import { readFileSync, writeFileSync } from 'node:fs';
import {
  academicYear,
  achievementCriteria,
  assessment,
  assignRoles,
  classRoom,
  dailyAttendance,
  enrollment,
  entitlement,
  eq,
  foundation,
  gradeComponent,
  gradingSetting,
  member,
  program,
  reportCard,
  reportCardSnapshot,
  school,
  score,
  seedSchoolRoles,
  semester,
  semesterGradingConfig,
  sql,
  student,
  subject,
  subscription,
  user,
  withTenant,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { gradesFor } from './portal-lib';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/**
 * Garis dasar fase 3 (rancangan: docs/rancangan-fase-3-asesmen-rapor.md, tes T1 dan T2).
 *
 * Membekukan keluaran perilaku v1.2.2 untuk data tenant yang deterministik pada tiga mode nilai dan empat cakupan KKTP:
 * rekap mapel, matriks kelas, dokumen rapor draf, daftar rapor, nilai portal, lalu finalisasi (snapshot jsonb,
 * `schema_version`, salinan beku `config_version`, `matchesLive`). Fixture: `__fixtures__/phase3-baseline.json`.
 *
 * Tahap 3.1 dan seterusnya harus tetap menghasilkan fixture yang sama untuk sekolah yang tidak memakai fitur baru. Bila
 * tes ini merah, perilaku sekolah lama berubah: perbaiki kodenya, bukan fixture. Field API aditif yang disengaja didaftar di
 * `ADDITIVE_KEYS` (dibuang sebelum membandingkan). Pembaruan fixture HANYA bila perubahan perilaku disetujui:
 * `UPDATE_PHASE3_BASELINE=1 pnpm vitest run apps/api/src/phase3-baseline.test.ts`, lalu rapikan dengan biome.
 */

const FIXTURE = new URL('./__fixtures__/phase3-baseline.json', import.meta.url);
const UPDATE = process.env.UPDATE_PHASE3_BASELINE === '1';
/** Kunci aditif yang boleh muncul pada respons tahap berikutnya tanpa mengubah angka lama. Kosong untuk v1.2.2. */
const ADDITIVE_KEYS: readonly string[] = [];
/** Kunci waktu yang berubah tiap eksekusi. */
const TIME_KEYS = new Set(['generatedAt', 'finalizedAt', 'frozenAt', 'createdAt', 'updatedAt']);
/** Kunci berisi id pengguna acak (bukan uuid). */
const ACTOR_KEYS = new Set(['finalizedBy', 'frozenBy', 'actorId']);

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let subscriptionId = '';
let subscriptionEnd = new Date();
let cookie = '';
let userId = '';
const schoolIds: string[] = [];

const db = () => app.platformDb;

type Mode = 'weighted_average' | 'percentage' | 'simple_average';
const MODES: Mode[] = ['weighted_average', 'percentage', 'simple_average'];

interface World {
  mode: Mode;
  schoolId: string;
  sem: string;
  classA: string;
  classB: string;
  subjects: { mat: string; ipa: string; ind: string; ing: string };
  students: { ani: string; budi: string; citra: string; dedi: string };
  /** id -> label stabil untuk normalisasi. */
  labels: Map<string, string>;
}

let worldSeq = 0;

/**
 * Sekolah uji deterministik. Kelas 7A (program IPA-X, tingkat "7") berisi Ani, Budi, Citra; kelas 7B (tanpa program) berisi Dedi.
 * Empat mapel mewakili empat cakupan KKTP: MAT = (mapel+tingkat+program, 80), IPA = (mapel+tingkat, 70), IND = (mapel, 65),
 * ING = tanpa kriteria (KKM sekolah 75). Mode `weighted_average` sengaja tanpa baris `grading_setting` (nilai bawaan).
 */
async function makeWorld(mode: Mode): Promise<World> {
  const label = `p3b${run}${worldSeq++}`;
  const [s] = await db()
    .insert(school)
    .values({ foundationId, slug: label, name: 'Sekolah Garis Dasar' })
    .returning();
  const schoolId = s!.id;
  schoolIds.push(schoolId);
  await seedSchoolRoles(db(), schoolId);
  await db()
    .insert(entitlement)
    .values({ schoolId, moduleKey: 'grades', subscriptionId, validUntil: subscriptionEnd });
  const [m] = await db().insert(member).values({ userId, schoolId }).returning();
  await assignRoles(db(), m!.id, schoolId, ['school_admin']);

  const [year] = await db()
    .insert(academicYear)
    .values({ schoolId, name: '2000-2099', startsOn: '2000-01-01', endsOn: '2099-12-31', isActive: true })
    .returning();
  const [sem] = await db()
    .insert(semester)
    .values({
      schoolId,
      academicYearId: year!.id,
      name: 'Ganjil',
      startsOn: '2026-07-01',
      endsOn: '2026-12-31',
      isActive: true,
    })
    .returning();
  const [prog] = await db()
    .insert(program)
    .values({ schoolId, code: 'IPA-X', name: 'Program IPA' })
    .returning();
  const mkClass = async (name: string, programId: string | null) =>
    (
      await db()
        .insert(classRoom)
        .values({ schoolId, academicYearId: year!.id, name, level: '7', programId })
        .returning()
    )[0]!.id;
  const classA = await mkClass('7A', prog!.id);
  const classB = await mkClass('7B', null);
  const mkSubject = async (code: string, name: string) =>
    (await db().insert(subject).values({ schoolId, code, name }).returning())[0]!.id;
  const subjects = {
    mat: await mkSubject('MAT', 'Matematika'),
    ipa: await mkSubject('IPA', 'Ilmu Pengetahuan Alam'),
    ind: await mkSubject('IND', 'Bahasa Indonesia'),
    ing: await mkSubject('ING', 'Bahasa Inggris'),
  };
  const mkStudent = async (name: string, nis: string, classId: string) => {
    const [st] = await db()
      .insert(student)
      .values({ schoolId, name, gender: 'L', status: 'active', nis, nisn: `00${nis}` })
      .returning();
    await db().insert(enrollment).values({ schoolId, studentId: st!.id, classId, academicYearId: year!.id });
    return st!.id;
  };
  const students = {
    ani: await mkStudent('Ani', '1001', classA),
    budi: await mkStudent('Budi', '1002', classA),
    citra: await mkStudent('Citra', '1003', classA),
    dedi: await mkStudent('Dedi', '1004', classB),
  };

  if (mode !== 'weighted_average') {
    await db()
      .insert(gradingSetting)
      .values({ schoolId, kkm: 75, predicateA: 90, predicateB: 80, predicateC: 70, calculationMode: mode });
  }
  const comps = await db()
    .insert(gradeComponent)
    .values([
      { schoolId, name: 'Tugas', weight: 40, sort: 0 },
      { schoolId, name: 'UAS', weight: 60, sort: 1 },
    ])
    .returning();
  const tugas = comps.find((c) => c.name === 'Tugas')!.id;
  const uas = comps.find((c) => c.name === 'UAS')!.id;

  // Empat cakupan KKTP. Baris bertingkat rendah pada MAT membuktikan urutan pemecah (tingkat+program menang).
  // Satu per satu (bukan satu INSERT) supaya `created_at` berbeda dan urutan baca (created_at, id) deterministik.
  const criteriaIds: [string, string][] = [];
  const addCriteria = async (name: string, v: Partial<typeof achievementCriteria.$inferInsert>) => {
    const [c] = await db()
      .insert(achievementCriteria)
      .values({ schoolId, mode: 'numeric', ...v } as typeof achievementCriteria.$inferInsert)
      .returning();
    criteriaIds.push([c!.id, `criteria:${name}`]);
  };
  await addCriteria('mat-level-program', {
    subjectId: subjects.mat,
    levelCode: '7',
    programId: prog!.id,
    threshold: 80,
  });
  await addCriteria('mat-subject', { subjectId: subjects.mat, threshold: 60 });
  await addCriteria('ipa-level', { subjectId: subjects.ipa, levelCode: '7', threshold: 70 });
  await addCriteria('ind-subject', { subjectId: subjects.ind, threshold: 65 });

  // Skor: [tugas, uas]; null = tanpa skor. Tiap siswa kelas A punya minimal satu skor di tiap mapel (finalisasi tanpa force).
  const plan: Record<string, Record<string, [number | null, number | null]>> = {
    ani: { mat: [80, 90], ipa: [70, 60], ind: [90, 95], ing: [75, 75] },
    budi: { mat: [60, 70], ipa: [80, 72], ind: [50, 60], ing: [85, null] },
    citra: { mat: [null, 78], ipa: [65, 68], ind: [null, 55], ing: [74, 76] },
    dedi: { mat: [88, 92], ipa: [40, null], ind: [null, null], ing: [66, 70] },
  };
  const classOf = (who: string) => (who === 'dedi' ? classB : classA);
  for (const subj of ['mat', 'ipa', 'ind', 'ing'] as const) {
    for (const cls of [classA, classB]) {
      const rows = Object.entries(plan).filter(([who]) => classOf(who) === cls);
      const mk = async (componentId: string, title: string, date: string) =>
        (
          await db()
            .insert(assessment)
            .values({
              schoolId,
              semesterId: sem!.id,
              classId: cls,
              subjectId: subjects[subj],
              componentId,
              title: `${title} ${subj}`,
              date,
            })
            .returning()
        )[0]!.id;
      const tugasId = await mk(tugas, 'Tugas', '2026-08-01');
      const uasId = await mk(uas, 'UAS', '2026-09-01');
      for (const [who, bySubject] of rows) {
        const [vt, vu] = bySubject[subj]!;
        const studentId = students[who as keyof typeof students];
        if (vt !== null)
          await db()
            .insert(score)
            .values({ schoolId, assessmentId: tugasId, studentId, value: vt, updatedBy: 'uji' });
        if (vu !== null)
          await db()
            .insert(score)
            .values({ schoolId, assessmentId: uasId, studentId, value: vu, updatedBy: 'uji' });
      }
    }
  }
  // Absensi Ani dan Budi dalam rentang semester, supaya bagian kehadiran dokumen tidak kosong.
  const att = (studentId: string, date: string, status: 'sick' | 'excused' | 'absent' | 'late' | 'present') =>
    db().insert(dailyAttendance).values({ schoolId, studentId, date, status });
  await att(students.ani, '2026-08-03', 'sick');
  await att(students.ani, '2026-08-04', 'late');
  await att(students.ani, '2026-08-05', 'present');
  await att(students.budi, '2026-08-03', 'absent');
  await att(students.budi, '2026-08-04', 'excused');

  const labels = new Map<string, string>([
    [schoolId, 'school'],
    [sem!.id, 'semester'],
    [classA, 'classA'],
    [classB, 'classB'],
    [prog!.id, 'program'],
    [tugas, 'comp:Tugas'],
    [uas, 'comp:UAS'],
    ...criteriaIds,
    ...Object.entries(subjects).map(([k, v]) => [v, `subject:${k}`] as [string, string]),
    ...Object.entries(students).map(([k, v]) => [v, `student:${k}`] as [string, string]),
  ]);
  return { mode, schoolId, sem: sem!.id, classA, classB, subjects, students, labels };
}

const call = (method: 'GET' | 'POST' | 'PUT', url: string, w: World, payload?: object) =>
  app.inject({
    method,
    url,
    headers: {
      cookie,
      'x-school-id': w.schoolId,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normalisasi: waktu -> '<waktu>', uuid -> label stabil (dikenal) atau '<id:n>' (urutan kemunculan), kunci aditif dibuang. */
function normalize(w: World, value: unknown): unknown {
  const seen = new Map<string, string>();
  const label = (id: string) => {
    const known = w.labels.get(id);
    if (known) return known;
    if (!seen.has(id)) seen.set(id, `<id:${seen.size + 1}>`);
    return seen.get(id)!;
  };
  const walk = (v: unknown, key?: string): unknown => {
    if (key && TIME_KEYS.has(key)) return '<waktu>';
    if (key && ACTOR_KEYS.has(key)) return v === null ? null : '<pengguna>';
    if (typeof v === 'string') return UUID.test(v) ? label(v) : v;
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k, val]) => val !== undefined && !ADDITIVE_KEYS.includes(k))
          .map(([k, val]) => [k, walk(val, k)]),
      );
    }
    return v;
  };
  return walk(JSON.parse(JSON.stringify(value)));
}

