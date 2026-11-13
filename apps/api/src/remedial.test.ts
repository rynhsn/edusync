import { REMEDIAL_POLICIES, type RemedialPolicy } from '@edusync/contracts';
import {
  academicYear,
  achievementCriteria,
  assessment,
  assessmentObjective,
  assignRoles,
  auditLog,
  classRoom,
  createDb,
  enrollment,
  entitlement,
  eq,
  foundation,
  freezeSemesterGradingConfig,
  gradeComponent,
  learningObjective,
  learningOutcome,
  learningSupport,
  member,
  school,
  schoolLevel,
  score,
  scoreRemedialAttempt,
  seedSchoolRoles,
  semester,
  semesterGradingConfig,
  sql,
  student,
  subject,
  subscription,
  teacher,
  teachingAssignment,
  user,
  withTenant,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { loadGradingConfig, remedialContextFor } from './grading-config-lib';
import { computeGrades } from './grading-lib';
import { gradesFor } from './portal-lib';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/**
 * Tahap 3.5 (rancangan fase 3, tes T13, T6, T10, T14): remedial dan pengayaan. Lima kebijakan nilai pada tiga mode nilai, `record_only`
 * identik dengan tanpa percobaan, `cap_at_criteria` memakai KKM efektif, kebijakan beku per semester (aturan tulis-tembus, salinan
 * lama), ketercapaian TP memakai nilai efektif, hapus penilaian menghapus percobaan, guard `report_final`, CRUD pendampingan,
 * batas nilai, dan isolasi tenant. (T6 dorong ujian ada di `exam-scores.test.ts`.)
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const FAKE = '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let subscriptionId = '';
let subscriptionEnd = new Date();
const schoolIds: string[] = [];
const userIds: string[] = [];
const db = () => app.platformDb;
let seq = 0;

interface World {
  schoolId: string;
  yearId: string;
  /** Semester aktif dan semester kedua (tidak aktif) pada tahun ajaran yang sama. */
  sem: string;
  sem2: string;
  admin: string;
  teacher: string;
  teacherOther: string;
  cls: string;
  /** Kelas lain di sekolah yang sama (tanpa pengampu). */
  cls2: string;
  mat: string;
  ipa: string;
  /** Komponen: Tugas (30), UTS (70), Kuis (formatif). */
  tugas: string;
  uts: string;
  kuis: string;
  /** Siswa kelas `cls`: A, B, C; D siswa `cls2`. */
  a: string;
  b: string;
  c: string;
  d: string;
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
  const email = `${label}-${run}-${seq++}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  const [m] = await db().insert(member).values({ userId: res.user.id, schoolId: sid }).returning();
  await assignRoles(db(), m!.id, sid, roles);
  return { cookie: await login(email), memberId: m!.id };
}

async function makeWorld(tag: string): Promise<World> {
  const [s] = await db()
    .insert(school)
    .values({ foundationId, slug: `${tag}-${run}`, name: `Sekolah ${tag}` })
    .returning();
  const sid = s!.id;
  schoolIds.push(sid);
  await seedSchoolRoles(db(), sid);
  await db()
    .insert(entitlement)
    .values({ schoolId: sid, moduleKey: 'grades', subscriptionId, validUntil: subscriptionEnd });
  await db()
    .insert(schoolLevel)
    .values(['7', '8'].map((code, i) => ({ schoolId: sid, code, label: `Kelas ${code}`, sort: i })));
  const [y] = await db()
    .insert(academicYear)
    .values({
      schoolId: sid,
      name: '2000-2099',
      startsOn: '2000-01-01',
      endsOn: '2099-12-31',
      isActive: true,
    })
    .returning();
  const [sem] = await db()
    .insert(semester)
    .values({
      schoolId: sid,
      academicYearId: y!.id,
      name: 'Ganjil',
      startsOn: '2026-07-01',
      endsOn: '2026-12-31',
      isActive: true,
    })
    .returning();
  const [sem2] = await db()
    .insert(semester)
    .values({
      schoolId: sid,
      academicYearId: y!.id,
      name: 'Genap',
      startsOn: '2027-01-01',
      endsOn: '2027-06-30',
      isActive: false,
    })
    .returning();
  const mkSubject = async (code: string) =>
    (
      await db()
        .insert(subject)
        .values({ schoolId: sid, code, name: `Mapel ${code}` })
        .returning()
    )[0]!.id;
  const [mat, ipa] = [await mkSubject('MAT'), await mkSubject('IPA')];
  const comps = await db()
    .insert(gradeComponent)
    .values([
      { schoolId: sid, name: 'Tugas', weight: 30, sort: 0 },
      { schoolId: sid, name: 'UTS', weight: 70, sort: 1 },
      { schoolId: sid, name: 'Kuis', weight: 0, sort: 2, category: 'formative', includeInFinal: false },
    ])
    .returning();
  const comp = (n: string) => comps.find((c) => c.name === n)?.id ?? '';
  const mkClass = async (name: string, level: string) =>
    (
      await db().insert(classRoom).values({ schoolId: sid, academicYearId: y!.id, name, level }).returning()
    )[0]!.id;
  const cls = await mkClass('7A', '7');
  const cls2 = await mkClass('7B', '7');
  const mkStudent = async (name: string, classId: string) => {
    const [st] = await db()
      .insert(student)
      .values({ schoolId: sid, name, gender: 'L', status: 'active', nis: `${name}-${tag}-${run}` })
      .returning();
    await db()
      .insert(enrollment)
      .values({ schoolId: sid, studentId: st!.id, classId, academicYearId: y!.id });
    return st!.id;
  };
  const [a, b, c, d] = [
    await mkStudent('Ani', cls),
    await mkStudent('Budi', cls),
    await mkStudent('Cici', cls),
    await mkStudent('Dedi', cls2),
  ];
  const admin = await join(`admin-${tag}`, sid, ['school_admin']);
  const tm = await join(`guru-${tag}`, sid, ['teacher']);
  const to = await join(`guru-lain-${tag}`, sid, ['teacher']);
  const [tMat] = await db()
    .insert(teacher)
    .values({ schoolId: sid, name: 'Pak Mat', memberId: tm.memberId })
    .returning();
  await db().insert(teacher).values({ schoolId: sid, name: 'Bu Lain', memberId: to.memberId });
  await db()
    .insert(teachingAssignment)
    .values({ schoolId: sid, classId: cls, subjectId: mat, teacherId: tMat!.id });
  return {
    schoolId: sid,
    yearId: y!.id,
    sem: sem!.id,
    sem2: sem2!.id,
    admin: admin.cookie,
    teacher: tm.cookie,
    teacherOther: to.cookie,
    cls,
    cls2,
    mat,
    ipa,
    tugas: comp('Tugas'),
    uts: comp('UTS'),
    kuis: comp('Kuis'),
    a,
    b,
    c,
    d,
  };
}

const call = (
  w: World,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
  who = w.admin,
) =>
  app.inject({
    method,
    url,
    headers: {
      cookie: who,
      'x-school-id': w.schoolId,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

const errCode = (res: { json: () => { error: { code: string } } }) => res.json().error.code;

/** Penilaian langsung di DB beserta skor (siswa -> nilai). */
async function makeAssessment(
  w: World,
  a: {
    componentId?: string;
    semesterId?: string;
    classId?: string;
    subjectId?: string;
    max?: number;
    scores?: Record<string, number | null>;
    title?: string;
    objectiveIds?: string[];
  } = {},
) {
  const [row] = await db()
    .insert(assessment)
    .values({
      schoolId: w.schoolId,
      semesterId: a.semesterId ?? w.sem,
      classId: a.classId ?? w.cls,
      subjectId: a.subjectId ?? w.mat,
      componentId: a.componentId ?? w.tugas,
      title: a.title ?? `Penilaian ${seq++}`,
      date: '2026-08-01',
      maxScore: a.max ?? 100,
    })
    .returning();
  for (const [studentId, value] of Object.entries(a.scores ?? {})) {
    await db()
      .insert(score)
      .values({ schoolId: w.schoolId, assessmentId: row!.id, studentId, value, updatedBy: 'uji' });
  }
  if (a.objectiveIds?.length) {
    await db()
      .insert(assessmentObjective)
      .values(
        a.objectiveIds.map((objectiveId) => ({ schoolId: w.schoolId, assessmentId: row!.id, objectiveId })),
      );
  }
  return row!.id;
}

/** Percobaan remedial langsung di DB. */
const addAttempt = (
  w: World,
  assessmentId: string,
  studentId: string,
  attemptNo: number,
  value: number | null,
) =>
  db().insert(scoreRemedialAttempt).values({
    schoolId: w.schoolId,
    assessmentId,
    studentId,
    attemptNo,
    value,
    takenOn: '2026-09-01',
    recordedBy: 'uji',
  });

async function makeObjective(w: World, subjectId: string, label: string) {
  const [o] = await db()
    .insert(learningOutcome)
    .values({ schoolId: w.schoolId, subjectId, phase: 'D', description: `CP ${label}` })
    .returning();
  const [t] = await db()
    .insert(learningObjective)
    .values({
      schoolId: w.schoolId,
      outcomeId: o!.id,
      code: label,
      description: `TP ${label}`,
      sortOrder: seq++,
    })
    .returning();
  return t!.id;
}

const setSettings = (
  w: World,
  over: { calculationMode?: string; remedialPolicy?: string; kkm?: number } = {},
  who = w.admin,
) =>
  call(
    w,
    'PUT',
    '/v1/grading/settings',
    { kkm: 75, predicateA: 90, predicateB: 80, predicateC: 70, ...over },
    who,
  );

interface RecapStudent {
  studentId: string;
  perComponent: { componentId: string; average: number | null }[];
  final: number | null;
  predicate: string | null;
  belowKkm: boolean;
  source?: string;
  remedial?: { attempts: number; effectiveSource: string };
}
interface Recap {
  kkm: number;
  remedialPolicy?: string;
  students: RecapStudent[];
  stats: unknown;
}

async function recap(w: World, semesterId = w.sem, who = w.admin) {
  const res = await call(
    w,
    'GET',
    `/v1/grading/recap?semesterId=${semesterId}&classId=${w.cls}&subjectId=${w.mat}`,
    undefined,
    who,
  );
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as Recap;
}
const finalOf = (r: Recap, studentId: string) => r.students.find((s) => s.studentId === studentId)!.final;

const frozenRow = async (semesterId: string) =>
  (
    await db().select().from(semesterGradingConfig).where(eq(semesterGradingConfig.semesterId, semesterId))
  )[0];

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Remedial', slug: `yrem-${run}` })
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
  subscriptionId = sub!.id;
  subscriptionEnd = sub!.currentPeriodEnd;
}, 120_000);

afterAll(async () => {
  const tables = await db().execute<{ table_name: string }>(
    sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'school_id' and table_name <> 'school'`,
  );
  // Satu pernyataan per tabel untuk semua sekolah uji; beberapa putaran karena urutan FK tidak diketahui.
  const ids = sql.join(
    schoolIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  for (let pass = 0; pass < 6; pass++) {
    for (const { table_name } of tables.rows) {
      await db()
        .execute(sql`delete from ${sql.identifier(table_name)} where school_id in (${ids})`)
        .catch(() => undefined);
    }
  }
  for (const sId of schoolIds) await db().delete(school).where(eq(school.id, sId));
  await db().execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db().delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db().delete(user).where(eq(user.id, uid));
  await app.close();
}, 240_000);

