import {
  academicYear,
  assignRoles,
  classRoom,
  entitlement,
  eq,
  foundation,
  member,
  school,
  seedSchoolRoles,
  sql,
  student,
  subscription,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';

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
let noModuleId = '';
let otherId = '';
let foundationId = '';
let yearId = '';
const userIds: string[] = [];
let adminCookie = '';
let teacherCookie = '';
let noModuleCookie = '';
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
async function join(label: string, sid: string, roles: string[]) {
  const u = await makeUser(label);
  const [m] = await app.platformDb.insert(member).values({ userId: u.id, schoolId: sid }).returning();
  await assignRoles(app.platformDb, m!.id, sid, roles);
  return login(u.email);
}

const call = (method: 'GET' | 'POST', url: string, cookie: string, payload?: object, sid = schoolId) =>
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

const bulk = (items: object[], cookie = adminCookie, sid = schoolId) =>
  call('POST', '/v1/attendance/cards/bulk', cookie, { items }, sid);

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Kartu', slug: `yk-${run}` })
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
  const make = async (slug: string, modules: string[]) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug, name: `Sekolah ${slug}` })
      .returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of modules) {
      await db
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    return s!.id;
  };
  schoolId = await make(`kmb-${run}`, ['attendance']);
  noModuleId = await make(`kmb-nomod-${run}`, []);
  otherId = await make(`kmb-lain-${run}`, ['attendance']);
  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30', isActive: true })
    .returning();
  yearId = y!.id;
  adminCookie = await join('admin-kartu', schoolId, ['school_admin']);
  teacherCookie = await join('guru-kartu', schoolId, ['teacher']);
  noModuleCookie = await join('admin-kartu-tanpa-modul', noModuleId, ['school_admin']);
  otherCookie = await join('admin-kartu-lain', otherId, ['school_admin']);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, noModuleId, otherId]) {
    for (const table of [
      'audit_log',
      'attendance_card',
      'enrollment',
      'student',
      'class_room',
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

describe('kartu RFID massal', () => {
  const studentIds: Record<string, string> = {};

  it('menyiapkan siswa ber-NIS di dua sekolah', async () => {
    const [kelas] = await app.platformDb
      .insert(classRoom)
      .values({ schoolId, academicYearId: yearId, name: '7A', level: '7' })
      .returning();
    for (const [nis, name] of [
      ['1001', 'Ani'],
      ['1002', 'Budi'],
      ['1003', 'Citra'],
      ['1004', 'Dewi'],
      ['1005', 'Eko'],
    ] as const) {
      const res = await call('POST', '/v1/students', adminCookie, {
        name,
        nis,
        gender: 'P',
        classId: kelas!.id,
      });
      expect(res.statusCode).toBe(201);
      studentIds[nis] = res.json().id;
    }
    // Eko tidak aktif.
    await app.platformDb
      .update(student)
      .set({ status: 'dropped' })
      .where(eq(student.id, studentIds['1005'] as string));
    // Sekolah lain punya siswa ber-NIS 2001.
    const [other] = await app.platformDb
      .insert(student)
      .values({ schoolId: otherId, name: 'Siswa Lain', nis: '2001', gender: 'L' })
      .returning();
    expect(other!.id).toBeTruthy();
  });

  it('sebagian berhasil; semua alasan gagal terlapor dengan indeks 1-based', async () => {
    // Siswa 1004 sudah punya kartu aktif, dan kode TAKEN0001 terpakai olehnya.
    const single = await call('POST', '/v1/attendance/cards', adminCookie, {
      studentId: studentIds['1004'],
      code: 'TAKEN0001',
    });
    expect(single.statusCode).toBe(201);
    const res = await bulk([
      { nis: '1001', code: 'aaaa1111' }, // 1: berhasil
      { nis: '9999', code: 'BBBB2222' }, // 2: siswa tidak ada
      { nis: '1002', code: 'taken0001' }, // 3: kode dipakai
      { nis: '1004', code: 'CCCC3333' }, // 4: siswa sudah punya kartu
      { nis: '1002', code: 'ab' }, // 5: kode tidak valid
      { nis: '1002', code: 'AAAA1111' }, // 6: duplikat dalam batch
      { nis: '1005', code: 'EEEE5555' }, // 7: siswa tidak aktif
      { nis: '1003', code: 'DDDD4444' }, // 8: berhasil
      { nis: '2001', code: 'FFFF6666' }, // 9: NIS sekolah lain
    ]);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      created: 2,
      failed: [
        { row: 2, nis: '9999', code: 'BBBB2222', reason: 'student_not_found' },
        { row: 3, nis: '1002', code: 'TAKEN0001', reason: 'code_taken' },
        { row: 4, nis: '1004', code: 'CCCC3333', reason: 'student_has_card' },
        { row: 5, nis: '1002', code: 'AB', reason: 'invalid_code' },
        { row: 6, nis: '1002', code: 'AAAA1111', reason: 'code_taken' },
        { row: 7, nis: '1005', code: 'EEEE5555', reason: 'student_not_found' },
        { row: 9, nis: '2001', code: 'FFFF6666', reason: 'student_not_found' },
      ],
    });
    const list = (await call('GET', '/v1/attendance/cards', adminCookie)).json();
    expect(list.map((c: { code: string }) => c.code).sort()).toEqual(['AAAA1111', 'DDDD4444', 'TAKEN0001']);

    const audits = await app.platformDb.execute(
      sql`select details from audit_log where school_id = ${schoolId} and action = 'attendance.card.bulk'`,
    );
    expect(audits.rows).toHaveLength(1);
    expect((audits.rows[0] as { details: object }).details).toMatchObject({ created: 2, failed: 7 });
  });

  it('NIS sekolah lain tidak bocor; kode sama di sekolah berbeda boleh', async () => {
    const res = await bulk([{ nis: '2001', code: 'GGGG7777' }]);
    expect(res.json()).toEqual({
      created: 0,
      failed: [{ row: 1, nis: '2001', code: 'GGGG7777', reason: 'student_not_found' }],
    });
    const mine = await bulk([{ nis: '2001', code: 'AAAA1111' }], otherCookie, otherId);
    expect(mine.json().created).toBe(1);
  });

  it('validasi, izin, dan modul', async () => {
    expect((await bulk([])).statusCode).toBe(400);
    const tooMany = Array.from({ length: 501 }, (_, i) => ({ nis: `n${i}`, code: `CODE${i}` }));
    expect((await bulk(tooMany)).statusCode).toBe(400);
    expect((await bulk([{ nis: ' ', code: 'ABCD1234' }])).statusCode).toBe(400);
    expect((await bulk([{ nis: '1001', code: 'ABCD1234' }], teacherCookie)).statusCode).toBe(403);
    const anon = await app.inject({
      method: 'POST',
      url: '/v1/attendance/cards/bulk',
      payload: { items: [] },
    });
    expect(anon.statusCode).toBe(401);
    const blocked = await bulk([{ nis: '1001', code: 'ABCD1234' }], noModuleCookie, noModuleId);
    expect(blocked.json().error.code).toBe('module_disabled');
  });
});
