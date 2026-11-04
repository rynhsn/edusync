import { localParts } from '@edusync/contracts';
import {
  academicYear,
  assignRoles,
  classRoom,
  enrollment,
  entitlement,
  eq,
  exam,
  examAttempt,
  foundation,
  guardian,
  member,
  portalLink,
  school,
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
let adminCookie = '';
let studentCookie = '';
let guardianCookie = '';
let studentId = '';
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

/** Tanggal dan jam dinding (Jakarta) `minutes` menit dari sekarang. */
const wall = (minutes: number) => localParts(new Date(Date.now() + minutes * 60_000), 'Asia/Jakarta');

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

/** Ujian CBT: dua pilihan ganda (kunci B, C) dan satu esai (poin 6). `startsInMin` < 0 = sudah dibuka. */
async function makeExam(over: Record<string, unknown> = {}, startsInMin = -10, durationMinutes = 60) {
  const w = wall(startsInMin);
  const ex = (
    await call('POST', '/v1/exams', adminCookie, {
      title: 'ASAS CBT',
      semesterId,
      subjectId: mtkId,
      classIds: [classA],
      mode: 'cbt',
      status: 'ready',
      examDate: w.date,
      startTime: w.time,
      durationMinutes,
      ...over,
    })
  ).json();
  const q = [];
  for (const body of [
    mcq('Satu', 'B'),
    mcq('Dua', 'C'),
    { subjectId: mtkId, type: 'essay', body: 'Uraikan', points: 6 },
  ]) {
    q.push((await call('POST', '/v1/exam/questions', adminCookie, body)).json().id);
  }
  const full = (await call('POST', `/v1/exams/${ex.id}/questions`, adminCookie, { questionIds: q })).json();
  return {
    id: ex.id as string,
    q: full.questions.map((x: { id: string }) => x.id) as [string, string, string],
  };
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan CBT', slug: `ycbt-${run}` })
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
    .values({ foundationId, slug: `cbt-${run}`, name: 'Sekolah CBT' })
    .returning();
  schoolId = s!.id;
  await seedSchoolRoles(db, schoolId);
  for (const moduleKey of ['grades', 'exams', 'attendance', 'parent_portal']) {
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
  const [mtk] = await db
    .insert(subject)
    .values([{ schoolId, code: 'MTK', name: 'Matematika' }])
    .returning();
  mtkId = mtk!.id;
  const [st, other] = await db
    .insert(student)
    .values([
      { schoolId, name: 'Siswa CBT', gender: 'L' as const },
      { schoolId, name: 'Siswa Lain', gender: 'P' as const },
    ])
    .returning();
  studentId = st!.id;
  await db.insert(enrollment).values([
    { schoolId, studentId: st!.id, classId: classA, academicYearId: y!.id },
    { schoolId, studentId: other!.id, classId: classB, academicYearId: y!.id },
  ]);

  adminCookie = (await join('admin-cbt', ['school_admin'])).cookie;
  const siswa = await join('siswa-cbt', ['student']);
  studentCookie = siswa.cookie;
  await db.insert(portalLink).values({ schoolId, memberId: siswa.memberId, kind: 'student', studentId });
  const wali = await join('wali-cbt', ['guardian']);
  guardianCookie = wali.cookie;
  const [g] = await db.insert(guardian).values({ schoolId, name: 'Wali CBT' }).returning();
  await db
    .insert(portalLink)
    .values({ schoolId, memberId: wali.memberId, kind: 'guardian', guardianId: g!.id });
});

afterAll(async () => {
  const db = app.platformDb;
  for (const table of [
    'audit_log',
    'exam_answer',
    'exam_attempt',
    'exam_question',
    'exam',
    'question',
    'portal_link',
    'guardian',
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

type Item = { id: string; state: string; questionCount: number };
const list = async () => (await call('GET', '/v1/portal/exams', studentCookie)).json() as Item[];

describe('daftar ujian siswa', () => {
  it('hanya ujian CBT siap untuk kelasnya; wali ditolak', async () => {
    const open = await makeExam({ title: 'Terbuka' });
    const draft = await makeExam({ title: 'Draf', status: 'draft' });
    const paper = await makeExam({ title: 'Kertas', mode: 'paper' });
    const otherClass = await makeExam({ title: 'Kelas lain', classIds: [classB] });
    const future = await makeExam({ title: 'Nanti' }, 120);
    const unscheduled = (
      await call('POST', '/v1/exams', adminCookie, {
        title: 'Tanpa jadwal',
        semesterId,
        subjectId: mtkId,
        classIds: [classA],
        mode: 'both',
        status: 'ready',
      })
    ).json();

    const items = await list();
    const state = (id: string) => items.find((i) => i.id === id)?.state;
    expect(state(open.id)).toBe('open');
    expect(state(future.id)).toBe('upcoming');
    expect(state(unscheduled.id)).toBe('unscheduled');
    for (const hidden of [draft.id, paper.id, otherClass.id]) expect(state(hidden)).toBeUndefined();
    expect(items.find((i) => i.id === open.id)?.questionCount).toBe(3);

    // Akun wali dan staf bukan peserta: daftar kosong, bukan galat.
    expect((await call('GET', '/v1/portal/exams', guardianCookie)).json()).toEqual([]);
    expect((await call('GET', '/v1/portal/exams', adminCookie)).json()).toEqual([]);
  });
});

describe('mengerjakan ujian', () => {
  it('mulai, soal tanpa kunci, melanjutkan tanpa mengulang waktu, belum waktunya ditolak', async () => {
    const ex = await makeExam({ title: 'Mulai' }, -10, 60);
    const started = await call('POST', `/v1/portal/exams/${ex.id}/start`, studentCookie);
    expect(started.statusCode, started.body).toBe(200);
    const s = started.json();
    expect(s.state).toBe('in_progress');
    expect(s.questions).toHaveLength(3);
    // Kunci jawaban dan pedoman tidak boleh bocor ke siswa.
    expect(JSON.stringify(s)).not.toMatch(/"answer"\s*:\s*"[A-C]"/);
    for (const q of s.questions) expect(q).not.toHaveProperty('answer');
    // Batas akhir = akhir jendela (mulai -10 menit + 60), bukan sekarang + 60.
    const left = (new Date(s.deadlineAt).getTime() - new Date(s.serverNow).getTime()) / 60_000;
    expect(left).toBeGreaterThan(48);
    expect(left).toBeLessThan(51.5);

    const again = (await call('POST', `/v1/portal/exams/${ex.id}/start`, studentCookie)).json();
    expect(again.deadlineAt).toBe(s.deadlineAt);

    const future = await makeExam({ title: 'Belum' }, 120);
    const early = await call('POST', `/v1/portal/exams/${future.id}/start`, studentCookie);
    expect(early.statusCode).toBe(409);
    expect(early.json().error.code).toBe('not_open');
    expect((await call('POST', `/v1/portal/exams/${ex.id}/start`, guardianCookie)).statusCode).toBe(404);
  });

  it('jawaban tersimpan dan dinilai di server; esai dipertahankan saat guru memberi skor', async () => {
    const ex = await makeExam({ title: 'Jawab' });
    await call('POST', `/v1/portal/exams/${ex.id}/start`, studentCookie);
    const [q1, q2, q3] = ex.q;
    const put = (body: object) => call('PUT', `/v1/portal/exams/${ex.id}/answers`, studentCookie, body);
    expect((await put({ answers: [{ questionId: q1, answer: 'Z' }] })).statusCode).toBe(400);
    expect((await put({ answers: [{ questionId: crypto.randomUUID(), answer: 'A' }] })).statusCode).toBe(400);
    const ok = await put({
      answers: [
        { questionId: q1, answer: 'b' }, // benar
        { questionId: q2, answer: 'A' }, // salah
        { questionId: q3, answer: 'Jawaban esai saya' },
      ],
      blurs: 2,
    });
    expect(ok.statusCode, ok.body).toBe(200);
    await put({ answers: [], blurs: 1 }); // hanya naik

    const resumed = (await call('GET', `/v1/portal/exams/${ex.id}/session`, studentCookie)).json();
    expect(resumed.answers).toMatchObject({ [q1]: 'B', [q2]: 'A', [q3]: 'Jawaban esai saya' });

    const sheet = (await call('GET', `/v1/exams/${ex.id}/scoresheet`, adminCookie)).json();
    const row = sheet.students.find((x: { studentId: string }) => x.studentId === studentId);
    expect(row).toMatchObject({ total: 2, entered: true, essayPending: true, blurCount: 2 });
    expect(row.startedAt).toBeTruthy();
    expect(row.answers[q3].answer).toBe('Jawaban esai saya');

    // Guru memberi skor esai: teks siswa tetap ada.
    const graded = (
      await call('PUT', `/v1/exams/${ex.id}/scoresheet`, adminCookie, {
        records: [{ studentId, answers: [{ questionId: q3, score: 5 }] }],
      })
    ).json();
    const after = graded.students.find((x: { studentId: string }) => x.studentId === studentId);
    expect(after.answers[q3]).toEqual({ answer: 'Jawaban esai saya', score: 5 });
    expect(after.total).toBe(7);
  });

  it('kumpul menutup percobaan; waktu habis otomatis mengumpulkan', async () => {
    const ex = await makeExam({ title: 'Kumpul' });
    await call('POST', `/v1/portal/exams/${ex.id}/start`, studentCookie);
    expect((await call('POST', `/v1/portal/exams/${ex.id}/submit`, studentCookie)).statusCode).toBe(200);
    expect((await call('POST', `/v1/portal/exams/${ex.id}/submit`, studentCookie)).statusCode).toBe(200); // idempoten
    const late = await call('PUT', `/v1/portal/exams/${ex.id}/answers`, studentCookie, {
      answers: [{ questionId: ex.q[0], answer: 'A' }],
    });
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe('closed');
    expect((await call('POST', `/v1/portal/exams/${ex.id}/start`, studentCookie)).json().error.code).toBe(
      'already_submitted',
    );
    expect((await list()).find((i) => i.id === ex.id)?.state).toBe('submitted');

    // Waktu habis: batas akhir dimundurkan ke masa lalu, lalu sesi dimuat ulang.
    const ex2 = await makeExam({ title: 'Habis' });
    await call('POST', `/v1/portal/exams/${ex2.id}/start`, studentCookie);
    await app.platformDb
      .update(examAttempt)
      .set({ deadlineAt: new Date(Date.now() - 60_000) })
      .where(eq(examAttempt.examId, ex2.id));
    const expired = await call('PUT', `/v1/portal/exams/${ex2.id}/answers`, studentCookie, {
      answers: [{ questionId: ex2.q[0], answer: 'B' }],
    });
    expect(expired.statusCode).toBe(409);
    const view = (await call('GET', `/v1/portal/exams/${ex2.id}/session`, studentCookie)).json();
    expect(view.state).toBe('submitted');
  });

  it('jawaban kertas yang dimasukkan guru tidak terbawa ke CBT siswa', async () => {
    const ex = await makeExam({ title: 'Kertas lalu CBT', mode: 'both' });
    await call('PUT', `/v1/exams/${ex.id}/scoresheet`, adminCookie, {
      records: [{ studentId, answers: [{ questionId: ex.q[0], answer: 'B' }] }],
    });
    const s = (await call('POST', `/v1/portal/exams/${ex.id}/start`, studentCookie)).json();
    expect(Object.values(s.answers).filter(Boolean)).toHaveLength(0);
  });

  it('acak soal dan opsi tetap untuk satu percobaan', async () => {
    const ex = await makeExam({ title: 'Acak', shuffleQuestions: true, shuffleOptions: true });
    const a = (await call('POST', `/v1/portal/exams/${ex.id}/start`, studentCookie)).json();
    const b = (await call('GET', `/v1/portal/exams/${ex.id}/session`, studentCookie)).json();
    expect(a.questions.map((q: { id: string }) => q.id)).toEqual(
      b.questions.map((q: { id: string }) => q.id),
    );
    expect(new Set(a.questions.map((q: { id: string }) => q.id))).toEqual(new Set(ex.q));
    const opts = a.questions[0].options.map((o: { key: string }) => o.key);
    expect(opts).toEqual(b.questions[0].options.map((o: { key: string }) => o.key));
    expect([...opts].sort()).toEqual(['A', 'B', 'C'].slice(0, opts.length));
    expect((await app.platformDb.select().from(exam).where(eq(exam.id, ex.id)))[0]).toMatchObject({
      shuffleQuestions: true,
      shuffleOptions: true,
    });
  });
});
