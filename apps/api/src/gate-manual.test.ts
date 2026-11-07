import { zonedTimeToDate } from '@edusync/contracts';
import {
  academicYear,
  and,
  assignRoles,
  calendarEvent,
  classRoom,
  dailyAttendance,
  dutyRoster,
  enrollment,
  entitlement,
  eq,
  foundation,
  member,
  school,
  seedSchoolRoles,
  sql,
  student,
  subscription,
  tapEvent,
  teacher,
  user,
  withTenant,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { jakarta, loadPolicy, recordTap } from './gate';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let otherId = '';
let foundationId = '';
let yearId = '';
const userIds: string[] = [];
let adminCookie = '';
let waliCookie = '';
let lainCookie = '';
let piketCookie = '';
let otherCookie = '';
const ids = {
  c7A: '',
  c7B: '',
  ani: '',
  budi: '',
  citra: '',
  dina: '',
  sakit: '',
  asing: '',
  tWali: '',
  tPiket: '',
};

const daysAgo = (back: number) => jakarta(new Date(Date.now() - back * 86_400_000)).date;
const today = () => jakarta(new Date()).date;
const D = daysAgo(2);
const CLOSED = daysAgo(4);

async function makeUser(label: string) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  return { id: res.user.id, email };
}
async function join(label: string, sid: string, roles: string[]) {
  const u = await makeUser(label);
  const [m] = await app.platformDb.insert(member).values({ userId: u.id, schoolId: sid }).returning();
  await assignRoles(app.platformDb, m!.id, sid, roles);
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email: u.email, password },
  });
  return { cookie: res.cookies.map((c) => `${c.name}=${c.value}`).join('; '), memberId: m!.id, userId: u.id };
}

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
  sid = schoolId,
) =>
  app.inject({
    method,
    url,
    headers: {
      cookie,
      'x-school-id': sid,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

const manual = (cookie: string, body: object, sid = schoolId) =>
  call('POST', '/v1/gate/manual', cookie, body, sid);
const daily = async (studentId: string, date = D) => {
  const [r] = await app.platformDb
    .select()
    .from(dailyAttendance)
    .where(and(eq(dailyAttendance.studentId, studentId), eq(dailyAttendance.date, date)));
  return r;
};
const taps = (studentId: string) =>
  app.platformDb.select().from(tapEvent).where(eq(tapEvent.studentId, studentId));

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Manual', slug: `ym-${run}` })
    .returning();
  foundationId = f!.id;
  const [sub] = await db
    .insert(subscription)
    .values({
      foundationId,
      period: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  const make = async (slug: string) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug, name: `Sekolah ${slug}` })
      .returning();
    await seedSchoolRoles(db, s!.id);
    await db.insert(entitlement).values({
      schoolId: s!.id,
      moduleKey: 'attendance',
      subscriptionId: sub!.id,
      validUntil: sub!.currentPeriodEnd,
    });
    return s!.id;
  };
  schoolId = await make(`man-${run}`);
  otherId = await make(`man-lain-${run}`);
  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30', isActive: true })
    .returning();
  yearId = y!.id;
  const [oy] = await db
    .insert(academicYear)
    .values({
      schoolId: otherId,
      name: '2026/2027',
      startsOn: '2026-07-13',
      endsOn: '2027-06-30',
      isActive: true,
    })
    .returning();

  adminCookie = (await join('admin-manual', schoolId, ['school_admin'])).cookie;
  const wali = await join('guru-wali', schoolId, ['teacher']);
  waliCookie = wali.cookie;
  const lain = await join('guru-lain', schoolId, ['teacher']);
  lainCookie = lain.cookie;
  const piket = await join('guru-piket', schoolId, ['teacher']);
  piketCookie = piket.cookie;
  otherCookie = (await join('admin-manual-lain', otherId, ['school_admin'])).cookie;

  const [tw] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Bu Wali', memberId: wali.memberId })
    .returning();
  const [tp] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Pak Piket', memberId: piket.memberId })
    .returning();
  ids.tWali = tw!.id;
  ids.tPiket = tp!.id;
  // Guru ketiga: ada data guru tetapi bukan wali kelas dan tidak piket.
  await db.insert(teacher).values({ schoolId, name: 'Pak Lain', memberId: lain.memberId });

  const mkClass = async (name: string, homeroomTeacherId: string | null) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId, academicYearId: yearId, name, level: '7', homeroomTeacherId })
      .returning();
    return c!.id;
  };
  ids.c7A = await mkClass('7A', ids.tWali);
  ids.c7B = await mkClass('7B', null);
  const mkStudent = async (name: string, classId: string, sid = schoolId, yid = yearId) => {
    const [s] = await db.insert(student).values({ schoolId: sid, name, gender: 'P' }).returning();
    await db.insert(enrollment).values({ schoolId: sid, studentId: s!.id, classId, academicYearId: yid });
    return s!.id;
  };
  ids.ani = await mkStudent('Ani', ids.c7A);
  ids.budi = await mkStudent('Budi', ids.c7A);
  ids.citra = await mkStudent('Citra', ids.c7A);
  ids.sakit = await mkStudent('Sakit', ids.c7A);
  ids.dina = await mkStudent('Dina', ids.c7B);
  const [oc] = await db
    .insert(classRoom)
    .values({ schoolId: otherId, academicYearId: oy!.id, name: '7A', level: '7' })
    .returning();
  ids.asing = await mkStudent('Asing', oc!.id, otherId, oy!.id);

  await db.insert(calendarEvent).values({
    schoolId,
    academicYearId: yearId,
    type: 'holiday',
    scope: 'school',
    title: 'Libur uji',
    startsOn: CLOSED,
    endsOn: CLOSED,
  });
  await db.insert(dailyAttendance).values({ schoolId, studentId: ids.sakit, date: D, status: 'sick' });
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherId]) {
    for (const table of [
      'audit_log',
      'tap_event',
      'daily_attendance',
      'duty_roster',
      'calendar_event',
      'enrollment',
      'student',
      'class_room',
      'teacher',
      'academic_year',
      'member',
      'role',
      'entitlement',
    ]) {
      await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
    await db.delete(school).where(eq(school.id, sid));
  }
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('catat datang/pulang manual', () => {
  it('wali kelas mencatat datang massal: tepat waktu, terlambat dihitung dari kebijakan, siswa izin dilewati', async () => {
    const res = await manual(waliCookie, {
      date: D,
      direction: 'in',
      entries: [
        { studentId: ids.ani, at: '06:55' },
        { studentId: ids.budi, at: '07:30' },
        { studentId: ids.sakit, at: '07:00' },
        { studentId: crypto.randomUUID(), at: '07:00' },
      ],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const by = (id: string) => body.results.find((r: { studentId: string }) => r.studentId === id);
    expect(by(ids.ani)).toMatchObject({
      result: 'in',
      status: 'present',
      late: false,
      name: 'Ani',
      className: '7A',
    });
    expect(by(ids.budi)).toMatchObject({ result: 'in', status: 'late', late: true });
    expect(by(ids.sakit).result).toBe('skipped_status');
    expect(body.summary).toMatchObject({ in: 2, skipped_status: 1, not_found: 1 });

    const ani = await daily(ids.ani);
    expect(ani?.status).toBe('present');
    expect(ani?.checkInAt?.toISOString()).toBe(zonedTimeToDate(D, '06:55', 'Asia/Jakarta').toISOString());
    expect((await daily(ids.budi))?.status).toBe('late');
    expect((await daily(ids.sakit))?.status).toBe('sick');
    const [t] = await taps(ids.ani);
    expect(t).toMatchObject({ source: 'manual', direction: 'in' });
    expect(t?.recordedBy).toBeTruthy();
  });

  it('idempoten: datang ulang tidak menimpa, overwrite menimpa; status eksplisit dihormati', async () => {
    const again = await manual(waliCookie, {
      date: D,
      direction: 'in',
      entries: [{ studentId: ids.ani, at: '07:40' }],
    });
    expect(again.json().results[0]).toMatchObject({ result: 'already_in', status: 'present' });
    expect((await daily(ids.ani))?.checkInAt?.toISOString()).toBe(
      zonedTimeToDate(D, '06:55', 'Asia/Jakarta').toISOString(),
    );

    const over = await manual(waliCookie, {
      date: D,
      direction: 'in',
      overwrite: true,
      entries: [{ studentId: ids.ani, at: '07:40' }],
    });
    expect(over.json().results[0]).toMatchObject({ result: 'in', status: 'late' });

    const forced = await manual(waliCookie, {
      date: D,
      direction: 'in',
      entries: [{ studentId: ids.citra, at: '07:50', status: 'present' }],
    });
    expect(forced.json().results[0]).toMatchObject({ result: 'in', status: 'present' });

    const sick = await manual(waliCookie, {
      date: D,
      direction: 'in',
      overwrite: true,
      entries: [{ studentId: ids.sakit, at: '07:00' }],
    });
    expect(sick.json().results[0]).toMatchObject({ result: 'in', status: 'present' });
  });

  it('pulang: dicatat, tidak ditimpa, pulang sebelum datang ditolak, pulang tanpa datang diberi peringatan', async () => {
    const out = await manual(waliCookie, {
      date: D,
      direction: 'out',
      at: '14:00',
      entries: [{ studentId: ids.budi }, { studentId: ids.ani, at: '06:00' }],
    });
    const r = out.json();
    expect(r.results[0]).toMatchObject({ result: 'out', status: 'late', warning: null });
    expect(r.results[1].result).toBe('invalid_time');
    expect((await daily(ids.budi))?.checkOutAt).not.toBeNull();

    const dup = await manual(waliCookie, {
      date: D,
      direction: 'out',
      at: '15:00',
      entries: [{ studentId: ids.budi }],
    });
    expect(dup.json().results[0].result).toBe('already_out');

    // Dina belum tercatat datang: pulang tetap tercatat dengan peringatan (admin boleh semua kelas).
    const noIn = await manual(adminCookie, {
      date: D,
      direction: 'out',
      entries: [{ studentId: ids.dina, at: '13:00' }],
    });
    expect(noIn.json().results[0]).toMatchObject({ result: 'out', warning: 'no_check_in' });
    expect(noIn.json().summary.warnings).toBe(1);
  });

  it('validasi waktu: tanggal lampau tanpa jam, masa depan, dan jam di luar tanggal ditolak', async () => {
    const noTime = await manual(waliCookie, { date: D, direction: 'in', entries: [{ studentId: ids.ani }] });
    expect(noTime.statusCode).toBe(400);
    expect(noTime.json().error.code).toBe('time_required');
    const future = await manual(waliCookie, {
      date: daysAgo(-1),
      direction: 'in',
      entries: [{ studentId: ids.ani, at: '07:00' }],
    });
    expect(future.json().error.code).toBe('future_date');
    const wrongDay = await manual(waliCookie, {
      date: D,
      direction: 'in',
      entries: [{ studentId: ids.ani, at: new Date().toISOString() }],
    });
    expect(wrongDay.json().error.code).toBe('invalid_time');
    const fmt = await manual(waliCookie, {
      date: D,
      direction: 'in',
      entries: [{ studentId: ids.ani, at: '7.30' }],
    });
    expect(fmt.statusCode).toBe(400);
  });
});

describe('hak akses', () => {
  it('guru yang bukan wali kelas ditolak; siswa kelas lain ditolak untuk wali; tanpa izin kelola 403', async () => {
    const lain = await manual(lainCookie, {
      date: D,
      direction: 'in',
      entries: [{ studentId: ids.dina, at: '07:00' }],
    });
    expect(lain.statusCode).toBe(403);
    expect(lain.json().error.code).toBe('forbidden_class');
    const wali = await manual(waliCookie, {
      date: D,
      direction: 'in',
      entries: [{ studentId: ids.dina, at: '07:00' }],
    });
    expect(wali.statusCode).toBe(403);
    expect(await daily(ids.dina)).toMatchObject({ status: 'present' }); // hanya dari pulang admin sebelumnya
    expect((await daily(ids.dina))?.checkInAt).toBeNull();
    expect((await app.inject({ method: 'POST', url: '/v1/gate/manual' })).statusCode).toBe(401);
  });

  it('guru piket hari ini boleh semua kelas; admin boleh semua kelas', async () => {
    // Piket belum dijadwalkan: ditolak.
    const before = await manual(piketCookie, {
      direction: 'in',
      at: '00:00',
      entries: [{ studentId: ids.dina }],
    });
    expect(before.statusCode).toBe(403);
    await app.platformDb.insert(dutyRoster).values({ schoolId, date: today(), teacherId: ids.tPiket });
    const duty = await manual(piketCookie, {
      direction: 'in',
      at: '00:00',
      entries: [{ studentId: ids.dina }],
    });
    expect(duty.statusCode).toBe(200);
    expect(duty.json().results[0]).toMatchObject({ result: 'in' });
    const adm = await manual(adminCookie, {
      date: D,
      direction: 'in',
      entries: [{ studentId: ids.dina, at: '07:05' }],
    });
    expect(adm.statusCode).toBe(200);
  });

  it('isolasi antar sekolah: siswa sekolah lain tidak ditemukan dan tidak berubah', async () => {
    const res = await manual(adminCookie, {
      date: D,
      direction: 'in',
      entries: [{ studentId: ids.asing, at: '07:00' }],
    });
    expect(res.json().results[0].result).toBe('not_found');
    expect(await daily(ids.asing)).toBeUndefined();
    const cross = await manual(
      otherCookie,
      {
        date: D,
        direction: 'in',
        entries: [{ studentId: ids.ani, at: '07:00' }],
      },
      otherId,
    );
    expect(cross.json().results[0].result).toBe('not_found');
    const wrongSchool = await manual(otherCookie, {
      date: D,
      direction: 'in',
      entries: [{ studentId: ids.ani, at: '07:00' }],
    });
    expect(wrongSchool.statusCode).toBe(403);
  });
});

describe('hari libur', () => {
  it('ditolak 409 kecuali force', async () => {
    const body = { date: CLOSED, direction: 'in', entries: [{ studentId: ids.ani, at: '07:00' }] };
    const blocked = await manual(waliCookie, body);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('school_closed');
    expect(await daily(ids.ani, CLOSED)).toBeUndefined();
    const forced = await manual(waliCookie, { ...body, force: true });
    expect(forced.statusCode).toBe(200);
    expect((await daily(ids.ani, CLOSED))?.status).toBe('present');
  });
});

describe('mark-all', () => {
  it('datang untuk yang belum, pulang untuk yang datang tapi belum pulang; guru lain ditolak', async () => {
    const forbidden = await call('POST', '/v1/gate/manual/mark-all', lainCookie, {
      classId: ids.c7A,
      direction: 'in',
      date: daysAgo(3),
      at: '07:00',
    });
    expect(forbidden.statusCode).toBe(403);
    const missing = await call('POST', '/v1/gate/manual/mark-all', adminCookie, {
      classId: crypto.randomUUID(),
      direction: 'in',
      date: daysAgo(3),
      at: '07:00',
    });
    expect(missing.statusCode).toBe(404);

    const d3 = daysAgo(3);
    const inAll = await call('POST', '/v1/gate/manual/mark-all', waliCookie, {
      classId: ids.c7A,
      direction: 'in',
      date: d3,
      at: '07:00',
    });
    expect(inAll.statusCode).toBe(200);
    expect(inAll.json()).toMatchObject({ candidates: 4, summary: { in: 4 } });
    const outAll = await call('POST', '/v1/gate/manual/mark-all', waliCookie, {
      classId: ids.c7A,
      direction: 'out',
      date: d3,
      at: '13:00',
    });
    expect(outAll.json()).toMatchObject({ candidates: 4, summary: { out: 4, warnings: 0 } });
    const repeat = await call('POST', '/v1/gate/manual/mark-all', waliCookie, {
      classId: ids.c7A,
      direction: 'out',
      date: d3,
      at: '13:30',
    });
    expect(repeat.json()).toMatchObject({ candidates: 0, results: [] });
  });
});

describe('manual dan tap RFID bersama', () => {
  it('pulang manual setelah tap masuk RFID melengkapi catatan yang sama', async () => {
    const date = daysAgo(5);
    const at = zonedTimeToDate(date, '07:00', 'Asia/Jakarta');
    const tapped = await withTenant(app.tenantDb, [schoolId], async (tx) =>
      recordTap(tx, { schoolId }, { studentId: ids.citra, at }, await loadPolicy(tx)),
    );
    expect(tapped.result).toBe('in');
    const res = await manual(waliCookie, {
      date,
      direction: 'out',
      entries: [{ studentId: ids.citra, at: '13:10' }],
    });
    expect(res.json().results[0]).toMatchObject({ result: 'out', warning: null, status: 'present' });
    const row = await daily(ids.citra, date);
    expect(row?.checkInAt?.toISOString()).toBe(at.toISOString());
    expect(row?.checkOutAt?.toISOString()).toBe(zonedTimeToDate(date, '13:10', 'Asia/Jakarta').toISOString());
    const sources = (await taps(ids.citra))
      .filter((t) => t.at.getTime() >= at.getTime())
      .map((t) => t.source);
    expect(sources).toContain('rfid');
    expect(sources).toContain('manual');
    // Tap RFID setelah datang manual tidak menimpa jam datang.
    const date2 = daysAgo(6);
    await manual(waliCookie, {
      date: date2,
      direction: 'in',
      entries: [{ studentId: ids.budi, at: '06:50' }],
    });
    const tap2 = await withTenant(app.tenantDb, [schoolId], async (tx) =>
      recordTap(
        tx,
        { schoolId },
        { studentId: ids.budi, at: zonedTimeToDate(date2, '07:10', 'Asia/Jakarta') },
        await loadPolicy(tx),
      ),
    );
    expect(tap2.result).toBe('already_in');
  });
});

describe('koreksi dan daftar kelas', () => {
  it('PUT koreksi jam, ubah status, batalkan, dan tolak jam terbalik / guru lain', async () => {
    const date = daysAgo(7);
    const url = `/v1/gate/daily/${ids.ani}`;
    const noop = await call('PUT', url, waliCookie, { date, checkInAt: null, checkOutAt: null });
    expect(noop.json()).toMatchObject({ removed: false, status: null });

    const created = await call('PUT', url, waliCookie, { date, checkInAt: '07:30', checkOutAt: '13:00' });
    expect(created.json()).toMatchObject({ status: 'late', removed: false });
    const fixed = await call('PUT', url, waliCookie, { date, checkInAt: '07:00' });
    expect(fixed.json()).toMatchObject({ status: 'present' });
    expect(fixed.json().checkOutAt).not.toBeNull();
    const bad = await call('PUT', url, waliCookie, { date, checkOutAt: '06:00' });
    expect(bad.json().error.code).toBe('invalid_time');
    const note = await call('PUT', url, waliCookie, { date, status: 'sick', note: 'Surat dokter' });
    expect(note.json()).toMatchObject({ status: 'sick', note: 'Surat dokter' });
    const cleared = await call('PUT', url, waliCookie, {
      date,
      status: 'present',
      checkInAt: null,
      checkOutAt: null,
      note: null,
    });
    expect(cleared.json()).toMatchObject({ removed: false, status: 'present', checkInAt: null });
    const undone = await call('PUT', url, waliCookie, { date, checkInAt: null, checkOutAt: null });
    expect(undone.json()).toMatchObject({ removed: true, status: null });
    expect(await daily(ids.ani, date)).toBeUndefined();

    const lain = await call('PUT', url, lainCookie, { date, checkInAt: '07:00' });
    expect(lain.statusCode).toBe(403);
    const nf = await call('PUT', `/v1/gate/daily/${ids.asing}`, adminCookie, { date, checkInAt: '07:00' });
    expect(nf.statusCode).toBe(404);
  });

  it('GET /v1/gate/manual/classes: wali hanya kelasnya dengan hitungan; piket dan admin semua kelas', async () => {
    const wali = (await call('GET', '/v1/gate/manual/classes', waliCookie)).json();
    expect(wali.scope).toBe('homeroom');
    expect(wali.classes.map((c: { name: string }) => c.name)).toEqual(['7A']);
    expect(wali.classes[0]).toMatchObject({ homeroom: true, total: 4 });
    expect((await call('GET', '/v1/gate/manual/classes', lainCookie)).json().classes).toEqual([]);
    const duty = (await call('GET', '/v1/gate/manual/classes', piketCookie)).json();
    expect(duty.scope).toBe('duty');
    expect(duty.classes.map((c: { name: string }) => c.name)).toEqual(['7A', '7B']);
    const admin = (await call('GET', '/v1/gate/manual/classes', adminCookie)).json();
    expect(admin.scope).toBe('all');
    const b = admin.classes.find((c: { name: string }) => c.name === '7B');
    expect(b).toMatchObject({ total: 1, checkedIn: 1, checkedOut: 0, notYet: 0, homeroom: false });
  });
});
