import {
  assignRoles,
  entitlement,
  eq,
  foundation,
  member,
  school,
  seedSchoolRoles,
  sql,
  subscription,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { jakarta, weekdayOf } from './gate';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
const sid = { a: '', b: '', noMod: '', other: '' };
let foundationId = '';
let otherFoundationId = '';
const userIds: string[] = [];
let multiCookie = ''; // admin di A dan B
let onlyACookie = ''; // admin hanya di A
let otherCookie = '';

async function makeUser(label: string) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  return { id: res.user.id, email };
}
async function login(email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}
async function join(userId: string, schoolId: string, roles: string[]) {
  const [m] = await app.platformDb.insert(member).values({ userId, schoolId }).returning();
  await assignRoles(app.platformDb, m!.id, schoolId, roles);
}

const call = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
  schoolId = sid.a,
) =>
  app.inject({
    method,
    url,
    headers: {
      cookie,
      'x-school-id': schoolId,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });
const kiosk = (method: 'GET' | 'POST', url: string, key: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: { 'x-device-key': key, ...(payload ? { 'content-type': 'application/json' } : {}) },
    ...(payload ? { payload } : {}),
  });

function lastSchoolDay() {
  for (let back = 1; back < 8; back++) {
    const d = jakarta(new Date(Date.now() - back * 86_400_000)).date;
    if (weekdayOf(d) <= 6) return d;
  }
  throw new Error('tidak mungkin');
}

beforeAll(async () => {
  process.env.KIOSK_MAX_PAST_HOURS = String(24 * 8);
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const mkFoundation = async (slug: string) => {
    const [f] = await db
      .insert(foundation)
      .values({ name: `Lembaga ${slug}`, slug })
      .returning();
    const [sub] = await db
      .insert(subscription)
      .values({
        foundationId: f!.id,
        period: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      })
      .returning();
    return { id: f!.id, sub: sub! };
  };
  const f1 = await mkFoundation(`lu-${run}`);
  const f2 = await mkFoundation(`lu2-${run}`);
  foundationId = f1.id;
  otherFoundationId = f2.id;
  const make = async (f: typeof f1, slug: string, modules: string[]) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId: f.id, slug, name: `Unit ${slug}` })
      .returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of modules) {
      await db
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: f.sub.id, validUntil: f.sub.currentPeriodEnd });
    }
    return s!.id;
  };
  sid.a = await make(f1, `lu-a-${run}`, ['attendance']);
  sid.b = await make(f1, `lu-b-${run}`, ['attendance']);
  sid.noMod = await make(f1, `lu-n-${run}`, []);
  sid.other = await make(f2, `lu-o-${run}`, ['attendance']);

  const multi = await makeUser('admin-multi');
  for (const s of [sid.a, sid.b, sid.noMod]) await join(multi.id, s, ['school_admin']);
  multiCookie = await login(multi.email);
  const onlyA = await makeUser('admin-a');
  await join(onlyA.id, sid.a, ['school_admin']);
  onlyACookie = await login(onlyA.email);
  const other = await makeUser('admin-lain');
  await join(other.id, sid.other, ['school_admin']);
  otherCookie = await login(other.email);
});