/* ------------------------------------------------------------------------------------------------ */

describe('T13: lima kebijakan nilai pada tiga mode nilai', () => {
  let w: World;
  beforeAll(async () => {
    w = await makeWorld('t13');
    // Ani: Tugas asli 60 dengan dua percobaan (90 lalu 70), UTS 80. Budi: Tugas 60, UTS 80, tanpa percobaan. Cici: 95 dan 80.
    const tugas = await makeAssessment(w, {
      componentId: w.tugas,
      scores: { [w.a]: 60, [w.b]: 60, [w.c]: 95 },
    });
    await makeAssessment(w, { componentId: w.uts, scores: { [w.a]: 80, [w.b]: 80, [w.c]: 80 } });
    await addAttempt(w, tugas, w.a, 1, 90);
    await addAttempt(w, tugas, w.a, 2, 70);
  }, 120_000);

  /** Nilai Tugas efektif Ani per kebijakan (KKM 75): asli 60, percobaan 90 lalu 70. */
  const tugasEffective: Record<RemedialPolicy, number> = {
    record_only: 60,
    replace_latest: 70,
    max: 90,
    cap_at_criteria: 75,
    mean_with_original: 65,
  };
  const finalFor = (mode: string, tugas: number) =>
    mode === 'simple_average' ? (tugas + 80) / 2 : (tugas * 30 + 80 * 70) / 100;

  for (const mode of ['weighted_average', 'percentage', 'simple_average'] as const) {
    it(`mode ${mode}: nilai akhir mengikuti kebijakan, skor asli tidak ditimpa, siswa tanpa percobaan tidak berubah`, async () => {
      for (const policy of REMEDIAL_POLICIES) {
        const res = await setSettings(w, { calculationMode: mode, remedialPolicy: policy });
        expect(res.statusCode, res.body).toBe(200);
        const r = await recap(w);
        const ani = r.students.find((s) => s.studentId === w.a)!;
        expect(ani.final, `${mode}/${policy}`).toBeCloseTo(finalFor(mode, tugasEffective[policy]), 2);
        // Budi dan Cici tidak punya percobaan: nilai dan penanda tidak berubah oleh kebijakan apa pun.
        expect(finalOf(r, w.b), `${mode}/${policy}`).toBeCloseTo(finalFor(mode, 60), 2);
        expect(finalOf(r, w.c), `${mode}/${policy}`).toBeCloseTo(finalFor(mode, 95), 2);
        expect(r.students.find((s) => s.studentId === w.b)!.remedial).toBeUndefined();
        // Penanda hanya pada siswa ber-percobaan; sumber `original` hanya bila nilai efektif sama dengan skor asli.
        expect(ani.remedial).toEqual({
          attempts: 2,
          effectiveSource: policy === 'record_only' ? 'original' : 'remedial',
        });
        expect(r.remedialPolicy).toBe(policy === 'record_only' ? undefined : policy);
      }
      // Skor asli di database tidak pernah berubah.
      const originals = await db().select().from(score).where(eq(score.studentId, w.a));
      expect(originals.map((s) => s.value).sort()).toEqual([60, 80]);
    }, 120_000);
  }

  it('record_only mengikuti skor asli persis seperti sebelum ada percobaan (rekap, leger, rapor draf, portal)', async () => {
    const w2 = await makeWorld('t13-identik');
    const tugas = await makeAssessment(w2, { componentId: w2.tugas, scores: { [w2.a]: 60, [w2.b]: 82 } });
    await makeAssessment(w2, { componentId: w2.uts, scores: { [w2.a]: 80, [w2.b]: 70 } });
    expect((await setSettings(w2, { remedialPolicy: 'record_only' })).statusCode).toBe(200);

    const sem = (await db().select().from(semester).where(eq(semester.id, w2.sem)))[0]!;
    const snapshot = async () => {
      const r = await recap(w2);
      const ledger = (
        await call(w2, 'GET', `/v1/grading/recap/class?semesterId=${w2.sem}&classId=${w2.cls}`)
      ).json();
      const doc = (await call(w2, 'GET', `/v1/report-cards/${w2.a}?semesterId=${w2.sem}`)).json();
      delete doc.generatedAt;
      const portal = await withTenant(app.tenantDb, [w2.schoolId], (tx) => gradesFor(tx, w2.a, sem));
      // Penanda remedial adalah satu-satunya bidang yang boleh berbeda.
      for (const s of r.students) delete s.remedial;
      const portalClean = JSON.parse(JSON.stringify(portal)) as { subjects: { remedial?: unknown }[] };
      for (const s of portalClean.subjects) delete s.remedial;
      return { r, ledger, doc, portal: portalClean };
    };
    const without = await snapshot();
    await addAttempt(w2, tugas, w2.a, 1, 100);
    await addAttempt(w2, tugas, w2.b, 1, 100);
    const withAttempts = await snapshot();
    expect(withAttempts).toEqual(without);
    // Dan memang sama dengan perhitungan tanpa percobaan sama sekali (tidak ada kueri tabel percobaan tanpa konteks).
    const cfg = await withTenant(app.tenantDb, [w2.schoolId], (tx) => loadGradingConfig(tx, w2.sem));
    const ctx = await withTenant(app.tenantDb, [w2.schoolId], (tx) =>
      remedialContextFor(tx, cfg, { classId: w2.cls, subjectIds: [w2.mat] }),
    );
    expect(ctx).toBeUndefined();
  }, 120_000);

  it('rapor draf, rekap leger, dan nilai portal memakai nilai efektif yang sama dengan rekap', async () => {
    const w2 = await makeWorld('t13-permukaan');
    const tugas = await makeAssessment(w2, { componentId: w2.tugas, scores: { [w2.a]: 60 } });
    await makeAssessment(w2, { componentId: w2.uts, scores: { [w2.a]: 80 } });
    await addAttempt(w2, tugas, w2.a, 1, 90);
    expect((await setSettings(w2, { remedialPolicy: 'max' })).statusCode).toBe(200);
    const expected = 0.3 * 90 + 0.7 * 80;
    expect(finalOf(await recap(w2), w2.a)).toBeCloseTo(expected, 2);

    const doc = (await call(w2, 'GET', `/v1/report-cards/${w2.a}?semesterId=${w2.sem}`)).json();
    expect(doc.subjects.find((s: { subjectId: string }) => s.subjectId === w2.mat).final).toBeCloseTo(
      expected,
      2,
    );
    const ledger = (
      await call(w2, 'GET', `/v1/grading/recap/class?semesterId=${w2.sem}&classId=${w2.cls}`)
    ).json();
    expect(
      ledger.students.find((s: { studentId: string }) => s.studentId === w2.a).grades[0].final,
    ).toBeCloseTo(expected, 2);
    const sem = (await db().select().from(semester).where(eq(semester.id, w2.sem)))[0]!;
    const portal = await withTenant(app.tenantDb, [w2.schoolId], (tx) => gradesFor(tx, w2.a, sem));
    expect(portal.subjects[0]!.final).toBeCloseTo(expected, 2);
    expect(portal.subjects[0]!.remedial).toEqual({ attempts: 1, effectiveSource: 'remedial' });
    // Rekap menyebut kebijakan, dan skor asli di buku nilai tetap 60.
    expect((await recap(w2)).remedialPolicy).toBe('max');
  }, 120_000);

  it('cap_at_criteria memakai KKM efektif mapel (KKTP), bukan KKM sekolah', async () => {
    const w2 = await makeWorld('t13-kktp');
    const tugas = await makeAssessment(w2, { componentId: w2.tugas, scores: { [w2.a]: 60 } });
    await makeAssessment(w2, { componentId: w2.uts, scores: { [w2.a]: 80 } });
    await addAttempt(w2, tugas, w2.a, 1, 95);
    expect((await setSettings(w2, { remedialPolicy: 'cap_at_criteria' })).statusCode).toBe(200);
    // Tanpa KKTP: batas = KKM sekolah 75.
    expect(finalOf(await recap(w2), w2.a)).toBeCloseTo(0.3 * 75 + 0.7 * 80, 2);
    // KKTP tingkat 7 untuk mapel: KKM 85, jadi remedial menaikkan sampai 85.
    await db()
      .insert(achievementCriteria)
      .values({ schoolId: w2.schoolId, subjectId: w2.mat, levelCode: '7', mode: 'numeric', threshold: 85 });
    const r = await recap(w2);
    expect(r.kkm).toBe(85);
    expect(finalOf(r, w2.a)).toBeCloseTo(0.3 * 85 + 0.7 * 80, 2);
    // Skor maksimum bukan 100: ambang dalam satuan skor (85% dari 20 = 17).
    const kecil = await makeAssessment(w2, { componentId: w2.tugas, max: 20, scores: { [w2.b]: 10 } });
    await makeAssessment(w2, { componentId: w2.uts, scores: { [w2.b]: 80 } });
    await addAttempt(w2, kecil, w2.b, 1, 20);
    // Budi: Tugas efektif 17/20 = 85%.
    expect(finalOf(await recap(w2), w2.b)).toBeCloseTo(0.3 * 85 + 0.7 * 80, 2);
  }, 120_000);

  it('jumlah kueri penghitung tidak bergantung pada banyaknya percobaan', async () => {
    const w2 = await makeWorld('t13-kueri');
    const tugas = await makeAssessment(w2, {
      componentId: w2.tugas,
      scores: { [w2.a]: 60, [w2.b]: 60, [w2.c]: 60 },
    });
    expect((await setSettings(w2, { remedialPolicy: 'max' })).statusCode).toBe(200);
    const counting = createDb(process.env.DATABASE_URL!);
    let queries = 0;
    counting.pool.on('connect', (client) => {
      const c = client as unknown as { query: (...a: unknown[]) => unknown };
      const orig = c.query.bind(client);
      c.query = (...a: unknown[]) => {
        queries += 1;
        return orig(...a);
      };
    });
    try {
      const count = async () => {
        queries = 0;
        await withTenant(counting.db, [w2.schoolId], async (tx) => {
          const cfg = await loadGradingConfig(tx, w2.sem);
          return computeGrades(tx, {
            semesterId: w2.sem,
            classId: w2.cls,
            subjectIds: [w2.mat],
            studentIds: [w2.a, w2.b, w2.c],
            components: cfg.components,
            settings: cfg.settings,
            remedial: await remedialContextFor(tx, cfg, { classId: w2.cls, subjectIds: [w2.mat] }),
          });
        });
        return queries;
      };
      await addAttempt(w2, tugas, w2.a, 1, 90);
      const one = await count();
      await addAttempt(w2, tugas, w2.b, 1, 90);
      await addAttempt(w2, tugas, w2.c, 1, 90);
      await addAttempt(w2, tugas, w2.c, 2, 95);
      expect(await count()).toBe(one);
    } finally {
      await counting.pool.end();
    }
  }, 120_000);
});