const body = async (res: Promise<{ statusCode: number; json: () => unknown }>) => {
  const r = await res;
  expect(r.statusCode).toBe(200);
  return r.json();
};

/** Semua permukaan nilai satu semester: rekap per mapel dan kelas, matriks kelas, daftar rapor, dokumen rapor, portal. */
async function surface(w: World) {
  const [sem] = await db().select().from(semester).where(eq(semester.id, w.sem));
  const recap = async (classId: string) => {
    const out: Record<string, unknown> = {};
    for (const [k, subjectId] of Object.entries(w.subjects)) {
      out[k] = await body(
        call('GET', `/v1/grading/recap?semesterId=${w.sem}&classId=${classId}&subjectId=${subjectId}`, w),
      );
    }
    return out;
  };
  const matrix = (classId: string) =>
    body(call('GET', `/v1/grading/recap/class?semesterId=${w.sem}&classId=${classId}`, w));
  const list = (classId: string) =>
    body(call('GET', `/v1/report-cards?semesterId=${w.sem}&classId=${classId}`, w));
  const doc = (studentId: string) =>
    body(call('GET', `/v1/report-cards/${studentId}?semesterId=${w.sem}`, w));
  const portal = (studentId: string) =>
    withTenant(app.tenantDb, [w.schoolId], (tx) => gradesFor(tx, studentId, sem!));
  const docs: Record<string, unknown> = {};
  const portals: Record<string, unknown> = {};
  for (const [name, id] of Object.entries(w.students)) {
    docs[name] = await doc(id);
    portals[name] = await portal(id);
  }
  return {
    recapA: await recap(w.classA),
    recapB: await recap(w.classB),
    matrixA: await matrix(w.classA),
    matrixB: await matrix(w.classB),
    listA: await list(w.classA),
    listB: await list(w.classB),
    docs,
    portals,
  };
}

