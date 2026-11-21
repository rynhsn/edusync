import { randomUUID } from 'node:crypto';
import {
  academicYear,
  and,
  assignRoles,
  auditLog,
  classRoom,
  enrollment,
  entitlement,
  eq,
  foundation,
  learningObjective,
  learningOutcome,
  learningPlan,
  learningPlanSetting,
  lessonJournal,
  lessonJournalObjective,
  lessonPeriod,
  member,
  reportCard,
  scheduleEntry,
  school,
  seedSchoolRoles,
  semester,
  sql,
  student,
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

/** Tahap 3.6.2: jurnal mengajar di Absensi per jam (`/v1/lesson-journals`), opsional per sekolah lewat sakelar jurnal. */
const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
// Senin dan Selasa di masa lalu, di dalam semester uji; tidak ada libur terdaftar.
const MONDAY = '2026-10-12';
const TUESDAY = '2026-10-13';
const FUTURE = '2099-01-05';

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let schoolId = '';
let otherId = '';
let yearId = '';
let semId = '';
const userIds: string[] = [];
const cookie = {} as Record<'admin' | 'adminGuru' | 'owner' | 'stranger' | 'other', string>;
const ids = {} as Record<string, string>;

const db = () => app.platformDb;
const call = (method: 'GET' | 'PUT' | 'DELETE', url: string, who: string, payload?: object, sid = schoolId) =>
  app.inject({
    method,
    url,
    headers: {
      cookie: who,
      'x-school-id': sid,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });
const code = (res: { json: () => { error?: { code?: string } } }) => res.json().error?.code;
const setSwitch = (journalEnabled: boolean, sid = schoolId, who = cookie.admin) =>
  call('PUT', '/v1/learning-plan/settings', who, { journalEnabled }, sid);
const jurl = (key: string, date = MONDAY) => `/v1/lesson-journals?scheduleEntryId=${ids[key]}&date=${date}`;
const put = (who: string, body: object) =>
  call('PUT', '/v1/lesson-journals', who, {
    scheduleEntryId: ids.mat,
    date: MONDAY,
    topic: 'Bilangan bulat',
    ...body,
  });
const rows = (key = 'mat') =>
  db()
    .select()
    .from(lessonJournal)
    .where(eq(lessonJournal.scheduleEntryId, ids[key] as string));

async function join(label: string, sid: string, roles: string[]) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  const [m] = await db().insert(member).values({ userId: res.user.id, schoolId: sid }).returning();
  await assignRoles(db(), m!.id, sid, roles);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return { memberId: m!.id, cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join('; ') };
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Jurnal', slug: `yj-${run}` })
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
    for (const moduleKey of ['schedule', 'attendance', 'grades']) {
      await db()
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    return s!.id;
  };
  schoolId = await make(`jr-${run}`);
  otherId = await make(`jr2-${run}`);
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
  await db().insert(academicYear).values({
    schoolId: otherId,
    name: '2026/2027',
    startsOn: '2026-07-13',
    endsOn: '2027-06-30',
    isActive: true,
  });

  cookie.admin = (await join('admin', schoolId, ['school_admin'])).cookie;
  const adminGuru = await join('adminguru', schoolId, ['school_admin']);
  cookie.adminGuru = adminGuru.cookie;
  const owner = await join('owner', schoolId, ['teacher']);
  cookie.owner = owner.cookie;
  cookie.stranger = (await join('stranger', schoolId, ['teacher'])).cookie;
  cookie.other = (await join('admin2', otherId, ['school_admin'])).cookie;

  const [p1] = await db()
    .insert(lessonPeriod)
    .values({ schoolId, number: 1, startsAt: '07:00', endsAt: '07:40' })
    .returning();
  const [p2] = await db()
    .insert(lessonPeriod)
    .values({ schoolId, number: 2, startsAt: '07:40', endsAt: '08:20' })
    .returning();
  const [t1] = await db()
    .insert(teacher)
    .values({ schoolId, name: 'Guru Pemilik', memberId: owner.memberId })
    .returning();
  const [t2] = await db()
    .insert(teacher)
    .values({ schoolId, name: 'Guru Pengganti', memberId: adminGuru.memberId })
    .returning();
  ids.owner = t1!.id;
  ids.sub = t2!.id;
  const mkClass = async (name: string) => {
    const [c] = await db()
      .insert(classRoom)
      .values({ schoolId, academicYearId: yearId, name, level: '7' })
      .returning();
    return c!.id;
  };
  ids.cA = await mkClass('7A');
  const cB = await mkClass('7B');
  const mk = async (key: string, name: string) => {
    const [s] = await db()
      .insert(subject)
      .values({ schoolId, code: `${key}-${run}`, name })
      .returning();
    ids[key] = s!.id;
    const [o] = await db()
      .insert(learningOutcome)
      .values({ schoolId, subjectId: s!.id, phase: 'D', description: `CP ${name}` })
      .returning();
    for (const [k, active] of [
      ['tp1', true],
      ['tp2', true],
      ['lama', false],
    ] as const) {
      const [t] = await db()
        .insert(learningObjective)
        .values({ schoolId, outcomeId: o!.id, description: k, active })
        .returning();
      ids[`${key}-${k}`] = t!.id;
    }
  };
  await mk('mtk', 'Matematika');
  await mk('ipa', 'IPA');
  const cell = async (key: string, classId: string, subjectId: string, extra: object = {}) => {
    const [e] = await db()
      .insert(scheduleEntry)
      .values({
        schoolId,
        academicYearId: yearId,
        classId,
        subjectId,
        teacherId: ids.owner as string,
        weekday: 1,
        periodId: p1!.id,
        ...extra,
      })
      .returning();
    ids[key] = e!.id;
  };
  ids.combinedKey = randomUUID();
  await cell('mat', ids.cA as string, ids.mtk as string);
  // Pertemuan gabungan: dua rombel, mapel IPA, guru pemilik, jam 2 supaya tidak bentrok dengan jam 1.
  await cell('gA', ids.cA as string, ids.ipa as string, { periodId: p2!.id, combinedKey: ids.combinedKey });
  await cell('gB', cB, ids.ipa as string, { periodId: p2!.id, combinedKey: ids.combinedKey });
  const [st] = await db()
    .insert(student)
    .values({ schoolId, name: 'Ani', gender: 'P', status: 'active', nis: `n-${run}` })
    .returning();
  await db()
    .insert(enrollment)
    .values({ schoolId, studentId: st!.id, classId: ids.cA as string, academicYearId: yearId });
  ids.student = st!.id;
}, 60_000);