/* ------------------------------------------------------------------------------------------------ */

describe('kebijakan beku per semester', () => {
  let w: World;
  beforeAll(async () => {
    w = await makeWorld('beku');
    // Data identik di kedua semester: Ani Tugas 60 (percobaan 90 lalu 70), UTS 80.
    for (const semesterId of [w.sem, w.sem2]) {
      const tugas = await makeAssessment(w, { semesterId, componentId: w.tugas, scores: { [w.a]: 60 } });
      await makeAssessment(w, { semesterId, componentId: w.uts, scores: { [w.a]: 80 } });
      await addAttempt(w, tugas, w.a, 1, 90);
      await addAttempt(w, tugas, w.a, 2, 70);
    }
  }, 120_000);

  const at = (policy: RemedialPolicy) =>
    ({
      record_only: 0.3 * 60 + 0.7 * 80,
      replace_latest: 0.3 * 70 + 0.7 * 80,
      max: 0.3 * 90 + 0.7 * 80,
      cap_at_criteria: 0.3 * 75 + 0.7 * 80,
      mean_with_original: 0.3 * 65 + 0.7 * 80,
    })[policy];
  const status = async (semesterId: string) =>
    (await call(w, 'GET', `/v1/semesters/${semesterId}/grading-config`)).json() as {
      matchesLive: boolean;
      remedialPolicy?: string;
    };
  const freezeSem2 = (overwrite = true) =>
    freezeSemesterGradingConfig(db(), {
      schoolId: w.schoolId,
      semesterId: w.sem2,
      origin: 'semester_closed',
      actorId: null,
      overwrite,
    });

  it('semester beku tidak berubah bila kebijakan hidup diubah; salinan lama dibaca record_only', async () => {
    await freezeSem2();
    const first = await frozenRow(w.sem2);
    // Kebijakan bawaan: salinan sparse (kolom NULL). Versi 2 di sini hanya karena dunia uji punya komponen formatif.
    expect(first!.remedialPolicy).toBeNull();
    expect((await status(w.sem2)).remedialPolicy).toBeUndefined();

    const set = await setSettings(w, { remedialPolicy: 'max' });
    expect(set.statusCode, set.body).toBe(200);
    expect(set.json().remedialPolicy).toBe('max');
    // Semester aktif (tanpa salinan beku) langsung mengikuti kebijakan hidup; semester beku tetap record_only.
    expect(finalOf(await recap(w, w.sem), w.a)).toBeCloseTo(at('max'), 2);
    expect(finalOf(await recap(w, w.sem2), w.a)).toBeCloseTo(at('record_only'), 2);
    expect((await status(w.sem2)).matchesLive).toBe(false);
    // Semester nonaktif tidak disentuh aturan tulis-tembus.
    expect(set.json().syncedSemesterId).toBeUndefined();
    expect((await frozenRow(w.sem2))!.remedialPolicy).toBeNull();
  });

  it('menerapkan pengaturan terkini ke semester beku menyalin kebijakan; perubahan hidup berikutnya tidak menggeser', async () => {
    await freezeSem2();
    const row = await frozenRow(w.sem2);
    expect(row!.remedialPolicy).toBe('max');
    const st = await status(w.sem2);
    expect([st.matchesLive, st.remedialPolicy]).toEqual([true, 'max']);

    for (const policy of ['replace_latest', 'cap_at_criteria', 'mean_with_original'] as const) {
      expect((await setSettings(w, { remedialPolicy: policy })).statusCode).toBe(200);
      expect(finalOf(await recap(w, w.sem2), w.a), policy).toBeCloseTo(at('max'), 2);
      expect(finalOf(await recap(w, w.sem), w.a), policy).toBeCloseTo(at(policy), 2);
    }
  });

  it('aturan tulis-tembus: semester aktif beku tanpa rapor final ikut disinkronkan, kembali ke bawaan menjadi NULL', async () => {
    await freezeSemesterGradingConfig(db(), {
      schoolId: w.schoolId,
      semesterId: w.sem,
      origin: 'sync',
      actorId: null,
      overwrite: true,
    });
    const set = await setSettings(w, { remedialPolicy: 'replace_latest' });
    expect(set.statusCode, set.body).toBe(200);
    expect(set.json().syncedSemesterId).toBe(w.sem);
    expect((await frozenRow(w.sem))!.remedialPolicy).toBe('replace_latest');
    expect(finalOf(await recap(w, w.sem), w.a)).toBeCloseTo(at('replace_latest'), 2);
    expect((await status(w.sem)).matchesLive).toBe(true);

    const back = await setSettings(w, { remedialPolicy: 'record_only' });
    expect(back.json().syncedSemesterId).toBe(w.sem);
    expect((await frozenRow(w.sem))!.remedialPolicy).toBeNull();
    expect(finalOf(await recap(w, w.sem), w.a)).toBeCloseTo(at('record_only'), 2);
    // Semester kedua tetap pada salinannya (max).
    expect(finalOf(await recap(w, w.sem2), w.a)).toBeCloseTo(at('max'), 2);
  });

  it('kebijakan yang tidak dikirim dipertahankan; nilai asing ditolak validasi', async () => {
    expect((await setSettings(w, { remedialPolicy: 'max' })).statusCode).toBe(200);
    const keep = await call(w, 'PUT', '/v1/grading/settings', {
      kkm: 75,
      predicateA: 90,
      predicateB: 80,
      predicateC: 70,
    });
    expect(keep.json().remedialPolicy).toBe('max');
    const get = await call(w, 'GET', '/v1/grading/settings');
    expect(get.json().remedialPolicy).toBe('max');
    expect((await setSettings(w, { remedialPolicy: 'tebak' })).statusCode).toBe(400);
    // Hanya pemegang grade:configure.
    expect((await setSettings(w, { remedialPolicy: 'max' }, w.teacher)).statusCode).toBe(403);
    expect((await setSettings(w, { remedialPolicy: 'record_only' })).statusCode).toBe(200);
    expect((await call(w, 'GET', '/v1/grading/settings')).json().remedialPolicy).toBeUndefined();
  });
});

