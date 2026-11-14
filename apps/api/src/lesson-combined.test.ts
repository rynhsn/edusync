import { randomUUID } from 'node:crypto';
import {
  academicYear,
  assignRoles,
  auditLog,
  classRoom,
  classSubjectParticipation,
  enrollment,
  entitlement,
  eq,
  foundation,
  lessonAttendance,
  lessonPeriod,
  member,
  reportCard,
  scheduleEntry,
  school,
  seedSchoolRoles,
  semester,
  sql,
  student,
  studentSubjectEnrollment,
  subject,
  subscription,
  teacher,
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

/**
 * Tahap 3B.4: absensi per jam yang peka pilihan mapel dan pertemuan gabungan (`/v1/lesson-attendance/combined`). Sekolah tanpa
 * mapel berpenanda berperilaku persis seperti sebelumnya (dijaga juga oleh gate.test.ts yang tidak diubah).
 */
const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
// Senin di masa lalu (weekday 1) di dalam tahun ajaran uji; tidak ada libur terdaftar.
const MONDAY = '2026-10-12';
const TUESDAY = '2026-10-13';

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let otherId = '';
let foundationId = '';
let yearId = '';
let semId = '';
let periodId = '';
const userIds: string[] = [];
let adminCookie = '';
let ownerCookie = '';
let strangerCookie = '';
let otherCookie = '';
let ownerTeacherId = '';
let otherTeacherId = '';
let thirdTeacherId = '';

const ids = {} as Record<string, string>;

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

const call = (
  method: 'GET' | 'POST' | 'PUT',
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
const code = (res: { json: () => { error?: { code?: string } } }) => res.json().error?.code;

const db = () => app.platformDb;

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Gabungan', slug: `yg-${run}` })
    .returning();
  foundationId = f!.id;
  const [sub] = await db()
    .insert(subscription)
    .values({
      foundationId,
      period: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  const make = async (slug: string) => {
    const [s] = await db().insert(school).values({ foundationId, slug, name: slug }).returning();
    await seedSchoolRoles(db(), s!.id);
    for (const moduleKey of ['schedule', 'attendance']) {
      await db()
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    return s!.id;
  };
  schoolId = await make(`gab-${run}`);
  otherId = await make(`gab-lain-${run}`);
  const [y] = await db()
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30', isActive: true })
    .returning();
  yearId = y!.id;
  const [sem] = await db()
    .insert(semester)
    .values({
      schoolId,
      academicYearId: yearId,
      name: 'Ganjil',
      startsOn: '2026-07-13',
      endsOn: '2026-12-31',
    })
    .returning();
  semId = sem!.id;
  const [oy] = await db()
    .insert(academicYear)
    .values({
      schoolId: otherId,
      name: '2026/2027',
      startsOn: '2026-07-13',
      endsOn: '2027-06-30',
      isActive: true,
    })
    .returning();
  void oy;
  adminCookie = (await join('admin-gabungan', schoolId, ['school_admin'])).cookie;
  const owner = await join('guru-pemilik', schoolId, ['teacher']);
  ownerCookie = owner.cookie;
  strangerCookie = (await join('guru-asing', schoolId, ['teacher'])).cookie;
  otherCookie = (await join('admin-gabungan-lain', otherId, ['school_admin'])).cookie;

  const [p] = await db()
    .insert(lessonPeriod)
    .values({ schoolId, number: 1, startsAt: '07:00', endsAt: '07:40' })
    .returning();
  periodId = p!.id;
  const [op] = await db()
    .insert(lessonPeriod)
    .values({ schoolId, number: 2, startsAt: '07:40', endsAt: '08:20' })
    .returning();
  ids.period2 = op!.id;

  const [t1] = await db()
    .insert(teacher)
    .values({ schoolId, name: 'Guru Pemilik', memberId: owner.memberId })
    .returning();
  ownerTeacherId = t1!.id;
  const [t2] = await db().insert(teacher).values({ schoolId, name: 'Guru Lain' }).returning();
  otherTeacherId = t2!.id;
  const [t3] = await db().insert(teacher).values({ schoolId, name: 'Guru Ketiga' }).returning();
  thirdTeacherId = t3!.id;

  const mkClass = async (key: string, name: string) => {
    const [c] = await db()
      .insert(classRoom)
      .values({ schoolId, academicYearId: yearId, name, level: '11' })
      .returning();
    ids[key] = c!.id;
  };
  await mkClass('xiA', 'XI-A');
  await mkClass('xiB', 'XI-B');
  const mkSubject = async (key: string, name: string) => {
    const [s] = await db()
      .insert(subject)
      .values({ schoolId, code: `${key}-${run}`, name })
      .returning();
    ids[key] = s!.id;
  };
  await mkSubject('fis', 'Fisika'); // pilihan
  await mkSubject('kim', 'Kimia'); // pilihan, tanpa pengambil di XI-B
  await mkSubject('mat', 'Matematika'); // wajib
  const mkStudent = async (key: string, name: string, classKey: string) => {
    const [st] = await db()
      .insert(student)
      .values({ schoolId, name, gender: 'L', status: 'active', nis: `${key}-${run}` })
      .returning();
    ids[key] = st!.id;
    await db()
      .insert(enrollment)
      .values({ schoolId, studentId: st!.id, classId: ids[classKey]!, academicYearId: yearId });
  };
  await mkStudent('ani', 'Ani', 'xiA');
  await mkStudent('budi', 'Budi', 'xiA');
  await mkStudent('cici', 'Cici', 'xiA');
  await mkStudent('dodi', 'Dodi', 'xiB');
  await mkStudent('eka', 'Eka', 'xiB');

  // Fisika dan Kimia berpenanda pilihan di kedua rombel. Fisika: Ani, Cici (XI-A), Eka (XI-B). Kimia: Budi saja (XI-A).
  for (const classKey of ['xiA', 'xiB']) {
    for (const subjectKey of ['fis', 'kim']) {
      await db().insert(classSubjectParticipation).values({
        schoolId,
        classId: ids[classKey]!,
        subjectId: ids[subjectKey]!,
        mode: 'selected',
        updatedBy: 'test',
      });
    }
  }
  const choose = (studentKey: string, subjectKey: string) =>
    db().insert(studentSubjectEnrollment).values({
      schoolId,
      studentId: ids[studentKey]!,
      subjectId: ids[subjectKey]!,
      academicYearId: yearId,
      source: 'choice',
      createdBy: 'test',
    });
  await choose('ani', 'fis');
  await choose('cici', 'fis');
  await choose('eka', 'fis');
  await choose('budi', 'kim');

  const cell = async (
    key: string,
    classKey: string,
    subjectKey: string,
    teacherId: string,
    extra: object = {},
  ) => {
    const [e] = await db()
      .insert(scheduleEntry)
      .values({
        schoolId,
        academicYearId: yearId,
        classId: ids[classKey]!,
        subjectId: ids[subjectKey]!,
        teacherId,
        weekday: 1,
        periodId,
        ...extra,
      })
      .returning();
    ids[key] = e!.id;
  };
  ids.combinedKey = randomUUID();
  // Senin jam 1: Fisika gabungan XI-A + XI-B (guru pemilik), Kimia paralel di XI-A (lane 1, guru lain), Matematika XI-B jam 2.
  await cell('fisA', 'xiA', 'fis', ownerTeacherId, { combinedKey: ids.combinedKey });
  await cell('fisB', 'xiB', 'fis', ownerTeacherId, { combinedKey: ids.combinedKey });
  await cell('kimA', 'xiA', 'kim', otherTeacherId, { lane: 1 });
  await cell('kimB', 'xiB', 'kim', thirdTeacherId, { lane: 1 });
  await cell('matA', 'xiA', 'mat', otherTeacherId, { periodId: ids.period2 });
});

afterAll(async () => {
  for (const sid of [schoolId, otherId]) {
    for (const table of [
      'audit_log',
      'outbox',
      'lesson_attendance',
      'report_card',
      'schedule_entry',
      'student_subject_enrollment',
      'class_subject_participation',
      'lesson_period',
      'enrollment',
      'student',
      'teacher',
      'subject',
      'class_room',
      'semester',
      'academic_year',
      'member',
      'role',
      'entitlement',
    ]) {
      await db().execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
    await db().delete(school).where(eq(school.id, sid));
  }
  await db().execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db().delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db().delete(user).where(eq(user.id, uid));
  await app.close();
});

const sheet = async (entryKey: string, cookie = adminCookie, date = MONDAY) =>
  (await call('GET', `/v1/lesson-attendance?scheduleEntryId=${ids[entryKey]}&date=${date}`, cookie)).json();
const names = (rows: { name: string }[]) => rows.map((r) => r.name).sort();

describe('absensi per jam: roster pengambil mapel', () => {
  it('mapel pilihan hanya memuat pengambilnya; mapel wajib tetap seluruh rombel', async () => {
    expect(names((await sheet('fisA')).students)).toEqual(['Ani', 'Cici']);
    expect(names((await sheet('fisB')).students)).toEqual(['Eka']);
    expect(names((await sheet('kimA')).students)).toEqual(['Budi']);
    expect(names((await sheet('kimB')).students)).toEqual([]);
    expect(names((await sheet('matA')).students)).toEqual(['Ani', 'Budi', 'Cici']);
  });

  it('menyimpan untuk murid yang tidak mengambil ditolak 400; pengambil diterima', async () => {
    const bad = await call('PUT', '/v1/lesson-attendance', adminCookie, {
      scheduleEntryId: ids.fisA,
      date: MONDAY,
      records: [{ studentId: ids.budi, status: 'present' }],
    });
    expect(bad.statusCode).toBe(400);
    expect(code(bad)).toBe('invalid_reference');
    const ok = await call('PUT', '/v1/lesson-attendance', adminCookie, {
      scheduleEntryId: ids.fisA,
      date: MONDAY,
      records: [{ studentId: ids.ani, status: 'present' }],
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().saved).toBe(1);
    // Hapus agar uji gabungan di bawah mulai dari nol.
    await db().delete(lessonAttendance).where(eq(lessonAttendance.scheduleEntryId, ids.fisA!));
  });

  it('GET /v1/lessons: total = pengambil, lane dan combinedKey hanya pada sel yang memakainya', async () => {
    const res = (await call('GET', `/v1/lessons?date=${MONDAY}`, adminCookie)).json();
    const by = (id: string) => res.lessons.find((l: { id: string }) => l.id === ids[id]);
    expect(by('fisA')).toMatchObject({ total: 2, combinedKey: ids.combinedKey });
    expect(by('fisB')).toMatchObject({ total: 1, combinedKey: ids.combinedKey });
    expect(by('kimA')).toMatchObject({ total: 1, lane: 1 });
    expect(by('kimB')).toMatchObject({ total: 0 });
    // Mapel wajib: hitungan rombel apa adanya dan tanpa field baru.
    expect(by('matA')).toMatchObject({ total: 3 });
    expect(by('matA')).not.toHaveProperty('lane');
    expect(by('matA')).not.toHaveProperty('combinedKey');
    expect(by('fisA')).not.toHaveProperty('lane');
  });

  it('laporan jam belum diisi: sel tanpa pengambil tidak pernah dihitung belum diisi', async () => {
    const res = (
      await call('GET', `/v1/attendance/report/lessons-unfilled?date=${MONDAY}`, adminCookie)
    ).json();
    const got = res.lessons.map((l: { id: string }) => l.id);
    expect(got).toContain(ids.fisA);
    expect(got).toContain(ids.fisB);
    expect(got).toContain(ids.kimA);
    expect(got).toContain(ids.matA);
    expect(got).not.toContain(ids.kimB);
    expect(res.lessons.find((l: { id: string }) => l.id === ids.fisA)).toMatchObject({ total: 2, filled: 0 });
  });
});

describe('absensi gabungan', () => {
  const combinedUrl = (date = MONDAY, key = ids.combinedKey) =>
    `/v1/lesson-attendance/combined?combinedKey=${key}&date=${date}`;

  it('GET menggabungkan murid semua sel, tiap murid dengan selnya sendiri', async () => {
    const res = await call('GET', combinedUrl(), ownerCookie);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      canRecord: true,
      substitute: false,
      subjectName: 'Fisika',
      periodNumber: 1,
    });
    expect(body.cells).toEqual([
      { scheduleEntryId: ids.fisA, classId: ids.xiA, className: 'XI-A', total: 2 },
      { scheduleEntryId: ids.fisB, classId: ids.xiB, className: 'XI-B', total: 1 },
    ]);
    expect(body.students.map((s: { name: string }) => s.name)).toEqual(['Ani', 'Cici', 'Eka']);
    expect(body.students.find((s: { name: string }) => s.name === 'Eka').scheduleEntryId).toBe(ids.fisB);
    expect(body.students.every((s: { status: unknown }) => s.status === null)).toBe(true);
  });

  it('guru lain tanpa piket hanya bisa melihat (canRecord false) dan tidak boleh menulis (403)', async () => {
    const view = (await call('GET', combinedUrl(), strangerCookie)).json();
    expect(view.canRecord).toBe(false);
    const res = await call('PUT', '/v1/lesson-attendance/combined', strangerCookie, {
      combinedKey: ids.combinedKey,
      date: MONDAY,
      records: [{ studentId: ids.ani, status: 'present' }],
    });
    expect(res.statusCode).toBe(403);
    expect(code(res)).toBe('not_your_lesson');
  });

  it('PUT menulis ke sel masing-masing murid dan mengisi laporan per sel', async () => {
    const res = await call('PUT', '/v1/lesson-attendance/combined', ownerCookie, {
      combinedKey: ids.combinedKey,
      date: MONDAY,
      records: [
        { studentId: ids.ani, status: 'present' },
        { studentId: ids.cici, status: 'absent', note: 'tanpa kabar' },
        { studentId: ids.eka, status: 'sick' },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ saved: 3, substitute: false, cells: 2 });

    const rowsA = await db()
      .select()
      .from(lessonAttendance)
      .where(eq(lessonAttendance.scheduleEntryId, ids.fisA!));
    const rowsB = await db()
      .select()
      .from(lessonAttendance)
      .where(eq(lessonAttendance.scheduleEntryId, ids.fisB!));
    expect(rowsA.map((r) => r.studentId).sort()).toEqual([ids.ani, ids.cici].sort());
    expect(rowsB.map((r) => r.studentId)).toEqual([ids.eka]);
    expect(rowsA.find((r) => r.studentId === ids.cici)).toMatchObject({
      status: 'absent',
      note: 'tanpa kabar',
    });

    // Lembar per sel (rute lama) melihat tulisan yang sama.
    const a = await sheet('fisA');
    expect(a.students.find((s: { name: string }) => s.name === 'Cici')).toMatchObject({ status: 'absent' });
    // Jam belum diisi: dua sel Fisika sudah penuh (2 dari 2, 1 dari 1), sehingga hilang dari laporan.
    const unfilled = (
      await call('GET', `/v1/attendance/report/lessons-unfilled?date=${MONDAY}`, adminCookie)
    ).json();
    const got = unfilled.lessons.map((l: { id: string }) => l.id);
    expect(got).not.toContain(ids.fisA);
    expect(got).not.toContain(ids.fisB);
    const audits = await db()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'lesson_attendance.save_combined'));
    expect(audits.some((a) => a.schoolId === schoolId)).toBe(true);
  });

  it('PUT ulang menimpa catatan yang sama (idempoten), pengurus boleh menggantikan', async () => {
    const res = await call('PUT', '/v1/lesson-attendance/combined', adminCookie, {
      combinedKey: ids.combinedKey,
      date: MONDAY,
      records: [{ studentId: ids.cici, status: 'excused' }],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ saved: 1, substitute: true, cells: 1 });
    const rows = await db()
      .select()
      .from(lessonAttendance)
      .where(eq(lessonAttendance.scheduleEntryId, ids.fisA!));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.studentId === ids.cici)).toMatchObject({ status: 'excused', substitute: true });
  });

  it('menolak murid yang tidak mengambil mapel atau bukan anggota; tidak menulis apa pun (semua atau tidak)', async () => {
    const before = await db()
      .select()
      .from(lessonAttendance)
      .where(eq(lessonAttendance.scheduleEntryId, ids.fisB!));
    const res = await call('PUT', '/v1/lesson-attendance/combined', ownerCookie, {
      combinedKey: ids.combinedKey,
      date: MONDAY,
      records: [
        { studentId: ids.eka, status: 'present' },
        { studentId: ids.dodi, status: 'present' }, // XI-B tetapi tidak mengambil Fisika
      ],
    });
    expect(res.statusCode).toBe(400);
    expect(code(res)).toBe('invalid_reference');
    const after = await db()
      .select()
      .from(lessonAttendance)
      .where(eq(lessonAttendance.scheduleEntryId, ids.fisB!));
    expect(after.find((r) => r.studentId === ids.eka)?.status).toBe(
      before.find((r) => r.studentId === ids.eka)?.status,
    );
  });

  it('kunci tidak dikenal 404, hari bukan jadwal 400, tanggal depan 409, sekolah lain 404', async () => {
    expect((await call('GET', combinedUrl(MONDAY, randomUUID()), adminCookie)).statusCode).toBe(404);
    const day = await call('GET', combinedUrl(TUESDAY), adminCookie);
    expect(day.statusCode).toBe(400);
    expect(code(day)).toBe('invalid_date');
    const future = await call('PUT', '/v1/lesson-attendance/combined', adminCookie, {
      combinedKey: ids.combinedKey,
      date: '2999-01-04',
      records: [{ studentId: ids.ani, status: 'present' }],
    });
    expect(future.statusCode).toBe(409);
    expect(code(future)).toBe('future_date');
    // Admin sekolah lain tidak melihat kunci ini.
    expect((await call('GET', combinedUrl(), otherCookie, undefined, otherId)).statusCode).toBe(404);
  });

  it('rapor final salah satu murid pada semester itu menolak 409 report_final', async () => {
    await db().insert(reportCard).values({
      schoolId,
      semesterId: semId,
      studentId: ids.eka!,
      classId: ids.xiB!,
      status: 'final',
      snapshot: {},
    });
    const res = await call('PUT', '/v1/lesson-attendance/combined', ownerCookie, {
      combinedKey: ids.combinedKey,
      date: MONDAY,
      records: [
        { studentId: ids.ani, status: 'present' },
        { studentId: ids.eka, status: 'present' },
      ],
    });
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('report_final');
    await db().delete(reportCard).where(eq(reportCard.semesterId, semId));
  });

  it('membutuhkan login dan izin attendance:read', async () => {
    const res = await app.inject({ method: 'GET', url: combinedUrl(), headers: { 'x-school-id': schoolId } });
    expect(res.statusCode).toBe(401);
  });
});
