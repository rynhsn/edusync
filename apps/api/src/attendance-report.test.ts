import {
  academicYear,
  assignRoles,
  dailyAttendance,
  entitlement,
  eq,
  foundation,
  lessonAttendance,
  lessonPeriod,
  member,
  scheduleEntry,
  school,
  seedSchoolRoles,
  sql,
  subscription,
  teacher,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { weekdayOf } from './gate';

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
let teacherACookie = '';
let teacherBCookie = '';
let principalCookie = '';
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
  return { cookie: await login(u.email), memberId: m!.id };
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

const D1 = '2026-09-01';
const D2 = '2026-09-02';
const D3 = '2026-09-03';
const CLOSED = '2026-09-04';

const ids = { kelasA: '', kelasB: '', ani: '', budi: '', citra: '', guruA: '', guruB: '', entryA1: '' };

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Laporan', slug: `yl-${run}` })
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
  schoolId = await make(`lap-${run}`, ['attendance', 'schedule']);
  noModuleId = await make(`lap-nomod-${run}`, []);
  otherId = await make(`lap-lain-${run}`, ['attendance']);
  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30', isActive: true })
    .returning();
  yearId = y!.id;
  await db.insert(academicYear).values({
    schoolId: otherId,
    name: '2026/2027',
    startsOn: '2026-07-13',
    endsOn: '2027-06-30',
    isActive: true,
  });

  adminCookie = (await join('admin-laporan', schoolId, ['school_admin'])).cookie;
  const a = await join('guru-lap-a', schoolId, ['teacher']);
  teacherACookie = a.cookie;
  const b = await join('guru-lap-b', schoolId, ['teacher']);
  teacherBCookie = b.cookie;
  // Kepala sekolah yang juga tercatat sebagai guru: tetap melihat semua kelas.
  const p = await join('kepsek-lap', schoolId, ['principal']);
  principalCookie = p.cookie;
  noModuleCookie = (await join('admin-tanpa-modul', noModuleId, ['school_admin'])).cookie;
  otherCookie = (await join('admin-laporan-lain', otherId, ['school_admin'])).cookie;

  const mk = async (url: string, body: object) => (await call('POST', url, adminCookie, body)).json();
  ids.kelasA = (await mk('/v1/classes', { academicYearId: yearId, name: '7A', level: '7' })).id;
  ids.kelasB = (await mk('/v1/classes', { academicYearId: yearId, name: '7B', level: '7' })).id;
  const mapel = (await mk('/v1/subjects', { code: 'MTK', name: 'Matematika' })).id;
  ids.ani = (await mk('/v1/students', { name: 'Ani', gender: 'P', classId: ids.kelasA })).id;
  ids.budi = (await mk('/v1/students', { name: 'Budi', gender: 'L', classId: ids.kelasA })).id;
  ids.citra = (await mk('/v1/students', { name: 'Citra', gender: 'P', classId: ids.kelasB })).id;
  ids.guruA = (await mk('/v1/teachers', { name: 'Guru A' })).id;
  ids.guruB = (await mk('/v1/teachers', { name: 'Guru B' })).id;
  const kepsek = (await mk('/v1/teachers', { name: 'Kepsek' })).id;
  await db.update(teacher).set({ memberId: a.memberId }).where(eq(teacher.id, ids.guruA));
  await db.update(teacher).set({ memberId: b.memberId }).where(eq(teacher.id, ids.guruB));
  await db.update(teacher).set({ memberId: p.memberId }).where(eq(teacher.id, kepsek));

  const periods = await db
    .insert(lessonPeriod)
    .values([
      { schoolId, number: 1, startsAt: '07:00', endsAt: '07:40' },
      { schoolId, number: 2, startsAt: '07:40', endsAt: '08:20' },
    ])
    .returning();
  const weekday = weekdayOf(D1);
  const entry = async (classId: string, teacherId: string, periodId: string) =>
    (
      await db
        .insert(scheduleEntry)
        .values({ schoolId, academicYearId: yearId, classId, subjectId: mapel, teacherId, weekday, periodId })
        .returning()
    )[0]!.id;
  ids.entryA1 = await entry(ids.kelasA, ids.guruA, periods[0]!.id);
  await entry(ids.kelasA, ids.guruA, periods[1]!.id);
  await entry(ids.kelasB, ids.guruB, periods[0]!.id);

  const daily = (
    studentId: string,
    date: string,
    status: 'present' | 'late' | 'excused' | 'sick' | 'absent',
  ) => db.insert(dailyAttendance).values({ schoolId, studentId, date, status });
  await daily(ids.ani, D1, 'present');
  await daily(ids.budi, D1, 'present');
  await daily(ids.ani, D2, 'late');
  await daily(ids.budi, D2, 'sick');
  await daily(ids.ani, D3, 'present');
  await daily(ids.citra, D1, 'present');
  const lesson = (studentId: string, date: string, status: 'present' | 'excused' | 'sick' | 'absent') =>
    db
      .insert(lessonAttendance)
      .values({ schoolId, scheduleEntryId: ids.entryA1, studentId, date, status, recordedBy: 'uji' });
  await lesson(ids.ani, D1, 'present');
  await lesson(ids.budi, D1, 'absent'); // hadir di gerbang, alpa di kelas: bolos
  await lesson(ids.ani, D2, 'absent'); // terlambat di gerbang, alpa di kelas: bolos
  await lesson(ids.budi, D2, 'absent'); // sakit di gerbang: bukan bolos
  await call('POST', `/v1/academic-years/${yearId}/events`, adminCookie, {
    type: 'holiday',
    title: 'Libur Uji',
    startsOn: CLOSED,
    endsOn: CLOSED,
  });
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, noModuleId, otherId]) {
    for (const table of [
      'audit_log',
      'lesson_attendance',
      'daily_attendance',
      'schedule_entry',
      'calendar_event',
      'lesson_period',
      'enrollment',
      'student',
      'teacher',
      'subject',
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

const report = (cookie: string, query: string, sid = schoolId) =>
  call('GET', `/v1/attendance/report?${query}`, cookie, undefined, sid);

type Row = { name: string; days: Record<string, number>; lessons: Record<string, number>; skipped: number };
const row = (body: { students: Row[] }, name: string) => body.students.find((s) => s.name === name) as Row;

describe('laporan absensi', () => {
  it('menghitung hari gerbang, jam pelajaran, dan bolos kelas per siswa', async () => {
    const res = await report(adminCookie, `classId=${ids.kelasA}&from=2026-09-01&to=2026-09-30`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.effectiveDays).toBe(3);
    expect(body.students.map((s: Row) => s.name)).toEqual(['Ani', 'Budi']);
    expect(row(body, 'Ani')).toMatchObject({
      days: { present: 2, late: 1, excused: 0, sick: 0, absent: 0, notRecorded: 0 },
      lessons: { present: 1, absent: 1 },
      skipped: 1,
    });
    expect(row(body, 'Budi')).toMatchObject({
      days: { present: 1, sick: 1, notRecorded: 1 },
      lessons: { absent: 2 },
      skipped: 1,
    });
    expect(body.summary).toMatchObject({ students: 2, skipped: 2, lessons: { present: 1, absent: 3 } });
    expect(body.summary.days).toMatchObject({ present: 3, late: 1, sick: 1, notRecorded: 1 });
  });

  it('tanpa classId menampilkan semua kelas; rentang dibatasi', async () => {
    const all = (await report(adminCookie, 'from=2026-09-01&to=2026-09-01')).json();
    expect(all.students.map((s: Row) => s.name)).toEqual(['Ani', 'Budi', 'Citra']);
    expect(all.effectiveDays).toBe(1);
    expect((await report(adminCookie, 'from=2026-09-30&to=2026-09-01')).json().error.code).toBe(
      'invalid_period',
    );
    expect((await report(adminCookie, 'from=2025-01-01&to=2026-09-01')).json().error.code).toBe(
      'invalid_period',
    );
  });

  it('guru hanya melihat kelas yang ia ajar; kelas lain ditolak', async () => {
    const own = await report(teacherACookie, `classId=${ids.kelasA}&from=2026-09-01&to=2026-09-30`);
    expect(own.statusCode).toBe(200);
    const denied = await report(teacherACookie, `classId=${ids.kelasB}&from=2026-09-01&to=2026-09-30`);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('forbidden');
    const auto = (await report(teacherACookie, 'from=2026-09-01&to=2026-09-30')).json();
    expect(auto.students.map((s: Row) => s.name)).toEqual(['Ani', 'Budi']);
    const b = (await report(teacherBCookie, 'from=2026-09-01&to=2026-09-30')).json();
    expect(b.students.map((s: Row) => s.name)).toEqual(['Citra']);
  });

  it('kepala sekolah yang juga guru dan admin melihat semua kelas', async () => {
    for (const cookie of [principalCookie, adminCookie]) {
      const res = await report(cookie, `classId=${ids.kelasB}&from=2026-09-01&to=2026-09-30`);
      expect(res.statusCode).toBe(200);
      const all = (await report(cookie, 'from=2026-09-01&to=2026-09-30')).json();
      expect(all.students).toHaveLength(3);
    }
  });

  it('modul nonaktif, tanpa sesi, dan sekolah lain tidak bocor', async () => {
    const q = `classId=${ids.kelasA}&from=2026-09-01&to=2026-09-30`;
    expect((await report(noModuleCookie, q, noModuleId)).json().error.code).toBe('module_disabled');
    expect((await app.inject(`/v1/attendance/report?${q}`)).statusCode).toBe(401);
    // Kelas milik sekolah lain tidak ditemukan; tanpa kelas, siswa sekolah ini tidak muncul.
    expect((await report(otherCookie, q, otherId)).statusCode).toBe(404);
    const none = (await report(otherCookie, 'from=2026-09-01&to=2026-09-30', otherId)).json();
    expect(none.students).toEqual([]);
    // Header sekolah lain dengan sesi yang bukan anggotanya ditolak.
    expect((await report(otherCookie, q, schoolId)).statusCode).toBe(403);
  });
});

describe('jam pelajaran yang belum terisi', () => {
  const unfilled = (cookie: string, date: string, sid = schoolId) =>
    call('GET', `/v1/attendance/report/lessons-unfilled?date=${date}`, cookie, undefined, sid);
  const key = (l: { className: string; periodNumber: number }) => `${l.className}-${l.periodNumber}`;

  it('menampilkan jam kosong atau kurang; guru hanya jamnya sendiri', async () => {
    // 7A jam 1 sudah lengkap (2/2); 7A jam 2 kosong; 7B jam 1 kosong.
    const admin = (await unfilled(adminCookie, D1)).json();
    expect(admin.lessons.map(key).sort()).toEqual(['7A-2', '7B-1']);
    expect(admin.lessons.find((l: { className: string }) => l.className === '7B')).toMatchObject({
      total: 1,
      filled: 0,
    });
    expect((await unfilled(teacherACookie, D1)).json().lessons.map(key)).toEqual(['7A-2']);
    expect((await unfilled(teacherBCookie, D1)).json().lessons.map(key)).toEqual(['7B-1']);
  });

  it('hari libur kosong; modul nonaktif dan sekolah lain tidak bocor', async () => {
    const closed = (await unfilled(adminCookie, CLOSED)).json();
    expect(closed.closed).toEqual({ type: 'holiday', title: 'Libur Uji' });
    expect(closed.lessons).toEqual([]);
    expect((await unfilled(noModuleCookie, D1, noModuleId)).json().error.code).toBe('module_disabled');
    expect((await unfilled(otherCookie, D1, otherId)).json().lessons).toEqual([]);
  });
});