/* ------------------------------------------------------------------------------------------------ */

describe('ketercapaian TP memakai nilai efektif', () => {
  let w: World;
  let tp = '';
  beforeAll(async () => {
    w = await makeWorld('tp');
    tp = await makeObjective(w, w.mat, 'M1');
    const tugas = await makeAssessment(w, {
      componentId: w.tugas,
      scores: { [w.a]: 60, [w.b]: 60 },
      objectiveIds: [tp],
    });
    await addAttempt(w, tugas, w.a, 1, 90);
  }, 120_000);

  const cell = async (studentId: string) => {
    const res = await call(
      w,
      'GET',
      `/v1/grading/objective-achievement?semesterId=${w.sem}&classId=${w.cls}&subjectId=${w.mat}`,
    );
    expect(res.statusCode, res.body).toBe(200);
    const m = res.json() as {
      students: {
        studentId: string;
        cells: { objectiveId: string; percent: number | null; achieved: boolean | null }[];
      }[];
    };
    return m.students.find((s) => s.studentId === studentId)!.cells.find((c) => c.objectiveId === tp)!;
  };

  it('record_only: persen dan status dari skor asli; kebijakan lain: dari nilai efektif', async () => {
    expect((await setSettings(w, { remedialPolicy: 'record_only' })).statusCode).toBe(200);
    expect(await cell(w.a)).toMatchObject({ percent: 60, achieved: false });
    for (const [policy, percent, achieved] of [
      ['max', 90, true],
      ['replace_latest', 90, true],
      ['cap_at_criteria', 75, true],
      ['mean_with_original', 75, true],
    ] as const) {
      expect((await setSettings(w, { remedialPolicy: policy })).statusCode).toBe(200);
      expect(await cell(w.a), policy).toMatchObject({ percent, achieved });
      // Siswa tanpa percobaan tidak berubah.
      expect(await cell(w.b), policy).toMatchObject({ percent: 60, achieved: false });
    }
  });
});

/* ------------------------------------------------------------------------------------------------ */