async function capture(w: World) {
  // 1) Draf: sebelum finalisasi apa pun.
  const draft = await surface(w);

  // 2) Pengaturan rapor dan catatan wali (deterministik) lalu finalisasi kelas A tanpa force dan tanpa fitur baru.
  expect(
    (
      await call('PUT', '/v1/report-cards/settings', w, {
        principalName: 'Kepala Sekolah Uji',
        principalNip: '19700101',
        city: 'Bandung',
        address: 'Jl. Uji 1',
        descA: 'Sangat baik.',
        descB: 'Baik.',
        descC: 'Cukup.',
        descD: 'Perlu bimbingan.',
        showRank: true,
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await call('PUT', '/v1/report-cards/note', w, {
        semesterId: w.sem,
        studentId: w.students.ani,
        note: 'Pertahankan.',
      })
    ).statusCode,
  ).toBe(200);
  const afterSettings = await surface(w);
  const fin = await call('POST', '/v1/report-cards/finalize', w, { semesterId: w.sem, classId: w.classA });
  expect(fin.statusCode).toBe(200);
  expect(fin.json()).toEqual({ finalized: 3 });

  // 3) Setelah final: permukaan, baris DB, salinan beku.
  const final = await surface(w);
  const cards = await db().select().from(reportCard).where(eq(reportCard.schoolId, w.schoolId));
  const history = await db()
    .select()
    .from(reportCardSnapshot)
    .where(eq(reportCardSnapshot.schoolId, w.schoolId));
  const byStudent = (rows: { studentId: string }[]) =>
    Object.fromEntries(
      Object.entries(w.students).map(([name, id]) => [name, rows.find((r) => r.studentId === id) ?? null]),
    );
  const [frozen] = await db()
    .select()
    .from(semesterGradingConfig)
    .where(eq(semesterGradingConfig.semesterId, w.sem));
  const status = await body(call('GET', `/v1/semesters/${w.sem}/grading-config`, w));

  // Pernyataan eksplisit (selain fixture): bentuk v1 tanpa fitur baru.
  for (const c of cards.filter((r) => r.status === 'final')) {
    expect(c.schemaVersion).toBe(1);
  }
  expect(history.every((h) => h.schemaVersion === 1 || h.kind === 'reopened')).toBe(true);
  expect(frozen!.configVersion).toBe(1);
  expect((status as { matchesLive: boolean }).matchesLive).toBe(true);

  return normalize(w, {
    draft,
    afterSettings,
    final,
    reportCards: byStudent(cards.map(({ id: _id, ...c }) => c)),
    history: byStudent(
      history.map((h) => ({
        studentId: h.studentId,
        version: h.version,
        kind: h.kind,
        schemaVersion: h.schemaVersion,
        snapshot: h.snapshot,
      })),
    ),
    frozen: {
      kkm: frozen!.kkm,
      predicateA: frozen!.predicateA,
      predicateB: frozen!.predicateB,
      predicateC: frozen!.predicateC,
      calculationMode: frozen!.calculationMode,
      configVersion: frozen!.configVersion,
      origin: frozen!.origin,
      components: frozen!.components,
      criteria: frozen!.criteria,
    },
    status,
  });
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Garis Dasar', slug: `ypb-${run}` })
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
  const email = `admin-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: 'admin', email, password } });
  userId = res.user.id;
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}, 90_000);

afterAll(async () => {
  for (const sid of schoolIds) {
    for (const table of [
      'audit_log',
      'report_card_snapshot',
      'report_card',
      'report_setting',
      'semester_grading_config',
      'achievement_rubric_level',
      'achievement_criteria',
      'score',
      'assessment',
      'grade_component',
      'grading_setting',
      'daily_attendance',
      'enrollment',
      'class_room',
      'program',
      'subject',
      'student',
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
  await db().delete(user).where(eq(user.id, userId));
  await app.close();
});

describe('garis dasar fase 3 (T1 dan T2): perilaku v1.2.2 dibekukan', () => {
  const actual: Record<string, unknown> = {};

  for (const mode of MODES) {
    it(`mode ${mode}: rekap, matriks, rapor draf, daftar rapor, portal, finalisasi, dan salinan beku`, async () => {
      const w = await makeWorld(mode);
      actual[mode] = await capture(w);
      if (UPDATE) return;
      const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, unknown>;
      expect(actual[mode]).toEqual(fixture[mode]);
    }, 120_000);
  }

  it.runIf(UPDATE)('menulis ulang fixture (UPDATE_PHASE3_BASELINE=1)', () => {
    expect(Object.keys(actual).sort()).toEqual([...MODES].sort());
    writeFileSync(FIXTURE, `${JSON.stringify(actual, null, 2)}\n`);
  });

  it('fixture mencakup tiga mode dan keempat cakupan KKM yang berbeda', () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<
      string,
      {
        draft: { docs: { ani: { subjects: { name: string; kkm: number }[] } } };
        frozen: { calculationMode: string; configVersion: number };
        status: Record<string, unknown>;
      }
    >;
    expect(Object.keys(fixture).sort()).toEqual([...MODES].sort());
    for (const mode of MODES) {
      const subjects = fixture[mode]!.draft.docs.ani.subjects;
      const kkm = Object.fromEntries(subjects.map((s) => [s.name, s.kkm]));
      expect(kkm).toEqual({
        Matematika: 80,
        'Ilmu Pengetahuan Alam': 70,
        'Bahasa Indonesia': 65,
        'Bahasa Inggris': 75,
      });
      expect(fixture[mode]!.frozen.calculationMode).toBe(mode);
      expect(fixture[mode]!.frozen.configVersion).toBe(1);
      expect(fixture[mode]!.status).toMatchObject({ frozen: true, origin: 'finalize', matchesLive: true });
    }
  });
});