afterAll(async () => {
  for (const sid of [schoolId, otherId]) {
    for (const table of [
      'audit_log',
      'lesson_journal_objective',
      'lesson_journal',
      'learning_plan_objective',
      'learning_plan',
      'learning_plan_setting',
      'learning_objective',
      'learning_outcome',
      'report_card',
      'schedule_entry',
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

describe('sakelar jurnal mati (bawaan)', () => {
  it('semua endpoint jurnal 403 feature_disabled dan GET /v1/lesson-attendance tidak berubah', async () => {
    for (const res of await Promise.all([
      call('GET', jurl('mat'), cookie.owner),
      put(cookie.owner, {}),
      call('DELETE', jurl('mat'), cookie.owner),
    ])) {
      expect(res.statusCode).toBe(403);
      expect(code(res)).toBe('feature_disabled');
    }
    expect(await rows()).toHaveLength(0);
    const before = await call(
      'GET',
      `/v1/lesson-attendance?scheduleEntryId=${ids.mat}&date=${MONDAY}`,
      cookie.owner,
    );
    expect(before.statusCode).toBe(200);
    expect(Object.keys(before.json()).sort()).toEqual(['canRecord', 'date', 'students', 'substitute']);
  });

  it('hanya curriculum:manage menyalakan; sekolah lain tidak terpengaruh', async () => {
    expect((await setSwitch(true, schoolId, cookie.owner)).statusCode).toBe(403);
    expect((await setSwitch(true)).statusCode).toBe(200);
    expect(code(await call('GET', jurl('mat'), cookie.other, undefined, otherId))).toBe('feature_disabled');
    // Hidup di sekolah lain pun tidak membuka jam pelajaran sekolah ini (RLS: 404).
    expect((await setSwitch(true, otherId, cookie.other)).statusCode).toBe(200);
    expect((await call('GET', jurl('mat'), cookie.other, undefined, otherId)).statusCode).toBe(404);
    await setSwitch(false, otherId, cookie.other);
  });
});

describe('jurnal satu jam', () => {
  it('belum ada jurnal: null; pemilik menyimpan, memperbarui (satu baris per sel+tanggal), dan membaca kembali', async () => {
    const empty = await call('GET', jurl('mat'), cookie.owner);
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toMatchObject({
      canRecord: true,
      substitute: false,
      journal: null,
      plans: [],
      subjectName: 'Matematika',
    });
    expect(empty.json().objectives.map((o: { description: string }) => o.description)).toEqual([
      'tp1',
      'tp2',
    ]);
    const first = await put(cookie.owner, { note: 'Kendala proyektor', objectiveIds: [ids['mtk-tp1']] });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toMatchObject({
      substitute: false,
      cells: 1,
      journal: {
        topic: 'Bilangan bulat',
        note: 'Kendala proyektor',
        actualTeacherName: null,
        objectiveIds: [ids['mtk-tp1']],
      },
    });
    const again = await put(cookie.owner, { topic: 'Pecahan', objectiveIds: [ids['mtk-tp2']] });
    expect(again.json().journal).toMatchObject({
      topic: 'Pecahan',
      note: null,
      objectiveIds: [ids['mtk-tp2']],
    });
    expect(await rows()).toHaveLength(1);
    const links = await db()
      .select()
      .from(lessonJournalObjective)
      .where(eq(lessonJournalObjective.schoolId, schoolId));
    expect(links).toHaveLength(1);
    const read = await call('GET', jurl('mat'), cookie.owner);
    expect(read.json().journal).toMatchObject({ topic: 'Pecahan' });
    const audits = await db()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.schoolId, schoolId), eq(auditLog.action, 'lesson_journal.save')));
    expect(audits).toHaveLength(2);
  });

  it('validasi: topik wajib, TP mapel lain/nonaktif/lebih dari 10, perencanaan mapel lain, sasaran, tanggal', async () => {
    expect((await put(cookie.owner, { topic: '   ' })).statusCode).toBe(400);
    expect(code(await put(cookie.owner, { objectiveIds: [ids['ipa-tp1']] }))).toBe(
      'objective_subject_mismatch',
    );
    expect(code(await put(cookie.owner, { objectiveIds: [ids['mtk-lama']] }))).toBe('objective_inactive');
    expect(code(await put(cookie.owner, { objectiveIds: [randomUUID()] }))).toBe('invalid_reference');
    const many = await put(cookie.owner, { objectiveIds: Array.from({ length: 11 }, () => randomUUID()) });
    expect(many.statusCode).toBe(400);
    const [other] = await db()
      .insert(learningPlan)
      .values({
        schoolId,
        subjectId: ids.ipa as string,
        academicYearId: yearId,
        title: 'Rencana IPA',
        goals: 'g',
        steps: 's',
        assessmentPlan: 'a',
      })
      .returning();
    expect(code(await put(cookie.owner, { planId: other!.id }))).toBe('invalid_reference');
    expect(code(await put(cookie.owner, { planId: randomUUID() }))).toBe('invalid_reference');
    expect(code(await put(cookie.owner, { scheduleEntryId: undefined }))).toBe('invalid_target');
    expect(code(await put(cookie.owner, { combinedKey: ids.combinedKey }))).toBe('invalid_target');
    expect(code(await put(cookie.owner, { date: TUESDAY }))).toBe('invalid_date');
    const future = await put(cookie.owner, { date: FUTURE });
    expect(future.statusCode).toBe(409);
    expect(code(future)).toBe('future_date');
    await db().delete(learningPlan).where(eq(learningPlan.id, other!.id));
  });

  it('perencanaan terkait: terdaftar di GET hanya bila sakelar perencanaan hidup, dan tersimpan sebagai planId', async () => {
    const [plan] = await db()
      .insert(learningPlan)
      .values({
        schoolId,
        subjectId: ids.mtk as string,
        academicYearId: yearId,
        title: 'Rencana MTK',
        goals: 'g',
        steps: 's',
        assessmentPlan: 'a',
      })
      .returning();
    expect((await call('GET', jurl('mat'), cookie.owner)).json().plans).toEqual([]);
    await call('PUT', '/v1/learning-plan/settings', cookie.admin, { planEnabled: true });
    const list = (await call('GET', jurl('mat'), cookie.owner)).json().plans;
    expect(list).toEqual([{ id: plan!.id, title: 'Rencana MTK', objectiveIds: [] }]);
    const saved = await put(cookie.owner, { planId: plan!.id });
    expect(saved.json().journal.planId).toBe(plan!.id);
    // Perencanaan dihapus: jurnal tetap, plan_id dikosongkan (SET NULL).
    await db().delete(learningPlan).where(eq(learningPlan.id, plan!.id));
    expect((await call('GET', jurl('mat'), cookie.owner)).json().journal).toMatchObject({
      planId: null,
      topic: 'Bilangan bulat',
    });
    await call('PUT', '/v1/learning-plan/settings', cookie.admin, { planEnabled: false });
  });

  it('bukan guru jam itu 403 not_your_lesson; pengurus menggantikan dan tercatat sebagai guru pengganti', async () => {
    const no = await put(cookie.stranger, {});
    expect(no.statusCode).toBe(403);
    expect(code(no)).toBe('not_your_lesson');
    expect(code(await call('DELETE', jurl('mat'), cookie.stranger))).toBe('not_your_lesson');
    expect((await call('GET', jurl('mat'), cookie.stranger)).json()).toMatchObject({ canRecord: false });
    const sub = await put(cookie.adminGuru, { topic: 'Diisi pengganti' });
    expect(sub.statusCode).toBe(200);
    expect(sub.json()).toMatchObject({ substitute: true, journal: { actualTeacherName: 'Guru Pengganti' } });
    const [row] = await rows();
    expect(row?.actualTeacherId).toBe(ids.sub);
    // Guru jadwal menyimpan lagi: tanda pengganti hilang.
    expect((await put(cookie.owner, {})).json().journal.actualTeacherName).toBeNull();
  });

  it('tidak diblokir rapor final', async () => {
    await db()
      .insert(reportCard)
      .values({
        schoolId,
        semesterId: semId,
        studentId: ids.student as string,
        classId: ids.cA as string,
        status: 'final',
        snapshot: {},
      });
    expect((await put(cookie.owner, { topic: 'Setelah rapor final' })).statusCode).toBe(200);
    await db().delete(reportCard).where(eq(reportCard.semesterId, semId));
  });

  it('hapus: 200 lalu 404; relasi TP ikut terhapus', async () => {
    expect((await call('DELETE', jurl('mat'), cookie.owner)).statusCode).toBe(200);
    expect((await call('DELETE', jurl('mat'), cookie.owner)).statusCode).toBe(404);
    expect(await rows()).toHaveLength(0);
    expect(
      await db().select().from(lessonJournalObjective).where(eq(lessonJournalObjective.schoolId, schoolId)),
    ).toHaveLength(0);
  });
});

describe('pertemuan gabungan', () => {
  const body = (extra: object = {}) => ({
    combinedKey: ids.combinedKey,
    date: MONDAY,
    topic: 'Praktikum gabungan',
    ...extra,
  });
  it('satu penyimpanan menulis jurnal yang sama ke tiap sel; hapus menghapus semuanya', async () => {
    const res = await call(
      'PUT',
      '/v1/lesson-journals',
      cookie.owner,
      body({ objectiveIds: [ids['ipa-tp1']] }),
    );
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ cells: 2, journal: { topic: 'Praktikum gabungan' } });
    for (const key of ['gA', 'gB']) expect(await rows(key)).toHaveLength(1);
    const read = await call(
      'GET',
      `/v1/lesson-journals?combinedKey=${ids.combinedKey}&date=${MONDAY}`,
      cookie.owner,
    );
    expect(read.json().journal).toMatchObject({ topic: 'Praktikum gabungan' });
    expect(code(await call('PUT', '/v1/lesson-journals', cookie.stranger, body()))).toBe('not_your_lesson');
    expect(code(await call('PUT', '/v1/lesson-journals', cookie.owner, body({ date: TUESDAY })))).toBe(
      'invalid_date',
    );
    const del = await call(
      'DELETE',
      `/v1/lesson-journals?combinedKey=${ids.combinedKey}&date=${MONDAY}`,
      cookie.owner,
    );
    expect(del.statusCode).toBe(200);
    for (const key of ['gA', 'gB']) expect(await rows(key)).toHaveLength(0);
  });
});

describe('RLS dan keterbacaan', () => {
  it('membutuhkan login; dan jurnal tanpa login ditolak', async () => {
    const anon = await app.inject({ method: 'GET', url: jurl('mat'), headers: { 'x-school-id': schoolId } });
    expect(anon.statusCode).toBe(401);
    await put(cookie.owner, {});
    await db().delete(lessonJournal).where(eq(lessonJournal.schoolId, schoolId));
    await db().delete(learningPlanSetting).where(eq(learningPlanSetting.schoolId, schoolId));
  });
});