describe('percobaan remedial (API)', () => {
  let w: World;
  let tugas = '';
  let kecil = '';
  beforeAll(async () => {
    w = await makeWorld('api');
    tugas = await makeAssessment(w, {
      componentId: w.tugas,
      scores: { [w.a]: 60, [w.b]: 60, [w.c]: 75 },
      title: 'Tugas 1',
    });
    kecil = await makeAssessment(w, {
      componentId: w.uts,
      max: 50,
      scores: { [w.a]: 20 },
      title: 'UTS kecil',
    });
  }, 120_000);

  const attemptsUrl = (id: string) => `/v1/assessments/${id}/remedial-attempts`;
  interface Sheet {
    policy: string;
    kkm: number;
    canInput: boolean;
    students: {
      studentId: string;
      original: number | null;
      percent: number | null;
      needsRemedial: boolean;
      effective: number | null;
      effectiveSource: string;
      attempts: {
        id: string;
        attemptNo: number;
        value: number | null;
        supportId: string | null;
        note: string | null;
      }[];
    }[];
  }
  const sheet = async (id: string, who = w.admin) => {
    const res = await call(w, 'GET', attemptsUrl(id), undefined, who);
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as Sheet;
  };
  const row = (s: Sheet, id: string) => s.students.find((x) => x.studentId === id)!;

  it('mencatat percobaan berurutan; skor asli tidak berubah; nilai efektif mengikuti kebijakan', async () => {
    const created = await call(
      w,
      'POST',
      attemptsUrl(tugas),
      {
        records: [
          { studentId: w.a, value: 90, takenOn: '2026-09-10' },
          { studentId: w.a, value: 70, note: 'remedial kedua' },
          { studentId: w.b, value: null },
        ],
      },
      w.teacher,
    );
    expect(created.statusCode, created.body).toBe(201);
    const s = created.json() as Sheet;
    expect(row(s, w.a).attempts.map((x) => [x.attemptNo, x.value])).toEqual([
      [1, 90],
      [2, 70],
    ]);
    expect(row(s, w.a).attempts[0]).toMatchObject({ supportId: null });
    expect(row(s, w.a).attempts[1]!.note).toBe('remedial kedua');
    expect(row(s, w.b).attempts.map((x) => [x.attemptNo, x.value])).toEqual([[1, null]]);
    // Bawaan record_only: hanya dicatat.
    expect([s.policy, s.kkm]).toEqual(['record_only', 75]);
    expect(row(s, w.a)).toMatchObject({
      original: 60,
      percent: 60,
      needsRemedial: true,
      effective: 60,
      effectiveSource: 'original',
    });
    // Percobaan berikutnya melanjutkan nomor.
    const more = await call(
      w,
      'POST',
      attemptsUrl(tugas),
      { records: [{ studentId: w.a, value: 80 }] },
      w.teacher,
    );
    expect(row(more.json() as Sheet, w.a).attempts.map((x) => x.attemptNo)).toEqual([1, 2, 3]);

    expect((await setSettings(w, { remedialPolicy: 'max' })).statusCode).toBe(200);
    const max = await sheet(tugas);
    expect(row(max, w.a)).toMatchObject({ original: 60, effective: 90, effectiveSource: 'remedial' });
    // Percobaan tanpa nilai tidak memengaruhi nilai efektif.
    expect(row(max, w.b)).toMatchObject({ original: 60, effective: 60, effectiveSource: 'original' });
    // Skor asli di tabel tetap.
    const [orig] = await db().select().from(score).where(eq(score.studentId, w.a));
    expect(orig!.value).toBe(60);
    expect((await setSettings(w, { remedialPolicy: 'record_only' })).statusCode).toBe(200);
  });

  it('batas nilai: 0..skor maksimum penilaian (400 score_out_of_range); nilai di batas diterima', async () => {
    const over = await call(w, 'POST', attemptsUrl(tugas), { records: [{ studentId: w.c, value: 100.5 }] });
    expect([over.statusCode, errCode(over)]).toEqual([400, 'score_out_of_range']);
    const overSmall = await call(w, 'POST', attemptsUrl(kecil), { records: [{ studentId: w.a, value: 51 }] });
    expect([overSmall.statusCode, errCode(overSmall)]).toEqual([400, 'score_out_of_range']);
    const negative = await call(w, 'POST', attemptsUrl(tugas), { records: [{ studentId: w.c, value: -1 }] });
    expect(negative.statusCode).toBe(400);
    // Satu catatan di luar batas membatalkan seluruh permintaan.
    const mixed = await call(w, 'POST', attemptsUrl(tugas), {
      records: [
        { studentId: w.c, value: 80 },
        { studentId: w.c, value: 101 },
      ],
    });
    expect(mixed.statusCode).toBe(400);
    expect(row(await sheet(tugas), w.c).attempts).toHaveLength(0);
    for (const [id, value] of [
      [tugas, 100],
      [kecil, 50],
      [tugas, 0],
    ] as const) {
      const ok = await call(w, 'POST', attemptsUrl(id), { records: [{ studentId: w.a, value }] });
      expect(ok.statusCode, ok.body).toBe(201);
    }
  });

  it('siswa harus anggota aktif kelas penilaian; 21 percobaan ditolak; pendampingan harus remedial pada pasangan yang sama', async () => {
    const outside = await call(w, 'POST', attemptsUrl(tugas), { records: [{ studentId: w.d, value: 80 }] });
    expect([outside.statusCode, errCode(outside)]).toEqual([400, 'invalid_reference']);
    const unknown = await call(w, 'POST', attemptsUrl(tugas), { records: [{ studentId: FAKE, value: 80 }] });
    expect(unknown.statusCode).toBe(400);

    const full = await makeAssessment(w, { componentId: w.tugas, scores: { [w.b]: 10 }, title: 'Penuh' });
    for (let no = 1; no <= 20; no++) await addAttempt(w, full, w.b, no, 10);
    const tooMany = await call(w, 'POST', attemptsUrl(full), { records: [{ studentId: w.b, value: 11 }] });
    expect([tooMany.statusCode, errCode(tooMany)]).toEqual([400, 'too_many_attempts']);

    const enrichment = await call(w, 'POST', '/v1/learning-supports', {
      semesterId: w.sem,
      classId: w.cls,
      subjectId: w.mat,
      kind: 'enrichment',
      title: 'Pengayaan',
    });
    expect(enrichment.statusCode, enrichment.body).toBe(201);
    const remedial = await call(w, 'POST', '/v1/learning-supports', {
      semesterId: w.sem,
      classId: w.cls,
      subjectId: w.mat,
      kind: 'remedial',
      title: 'Remedial MAT',
    });
    const otherSubject = await call(w, 'POST', '/v1/learning-supports', {
      semesterId: w.sem,
      classId: w.cls,
      subjectId: w.ipa,
      kind: 'remedial',
      title: 'Remedial IPA',
    });
    expect(otherSubject.statusCode, otherSubject.body).toBe(201);
    for (const supportId of [enrichment.json().id, otherSubject.json().id, FAKE]) {
      const bad = await call(w, 'POST', attemptsUrl(tugas), {
        records: [{ studentId: w.c, value: 80, supportId }],
      });
      expect([bad.statusCode, errCode(bad)], supportId).toEqual([400, 'invalid_reference']);
    }
    const good = await call(w, 'POST', attemptsUrl(tugas), {
      records: [{ studentId: w.c, value: 80, supportId: remedial.json().id }],
    });
    expect(good.statusCode, good.body).toBe(201);
    expect(row(good.json() as Sheet, w.c).attempts[0]!.supportId).toBe(remedial.json().id);
  });

  it('hak akses: guru pengampu boleh, guru lain 403, penilaian tak dikenal 404; hapus percobaan', async () => {
    expect((await call(w, 'GET', attemptsUrl(tugas), undefined, w.teacherOther)).statusCode).toBe(403);
    expect(
      (
        await call(
          w,
          'POST',
          attemptsUrl(tugas),
          { records: [{ studentId: w.c, value: 80 }] },
          w.teacherOther,
        )
      ).statusCode,
    ).toBe(403);
    expect((await call(w, 'GET', attemptsUrl(FAKE))).statusCode).toBe(404);
    expect(
      (await call(w, 'POST', attemptsUrl(FAKE), { records: [{ studentId: w.c, value: 1 }] })).statusCode,
    ).toBe(404);
    const before = row(await sheet(tugas, w.teacher), w.a).attempts;
    const victim = before[0]!;
    expect(
      (await call(w, 'DELETE', `/v1/remedial-attempts/${victim.id}`, undefined, w.teacherOther)).statusCode,
    ).toBe(403);
    expect(
      (await call(w, 'DELETE', `/v1/remedial-attempts/${victim.id}`, undefined, w.teacher)).statusCode,
    ).toBe(200);
    expect((await call(w, 'DELETE', `/v1/remedial-attempts/${victim.id}`)).statusCode).toBe(404);
    // Nomor percobaan lain tidak bergeser.
    const after = row(await sheet(tugas), w.a).attempts;
    expect(after.map((x) => x.attemptNo)).toEqual(before.slice(1).map((x) => x.attemptNo));
    const log = await db().select().from(auditLog).where(eq(auditLog.action, 'remedial_attempt.delete'));
    expect(log.some((l) => l.schoolId === w.schoolId)).toBe(true);
  });

  it('daftar murid yang perlu remedial: di bawah KKM efektif, sumatif saja, nilai efektif dan sisa di bawah KKM', async () => {
    const w2 = await makeWorld('api-kandidat');
    const t1 = await makeAssessment(w2, {
      componentId: w2.tugas,
      scores: { [w2.a]: 60, [w2.b]: 60, [w2.c]: 75 },
      title: 'Tugas A',
    });
    // Kuis formatif dengan skor rendah: tidak dihitung. Penilaian tanpa skor siswa: tidak dihitung.
    await makeAssessment(w2, { componentId: w2.kuis, scores: { [w2.c]: 10 }, title: 'Kuis' });
    await addAttempt(w2, t1, w2.a, 1, 90);
    await addAttempt(w2, t1, w2.b, 1, 70);
    expect((await setSettings(w2, { remedialPolicy: 'max' })).statusCode).toBe(200);
    const url = `/v1/grading/remedial-candidates?semesterId=${w2.sem}&classId=${w2.cls}&subjectId=${w2.mat}`;
    const res = await call(w2, 'GET', url);
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json() as {
      policy: string;
      kkm: number;
      students: {
        studentId: string;
        items: {
          title: string;
          original: number;
          percent: number;
          attempts: number;
          effective: number;
          stillBelow: boolean;
        }[];
      }[];
    };
    expect([body.policy, body.kkm]).toEqual(['max', 75]);
    // Cici tepat di KKM (75) dan formatifnya diabaikan: tidak muncul.
    expect(body.students.map((s) => s.studentId).sort()).toEqual([w2.a, w2.b].sort());
    const ani = body.students.find((s) => s.studentId === w2.a)!.items[0]!;
    expect(ani).toMatchObject({
      title: 'Tugas A',
      original: 60,
      percent: 60,
      attempts: 1,
      effective: 90,
      stillBelow: false,
    });
    const budi = body.students.find((s) => s.studentId === w2.b)!.items[0]!;
    expect(budi).toMatchObject({ attempts: 1, effective: 70, stillBelow: true });
    // Guru lain dan penilaian lintas pasangan.
    expect((await call(w2, 'GET', url, undefined, w2.teacherOther)).statusCode).toBe(403);
    expect((await call(w2, 'GET', url, undefined, w2.teacher)).statusCode).toBe(200);
    expect(
      (
        await call(
          w2,
          'GET',
          `/v1/grading/remedial-candidates?semesterId=${FAKE}&classId=${w2.cls}&subjectId=${w2.mat}`,
        )
      ).statusCode,
    ).toBe(400);
  }, 120_000);

  it('hapus penilaian menghapus percobaannya (dengan jumlah di audit); skor dan percobaan sekolah lain tidak tersentuh', async () => {
    const w2 = await makeWorld('api-hapus');
    const a1 = await makeAssessment(w2, { scores: { [w2.a]: 50 }, title: 'Hapus saya' });
    const a2 = await makeAssessment(w2, { scores: { [w2.a]: 50 }, title: 'Tetap' });
    await addAttempt(w2, a1, w2.a, 1, 80);
    await addAttempt(w2, a1, w2.b, 1, 70);
    await addAttempt(w2, a2, w2.a, 1, 80);
    const res = await call(w2, 'DELETE', `/v1/assessments/${a1}`, undefined, w2.teacher);
    expect(res.statusCode, res.body).toBe(200);
    const left = await db()
      .select()
      .from(scoreRemedialAttempt)
      .where(eq(scoreRemedialAttempt.schoolId, w2.schoolId));
    expect(left.map((l) => l.assessmentId)).toEqual([a2]);
    const [entry] = await db()
      .select()
      .from(auditLog)
      .where(sql`${auditLog.action} = 'assessment.delete' and ${auditLog.entityId} = ${a1}`);
    expect((entry!.details as { remedialAttempts?: number }).remedialAttempts).toBe(2);
  }, 120_000);
});

