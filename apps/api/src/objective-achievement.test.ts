import {
  frozenCriteriaListSchema,
  frozenObjectiveCriteriaListSchema,
  type ObjectiveStatusScope,
} from '@edusync/contracts';
import {
  academicYear,
  achievementCriteria,
  achievementRubricLevel,
  assessment,
  assessmentObjective,
  assignRoles,
  classRoom,
  createDb,
  enrollment,
  entitlement,
  eq,
  foundation,
  gradeComponent,
  gradingSetting,
  learningFlow,
  learningFlowItem,
  learningObjective,
  learningOutcome,
  member,
  program,
  reportCard,
  school,
  schoolLevel,
  score,
  seedSchoolRoles,
  semester,
  semesterGradingConfig,
  sql,
  student,
  studentObjectiveAchievement,
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
import { loadGradingConfig } from './grading-config-lib';
import { computeObjectiveAchievement } from './objective-achievement-lib';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/**
 * Tahap 3.3 (rancangan fase 3, tes T11, T14, T16, T17): kaitan penilaian <-> TP, ketercapaian TP per murid (empat mode kriteria
 * x empat jenjang cakupan, fallback KKM mapel lalu sekolah, tiga agregasi, override menang, formatif tidak dihitung, jumlah
 * kueri tetap), pembekuan kriteria TP dan agregasi, versi TP, isolasi tenant, dan guard `report_final` per siswa.
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
  sem: string;
  admin: string;
  teacherMat: string;
  teacherOther: string;
  prg: string;
  /** Kelas: tingkat 7 + program, tingkat 7, tingkat 8 + program, tingkat 8. */
  c7p: string;
  c7: string;
  c8p: string;
  c8: string;
  mat: string;
  ipa: string;
  fis: string;
  tugas: string;
  uts: string;
  kuis: string;
  /** Siswa per kelas (dua per kelas). */
  s: Record<string, string[]>;
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

async function makeWorld(tag: string, opts: { grades?: boolean; formative?: boolean } = {}): Promise<World> {
  const [s] = await db()
    .insert(school)
    .values({ foundationId, slug: `${tag}-${run}`, name: `Sekolah ${tag}` })
    .returning();
  const sid = s!.id;
  schoolIds.push(sid);
  await seedSchoolRoles(db(), sid);
  if (opts.grades !== false) {
    await db()
      .insert(entitlement)
      .values({ schoolId: sid, moduleKey: 'grades', subscriptionId, validUntil: subscriptionEnd });
  }
  await db()
    .insert(schoolLevel)
    .values(['7', '8', '9'].map((code, i) => ({ schoolId: sid, code, label: `Kelas ${code}`, sort: i })));
  const [prg] = await db().insert(program).values({ schoolId: sid, code: 'IPA', name: 'IPA' }).returning();
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
  const mkSubject = async (code: string) =>
    (
      await db()
        .insert(subject)
        .values({ schoolId: sid, code, name: `Mapel ${code}` })
        .returning()
    )[0]!.id;
  const [mat, ipa, fis] = [await mkSubject('MAT'), await mkSubject('IPA'), await mkSubject('FIS')];
  const comps = await db()
    .insert(gradeComponent)
    .values([
      { schoolId: sid, name: 'Tugas', weight: 50, sort: 0 },
      { schoolId: sid, name: 'UTS', weight: 50, sort: 1 },
      ...(opts.formative === false
        ? []
        : [
            { schoolId: sid, name: 'Kuis', weight: 0, sort: 2, category: 'formative', includeInFinal: false },
          ]),
    ])
    .returning();
  const byName = (n: string) => comps.find((c) => c.name === n)?.id ?? '';
  const mkClass = async (name: string, level: string, programId: string | null) => {
    const [c] = await db()
      .insert(classRoom)
      .values({ schoolId: sid, academicYearId: y!.id, name, level, programId })
      .returning();
    return c!.id;
  };
  const c7p = await mkClass('7-P', '7', prg!.id);
  const c7 = await mkClass('7', '7', null);
  const c8p = await mkClass('8-P', '8', prg!.id);
  const c8 = await mkClass('8', '8', null);
  const sMap: Record<string, string[]> = {};
  for (const [name, classId] of Object.entries({ c7p, c7, c8p, c8 })) {
    sMap[name] = [];
    for (const n of ['A', 'B']) {
      const [st] = await db()
        .insert(student)
        .values({
          schoolId: sid,
          name: `${n}-${name}`,
          gender: 'L',
          status: 'active',
          nis: `${n}${name}-${tag}-${run}`,
        })
        .returning();
      await db()
        .insert(enrollment)
        .values({ schoolId: sid, studentId: st!.id, classId, academicYearId: y!.id });
      sMap[name]!.push(st!.id);
    }
  }
  const admin = await join(`admin-${tag}`, sid, ['school_admin']);
  const tm = await join(`guru-mat-${tag}`, sid, ['teacher']);
  const to = await join(`guru-lain-${tag}`, sid, ['teacher']);
  const [tMat] = await db()
    .insert(teacher)
    .values({ schoolId: sid, name: 'Pak Mat', memberId: tm.memberId })
    .returning();
  await db().insert(teacher).values({ schoolId: sid, name: 'Bu Lain', memberId: to.memberId });
  // Pak Mat mengampu MAT di kelas 7-P saja.
  await db()
    .insert(teachingAssignment)
    .values({ schoolId: sid, classId: c7p, subjectId: mat, teacherId: tMat!.id });
  return {
    schoolId: sid,
    yearId: y!.id,
    sem: sem!.id,
    admin: admin.cookie,
    teacherMat: tm.cookie,
    teacherOther: to.cookie,
    prg: prg!.id,
    c7p,
    c7,
    c8p,
    c8,
    mat,
    ipa,
    fis,
    tugas: byName('Tugas'),
    uts: byName('UTS'),
    kuis: byName('Kuis'),
    s: sMap,
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

/** CP + TP baru milik sebuah mapel (langsung di DB). */
async function makeObjective(w: World, subjectId: string, label: string, opts: { active?: boolean } = {}) {
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
      active: opts.active ?? true,
    })
    .returning();
  return t!.id;
}

interface Level {
  label: string;
  min: number | null;
  max: number | null;
  ok: boolean;
}

/** Kriteria (KKTP) langsung di DB: per TP bila `objectiveId`, selain itu tingkat mapel. */
async function makeCriteria(
  w: World,
  c: {
    subjectId: string;
    objectiveId?: string | null;
    levelCode?: string | null;
    programId?: string | null;
    mode: 'numeric' | 'interval' | 'rubric' | 'descriptor';
    threshold?: number | null;
    levels?: Level[];
  },
) {
  const [row] = await db()
    .insert(achievementCriteria)
    .values({
      schoolId: w.schoolId,
      subjectId: c.subjectId,
      objectiveId: c.objectiveId ?? null,
      levelCode: c.levelCode ?? null,
      programId: c.programId ?? null,
      mode: c.mode,
      threshold: c.threshold ?? null,
    })
    .returning();
  if (c.levels?.length) {
    await db()
      .insert(achievementRubricLevel)
      .values(
        c.levels.map((l, i) => ({
          schoolId: w.schoolId,
          criteriaId: row!.id,
          label: l.label,
          minScore: l.min,
          maxScore: l.max,
          isAchieved: l.ok,
          sortOrder: i,
        })),
      );
  }
  return row!.id;
}

/** Penilaian langsung di DB beserta skor (studentId -> nilai) dan kaitan TP. */
async function makeAssessment(
  w: World,
  a: {
    classId: string;
    subjectId: string;
    componentId?: string;
    date?: string;
    title?: string;
    max?: number;
    scores?: Record<string, number | null>;
    objectiveIds?: string[];
    purpose?: string | null;
  },
) {
  const [row] = await db()
    .insert(assessment)
    .values({
      schoolId: w.schoolId,
      semesterId: w.sem,
      classId: a.classId,
      subjectId: a.subjectId,
      componentId: a.componentId ?? w.tugas,
      title: a.title ?? `Penilaian ${seq++}`,
      date: a.date ?? '2026-08-01',
      maxScore: a.max ?? 100,
      purpose: a.purpose ?? null,
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

interface Matrix {
  aggregation: string;
  frozen: boolean;
  canInput: boolean;
  objectives: {
    id: string;
    active: boolean;
    assessmentCount: number;
    formativeCount: number;
    summary: { assessed: number; achieved: number };
  }[];
  students: {
    studentId: string;
    locked: boolean;
    cells: {
      objectiveId: string;
      percent: number | null;
      achieved: boolean | null;
      levelLabel: string | null;
      source: string | null;
      scope: ObjectiveStatusScope | null;
      threshold: number | null;
      scoredCount: number;
      note: string | null;
      formative?: { average: number; count: number };
    }[];
  }[];
}

const matrixUrl = (w: World, classId: string, subjectId: string, extra = '') =>
  `/v1/grading/objective-achievement?semesterId=${w.sem}&classId=${classId}&subjectId=${subjectId}${extra}`;
async function matrix(w: World, classId: string, subjectId: string, who = w.admin, extra = '') {
  const res = await call(w, 'GET', matrixUrl(w, classId, subjectId, extra), undefined, who);
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as Matrix;
}
const cellOf = (m: Matrix, studentId: string, objectiveId: string) =>
  m.students.find((s) => s.studentId === studentId)!.cells.find((c) => c.objectiveId === objectiveId)!;
const errCode = (res: { json: () => { error: { code: string } } }) => res.json().error.code;

const setAggregation = (w: World, objectiveAggregation: string) =>
  call(w, 'PUT', '/v1/grading/settings', {
    kkm: 75,
    predicateA: 90,
    predicateB: 80,
    predicateC: 70,
    objectiveAggregation,
  });
const sync = (w: World) => call(w, 'POST', `/v1/semesters/${w.sem}/grading-config/sync`);
const frozenRow = async (w: World) =>
  (await db().select().from(semesterGradingConfig).where(eq(semesterGradingConfig.semesterId, w.sem)))[0];

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Ketercapaian TP', slug: `yktp-${run}` })
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
  for (let pass = 0; pass < 6; pass++) {
    for (const sId of schoolIds) {
      for (const { table_name } of tables.rows) {
        await db()
          .execute(sql`delete from ${sql.identifier(table_name)} where school_id = ${sId}`)
          .catch(() => undefined);
      }
    }
  }
  for (const sId of schoolIds) await db().delete(school).where(eq(school.id, sId));
  await db().execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db().delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db().delete(user).where(eq(user.id, uid));
  await app.close();
});

/* ------------------------------------------------------------------------------------------------ */

describe('kaitan penilaian <-> TP (API)', () => {
  let w: World;
  let other: World;
  let tp1 = '';
  let tp2 = '';
  let ipaTp = '';
  beforeAll(async () => {
    w = await makeWorld('kait');
    other = await makeWorld('kait-lain');
    tp1 = await makeObjective(w, w.mat, 'M1');
    tp2 = await makeObjective(w, w.mat, 'M2');
    ipaTp = await makeObjective(w, w.ipa, 'I1');
  }, 120_000);

  const body = (over: object = {}) => ({
    semesterId: w.sem,
    classId: w.c7p,
    subjectId: w.mat,
    componentId: w.tugas,
    title: 'Ulangan TP',
    date: '2026-08-02',
    maxScore: 100,
    ...over,
  });

  it('POST dengan objectiveIds mengaitkan TP; respons memuat objectives; tanpa objectiveIds = tanpa kaitan', async () => {
    const plain = await call(w, 'POST', '/v1/assessments', body());
    expect(plain.statusCode, plain.body).toBe(201);
    expect(plain.json().objectives).toEqual([]);
    const res = await call(
      w,
      'POST',
      '/v1/assessments',
      body({ title: 'Dengan TP', objectiveIds: [tp1, tp2, tp1] }),
    );
    expect(res.statusCode, res.body).toBe(201);
    expect(
      res
        .json()
        .objectives.map((o: { id: string }) => o.id)
        .sort(),
    ).toEqual([tp1, tp2].sort());
    expect(res.json().objectives[0]).toMatchObject({ active: true });
    const list = (await call(w, 'GET', `/v1/assessments?semesterId=${w.sem}&classId=${w.c7p}`)).json();
    expect(list.find((a: { title: string }) => a.title === 'Dengan TP').objectives).toHaveLength(2);
  });

  it('PUT /v1/assessments/:id: objectiveIds dihilangkan = tetap, larik = ganti, [] = lepas; PUT /:id/objectives sama', async () => {
    const created = (
      await call(w, 'POST', '/v1/assessments', body({ title: 'Ganti TP', objectiveIds: [tp1] }))
    ).json();
    const upd = (extra: object = {}) =>
      call(w, 'PUT', `/v1/assessments/${created.id}`, {
        componentId: w.tugas,
        title: 'Ganti TP',
        date: '2026-08-02',
        maxScore: 100,
        ...extra,
      });
    expect((await upd()).json().objectives.map((o: { id: string }) => o.id)).toEqual([tp1]);
    expect((await upd({ objectiveIds: [tp2] })).json().objectives.map((o: { id: string }) => o.id)).toEqual([
      tp2,
    ]);
    expect((await upd({ objectiveIds: [] })).json().objectives).toEqual([]);
    const dedicated = await call(w, 'PUT', `/v1/assessments/${created.id}/objectives`, {
      objectiveIds: [tp1, tp2],
    });
    expect(dedicated.statusCode, dedicated.body).toBe(200);
    expect(dedicated.json().objectives).toHaveLength(2);
    const rows = await db()
      .select()
      .from(assessmentObjective)
      .where(eq(assessmentObjective.assessmentId, created.id));
    expect(rows).toHaveLength(2);
    const audits = await db().execute<{ action: string }>(
      sql`select action from audit_log where entity_id = ${created.id} and action = 'assessment.objectives'`,
    );
    expect(audits.rows).toHaveLength(1);
  });

  it('validasi: mapel lain, tidak aktif, terlalu banyak, tidak ada, milik sekolah lain', async () => {
    const created = (await call(w, 'POST', '/v1/assessments', body({ title: 'Validasi' }))).json();
    const put = (objectiveIds: string[]) =>
      call(w, 'PUT', `/v1/assessments/${created.id}/objectives`, { objectiveIds });
    const mismatch = await put([ipaTp]);
    expect([mismatch.statusCode, errCode(mismatch)]).toEqual([400, 'objective_subject_mismatch']);
    const inactive = await makeObjective(w, w.mat, 'MX', { active: false });
    const off = await put([inactive]);
    expect([off.statusCode, errCode(off)]).toEqual([400, 'objective_inactive']);
    const many: string[] = [];
    for (let i = 0; i < 21; i++) many.push(await makeObjective(w, w.mat, `Banyak${i}`));
    const tooMany = await put(many);
    expect([tooMany.statusCode, errCode(tooMany)]).toEqual([400, 'too_many_objectives']);
    expect((await put(many.slice(0, 20))).statusCode).toBe(200);
    expect(errCode(await put([FAKE]))).toBe('invalid_reference');
    const foreignTp = await makeObjective(other, other.mat, 'F1');
    expect(errCode(await put([foreignTp]))).toBe('invalid_reference');
    // Penolakan tidak meninggalkan setengah perubahan.
    const rows = await db()
      .select()
      .from(assessmentObjective)
      .where(eq(assessmentObjective.assessmentId, created.id));
    expect(rows).toHaveLength(20);
    // Dua puluh satu lewat POST juga ditolak (tidak ada penilaian yang dibuat).
    const before = await db().select().from(assessment).where(eq(assessment.schoolId, w.schoolId));
    const post = await call(w, 'POST', '/v1/assessments', body({ title: 'Kebanyakan', objectiveIds: many }));
    expect([post.statusCode, errCode(post)]).toEqual([400, 'too_many_objectives']);
    expect(await db().select().from(assessment).where(eq(assessment.schoolId, w.schoolId))).toHaveLength(
      before.length,
    );
  });

  it('TP yang sudah terkait boleh tetap walau kemudian nonaktif; TP nonaktif baru ditolak', async () => {
    const t = await makeObjective(w, w.mat, 'Lama');
    const created = (
      await call(w, 'POST', '/v1/assessments', body({ title: 'Tetap', objectiveIds: [t] }))
    ).json();
    await db().update(learningObjective).set({ active: false }).where(eq(learningObjective.id, t));
    const keep = await call(w, 'PUT', `/v1/assessments/${created.id}/objectives`, { objectiveIds: [t, tp1] });
    expect(keep.statusCode, keep.body).toBe(200);
    expect(keep.json().objectives.find((o: { id: string }) => o.id === t).active).toBe(false);
    const other2 = (await call(w, 'POST', '/v1/assessments', body({ title: 'Baru' }))).json();
    expect(
      errCode(await call(w, 'PUT', `/v1/assessments/${other2.id}/objectives`, { objectiveIds: [t] })),
    ).toBe('objective_inactive');
  });

  it('hak: guru pengampu boleh, guru lain 403, kepala sekolah/tanpa izin 403; hapus penilaian ikut menghapus kaitan', async () => {
    const created = (
      await call(w, 'POST', '/v1/assessments', body({ title: 'Hak', objectiveIds: [tp1] }), w.teacherMat)
    ).json();
    expect(created.objectives).toHaveLength(1);
    const put = (who: string) =>
      call(w, 'PUT', `/v1/assessments/${created.id}/objectives`, { objectiveIds: [tp2] }, who);
    expect((await put(w.teacherOther)).statusCode).toBe(403);
    expect((await put(w.teacherMat)).statusCode).toBe(200);
    expect((await call(w, 'DELETE', `/v1/assessments/${created.id}`)).statusCode).toBe(200);
    expect(
      await db().select().from(assessmentObjective).where(eq(assessmentObjective.assessmentId, created.id)),
    ).toEqual([]);
  });

  it('modul grades nonaktif: 403 module_disabled', async () => {
    const off = await makeWorld('kait-off', { grades: false });
    for (const [method, url, payload] of [
      ['PUT', `/v1/assessments/${FAKE}/objectives`, { objectiveIds: [] }],
      ['GET', matrixUrl(off, off.c7p, off.mat), undefined],
      [
        'PUT',
        '/v1/grading/objective-achievement',
        {
          semesterId: off.sem,
          classId: off.c7p,
          subjectId: off.mat,
          records: [{ studentId: FAKE, objectiveId: FAKE, achieved: true }],
        },
      ],
    ] as const) {
      const res = await call(off, method, url, payload);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
      expect(errCode(res)).toBe('module_disabled');
    }
  });

  it('T14: sekolah lain tidak dapat membaca atau mengubah kaitan, dan FK komposit menolak silang sekolah', async () => {
    const created = (
      await call(w, 'POST', '/v1/assessments', body({ title: 'Rahasia', objectiveIds: [tp1] }))
    ).json();
    // Sekolah B memakai id penilaian sekolah A: tidak ditemukan.
    const hit = await call(other, 'PUT', `/v1/assessments/${created.id}/objectives`, { objectiveIds: [] });
    expect(hit.statusCode).toBe(404);
    expect((await call(other, 'GET', `/v1/assessments?semesterId=${w.sem}`)).json()).toEqual([]);
    // Matriks dan override dengan kelas/mapel sekolah A dari sekolah B: 400 invalid_reference, tanpa kebocoran.
    const m = await call(other, 'GET', matrixUrl(w, w.c7p, w.mat), undefined, other.admin);
    expect([m.statusCode, errCode(m)]).toEqual([400, 'invalid_reference']);
    const put = await call(other, 'PUT', '/v1/grading/objective-achievement', {
      semesterId: other.sem,
      classId: other.c7p,
      subjectId: other.mat,
      records: [{ studentId: other.s.c7p![0], objectiveId: tp1, achieved: true }],
    });
    expect([put.statusCode, errCode(put)]).toEqual([400, 'invalid_reference']);
    // Pengaturan agregasi sekolah B tidak menyentuh sekolah A.
    expect((await setAggregation(other, 'max')).statusCode).toBe(200);
    expect((await call(w, 'GET', '/v1/grading/settings')).json()).not.toHaveProperty('objectiveAggregation');
    expect((await call(other, 'GET', '/v1/grading/settings')).json().objectiveAggregation).toBe('max');
    // Tabel tenant: konteks B tidak melihat baris A.
    const seen = await withTenant(app.tenantDb, [other.schoolId], (tx) =>
      tx.select().from(assessmentObjective),
    );
    expect(seen).toEqual([]);
    const seenA = await withTenant(app.tenantDb, [w.schoolId], (tx) => tx.select().from(assessmentObjective));
    expect(seenA.length).toBeGreaterThan(0);
    // FK komposit (school_id, id): baris B yang menunjuk penilaian atau TP milik A ditolak, lewat koneksi platform sekalipun.
    await expect(
      db()
        .insert(assessmentObjective)
        .values({ schoolId: other.schoolId, assessmentId: created.id, objectiveId: tp1 }),
    ).rejects.toThrow();
    const ownAssessment = await makeAssessment(other, { classId: other.c7p, subjectId: other.mat });
    await expect(
      db()
        .insert(assessmentObjective)
        .values({ schoolId: other.schoolId, assessmentId: ownAssessment, objectiveId: tp1 }),
    ).rejects.toThrow();
    await expect(
      db().insert(studentObjectiveAchievement).values({
        schoolId: other.schoolId,
        semesterId: other.sem,
        classId: other.c7p,
        subjectId: other.mat,
        studentId: other.s.c7p![0]!,
        objectiveId: tp1,
        achieved: true,
        updatedBy: 'uji',
      }),
    ).rejects.toThrow();
    // Lewat koneksi aplikasi (RLS WITH CHECK): sisip untuk sekolah lain ditolak.
    await expect(
      withTenant(app.tenantDb, [other.schoolId], (tx) =>
        tx
          .insert(assessmentObjective)
          .values({ schoolId: w.schoolId, assessmentId: created.id, objectiveId: tp1 }),
      ),
    ).rejects.toThrow();
  });
});

/* ------------------------------------------------------------------------------------------------ */

describe('T11: ketercapaian TP', () => {
  let w: World;
  beforeAll(async () => {
    w = await makeWorld('capai');
  }, 120_000);

  it('empat mode kriteria per TP (numeric, interval, rubric, descriptor) pada satu penilaian', async () => {
    const [a, b] = w.s.c8!;
    const tNum = await makeObjective(w, w.fis, 'num');
    const tInt = await makeObjective(w, w.fis, 'int');
    const tRub = await makeObjective(w, w.fis, 'rub');
    const tDes = await makeObjective(w, w.fis, 'des');
    const tBare = await makeObjective(w, w.fis, 'bare');
    await makeCriteria(w, { subjectId: w.fis, objectiveId: tNum, mode: 'numeric', threshold: 65 });
    await makeCriteria(w, {
      subjectId: w.fis,
      objectiveId: tInt,
      mode: 'interval',
      levels: [
        { label: 'Belum', min: 0, max: 59.99, ok: false },
        { label: 'Cukup', min: 60, max: 79.99, ok: true },
        { label: 'Baik', min: 80, max: 100, ok: true },
      ],
    });
    await makeCriteria(w, {
      subjectId: w.fis,
      objectiveId: tRub,
      mode: 'rubric',
      levels: [
        { label: 'Mulai', min: 0, max: 69, ok: false },
        { label: 'Mahir', min: 70, max: 100, ok: true },
      ],
    });
    await makeCriteria(w, {
      subjectId: w.fis,
      objectiveId: tDes,
      mode: 'descriptor',
      levels: [
        { label: 'Berkembang', min: 0, max: 74, ok: false },
        { label: 'Tercapai', min: 75, max: 100, ok: true },
      ],
    });
    await makeCriteria(w, {
      subjectId: w.fis,
      objectiveId: tBare,
      mode: 'descriptor',
      levels: [{ label: 'Tercapai', min: null, max: null, ok: true }],
    });
    await makeAssessment(w, {
      classId: w.c8,
      subjectId: w.fis,
      scores: { [a!]: 70, [b!]: 60 },
      objectiveIds: [tNum, tInt, tRub, tDes, tBare],
    });
    const m = await matrix(w, w.c8, w.fis);
    expect(m.objectives).toHaveLength(5);
    // Siswa a: 70
    expect(cellOf(m, a!, tNum)).toMatchObject({
      percent: 70,
      achieved: true,
      scope: 'objective',
      threshold: 65,
      source: 'computed',
      levelLabel: null,
    });
    expect(cellOf(m, a!, tInt)).toMatchObject({ achieved: true, levelLabel: 'Cukup', threshold: 60 });
    expect(cellOf(m, a!, tRub)).toMatchObject({ achieved: true, levelLabel: 'Mahir' });
    expect(cellOf(m, a!, tDes)).toMatchObject({ achieved: false, levelLabel: 'Berkembang' });
    expect(cellOf(m, a!, tBare)).toMatchObject({
      percent: 70,
      achieved: null,
      source: 'computed',
      levelLabel: null,
    });
    // Siswa b: 60
    expect(cellOf(m, b!, tNum)).toMatchObject({ achieved: false });
    expect(cellOf(m, b!, tInt)).toMatchObject({ achieved: true, levelLabel: 'Cukup' });
    expect(cellOf(m, b!, tRub)).toMatchObject({ achieved: false, levelLabel: 'Mulai' });
    const summary = m.objectives.find((o) => o.id === tNum)!.summary;
    expect(summary).toEqual({ assessed: 2, achieved: 1 });
    expect(m.objectives.find((o) => o.id === tBare)!.summary).toEqual({ assessed: 0, achieved: 0 });
  });

  it('empat jenjang cakupan: (tingkat, program) > tingkat > program > TP saja, dilihat dari kelas masing-masing', async () => {
    const tp = await makeObjective(w, w.fis, 'cakupan');
    await makeCriteria(w, {
      subjectId: w.fis,
      objectiveId: tp,
      levelCode: '7',
      programId: w.prg,
      mode: 'numeric',
      threshold: 80,
    });
    await makeCriteria(w, {
      subjectId: w.fis,
      objectiveId: tp,
      levelCode: '7',
      mode: 'numeric',
      threshold: 70,
    });
    await makeCriteria(w, {
      subjectId: w.fis,
      objectiveId: tp,
      programId: w.prg,
      mode: 'numeric',
      threshold: 60,
    });
    await makeCriteria(w, { subjectId: w.fis, objectiveId: tp, mode: 'numeric', threshold: 50 });
    const expected: [string, ObjectiveStatusScope, number, boolean][] = [
      ['c7p', 'objective_level_program', 80, false],
      ['c7', 'objective_level', 70, false],
      ['c8p', 'objective_program', 60, true],
      ['c8', 'objective', 50, true],
    ];
    for (const [name, scope, threshold, achieved] of expected) {
      const classId = w[name as 'c7p'];
      const [sid] = w.s[name]!;
      await makeAssessment(w, { classId, subjectId: w.fis, scores: { [sid!]: 65 }, objectiveIds: [tp] });
      const m = await matrix(w, classId, w.fis);
      expect(cellOf(m, sid!, tp), name).toMatchObject({ scope, threshold, achieved, percent: 65 });
    }
  });

  it('tanpa kriteria TP: KKM mapel (KKTP tingkat mapel), lalu KKM sekolah', async () => {
    const tp = await makeObjective(w, w.mat, 'fallback');
    const [sid] = w.s.c7!;
    await makeAssessment(w, { classId: w.c7, subjectId: w.mat, scores: { [sid!]: 65 }, objectiveIds: [tp] });
    // Belum ada KKTP mapel: KKM sekolah (bawaan 75).
    expect(cellOf(await matrix(w, w.c7, w.mat), sid!, tp)).toMatchObject({
      scope: 'school_kkm',
      threshold: 75,
      achieved: false,
    });
    // KKM mapel 60 (kriteria tanpa TP) menang atas KKM sekolah.
    await makeCriteria(w, { subjectId: w.mat, mode: 'numeric', threshold: 60 });
    expect(cellOf(await matrix(w, w.c7, w.mat), sid!, tp)).toMatchObject({
      scope: 'subject_kkm',
      threshold: 60,
      achieved: true,
    });
    // Kriteria per TP menang atas KKM mapel.
    await makeCriteria(w, { subjectId: w.mat, objectiveId: tp, mode: 'numeric', threshold: 66 });
    expect(cellOf(await matrix(w, w.c7, w.mat), sid!, tp)).toMatchObject({
      scope: 'objective',
      threshold: 66,
      achieved: false,
    });
  });

  it('tiga agregasi (mean, latest, max) dari beberapa penilaian sumatif; bawaan mean', async () => {
    const tp = await makeObjective(w, w.ipa, 'agregasi');
    const [sid] = w.s.c7!;
    for (const [date, value] of [
      ['2026-08-01', 60],
      ['2026-09-01', 90],
      ['2026-10-01', 40],
    ] as const) {
      await makeAssessment(w, {
        classId: w.c7,
        subjectId: w.ipa,
        date,
        scores: { [sid!]: value },
        objectiveIds: [tp],
      });
    }
    const percent = async () => {
      const m = await matrix(w, w.c7, w.ipa);
      return [m.aggregation, cellOf(m, sid!, tp).percent] as const;
    };
    expect(await percent()).toEqual(['mean', 63.33]);
    expect((await setAggregation(w, 'latest')).statusCode).toBe(200);
    expect(await percent()).toEqual(['latest', 40]);
    expect((await setAggregation(w, 'max')).statusCode).toBe(200);
    expect(await percent()).toEqual(['max', 90]);
    const settings = (await call(w, 'GET', '/v1/grading/settings')).json();
    expect(settings.objectiveAggregation).toBe('max');
    expect((await setAggregation(w, 'mean')).statusCode).toBe(200);
    expect(await percent()).toEqual(['mean', 63.33]);
    // Nilai di luar daftar ditolak; bawaan tidak menambahkan kunci ke respons pengaturan.
    expect((await setAggregation(w, 'median')).statusCode).toBe(400);
    expect((await call(w, 'GET', '/v1/grading/settings')).json()).not.toHaveProperty('objectiveAggregation');
  });

  it('skor kosong diabaikan; maksimum berbeda dinormalisasi; asesmen awal dan komponen asing tidak dihitung', async () => {
    const tp = await makeObjective(w, w.ipa, 'normal');
    const [a, b] = w.s.c8p!;
    await makeAssessment(w, {
      classId: w.c8p,
      subjectId: w.ipa,
      max: 50,
      scores: { [a!]: 40, [b!]: null },
      objectiveIds: [tp],
    });
    await makeAssessment(w, {
      classId: w.c8p,
      subjectId: w.ipa,
      max: 10,
      scores: { [a!]: 6 },
      objectiveIds: [tp],
    });
    // Asesmen awal di komponen formatif: bukan sumatif, jadi hanya kemajuan.
    await makeAssessment(w, {
      classId: w.c8p,
      subjectId: w.ipa,
      componentId: w.kuis,
      purpose: 'initial',
      scores: { [a!]: 100 },
      objectiveIds: [tp],
    });
    const m = await matrix(w, w.c8p, w.ipa);
    expect(cellOf(m, a!, tp)).toMatchObject({
      percent: 70,
      scoredCount: 2,
      formative: { average: 100, count: 1 },
    });
    expect(cellOf(m, b!, tp)).toMatchObject({
      percent: null,
      achieved: null,
      source: null,
      scope: null,
      scoredCount: 0,
    });
    expect(m.objectives[0]).toMatchObject({ assessmentCount: 2, formativeCount: 1 });
  });

  it('formatif tidak dihitung: skor formatif 100 tidak mengubah persen dan status; TP hanya formatif tidak berstatus', async () => {
    const tp = await makeObjective(w, w.fis, 'formatif');
    const tpOnly = await makeObjective(w, w.fis, 'hanya-formatif');
    const [sid] = w.s.c7p!;
    await makeAssessment(w, { classId: w.c7p, subjectId: w.fis, scores: { [sid!]: 50 }, objectiveIds: [tp] });
    const finalOf = async () =>
      (await call(w, 'GET', `/v1/grading/recap?semesterId=${w.sem}&classId=${w.c7p}&subjectId=${w.fis}`))
        .json()
        .students.find((s: { studentId: string }) => s.studentId === sid).final;
    const finalBefore = await finalOf();
    const before = cellOf(await matrix(w, w.c7p, w.fis), sid!, tp);
    await makeAssessment(w, {
      classId: w.c7p,
      subjectId: w.fis,
      componentId: w.kuis,
      scores: { [sid!]: 100 },
      objectiveIds: [tp, tpOnly],
    });
    const m = await matrix(w, w.c7p, w.fis);
    const after = cellOf(m, sid!, tp);
    expect([after.percent, after.achieved, after.scoredCount]).toEqual([
      before.percent,
      before.achieved,
      before.scoredCount,
    ]);
    expect(after.formative).toEqual({ average: 100, count: 1 });
    expect(cellOf(m, sid!, tpOnly)).toMatchObject({
      percent: null,
      achieved: null,
      source: null,
      formative: { average: 100, count: 1 },
    });
    expect(m.objectives.find((o) => o.id === tpOnly)).toMatchObject({
      assessmentCount: 0,
      formativeCount: 1,
    });
    // Nilai akhir mapel tidak berubah oleh kaitan TP (rapor/rekap tidak tersentuh).
    expect(await finalOf()).toBe(finalBefore);
  });

  it('override menang atas hitungan; label dan catatan; hapus dengan mengosongkan; includeAll menampilkan TP tanpa penilaian', async () => {
    const tp = await makeObjective(w, w.fis, 'override');
    const bare = await makeObjective(w, w.fis, 'tanpa-penilaian');
    const [a, b] = w.s.c7p!;
    await makeAssessment(w, {
      classId: w.c7p,
      subjectId: w.fis,
      scores: { [a!]: 40, [b!]: 90 },
      objectiveIds: [tp],
    });
    const put = (records: object[], who = w.admin) =>
      call(
        w,
        'PUT',
        '/v1/grading/objective-achievement',
        { semesterId: w.sem, classId: w.c7p, subjectId: w.fis, records },
        who,
      );
    expect(cellOf(await matrix(w, w.c7p, w.fis), a!, tp)).toMatchObject({
      achieved: false,
      source: 'computed',
    });
    const saved = await put([
      {
        studentId: a,
        objectiveId: tp,
        achieved: true,
        levelLabel: 'Remedial lisan',
        note: 'Lulus setelah remedial.',
      },
    ]);
    expect(saved.json()).toEqual({ saved: 1, cleared: 0 });
    const m = await matrix(w, w.c7p, w.fis);
    expect(cellOf(m, a!, tp)).toMatchObject({
      percent: 40,
      achieved: true,
      source: 'override',
      levelLabel: 'Remedial lisan',
      note: 'Lulus setelah remedial.',
    });
    expect(cellOf(m, b!, tp)).toMatchObject({ achieved: true, source: 'computed' });
    expect(m.objectives.find((o) => o.id === tp)!.summary).toEqual({ assessed: 2, achieved: 2 });
    // Override yang membalik tercapai -> belum.
    await put([{ studentId: b, objectiveId: tp, achieved: false }]);
    expect(cellOf(await matrix(w, w.c7p, w.fis), b!, tp)).toMatchObject({
      percent: 90,
      achieved: false,
      source: 'override',
    });
    // Hanya label/catatan: status tetap hitungan.
    await put([{ studentId: a, objectiveId: tp, levelLabel: 'Mahir', note: 'Catatan saja.' }]);
    expect(cellOf(await matrix(w, w.c7p, w.fis), a!, tp)).toMatchObject({
      achieved: false,
      source: 'computed',
      levelLabel: 'Mahir',
      note: 'Catatan saja.',
    });
    // Satu baris per (siswa, TP): upsert, bukan menumpuk.
    const rows = await db()
      .select()
      .from(studentObjectiveAchievement)
      .where(eq(studentObjectiveAchievement.objectiveId, tp));
    expect(rows).toHaveLength(2);
    // Mengosongkan ketiganya menghapus keputusan.
    expect(
      (
        await put([
          { studentId: a, objectiveId: tp },
          { studentId: b, objectiveId: tp, achieved: null, note: '' },
        ])
      ).json(),
    ).toEqual({ saved: 0, cleared: 2 });
    expect(
      await db()
        .select()
        .from(studentObjectiveAchievement)
        .where(eq(studentObjectiveAchievement.objectiveId, tp)),
    ).toEqual([]);
    expect(cellOf(await matrix(w, w.c7p, w.fis), a!, tp)).toMatchObject({
      achieved: false,
      source: 'computed',
    });
    // TP tanpa penilaian: hanya tampil bila diminta atau punya keputusan; override mengisi status tanpa angka.
    expect((await matrix(w, w.c7p, w.fis)).objectives.map((o) => o.id)).not.toContain(bare);
    await put([{ studentId: a, objectiveId: bare, achieved: true, note: 'Observasi.' }]);
    const m2 = await matrix(w, w.c7p, w.fis);
    expect(cellOf(m2, a!, bare)).toMatchObject({
      percent: null,
      achieved: true,
      source: 'override',
      scope: null,
    });
    const all = await matrix(w, w.c7p, w.fis, w.admin, '&includeAll=true');
    expect(all.objectives.map((o) => o.id)).toContain(bare);
  });

  it('validasi override: siswa bukan anggota kelas, TP mapel lain, hak guru, batas panjang', async () => {
    const tp = await makeObjective(w, w.mat, 'val');
    const ipaTp = await makeObjective(w, w.ipa, 'val-ipa');
    const [a] = w.s.c7p!;
    const [outsider] = w.s.c8!;
    const put = (records: object[], who = w.admin, classId = w.c7p, subjectId = w.mat) =>
      call(
        w,
        'PUT',
        '/v1/grading/objective-achievement',
        { semesterId: w.sem, classId, subjectId, records },
        who,
      );
    expect(errCode(await put([{ studentId: outsider, objectiveId: tp, achieved: true }]))).toBe(
      'invalid_reference',
    );
    expect(errCode(await put([{ studentId: a, objectiveId: ipaTp, achieved: true }]))).toBe(
      'objective_subject_mismatch',
    );
    expect(errCode(await put([{ studentId: a, objectiveId: FAKE, achieved: true }]))).toBe(
      'invalid_reference',
    );
    expect((await put([{ studentId: a, objectiveId: tp, note: 'x'.repeat(501) }])).statusCode).toBe(400);
    expect((await put([{ studentId: a, objectiveId: tp, levelLabel: 'x'.repeat(61) }])).statusCode).toBe(400);
    expect((await put([])).statusCode).toBe(400);
    // Guru pengampu (MAT di 7-P) boleh; guru lain dan pasangan yang tidak diampu 403.
    const ok = await put([{ studentId: a, objectiveId: tp, achieved: true }], w.teacherMat);
    expect(ok.statusCode, ok.body).toBe(200);
    expect((await put([{ studentId: a, objectiveId: tp, achieved: true }], w.teacherOther)).statusCode).toBe(
      403,
    );
    expect(
      (await put([{ studentId: outsider, objectiveId: ipaTp, achieved: true }], w.teacherMat, w.c8, w.ipa))
        .statusCode,
    ).toBe(403);
    // Membaca: pengampu boleh, guru lain 403.
    expect((await call(w, 'GET', matrixUrl(w, w.c7p, w.mat), undefined, w.teacherMat)).statusCode).toBe(200);
    expect((await call(w, 'GET', matrixUrl(w, w.c7p, w.mat), undefined, w.teacherOther)).statusCode).toBe(
      403,
    );
    const teacherView = await matrix(w, w.c7p, w.mat, w.teacherMat);
    expect(teacherView.canInput).toBe(true);
    // Referensi tidak sah pada kueri.
    const bad = await call(w, 'GET', matrixUrl(w, w.c7p, FAKE));
    expect([bad.statusCode, errCode(bad)]).toEqual([400, 'invalid_reference']);
  });

  it('jumlah kueri tetap untuk 40 siswa x 10 TP (tanpa N+1), pada konfigurasi hidup maupun beku', async () => {
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
      const build = async (tag: string, students: number, objectives: number) => {
        const x = await makeWorld(`q-${tag}`);
        const ids: string[] = [];
        for (let i = 0; i < students; i++) {
          const [st] = await db()
            .insert(student)
            .values({
              schoolId: x.schoolId,
              name: `Murid ${i}`,
              gender: 'L',
              status: 'active',
              nis: `q${tag}${i}-${run}`,
            })
            .returning();
          await db()
            .insert(enrollment)
            .values({ schoolId: x.schoolId, studentId: st!.id, classId: x.c7, academicYearId: x.yearId });
          ids.push(st!.id);
        }
        const tps: string[] = [];
        for (let i = 0; i < objectives; i++) tps.push(await makeObjective(x, x.mat, `Q${i}`));
        await makeCriteria(x, { subjectId: x.mat, objectiveId: tps[0]!, mode: 'numeric', threshold: 55 });
        await makeCriteria(x, { subjectId: x.mat, mode: 'numeric', threshold: 60 });
        for (let i = 0; i < Math.max(1, objectives / 2); i++) {
          const scores = Object.fromEntries(ids.map((id, j) => [id, (i * 7 + j * 3) % 101]));
          await makeAssessment(x, {
            classId: x.c7,
            subjectId: x.mat,
            scores,
            objectiveIds: [tps[2 * i]!, tps[2 * i + 1]!],
          });
        }
        return { x, ids, tps };
      };
      const count = async (b: Awaited<ReturnType<typeof build>>) => {
        queries = 0;
        const result = await withTenant(counting.db, [b.x.schoolId], async (tx) => {
          const cfg = await loadGradingConfig(tx, b.x.sem);
          return computeObjectiveAchievement(tx, {
            semesterId: b.x.sem,
            classId: b.x.c7,
            subjectId: b.x.mat,
            studentIds: b.ids,
            cfg,
          });
        });
        expect(result.objectives.length).toBeGreaterThan(0);
        return queries;
      };
      const small = await build('small', 2, 2);
      const big = await build('big', 40, 10);
      const nSmallLive = await count(small);
      const nBigLive = await count(big);
      expect(nBigLive).toBe(nSmallLive);
      expect(nBigLive).toBeLessThanOrEqual(20);
      // Semester beku: kriteria dari salinan, jadi lebih sedikit kueri, dan tetap tidak bergantung ukuran kelas.
      expect((await sync(small.x)).statusCode).toBe(200);
      expect((await sync(big.x)).statusCode).toBe(200);
      const nSmallFrozen = await count(small);
      const nBigFrozen = await count(big);
      expect(nBigFrozen).toBe(nSmallFrozen);
      expect(nBigFrozen).toBeLessThan(nBigLive);
      // Hasil 40 x 10 benar: setiap siswa punya sel untuk setiap TP.
      const m = await matrix(big.x, big.x.c7, big.x.mat);
      expect(m.objectives).toHaveLength(10);
      expect(m.students).toHaveLength(42); // 40 tambahan + 2 siswa bawaan kelas
      expect(m.students.every((s) => s.cells.length === 10)).toBe(true);
    } finally {
      await counting.pool.end();
    }
  }, 180_000);
});

/* ------------------------------------------------------------------------------------------------ */

describe('pembekuan kriteria TP dan agregasi', () => {
  let w: World;
  let tp = '';
  let sid = '';
  beforeAll(async () => {
    w = await makeWorld('beku', { formative: false });
    tp = await makeObjective(w, w.fis, 'beku');
    [sid] = w.s.c7!.slice(0, 1) as [string];
    await makeAssessment(w, {
      classId: w.c7,
      subjectId: w.fis,
      date: '2026-08-01',
      scores: { [sid]: 60 },
      objectiveIds: [tp],
    });
    await makeAssessment(w, {
      classId: w.c7,
      subjectId: w.fis,
      date: '2026-09-01',
      scores: { [sid]: 80 },
      objectiveIds: [tp],
    });
  }, 120_000);

  it('tanpa fitur: salinan v1 byte demi byte (sparse), kolom tahap 3.3 bawaan, matchesLive true', async () => {
    expect((await sync(w)).statusCode).toBe(200);
    const row = (await frozenRow(w))!;
    expect(row.configVersion).toBe(1);
    expect(row.objectiveCriteria).toEqual([]);
    expect(row.objectiveAggregation).toBeNull();
    const status = (await call(w, 'GET', `/v1/semesters/${w.sem}/grading-config`)).json();
    expect(status.matchesLive).toBe(true);
    expect(status).not.toHaveProperty('objectiveAggregation');
    expect(status).not.toHaveProperty('objectiveCriteriaCount');
    expect(cellOf(await matrix(w, w.c7, w.fis), sid, tp)).toMatchObject({
      percent: 70,
      scope: 'school_kkm',
      threshold: 75,
    });
  });

  it('kriteria TP lewat API ikut salinan di kolom TERPISAH (criteria tetap parse v1); semester beku tidak berubah oleh perubahan hidup', async () => {
    // Menulis KKTP ber-TP lewat API: aturan tulis-tembus menyalin ke semester aktif beku.
    const created = await call(w, 'POST', '/v1/achievement-criteria', {
      subjectId: w.fis,
      objectiveId: tp,
      mode: 'numeric',
      threshold: 65,
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json().syncedSemesterId).toBe(w.sem);
    const row = (await frozenRow(w))!;
    expect(row.configVersion).toBe(2);
    expect(frozenObjectiveCriteriaListSchema.parse(row.objectiveCriteria)).toHaveLength(1);
    // Pembaca v1 untuk `criteria` tidak melihat baris ber-TP (kode lama tidak gagal parse).
    expect(frozenCriteriaListSchema.parse(row.criteria)).toEqual([]);
    const status = (await call(w, 'GET', `/v1/semesters/${w.sem}/grading-config`)).json();
    expect(status).toMatchObject({ matchesLive: true, objectiveCriteriaCount: 1, criteriaCount: 0 });
    expect(cellOf(await matrix(w, w.c7, w.fis), sid, tp)).toMatchObject({
      scope: 'objective',
      threshold: 65,
      achieved: true,
    });

    // Ubah konfigurasi hidup LANGSUNG di DB (melewati tulis-tembus): salinan beku tetap dipakai.
    await db()
      .update(achievementCriteria)
      .set({ threshold: 90 })
      .where(eq(achievementCriteria.objectiveId, tp));
    await db()
      .insert(gradingSetting)
      .values({ schoolId: w.schoolId, objectiveAggregation: 'max' })
      .onConflictDoUpdate({
        target: gradingSetting.schoolId,
        set: { objectiveAggregation: 'max' },
      });
    const frozenView = await matrix(w, w.c7, w.fis);
    expect(frozenView).toMatchObject({ frozen: true, aggregation: 'mean' });
    expect(cellOf(frozenView, sid, tp)).toMatchObject({ percent: 70, threshold: 65, achieved: true });
    const diverged = (await call(w, 'GET', `/v1/semesters/${w.sem}/grading-config`)).json();
    expect(diverged.matchesLive).toBe(false);
    expect(diverged).not.toHaveProperty('objectiveAggregation');

    // Sinkron manual menerapkan konfigurasi hidup: agregasi max, ambang 90.
    const synced = await sync(w);
    expect(synced.statusCode).toBe(200);
    expect(synced.json()).toMatchObject({
      changed: true,
      matchesLive: true,
      objectiveAggregation: 'max',
      objectiveCriteriaCount: 1,
    });
    const after = await matrix(w, w.c7, w.fis);
    expect(after).toMatchObject({ frozen: true, aggregation: 'max' });
    expect(cellOf(after, sid, tp)).toMatchObject({ percent: 80, threshold: 90, achieved: false });
    // Tanpa perubahan: sinkron berikutnya idempoten.
    expect((await sync(w)).json().changed).toBe(false);
  });

  it('PUT /v1/grading/settings menyalin agregasi ke semester aktif beku (tulis-tembus) dan kembali sparse saat mean', async () => {
    const put = await setAggregation(w, 'latest');
    expect(put.statusCode, put.body).toBe(200);
    expect(put.json()).toMatchObject({ objectiveAggregation: 'latest', syncedSemesterId: w.sem });
    expect((await frozenRow(w))!.objectiveAggregation).toBe('latest');
    expect((await matrix(w, w.c7, w.fis)).aggregation).toBe('latest');
    await call(
      w,
      'DELETE',
      `/v1/achievement-criteria/${(await db().select().from(achievementCriteria).where(eq(achievementCriteria.objectiveId, tp)))[0]!.id}`,
    );
    const back = await setAggregation(w, 'mean');
    expect(back.json()).not.toHaveProperty('objectiveAggregation');
    const row = (await frozenRow(w))!;
    expect(row.objectiveAggregation).toBeNull();
    expect(row.objectiveCriteria).toEqual([]);
    expect(row.configVersion).toBe(1);
    expect((await call(w, 'GET', `/v1/semesters/${w.sem}/grading-config`)).json().matchesLive).toBe(true);
  });

  it('salinan v1 (tanpa kolom tahap 3.3) dibaca sebagai tanpa kriteria TP dan agregasi mean, walau konfigurasi hidup berbeda', async () => {
    const v1 = await makeWorld('beku-v1', { formative: false });
    const t = await makeObjective(v1, v1.fis, 'v1');
    const [a] = v1.s.c7!;
    await makeAssessment(v1, {
      classId: v1.c7,
      subjectId: v1.fis,
      date: '2026-08-01',
      scores: { [a!]: 60 },
      objectiveIds: [t],
    });
    await makeAssessment(v1, {
      classId: v1.c7,
      subjectId: v1.fis,
      date: '2026-09-01',
      scores: { [a!]: 100 },
      objectiveIds: [t],
    });
    expect((await sync(v1)).statusCode).toBe(200);
    // Salinan v1 murni: kolom tahap 3.3 dibuat NULL/'[]' seperti baris lama sebelum migrasi.
    await db()
      .update(semesterGradingConfig)
      .set({ objectiveCriteria: [], objectiveAggregation: null, configVersion: 1 })
      .where(eq(semesterGradingConfig.semesterId, v1.sem));
    await makeCriteria(v1, { subjectId: v1.fis, objectiveId: t, mode: 'numeric', threshold: 99 });
    await db()
      .insert(gradingSetting)
      .values({ schoolId: v1.schoolId, objectiveAggregation: 'max' })
      .onConflictDoUpdate({
        target: gradingSetting.schoolId,
        set: { objectiveAggregation: 'max' },
      });
    const m = await matrix(v1, v1.c7, v1.fis);
    expect(m.aggregation).toBe('mean');
    expect(cellOf(m, a!, t)).toMatchObject({
      percent: 80,
      scope: 'school_kkm',
      threshold: 75,
      achieved: true,
    });
  });

  it('T14: salinan tidak mencampur kriteria TP antar sekolah', async () => {
    const a = await makeWorld('beku-a');
    const b = await makeWorld('beku-b');
    const ta = await makeObjective(a, a.fis, 'a');
    const tb = await makeObjective(b, b.fis, 'b');
    await makeCriteria(a, { subjectId: a.fis, objectiveId: ta, mode: 'numeric', threshold: 61 });
    await makeCriteria(b, { subjectId: b.fis, objectiveId: tb, mode: 'numeric', threshold: 62 });
    expect((await sync(a)).statusCode).toBe(200);
    expect((await sync(b)).statusCode).toBe(200);
    const rowA = (await frozenRow(a))!;
    const text = JSON.stringify(rowA.objectiveCriteria);
    expect(text).toContain(ta);
    expect(text).not.toContain(tb);
    expect(JSON.stringify((await frozenRow(b))!.objectiveCriteria)).not.toContain(ta);
  });
});

/* ------------------------------------------------------------------------------------------------ */

describe('guard report_final per siswa pada override', () => {
  it('rapor final siswa menolak override 409 report_final; siswa lain (belum final) tetap boleh; boleh lagi setelah dibuka', async () => {
    const w = await makeWorld('final');
    const tp = await makeObjective(w, w.mat, 'final');
    const [a] = w.s.c7p!;
    const [other] = w.s.c7!;
    for (const [classId, sids] of [
      [w.c7p, w.s.c7p!],
      [w.c7, w.s.c7!],
    ] as const) {
      await makeAssessment(w, {
        classId,
        subjectId: w.mat,
        scores: Object.fromEntries(sids.map((id) => [id, 80])),
        objectiveIds: [tp],
      });
    }
    const put = (classId: string, studentId: string) =>
      call(w, 'PUT', '/v1/grading/objective-achievement', {
        semesterId: w.sem,
        classId,
        subjectId: w.mat,
        records: [{ studentId, objectiveId: tp, achieved: true, note: 'Keputusan guru' }],
      });
    expect((await put(w.c7p, a!)).statusCode).toBe(200);
    const fin = await call(w, 'POST', '/v1/report-cards/finalize', { semesterId: w.sem, classId: w.c7p });
    expect(fin.statusCode, fin.body).toBe(200);
    // Siswa kelas 7-P final: ditolak.
    const blocked = await put(w.c7p, a!);
    expect([blocked.statusCode, errCode(blocked)]).toEqual([409, 'report_final']);
    // Siswa kelas lain yang belum final tidak terkunci.
    expect((await put(w.c7, other!)).statusCode).toBe(200);
    // Matriks menandai siswa terkunci.
    const m = await matrix(w, w.c7p, w.mat);
    expect(m.students.every((s) => s.locked)).toBe(true);
    expect((await matrix(w, w.c7, w.mat)).students.some((s) => s.locked)).toBe(false);
    // Kaitan TP pada penilaian kelas final ditolak seperti penilaian (assertClassReportNotFinal).
    const [asm] = await db().select().from(assessment).where(eq(assessment.classId, w.c7p));
    const link = await call(w, 'PUT', `/v1/assessments/${asm!.id}/objectives`, { objectiveIds: [] });
    expect([link.statusCode, errCode(link)]).toEqual([409, 'report_final']);
    // Rapor final tidak berubah oleh keputusan lain (snapshot utuh) dan keputusan lama bertahan.
    const [card] = await db().select().from(reportCard).where(eq(reportCard.studentId, a!));
    expect(card).toMatchObject({ status: 'final', schemaVersion: 1 });
    // Buka kembali: boleh lagi.
    expect(
      (await call(w, 'POST', '/v1/report-cards/reopen', { semesterId: w.sem, classId: w.c7p })).statusCode,
    ).toBe(200);
    expect((await put(w.c7p, a!)).statusCode).toBe(200);
    expect(
      (await call(w, 'PUT', `/v1/assessments/${asm!.id}/objectives`, { objectiveIds: [] })).statusCode,
    ).toBe(200);
  });
});

/* ------------------------------------------------------------------------------------------------ */

describe('T17: versi TP bila dipakai penilaian', () => {
  it('ubah teks TP yang dikaitkan penilaian: versi baru, penilaian dan ATP terbit menunjuk yang lama, snapshot utuh; hapus 409 in_use', async () => {
    const w = await makeWorld('versi');
    const tp = await makeObjective(w, w.mat, 'V1');
    const [a] = w.s.c7p!;
    const asmId = await makeAssessment(w, {
      classId: w.c7p,
      subjectId: w.mat,
      scores: Object.fromEntries(w.s.c7p!.map((id) => [id, 80])),
      objectiveIds: [tp],
    });
    // ATP terbit yang memuat TP itu.
    const [flow] = await db()
      .insert(learningFlow)
      .values({
        schoolId: w.schoolId,
        subjectId: w.mat,
        academicYearId: w.yearId,
        name: 'ATP',
        status: 'published',
        publishedAt: new Date(),
      })
      .returning();
    await db()
      .insert(learningFlowItem)
      .values({ schoolId: w.schoolId, flowId: flow!.id, objectiveId: tp, sortOrder: 0 });
    // Rapor final kelas itu (snapshot yang harus tetap).
    expect(
      (await call(w, 'POST', '/v1/report-cards/finalize', { semesterId: w.sem, classId: w.c7p })).statusCode,
    ).toBe(200);
    const [before] = await db().select().from(reportCard).where(eq(reportCard.studentId, a!));

    const put = await call(w, 'PUT', `/v1/objectives/${tp}`, { description: 'TP V1 diperbarui' });
    expect(put.statusCode, put.body).toBe(200);
    expect(put.json()).toMatchObject({ versioned: true, previousId: tp });
    const nextId = put.json().id as string;
    expect(nextId).not.toBe(tp);
    const [old] = await db().select().from(learningObjective).where(eq(learningObjective.id, tp));
    expect(old).toMatchObject({ active: false, description: 'TP V1' });
    // Penilaian dan ATP terbit tetap menunjuk TP lama.
    const links = await db()
      .select()
      .from(assessmentObjective)
      .where(eq(assessmentObjective.assessmentId, asmId));
    expect(links.map((l) => l.objectiveId)).toEqual([tp]);
    const items = await db().select().from(learningFlowItem).where(eq(learningFlowItem.flowId, flow!.id));
    expect(items.map((i) => i.objectiveId)).toEqual([tp]);
    const [after] = await db().select().from(reportCard).where(eq(reportCard.studentId, a!));
    expect(after!.snapshot).toEqual(before!.snapshot);
    // Matriks (siswa lain belum final) masih menampilkan TP lama (nonaktif) selama dikaitkan.
    const m = await matrix(w, w.c7p, w.mat);
    expect(m.objectives.find((o) => o.id === tp)).toMatchObject({ active: false });
    // TP baru yang belum dipakai diubah di tempat (perilaku lama).
    const inPlace = await call(w, 'PUT', `/v1/objectives/${nextId}`, { description: 'Revisi kecil' });
    expect(inPlace.json()).toMatchObject({ versioned: false, id: nextId });

    // Hapus TP terpakai penilaian: 409 in_use; setelah dilepas dan tanpa ATP, boleh dihapus.
    const used = await makeObjective(w, w.mat, 'V2');
    const asm2 = await makeAssessment(w, { classId: w.c7, subjectId: w.mat, objectiveIds: [used] });
    const del = await call(w, 'DELETE', `/v1/objectives/${used}`);
    expect([del.statusCode, errCode(del)]).toEqual([409, 'in_use']);
    await db().delete(assessmentObjective).where(eq(assessmentObjective.assessmentId, asm2));
    expect((await call(w, 'DELETE', `/v1/objectives/${used}`)).statusCode).toBe(200);
    // TP dengan keputusan guru juga tidak dapat dihapus.
    const decided = await makeObjective(w, w.mat, 'V3');
    await db().insert(studentObjectiveAchievement).values({
      schoolId: w.schoolId,
      semesterId: w.sem,
      classId: w.c7p,
      subjectId: w.mat,
      studentId: a!,
      objectiveId: decided,
      achieved: true,
      updatedBy: 'uji',
    });
    expect(errCode(await call(w, 'DELETE', `/v1/objectives/${decided}`))).toBe('in_use');
  });

  it('TP hanya dikaitkan penilaian (tanpa ATP): versi baru; TP bebas: diubah di tempat', async () => {
    const w = await makeWorld('versi2');
    const linked = await makeObjective(w, w.mat, 'L');
    const free = await makeObjective(w, w.mat, 'F');
    await makeAssessment(w, { classId: w.c7p, subjectId: w.mat, objectiveIds: [linked] });
    const a = await call(w, 'PUT', `/v1/objectives/${linked}`, { description: 'Teks baru L' });
    expect(a.json()).toMatchObject({ versioned: true, previousId: linked });
    const b = await call(w, 'PUT', `/v1/objectives/${free}`, { description: 'Teks baru F' });
    expect(b.json()).toMatchObject({ versioned: false, id: free });
    // CP yang salah satu TP-nya dikaitkan penilaian juga berversi baru; CP tanpa TP terpakai diubah di tempat.
    const [lo] = await db().select().from(learningObjective).where(eq(learningObjective.id, linked));
    const cp = await call(w, 'PUT', `/v1/outcomes/${lo!.outcomeId}`, {
      phase: 'D',
      description: 'CP berubah',
    });
    expect(cp.statusCode, cp.body).toBe(200);
    expect(cp.json()).toMatchObject({ versioned: true, previousId: lo!.outcomeId });
    const [fo] = await db().select().from(learningObjective).where(eq(learningObjective.id, free));
    const cpFree = await call(w, 'PUT', `/v1/outcomes/${fo!.outcomeId}`, {
      phase: 'D',
      description: 'CP bebas berubah',
    });
    expect(cpFree.json()).toMatchObject({ versioned: false, id: fo!.outcomeId });
  });
});
