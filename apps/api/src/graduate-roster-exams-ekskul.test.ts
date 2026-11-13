import {
  academicYear,
  assignRoles,
  classRoom,
  enrollment,
  entitlement,
  eq,
  examAttempt,
  extracurricularAssessment,
  extracurricularAttendance,
  extracurricularMember,
  foundation,
  gradeComponent,
  member,
  school,
  score,
  seedSchoolRoles,
  semester,
  sql,
  student,
  subject,
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

/**
 * Lanjutan `graduate-roster.test.ts`: dua jalur BACA historis lain ikut memuat lulusan (`graduated`) yang punya
 * enrollment (ujian: tahun semester ujian) atau keanggotaan (ekskul: tahun keanggotaan) pada tahun itu. Jalur tulis
 * dan operasional tetap hanya siswa aktif; siswa pindah (`transferred`) tidak pernah ikut; lulusan tanpa
 * enrollment/keanggotaan pada tahun itu tidak ikut.
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let foundationId = '';
let adminCookie = '';
const userIds: string[] = [];

const ids = {
  pastYear: '',
  curYear: '',
  pastSem: '',
  pastCls: '',
  curCls: '',
  mtk: '',
  comp: '',
  ani: '',
  gita: '',
  tono: '',
  hana: '',
  exam: '',
  ekskul: '',
  session: '',
};

const call = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: {
      cookie: adminCookie,
      'x-school-id': schoolId,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Lulusan Ujian', slug: `yle-${run}` })
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
  const [s] = await db
    .insert(school)
    .values({ foundationId, slug: `lue-${run}`, name: 'Sekolah Lulusan Ujian' })
    .returning();
  schoolId = s!.id;
  await seedSchoolRoles(db, schoolId);
  for (const moduleKey of ['exams', 'grades', 'extracurricular']) {
    await db
      .insert(entitlement)
      .values({ schoolId, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
  }

  // Tahun lampau (tahun terakhir para lulusan) dan tahun berjalan.
  const [past] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2024/2025', startsOn: '2024-07-01', endsOn: '2025-06-30', isActive: false })
    .returning();
  const [cur] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30', isActive: true })
    .returning();
  ids.pastYear = past!.id;
  ids.curYear = cur!.id;
  const [sem] = await db
    .insert(semester)
    .values({
      schoolId,
      academicYearId: ids.pastYear,
      name: 'Genap',
      startsOn: '2025-01-05',
      endsOn: '2025-06-30',
      isActive: false,
    })
    .returning();
  ids.pastSem = sem!.id;

  const [pc] = await db
    .insert(classRoom)
    .values({ schoolId, academicYearId: ids.pastYear, name: 'XII A', level: 'XII' })
    .returning();
  const [cc] = await db
    .insert(classRoom)
    .values({ schoolId, academicYearId: ids.curYear, name: 'X A', level: 'X' })
    .returning();
  ids.pastCls = pc!.id;
  ids.curCls = cc!.id;

  const mk = async (
    name: string,
    status: 'active' | 'graduated' | 'transferred',
    yearId: string,
    classId: string,
  ) => {
    const [st] = await db.insert(student).values({ schoolId, name, gender: 'L', status }).returning();
    await db.insert(enrollment).values({ schoolId, studentId: st!.id, classId, academicYearId: yearId });
    return st!.id;
  };
  ids.ani = await mk('Ani', 'active', ids.pastYear, ids.pastCls);
  ids.gita = await mk('Gita', 'graduated', ids.pastYear, ids.pastCls);
  ids.tono = await mk('Tono', 'transferred', ids.pastYear, ids.pastCls);
  // Lulusan yang tidak punya enrollment/keanggotaan pada tahun lampau itu (hanya tahun berjalan): tidak ikut.
  ids.hana = await mk('Hana', 'graduated', ids.curYear, ids.curCls);

  const [mtk] = await db.insert(subject).values({ schoolId, code: 'MTK', name: 'Matematika' }).returning();
  ids.mtk = mtk!.id;
  const [comp] = await db.insert(gradeComponent).values({ schoolId, name: 'ASAS', weight: 100 }).returning();
  ids.comp = comp!.id;

  const [m] = await db
    .insert(member)
    .values({
      userId: (
        await app.auth.api.signUpEmail({
          body: { name: 'admin-lue', email: `admin-lue-${run}@example.test`, password },
        })
      ).user.id,
      schoolId,
    })
    .returning();
  userIds.push(m!.userId);
  await assignRoles(db, m!.id, schoolId, ['school_admin']);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email: `admin-lue-${run}@example.test`, password },
  });
  adminCookie = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  // Ujian tahun lampau (kertas) dengan satu soal pilihan ganda; Gita sudah punya data hasil sebelum lulus.
  const ex = (
    await call('POST', '/v1/exams', {
      title: 'ASAS lampau',
      semesterId: ids.pastSem,
      subjectId: ids.mtk,
      classIds: [ids.pastCls],
      mode: 'paper',
      examDate: '2025-03-10',
    })
  ).json();
  ids.exam = ex.id;
  const q = (
    await call('POST', '/v1/exam/questions', {
      subjectId: ids.mtk,
      type: 'mcq',
      body: 'Satu',
      options: [
        { key: 'A', text: 'satu' },
        { key: 'B', text: 'dua' },
      ],
      answer: 'B',
      points: 2,
    })
  ).json();
  await call('POST', `/v1/exams/${ids.exam}/questions`, { questionIds: [q.id] });
  await db
    .insert(examAttempt)
    .values({ schoolId, examId: ids.exam, studentId: ids.gita, absent: true, updatedBy: 'uji' });

  // Ekskul dengan keanggotaan tahun lampau (Ani, Gita, Tono) dan tahun berjalan (Hana). Anggota ditulis langsung,
  // karena API menambah anggota hanya menerima siswa aktif.
  const ek = (
    await call('POST', '/v1/extracurriculars', {
      name: 'Futsal',
      category: 'sport',
      externalCoach: 'Kak Rudi',
    })
  ).json();
  ids.ekskul = ek.id;
  for (const [studentId, academicYearId] of [
    [ids.ani, ids.pastYear],
    [ids.gita, ids.pastYear],
    [ids.tono, ids.pastYear],
    [ids.hana, ids.curYear],
  ] as const) {
    await db.insert(extracurricularMember).values({
      schoolId,
      extracurricularId: ids.ekskul,
      studentId,
      academicYearId,
      joinedOn: '2024-08-01',
    });
  }
  const sess = (
    await call('POST', `/v1/extracurriculars/${ids.ekskul}/sessions`, { date: '2025-02-03' })
  ).json();
  ids.session = sess.id;
  // Data yang dicatat sebelum kelulusan ditetapkan.
  await db.insert(extracurricularAttendance).values({
    schoolId,
    sessionId: ids.session,
    studentId: ids.gita,
    status: 'present',
    recordedBy: 'uji',
  });
  await db.insert(extracurricularAssessment).values({
    schoolId,
    extracurricularId: ids.ekskul,
    studentId: ids.gita,
    semesterId: ids.pastSem,
    predicate: 'A',
    updatedBy: 'uji',
  });
}, 90_000);

afterAll(async () => {
  const db = app.platformDb;
  for (const table of [
    'audit_log',
    'score',
    'assessment',
    'extracurricular_attendance',
    'extracurricular_assessment',
    'extracurricular_session',
    'extracurricular_member',
    'extracurricular',
    'extracurricular_category',
    'exam_answer',
    'exam_attempt',
    'exam_question',
    'exam',
    'question',
    'grade_component',
    'enrollment',
    'student',
    'subject',
    'class_room',
    'semester',
    'academic_year',
    'member',
    'role',
    'entitlement',
  ]) {
    await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${schoolId}`);
  }
  await db.delete(school).where(eq(school.id, schoolId));
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
}, 60_000);

describe('lembar nilai ujian tahun lampau', () => {
  it('GET memuat siswa aktif dan lulusan yang terdaftar di tahun semester; pindah dan lulusan tanpa enrollment tidak', async () => {
    const sheet = (await call('GET', `/v1/exams/${ids.exam}/scoresheet`)).json();
    expect(names(sheet.students)).toEqual(['Ani', 'Gita']);
    const gita = sheet.students.find((x: { name: string }) => x.name === 'Gita');
    expect(gita).toMatchObject({ entered: true, absent: true, studentStatus: 'graduated' });
    expect(sheet.students.find((x: { name: string }) => x.name === 'Ani').studentStatus).toBe('active');
  });

  it('PUT menolak lulusan, pindah, dan lulusan tanpa enrollment (400); siswa aktif diterima dan sheet tetap memuat lulusan', async () => {
    for (const studentId of [ids.gita, ids.tono, ids.hana]) {
      const res = await call('PUT', `/v1/exams/${ids.exam}/scoresheet`, {
        records: [{ studentId, absent: true }],
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('invalid_reference');
    }
    const ok = await call('PUT', `/v1/exams/${ids.exam}/scoresheet`, {
      records: [{ studentId: ids.ani, absent: false, answers: [] }],
    });
    expect(ok.statusCode).toBe(200);
    expect(names(ok.json().students)).toEqual(['Ani', 'Gita']);
    const byName = (n: string) => ok.json().students.find((x: { name: string }) => x.name === n);
    expect(byName('Gita').studentStatus).toBe('graduated');
    expect(byName('Ani').studentStatus).toBe('active');
  });

  it('POST grades (kirim ke buku nilai) tetap hanya siswa aktif: tidak membuat skor untuk lulusan', async () => {
    const res = await call('POST', `/v1/exams/${ids.exam}/grades`, {
      componentId: ids.comp,
      allowPending: true,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ assessments: 1, scores: 1 });
    const rows = await app.platformDb.select().from(score).where(eq(score.schoolId, schoolId));
    expect(rows.map((r) => r.studentId)).toEqual([ids.ani]);
  });
});

describe('ekskul tahun lampau', () => {
  const membersUrl = () => `/v1/extracurriculars/${ids.ekskul}/members?academicYearId=${ids.pastYear}`;

  it('GET anggota memuat lulusan yang punya keanggotaan tahun itu; pindah dan lulusan tanpa keanggotaan tidak', async () => {
    const list = (await call('GET', membersUrl())).json();
    expect(names(list)).toEqual(['Ani', 'Gita']);
    expect(list.find((x: { name: string }) => x.name === 'Gita').className).toBe('XII A');
    expect(list.find((x: { name: string }) => x.name === 'Gita').studentStatus).toBe('graduated');
    expect(list.find((x: { name: string }) => x.name === 'Ani').studentStatus).toBe('active');
  });

  it('tambah anggota tetap hanya siswa aktif', async () => {
    const res = await call('POST', `/v1/extracurriculars/${ids.ekskul}/members`, {
      studentIds: [ids.gita],
      academicYearId: ids.pastYear,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_reference');
  });

  it('laporan kehadiran tahun lampau memuat lulusan dengan rekapnya', async () => {
    const report = (
      await call('GET', `/v1/extracurriculars/${ids.ekskul}/report?from=2025-01-01&to=2025-03-01`)
    ).json();
    expect(names(report.students)).toEqual(['Ani', 'Gita']);
    expect(report.students.find((x: { name: string }) => x.name === 'Gita')).toMatchObject({
      present: 1,
      sessions: 1,
    });
  });

  it('penilaian: GET memuat lulusan dengan predikatnya; PUT menolak lulusan tetapi menerima siswa aktif', async () => {
    const url = `/v1/extracurriculars/${ids.ekskul}/assessments`;
    const list = (await call('GET', `${url}?semesterId=${ids.pastSem}`)).json();
    expect(names(list)).toEqual(['Ani', 'Gita']);
    expect(list.find((x: { name: string }) => x.name === 'Gita').predicate).toBe('A');
    expect(list.find((x: { name: string }) => x.name === 'Gita').studentStatus).toBe('graduated');
    expect(list.find((x: { name: string }) => x.name === 'Ani').studentStatus).toBe('active');

    const rejected = await call('PUT', url, {
      semesterId: ids.pastSem,
      records: [{ studentId: ids.gita, predicate: 'B' }],
    });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error.code).toBe('invalid_reference');
    const ok = await call('PUT', url, {
      semesterId: ids.pastSem,
      records: [{ studentId: ids.ani, predicate: 'B' }],
    });
    expect(ok.statusCode).toBe(200);
  });

  it('absensi pertemuan (operasional) tetap hanya anggota aktif: lembar tanpa lulusan, simpan lulusan ditolak', async () => {
    const sheet = (await call('GET', `/v1/extracurricular-sessions/${ids.session}/attendance`)).json();
    expect(names(sheet.students)).toEqual(['Ani']);
    const rejected = await call('PUT', `/v1/extracurricular-sessions/${ids.session}/attendance`, {
      records: [{ studentId: ids.gita, status: 'present' }],
    });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error.code).toBe('invalid_reference');
    const ok = await call('PUT', `/v1/extracurricular-sessions/${ids.session}/attendance`, {
      records: [{ studentId: ids.ani, status: 'present' }],
    });
    expect(ok.statusCode).toBe(200);
  });
});