/* ------------------------------------------------------------------------------------------------ */

describe('pendampingan belajar (API)', () => {
  let w: World;
  let tp = '';
  let tpIpa = '';
  beforeAll(async () => {
    w = await makeWorld('dukung');
    tp = await makeObjective(w, w.mat, 'M1');
    tpIpa = await makeObjective(w, w.ipa, 'I1');
  }, 120_000);

  const body = (over: object = {}) => ({
    semesterId: w.sem,
    classId: w.cls,
    subjectId: w.mat,
    kind: 'remedial',
    title: 'Remedial pecahan',
    ...over,
  });
  const listUrl = `/v1/learning-supports`;
  const q = () => `semesterId=${w.sem}&classId=${w.cls}&subjectId=${w.mat}`;

  it('membuat pendampingan dengan TP sasaran dan peserta; daftar menyaring jenis', async () => {
    const res = await call(
      w,
      'POST',
      listUrl,
      body({
        description: 'Dua pertemuan',
        startsOn: '2026-09-01',
        endsOn: '2026-09-15',
        objectiveIds: [tp],
        participants: [{ studentId: w.a }, { studentId: w.b, status: 'in_progress', outcomeNote: 'hadir' }],
      }),
      w.teacher,
    );
    expect(res.statusCode, res.body).toBe(201);
    const s = res.json();
    expect(s).toMatchObject({
      kind: 'remedial',
      title: 'Remedial pecahan',
      className: '7A',
      teacherName: 'Pak Mat',
      startsOn: '2026-09-01',
      canInput: true,
    });
    expect(s.objectives.map((o: { id: string }) => o.id)).toEqual([tp]);
    expect(s.participants.map((p: { name: string; status: string }) => [p.name, p.status])).toEqual([
      ['Ani', 'planned'],
      ['Budi', 'in_progress'],
    ]);
    await call(w, 'POST', listUrl, body({ kind: 'enrichment', title: 'Pengayaan aljabar' }));
    const all = (await call(w, 'GET', `${listUrl}?${q()}`, undefined, w.teacher)).json();
    expect(all).toHaveLength(2);
    const onlyEnrich = (await call(w, 'GET', `${listUrl}?${q()}&kind=enrichment`)).json();
    expect(onlyEnrich.map((x: { title: string }) => x.title)).toEqual(['Pengayaan aljabar']);
  });

  it('validasi: tanggal terbalik, TP mapel lain, peserta di luar kelas, hak akses, rujukan', async () => {
    const dates = await call(w, 'POST', listUrl, body({ startsOn: '2026-09-15', endsOn: '2026-09-01' }));
    expect([dates.statusCode, errCode(dates)]).toEqual([400, 'invalid_dates']);
    const mismatch = await call(w, 'POST', listUrl, body({ objectiveIds: [tpIpa] }));
    expect([mismatch.statusCode, errCode(mismatch)]).toEqual([400, 'objective_subject_mismatch']);
    const tooMany = await call(
      w,
      'POST',
      listUrl,
      body({ objectiveIds: Array.from({ length: 21 }, () => crypto.randomUUID()) }),
    );
    expect(tooMany.statusCode).toBe(400);
    const outside = await call(w, 'POST', listUrl, body({ participants: [{ studentId: w.d }] }));
    expect([outside.statusCode, errCode(outside)]).toEqual([400, 'invalid_reference']);
    const status = await call(
      w,
      'POST',
      listUrl,
      body({ participants: [{ studentId: w.a, status: 'selesai' }] }),
    );
    expect(status.statusCode).toBe(400);
    expect((await call(w, 'POST', listUrl, body(), w.teacherOther)).statusCode).toBe(403);
    expect((await call(w, 'POST', listUrl, body({ classId: w.cls2 }), w.teacher)).statusCode).toBe(403);
    expect((await call(w, 'POST', listUrl, body({ kind: 'lain' }))).statusCode).toBe(400);
    expect((await call(w, 'POST', listUrl, body({ semesterId: FAKE }))).statusCode).toBe(400);
    expect((await call(w, 'GET', `${listUrl}?${q()}`, undefined, w.teacherOther)).statusCode).toBe(403);
    // Gagal validasi tidak meninggalkan baris setengah jadi.
    const titles = (await call(w, 'GET', `${listUrl}?${q()}`)).json().map((x: { title: string }) => x.title);
    expect(titles).toHaveLength(2);
  });

  it('mengubah, mengganti peserta, dan menghapus; percobaan yang menunjuk pendampingan tetap ada', async () => {
    const created = (
      await call(w, 'POST', listUrl, body({ title: 'Remedial 2', objectiveIds: [tp] }))
    ).json();
    const id = created.id as string;
    const upd = await call(
      w,
      'PUT',
      `${listUrl}/${id}`,
      {
        title: 'Remedial 2 (ubah)',
        description: null,
        startsOn: '2026-10-01',
        endsOn: '2026-10-02',
        objectiveIds: [],
      },
      w.teacher,
    );
    expect(upd.statusCode, upd.body).toBe(200);
    expect(upd.json()).toMatchObject({
      title: 'Remedial 2 (ubah)',
      description: null,
      startsOn: '2026-10-01',
      objectives: [],
    });
    // Tanggal tunggal yang bertabrakan dengan nilai tersimpan ditolak.
    const clash = await call(w, 'PUT', `${listUrl}/${id}`, { title: 'x', startsOn: '2026-11-01' });
    expect([clash.statusCode, errCode(clash)]).toEqual([400, 'invalid_dates']);
    // Dihilangkan = tetap.
    const keep = await call(w, 'PUT', `${listUrl}/${id}`, { title: 'Remedial 2 (ubah)' });
    expect(keep.json().startsOn).toBe('2026-10-01');

    const parts = await call(
      w,
      'PUT',
      `${listUrl}/${id}/participants`,
      { participants: [{ studentId: w.c, status: 'completed', outcomeNote: 'tuntas' }, { studentId: w.a }] },
      w.teacher,
    );
    expect(parts.statusCode, parts.body).toBe(200);
    expect(
      parts.json().participants.map((p: { name: string; status: string }) => [p.name, p.status]),
    ).toEqual([
      ['Ani', 'planned'],
      ['Cici', 'completed'],
    ]);
    const replaced = await call(w, 'PUT', `${listUrl}/${id}/participants`, {
      participants: [{ studentId: w.b }],
    });
    expect(replaced.json().participants.map((p: { name: string }) => p.name)).toEqual(['Budi']);
    expect(
      (await call(w, 'PUT', `${listUrl}/${id}/participants`, { participants: [{ studentId: w.d }] }))
        .statusCode,
    ).toBe(400);
    expect(
      (await call(w, 'PUT', `${listUrl}/${id}/participants`, { participants: [] }, w.teacherOther))
        .statusCode,
    ).toBe(403);
    // Gagal validasi tidak mengosongkan peserta yang ada.
    expect(
      (await call(w, 'GET', `${listUrl}?${q()}`)).json().find((x: { id: string }) => x.id === id)
        .participants,
    ).toHaveLength(1);

    const tugas = await makeAssessment(w, { scores: { [w.a]: 50 } });
    const att = await call(w, 'POST', `/v1/assessments/${tugas}/remedial-attempts`, {
      records: [{ studentId: w.a, value: 80, supportId: id }],
    });
    expect(att.statusCode, att.body).toBe(201);
    expect((await call(w, 'DELETE', `${listUrl}/${id}`, undefined, w.teacherOther)).statusCode).toBe(403);
    expect((await call(w, 'DELETE', `${listUrl}/${id}`, undefined, w.teacher)).statusCode).toBe(200);
    expect((await call(w, 'DELETE', `${listUrl}/${id}`)).statusCode).toBe(404);
    expect((await call(w, 'PUT', `${listUrl}/${id}`, { title: 'x' })).statusCode).toBe(404);
    const kept = await db()
      .select()
      .from(scoreRemedialAttempt)
      .where(eq(scoreRemedialAttempt.assessmentId, tugas));
    expect(kept.map((k) => [k.value, k.supportId])).toEqual([[80, null]]);
    expect(await db().select().from(learningSupport).where(eq(learningSupport.id, id))).toEqual([]);
  });
});

