import {
  academicYear,
  assessment,
  assignRoles,
  classRoom,
  enrollment,
  entitlement,
  eq,
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
  teacher,
  teachingAssignment,
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
let foundationId = '';
let schoolId = '';
let semesterId = '';
let classA = '';
let classB = '';
let mtkId = '';
let bindId = '';
let componentId = '';
let adminCookie = '';
let mtkTeacherCookie = '';
let bindTeacherCookie = '';
let principalCookie = '';
const students: Record<string, string> = {};
const userIds: string[] = [];

async function join(label: string, roles: string[]) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  const [m] = await app.platformDb.insert(member).values({ userId: res.user.id, schoolId }).returning();
  await assignRoles(app.platformDb, m!.id, schoolId, roles);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return { cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join('; '), memberId: m!.id };
}

const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, cookie: string, payload?: object) =>
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

const mcq = (body: string, answer: string, points = 2) => ({
  subjectId: mtkId,
  type: 'mcq',
  body,
  options: [
    { key: 'A', text: 'satu' },
    { key: 'B', text: 'dua' },
    { key: 'C', text: 'tiga' },
  ],
  answer,
  points,
});

/** Ujian dengan dua pilihan ganda (kunci B dan C, masing-masing 2) dan satu esai (poin 6): total 10. */
async function makeExam(over: Record<string, unknown> = {}) {
  const ex = (
    await call('POST', '/v1/exams', adminCookie, {
      title: 'Uji nilai',
      semesterId,
      subjectId: mtkId,
      classIds: [classA, classB],
      mode: 'paper',
      examDate: '2026-12-08',
      ...over,
    })
  ).json();
  const q1 = (await call('POST', '/v1/exam/questions', adminCookie, mcq('Satu', 'B'))).json();
  const q2 = (await call('POST', '/v1/exam/questions', adminCookie, mcq('Dua', 'C'))).json();
  const q3 = (
    await call('POST', '/v1/exam/questions', adminCookie, {
      subjectId: mtkId,
      type: 'essay',
      body: 'Uraikan',
      points: 6,
    })
  ).json();
  const full = (
    await call('POST', `/v1/exams/${ex.id}/questions`, adminCookie, { questionIds: [q1.id, q2.id, q3.id] })
  ).json();
  const ids = full.questions.map((q: { id: string }) => q.id) as string[];
  return { id: ex.id as string, q: ids as [string, string, string] };
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Nilai', slug: `ynl-${run}` })
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
    .values({ foundationId, slug: `nilai-${run}`, name: 'Sekolah Nilai' })
    .returning();
  schoolId = s!.id;
  await seedSchoolRoles(db, schoolId);
  for (const moduleKey of ['grades', 'exams']) {
    await db
      .insert(entitlement)
      .values({ schoolId, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
  }
  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30', isActive: true })
    .returning();
  const [sem] = await db
    .insert(semester)
    .values({
      schoolId,
      academicYearId: y!.id,
      name: 'Ganjil',
      startsOn: '2026-07-13',
      endsOn: '2026-12-19',
      isActive: true,
    })
    .returning();
  semesterId = sem!.id;
  const [ka, kb] = await db
    .insert(classRoom)
    .values([
      { schoolId, academicYearId: y!.id, name: '7 A', level: '7' },
      { schoolId, academicYearId: y!.id, name: '7 B', level: '7' },
    ])
    .returning();
  classA = ka!.id;
  classB = kb!.id;
  const [mtk, bind] = await db
    .insert(subject)
    .values([
      { schoolId, code: 'MTK', name: 'Matematika' },
      { schoolId, code: 'BIN', name: 'Bahasa Indonesia' },
    ])
    .returning();
  mtkId = mtk!.id;
  bindId = bind!.id;
  const [comp] = await db.insert(gradeComponent).values({ schoolId, name: 'ASAS', weight: 40 }).returning();
  componentId = comp!.id;

  const people = [
    ['andi', 'Andi', classA, 'active'],
    ['budi', 'Budi', classA, 'active'],
    ['citra', 'Citra', classB, 'active'],
    ['pindah', 'Dodi Pindah', classA, 'transferred'],
  ] as const;
  for (const [key, name, cls, status] of people) {
    const [st] = await db.insert(student).values({ schoolId, name, gender: 'L', status }).returning();
    students[key] = st!.id;
    await db.insert(enrollment).values({ schoolId, studentId: st!.id, classId: cls, academicYearId: y!.id });
  }

  adminCookie = (await join('admin-nilai', ['school_admin'])).cookie;
  principalCookie = (await join('kepsek-nilai', ['principal'])).cookie;
  const guruMtk = await join('guru-mtk-nilai', ['teacher']);
  mtkTeacherCookie = guruMtk.cookie;
  const guruBin = await join('guru-bin-nilai', ['teacher']);
  bindTeacherCookie = guruBin.cookie;
  const [t1, t2] = await db
    .insert(teacher)
    .values([
      { schoolId, name: 'Guru MTK', memberId: guruMtk.memberId },
      { schoolId, name: 'Guru BIN', memberId: guruBin.memberId },
    ])
    .returning();
  await db.insert(teachingAssignment).values([
    { schoolId, classId: classA, subjectId: mtkId, teacherId: t1!.id },
    { schoolId, classId: classA, subjectId: bindId, teacherId: t2!.id },
  ]);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const table of [
    'audit_log',
    'score',
    'assessment',
    'exam_answer',
    'exam_attempt',
    'exam_question',
    'exam',
    'question',
    'grade_component',
    'teaching_assignment',
    'teacher',
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
});

type Sheet = {
  maxTotal: number;
  students: {
    studentId: string;
    name: string;
    entered: boolean;
    absent: boolean;
    total: number;
    percent: number | null;
    essayPending: boolean;
  }[];
};
const sheetOf = async (id: string, cookie = adminCookie) =>
  (await call('GET', `/v1/exams/${id}/scoresheet`, cookie)).json() as Sheet;
const row = (s: Sheet, key: string) =>
  s.students.find((x) => x.studentId === students[key]) as Sheet['students'][number];

describe('lembar nilai', () => {
  it('memuat siswa aktif kelas peserta saja', async () => {
    const ex = await makeExam();
    const sheet = await sheetOf(ex.id);
    expect(sheet.maxTotal).toBe(10);
    expect(sheet.students.map((s) => s.name)).toEqual(['Andi', 'Budi', 'Citra']);
    expect(sheet.students.every((s) => !s.entered)).toBe(true);
    // Guru mapel lain tidak melihat ujian ini; pembaca tanpa izin tulis boleh membaca.
    expect((await call('GET', `/v1/exams/${ex.id}/scoresheet`, bindTeacherCookie)).statusCode).toBe(404);
    expect((await call('GET', `/v1/exams/${ex.id}/scoresheet`, principalCookie)).statusCode).toBe(200);
  });

  it('pilihan ganda dinilai otomatis, esai dari guru, total dan persen dihitung', async () => {
    const ex = await makeExam();
    const [q1, q2, q3] = ex.q;
    const save = await call('PUT', `/v1/exams/${ex.id}/scoresheet`, mtkTeacherCookie, {
      records: [
        {
          studentId: students.andi,
          answers: [
            { questionId: q1, answer: 'b', score: 99 }, // benar; skor kiriman diabaikan
            { questionId: q2, answer: 'A' }, // salah
            { questionId: q3, score: 4.5 },
          ],
        },
        {
          studentId: students.budi,
          answers: [
            { questionId: q1, answer: 'B' },
            { questionId: q2, answer: 'C' },
          ],
        },
      ],
    });
    expect(save.statusCode, save.body).toBe(200);
    const sheet = save.json() as Sheet;
    expect(row(sheet, 'andi')).toMatchObject({ entered: true, total: 6.5, percent: 65, essayPending: false });
    expect(row(sheet, 'budi')).toMatchObject({ total: 4, percent: 40, essayPending: true });
    expect(row(sheet, 'citra').entered).toBe(false);

    // Soal yang tidak disebut tidak berubah: hanya esai Budi diisi.
    const again = (
      await call('PUT', `/v1/exams/${ex.id}/scoresheet`, adminCookie, {
        records: [{ studentId: students.budi, answers: [{ questionId: q3, score: 6 }] }],
      })
    ).json() as Sheet;
    expect(row(again, 'budi')).toMatchObject({ total: 10, percent: 100, essayPending: false });

    // Tidak hadir menghapus jawaban.
    const away = (
      await call('PUT', `/v1/exams/${ex.id}/scoresheet`, adminCookie, {
        records: [{ studentId: students.andi, absent: true }],
      })
    ).json() as Sheet;
    expect(row(away, 'andi')).toMatchObject({ absent: true, total: 0, percent: null });
  });

  it('memvalidasi masukan dan izin', async () => {
    const ex = await makeExam();
    const [q1, , q3] = ex.q;
    const put = (b: object, cookie = adminCookie) => call('PUT', `/v1/exams/${ex.id}/scoresheet`, cookie, b);
    expect(
      (await put({ records: [{ studentId: students.andi, answers: [{ questionId: q1, answer: 'Z' }] }] }))
        .statusCode,
    ).toBe(400);
    expect(
      (await put({ records: [{ studentId: students.andi, answers: [{ questionId: q3, score: 7 }] }] }))
        .statusCode,
    ).toBe(400);
    expect((await put({ records: [{ studentId: students.pindah, answers: [] }] })).statusCode).toBe(400);
    expect(
      (
        await put({
          records: [
            { studentId: students.andi, answers: [{ questionId: crypto.randomUUID(), answer: 'A' }] },
          ],
        })
      ).statusCode,
    ).toBe(400);
    const body = { records: [{ studentId: students.andi, answers: [{ questionId: q1, answer: 'A' }] }] };
    expect((await put(body, bindTeacherCookie)).statusCode).toBe(403);
    expect((await put(body, principalCookie)).statusCode).toBe(403);
    expect((await put(body, mtkTeacherCookie)).statusCode).toBe(200);
  });
});

describe('kirim ke buku nilai', () => {
  it('membuat penilaian per kelas, mengisi skor 0-100, dan idempoten', async () => {
    const ex = await makeExam({ title: 'ASAS Matematika' });
    const [q1, q2, q3] = ex.q;
    await call('PUT', `/v1/exams/${ex.id}/scoresheet`, adminCookie, {
      records: [
        {
          studentId: students.andi,
          answers: [
            { questionId: q1, answer: 'B' },
            { questionId: q2, answer: 'C' },
            { questionId: q3, score: 3 },
          ],
        },
        {
          studentId: students.citra,
          answers: [
            { questionId: q1, answer: 'B' },
            { questionId: q2, answer: 'A' },
            { questionId: q3, score: 0 },
          ],
        },
        { studentId: students.budi, absent: true },
      ],
    });

    expect(
      (await call('POST', `/v1/exams/${ex.id}/grades`, principalCookie, { componentId })).statusCode,
    ).toBe(403);
    expect(
      (await call('POST', `/v1/exams/${ex.id}/grades`, adminCookie, { componentId: crypto.randomUUID() }))
        .statusCode,
    ).toBe(400);

    const sent = await call('POST', `/v1/exams/${ex.id}/grades`, mtkTeacherCookie, { componentId });
    expect(sent.statusCode, sent.body).toBe(200);
    expect(sent.json()).toEqual({ assessments: 2, scores: 3 });

    const db = app.platformDb;
    const assessments = await db.select().from(assessment).where(eq(assessment.examId, ex.id));
    expect(assessments).toHaveLength(2);
    expect(assessments[0]).toMatchObject({
      title: 'ASAS Matematika',
      componentId,
      maxScore: 100,
      date: '2026-12-08',
    });
    const scores = await db
      .select()
      .from(score)
      .where(eq(score.assessmentId, assessments.find((a) => a.classId === classA)!.id));
    const byStudent = new Map(scores.map((s) => [s.studentId, s.value]));
    expect(byStudent.get(students.andi as string)).toBe(70); // 4 + 3 dari 10
    expect(byStudent.get(students.budi as string)).toBeNull(); // tidak hadir

    // Ubah nilai lalu kirim ulang: penilaian yang sama diperbarui, tidak ganda.
    await call('PUT', `/v1/exams/${ex.id}/scoresheet`, adminCookie, {
      records: [{ studentId: students.andi, answers: [{ questionId: q3, score: 6 }] }],
    });
    await call('POST', `/v1/exams/${ex.id}/grades`, adminCookie, { componentId });
    expect(await db.select().from(assessment).where(eq(assessment.examId, ex.id))).toHaveLength(2);
    const after = await db
      .select()
      .from(score)
      .where(eq(score.studentId, students.andi as string));
    expect(after.map((s) => s.value)).toEqual([100]);
  });

  it('esai belum dinilai menahan pengiriman kecuali dikonfirmasi', async () => {
    const ex = await makeExam({ title: 'Esai tertunda' });
    const [q1] = ex.q;
    await call('PUT', `/v1/exams/${ex.id}/scoresheet`, adminCookie, {
      records: [{ studentId: students.andi, answers: [{ questionId: q1, answer: 'B' }] }], // esai tak diisi
    });
    const held = await call('POST', `/v1/exams/${ex.id}/grades`, adminCookie, { componentId });
    expect(held.statusCode).toBe(409);
    expect(held.json().error.code).toBe('essay_pending');
    const sent = await call('POST', `/v1/exams/${ex.id}/grades`, adminCookie, {
      componentId,
      allowPending: true,
    });
    expect(sent.statusCode, sent.body).toBe(200);
    expect(sent.json().scores).toBe(1);
  });

  it('ujian tanpa soal ditolak', async () => {
    const ex = (
      await call('POST', '/v1/exams', adminCookie, {
        title: 'Kosong',
        semesterId,
        subjectId: mtkId,
        classIds: [classA],
      })
    ).json();
    const res = await call('POST', `/v1/exams/${ex.id}/grades`, adminCookie, { componentId });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('no_questions');
  });
});