afterAll(async () => {
  const db = app.platformDb;
  // Tap unit B menunjuk perangkat milik A, jadi semua tap dihapus sebelum perangkat mana pun.
  for (const id of Object.values(sid)) {
    await db.execute(sql`delete from tap_event where school_id = ${id}`);
  }
  for (const id of Object.values(sid)) {
    for (const table of [
      'audit_log',
      'tap_event',
      'daily_attendance',
      'attendance_card',
      'attendance_device',
      'attendance_policy',
      'enrollment',
      'student',
      'member',
      'role',
      'entitlement',
    ]) {
      await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${id}`);
    }
    await db.delete(school).where(eq(school.id, id));
  }
  for (const fid of [foundationId, otherFoundationId]) {
    await db.execute(sql`delete from subscription where foundation_id = ${fid}`);
    await db.delete(foundation).where(eq(foundation.id, fid));
  }
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

const st: Record<string, string> = {};
let key = '';
let deviceId = '';

describe('perangkat kiosk multi-unit', () => {
  it('daftar unit yang boleh ditambahkan: satu lembaga, absensi aktif, dan pengguna berhak', async () => {
    const mine = (await call('GET', '/v1/attendance/devices/units', multiCookie)).json();
    expect(mine.map((u: { id: string }) => u.id)).toEqual([sid.b]);
    // Admin yang hanya anggota A tidak punya unit lain untuk ditambahkan.
    expect((await call('GET', '/v1/attendance/devices/units', onlyACookie)).json()).toEqual([]);
  });

  it('unit yang tidak sah ditolak saat membuat perangkat', async () => {
    const post = (cookie: string, extraSchoolIds: string[]) =>
      call('POST', '/v1/attendance/devices', cookie, { name: 'Gerbang', extraSchoolIds });
    for (const [cookie, bad] of [
      [multiCookie, sid.noMod], // modul absensi tidak aktif
      [multiCookie, sid.other], // lembaga lain
      [onlyACookie, sid.b], // tidak berhak di unit itu
    ] as const) {
      const res = await post(cookie, [bad]);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('invalid_unit');
    }
    expect((await call('GET', '/v1/attendance/devices', multiCookie)).json()).toEqual([]);
  });

  it('perangkat dua unit: kartu tiap unit tercatat di unit pemiliknya', async () => {
    const created = await call('POST', '/v1/attendance/devices', multiCookie, {
      name: 'Gerbang bersama',
      extraSchoolIds: [sid.b, sid.a], // sekolah asal diabaikan
    });
    expect(created.statusCode).toBe(201);
    key = created.json().key;
    deviceId = created.json().id;
    const list = (await call('GET', '/v1/attendance/devices', multiCookie)).json();
    expect(list[0].schools).toEqual([{ id: sid.b, name: expect.any(String) }]);
    // Unit B tidak melihat perangkat milik A.
    expect((await call('GET', '/v1/attendance/devices', multiCookie, undefined, sid.b)).json()).toEqual([]);

    for (const [label, sch, code] of [
      ['Ani', sid.a, 'AAAA1111'],
      ['Budi', sid.b, 'BBBB2222'],
    ] as const) {
      const s = (await call('POST', '/v1/students', multiCookie, { name: label, gender: 'P' }, sch)).json();
      st[label] = s.id;
      const card = await call('POST', '/v1/attendance/cards', multiCookie, { studentId: s.id, code }, sch);
      expect(card.statusCode).toBe(201);
    }

    const info = (await kiosk('GET', '/v1/kiosk/info', key)).json();
    expect(info.school).toContain(`lu-a-${run}`);
    expect(info.school).toContain(`lu-b-${run}`);

    const day = lastSchoolDay();
    const tap = (code: string) => kiosk('POST', '/v1/kiosk/tap', key, { code, at: `${day}T06:50:00+07:00` });
    const a = await tap('aaaa1111');
    expect(a.statusCode).toBe(200);
    expect(a.json()).toMatchObject({
      result: 'in',
      student: { name: 'Ani' },
      schoolName: `Unit lu-a-${run}`,
    });
    const b = await tap('bbbb2222');
    expect(b.statusCode).toBe(200);
    expect(b.json()).toMatchObject({
      result: 'in',
      student: { name: 'Budi' },
      schoolName: `Unit lu-b-${run}`,
    });
    expect((await tap('cccc3333')).json().error.code).toBe('unknown_card');

    const taps = async (schoolId: string) =>
      (await app.platformDb.execute(sql`select student_id from tap_event where school_id = ${schoolId}`))
        .rows;
    expect(await taps(sid.a)).toHaveLength(1);
    expect(await taps(sid.b)).toHaveLength(1);
  });

  it('kartu yang sama di dua unit ditolak sebagai ambigu', async () => {
    const s = (await call('POST', '/v1/students', multiCookie, { name: 'Citra', gender: 'P' }, sid.b)).json();
    // Kode Ani (unit A) dipasang juga di unit B.
    const card = await call(
      'POST',
      '/v1/attendance/cards',
      multiCookie,
      { studentId: s.id, code: 'AAAA1111' },
      sid.b,
    );
    expect(card.statusCode).toBe(201);
    const res = await kiosk('POST', '/v1/kiosk/tap', key, { code: 'AAAA1111' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ambiguous_card');
  });

  it('melepas unit dan kartunya tidak lagi dikenal; unit B yang ditangguhkan atau tanpa modul tidak dilayani', async () => {
    const patch = (cookie: string, body: object) =>
      call('PATCH', `/v1/attendance/devices/${deviceId}`, cookie, body);
    // Admin yang tidak berhak di B tidak bisa menambah B baru, tetapi boleh melepasnya.
    expect((await patch(onlyACookie, { extraSchoolIds: [sid.b] })).statusCode).toBe(200); // sudah terpasang
    expect((await patch(onlyACookie, { extraSchoolIds: [] })).statusCode).toBe(200);
    expect((await patch(onlyACookie, { extraSchoolIds: [sid.b] })).statusCode).toBe(400); // tambah baru
    const gone = await kiosk('POST', '/v1/kiosk/tap', key, { code: 'BBBB2222' });
    expect(gone.json().error.code).toBe('unknown_card');
    expect((await patch(multiCookie, { extraSchoolIds: [sid.b] })).statusCode).toBe(200);

    await app.platformDb
      .update(school)
      .set({ status: 'suspended', suspendedReason: 'staff' })
      .where(eq(school.id, sid.b));
    expect((await kiosk('POST', '/v1/kiosk/tap', key, { code: 'BBBB2222' })).json().error.code).toBe(
      'unknown_card',
    );
    await app.platformDb
      .update(school)
      .set({ status: 'active', suspendedReason: null })
      .where(eq(school.id, sid.b));
    await app.platformDb.execute(
      sql`update entitlement set valid_until = now() - interval '1 day' where school_id = ${sid.b}`,
    );
    const noModule = await kiosk('POST', '/v1/kiosk/tap', key, { code: 'BBBB2222' });
    expect(noModule.json().error.code).toBe('module_disabled');
  });

  it('perangkat satu unit tetap bekerja seperti sebelumnya', async () => {
    const created = await call('POST', '/v1/attendance/devices', otherCookie, { name: 'Solo' }, sid.other);
    expect(created.statusCode).toBe(201);
    const list = (await call('GET', '/v1/attendance/devices', otherCookie, undefined, sid.other)).json();
    expect(list[0].schools).toEqual([]);
    const info = (await kiosk('GET', '/v1/kiosk/info', created.json().key)).json();
    expect(info.school).toBe(`Unit lu-o-${run}`);
  });
});