/* ------------------------------------------------------------------------------------------------ */

describe('T10: guard report_final', () => {
  let w: World;
  let tugas = '';
  let supportId = '';
  let attemptId = '';
  beforeAll(async () => {
    w = await makeWorld('final');
    tugas = await makeAssessment(w, {
      componentId: w.tugas,
      scores: { [w.a]: 60, [w.b]: 90, [w.c]: 90 },
      title: 'Tugas final',
    });
    await makeAssessment(w, { componentId: w.uts, scores: { [w.a]: 80, [w.b]: 80, [w.c]: 80 } });
    expect((await setSettings(w, { remedialPolicy: 'max' })).statusCode).toBe(200);
    const att = await call(w, 'POST', `/v1/assessments/${tugas}/remedial-attempts`, {
      records: [{ studentId: w.a, value: 90 }],
    });
    expect(att.statusCode, att.body).toBe(201);
    attemptId = (att.json() as { students: { attempts: { id: string }[] }[] }).students.flatMap(
      (s) => s.attempts,
    )[0]!.id;
    const sup = await call(w, 'POST', '/v1/learning-supports', {
      semesterId: w.sem,
      classId: w.cls,
      subjectId: w.mat,
      kind: 'remedial',
      title: 'Sebelum final',
      participants: [{ studentId: w.a }],
    });
    supportId = sup.json().id;
  }, 120_000);

  it('rapor final menolak semua jalur tulis baru (409 report_final); final tetap dari snapshot; reopen membukanya kembali', async () => {
    const fin = await call(w, 'POST', '/v1/report-cards/finalize', {
      semesterId: w.sem,
      classId: w.cls,
      force: true,
    });
    expect(fin.statusCode, fin.body).toBe(200);
    const expected = 0.3 * 90 + 0.7 * 80;
    const finalDoc = async () =>
      (await call(w, 'GET', `/v1/report-cards/${w.a}?semesterId=${w.sem}`)).json() as {
        status: string;
        subjects: { subjectId: string; final: number }[];
      };
    const d = await finalDoc();
    expect(d.status).toBe('final');
    expect(d.subjects.find((s) => s.subjectId === w.mat)!.final).toBeCloseTo(expected, 2);

    const locked: [string, () => Promise<{ statusCode: number; json: () => { error: { code: string } } }>][] =
      [
        ['kebijakan', () => setSettings(w, { remedialPolicy: 'replace_latest' })],
        [
          'percobaan baru',
          () =>
            call(w, 'POST', `/v1/assessments/${tugas}/remedial-attempts`, {
              records: [{ studentId: w.a, value: 70 }],
            }),
        ],
        ['hapus percobaan', () => call(w, 'DELETE', `/v1/remedial-attempts/${attemptId}`)],
        [
          'buat pendampingan',
          () =>
            call(w, 'POST', '/v1/learning-supports', {
              semesterId: w.sem,
              classId: w.cls,
              subjectId: w.mat,
              kind: 'enrichment',
              title: 'Terkunci',
            }),
        ],
        [
          'ubah pendampingan',
          () => call(w, 'PUT', `/v1/learning-supports/${supportId}`, { title: 'Terkunci' }),
        ],
        [
          'peserta pendampingan',
          () => call(w, 'PUT', `/v1/learning-supports/${supportId}/participants`, { participants: [] }),
        ],
        ['hapus pendampingan', () => call(w, 'DELETE', `/v1/learning-supports/${supportId}`)],
      ];
    for (const [name, go] of locked) {
      const res = await go();
      expect([res.statusCode, errCode(res)], name).toEqual([409, 'report_final']);
    }
    // Hasil remedial yang masuk lewat jalur lain tidak mengubah snapshot final: dokumen, rekap, dan ledger tetap angka terbit.
    await addAttempt(w, tugas, w.a, 2, 100);
    expect((await finalDoc()).subjects.find((s) => s.subjectId === w.mat)!.final).toBeCloseTo(expected, 2);
    const r = await recap(w);
    expect(r.students.find((s) => s.studentId === w.a)).toMatchObject({ source: 'report' });
    expect(finalOf(r, w.a)).toBeCloseTo(expected, 2);

    // Setelah dibuka kembali, semua jalur diterima.
    const reopen = await call(w, 'POST', '/v1/report-cards/reopen', { semesterId: w.sem, classId: w.cls });
    expect(reopen.statusCode, reopen.body).toBe(200);
    for (const [name, go] of locked) {
      const res = await go();
      expect(res.statusCode, `${name} sesudah reopen`).toBeLessThan(300);
    }
  }, 120_000);
});

/* ------------------------------------------------------------------------------------------------ */

describe('T14: isolasi tenant', () => {
  let a: World;
  let b: World;
  let tugasA = '';
  let attemptA = '';
  let supportA = '';
  beforeAll(async () => {
    a = await makeWorld('tenant-a');
    b = await makeWorld('tenant-b');
    tugasA = await makeAssessment(a, { scores: { [a.a]: 50 } });
    await makeAssessment(b, { scores: { [b.a]: 50 } });
    attemptA = (await addAttempt(a, tugasA, a.a, 1, 80).returning())[0]!.id;
    const sup = await call(a, 'POST', '/v1/learning-supports', {
      semesterId: a.sem,
      classId: a.cls,
      subjectId: a.mat,
      kind: 'remedial',
      title: 'Milik A',
      participants: [{ studentId: a.a }],
    });
    supportA = sup.json().id;
  }, 120_000);

  it('admin sekolah B tidak dapat membaca atau menulis percobaan dan pendampingan sekolah A (404/400)', async () => {
    expect((await call(b, 'GET', `/v1/assessments/${tugasA}/remedial-attempts`)).statusCode).toBe(404);
    expect(
      (
        await call(b, 'POST', `/v1/assessments/${tugasA}/remedial-attempts`, {
          records: [{ studentId: b.a, value: 1 }],
        })
      ).statusCode,
    ).toBe(404);
    expect((await call(b, 'DELETE', `/v1/remedial-attempts/${attemptA}`)).statusCode).toBe(404);
    expect((await call(b, 'PUT', `/v1/learning-supports/${supportA}`, { title: 'curi' })).statusCode).toBe(
      404,
    );
    expect(
      (await call(b, 'PUT', `/v1/learning-supports/${supportA}/participants`, { participants: [] }))
        .statusCode,
    ).toBe(404);
    expect((await call(b, 'DELETE', `/v1/learning-supports/${supportA}`)).statusCode).toBe(404);
    // Rujukan ke semester/kelas/mapel sekolah A dari sekolah B ditolak.
    const q = `semesterId=${a.sem}&classId=${a.cls}&subjectId=${a.mat}`;
    expect((await call(b, 'GET', `/v1/learning-supports?${q}`)).statusCode).toBe(400);
    expect((await call(b, 'GET', `/v1/grading/remedial-candidates?${q}`)).statusCode).toBe(400);
    expect(
      (
        await call(b, 'POST', '/v1/learning-supports', {
          semesterId: a.sem,
          classId: a.cls,
          subjectId: a.mat,
          kind: 'remedial',
          title: 'x',
        })
      ).statusCode,
    ).toBe(400);
    // Data sekolah A utuh.
    expect((await call(a, 'GET', `/v1/assessments/${tugasA}/remedial-attempts`)).statusCode).toBe(200);
    expect(await db().select().from(learningSupport).where(eq(learningSupport.id, supportA))).toHaveLength(1);
  });

  it('kebijakan satu sekolah tidak memengaruhi sekolah lain; RLS menyembunyikan baris', async () => {
    expect((await setSettings(a, { remedialPolicy: 'max' })).statusCode).toBe(200);
    expect((await call(b, 'GET', '/v1/grading/settings')).json().remedialPolicy).toBeUndefined();
    const seenByB = await withTenant(app.tenantDb, [b.schoolId], (tx) =>
      tx.select().from(scoreRemedialAttempt),
    );
    expect(seenByB).toEqual([]);
    const seenByA = await withTenant(app.tenantDb, [a.schoolId], (tx) =>
      tx.select().from(scoreRemedialAttempt),
    );
    expect(seenByA).toHaveLength(1);
  });

  it('FK komposit menolak percobaan dan pendampingan yang menyilang sekolah', async () => {
    await expect(addAttempt(b, tugasA, b.a, 1, 70)).rejects.toThrow();
    await expect(addAttempt(a, tugasA, b.a, 1, 70)).rejects.toThrow();
    await expect(
      db().insert(learningSupport).values({
        schoolId: b.schoolId,
        semesterId: a.sem,
        classId: b.cls,
        subjectId: b.mat,
        kind: 'remedial',
        title: 'silang',
        createdBy: 'uji',
      }),
    ).rejects.toThrow();
  });
});

describe('batas konfigurasi: kunci sparse pada respons lama', () => {
  it('sekolah tanpa kebijakan: respons pengaturan dan rekap tidak membawa field baru', async () => {
    const w = await makeWorld('sparse');
    await makeAssessment(w, { scores: { [w.a]: 60 } });
    const settings = (await call(w, 'GET', '/v1/grading/settings')).json();
    expect(Object.keys(settings)).not.toContain('remedialPolicy');
    const r = await recap(w);
    expect(Object.keys(r)).not.toContain('remedialPolicy');
    expect(r.students.every((s) => !('remedial' in s))).toBe(true);
    const status = (await call(w, 'GET', `/v1/semesters/${w.sem}/grading-config`)).json();
    expect(Object.keys(status)).not.toContain('remedialPolicy');
  }, 120_000);
});
