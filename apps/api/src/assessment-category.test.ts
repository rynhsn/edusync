import {
  academicYear,
  assessment,
  assignRoles,
  classRoom,
  enrollment,
  entitlement,
  eq,
  foundation,
  freezeSemesterGradingConfig,
  gradeComponent,
  gradingSetting,
  member,
  school,
  score,
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
import { loadGradingConfig } from './grading-config-lib';
import { gradesFor } from './portal-lib';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/**
 * Kategori asesmen, tahap 3.1 (rancangan: docs/rancangan-fase-3-asesmen-rapor.md, bagian 3.1; tes T3, T4, T5, T10, T14, T16).
 * Dunia dasar: Tugas 40 dan UAS 60 (sumatif), mapel MAT berskor (Ani 86, Budi 66) dan IPA tanpa penilaian, KKM 75.
 */

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
const extraUserIds: string[] = [];

const db = () => app.platformDb;

type Mode = 'weighted_average' | 'percentage' | 'simple_average';

interface World {
  schoolId: string;
  sem: string;
  classA: string;
  mat: string;
  ipa: string;
  tugas: string;
  uas: string;
  ani: string;
  budi: string;
  teacherCookie: string;
}

let worldSeq = 0;

async function makeWorld(opts: { mode?: Mode; bare?: boolean } = {}): Promise<World> {
  const label = `ac${run}${worldSeq++}`;
  const [s] = await db()
    .insert(school)
    .values({ foundationId, slug: label, name: `Sekolah ${label}` })
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
  const [cls] = await db()
    .insert(classRoom)
    .values({ schoolId, academicYearId: year!.id, name: '7A', level: '7' })
    .returning();
  const [mat] = await db().insert(subject).values({ schoolId, code: 'MAT', name: 'Matematika' }).returning();
  const [ipa] = await db().insert(subject).values({ schoolId, code: 'IPA', name: 'IPA' }).returning();
  const mkStudent = async (name: string) => {
    const [st] = await db()
      .insert(student)
      .values({ schoolId, name, gender: 'L', status: 'active', nis: `${name}-${label}` })
      .returning();
    await db()
      .insert(enrollment)
      .values({ schoolId, studentId: st!.id, classId: cls!.id, academicYearId: year!.id });
    return st!.id;
  };
  const ani = await mkStudent('Ani');
  const budi = await mkStudent('Budi');
  if (opts.mode) {
    await db().insert(gradingSetting).values({
      schoolId,
      kkm: 75,
      predicateA: 90,
      predicateB: 80,
      predicateC: 70,
      calculationMode: opts.mode,
    });
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
  if (!opts.bare) {
    const mk = async (componentId: string, title: string) =>
      (
        await db()
          .insert(assessment)
          .values({
            schoolId,
            semesterId: sem!.id,
            classId: cls!.id,
            subjectId: mat!.id,
            componentId,
            title,
            date: '2026-08-01',
          })
          .returning()
      )[0]!.id;
    const aT = await mk(tugas, 'Tugas 1');
    const aU = await mk(uas, 'UAS 1');
    const put = (assessmentId: string, studentId: string, value: number) =>
      db().insert(score).values({ schoolId, assessmentId, studentId, value, updatedBy: 'uji' });
    await put(aT, ani, 80);
    await put(aU, ani, 90);
    await put(aT, budi, 60);
    await put(aU, budi, 70);
  }
  // Guru MAT kelas 7A: grade:input tanpa grade:configure.
  const email = `guru-${label}@example.test`;
  const reg = await app.auth.api.signUpEmail({ body: { name: 'Guru', email, password } });
  extraUserIds.push(reg.user.id);
  const [gm] = await db().insert(member).values({ userId: reg.user.id, schoolId }).returning();
  await assignRoles(db(), gm!.id, schoolId, ['teacher']);
  const [t] = await db().insert(teacher).values({ schoolId, name: 'Guru MAT', memberId: gm!.id }).returning();
  await db()
    .insert(teachingAssignment)
    .values({ schoolId, classId: cls!.id, subjectId: mat!.id, teacherId: t!.id });
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return {
    schoolId,
    sem: sem!.id,
    classA: cls!.id,
    mat: mat!.id,
    ipa: ipa!.id,
    tugas,
    uas,
    ani,
    budi,
    teacherCookie: login.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
  };
}

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  w: { schoolId: string },
  payload?: object,
  who = cookie,
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

const stable = <T extends { generatedAt?: string }>(doc: T) => ({ ...doc, generatedAt: undefined });

const addComponent = async (w: World, body: object) => {
  const res = await call('POST', '/v1/grading/components', w, body);
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string; category: string; includeInFinal: boolean; weight: number };
};

const addAssessment = async (w: World, componentId: string, subjectId: string, extra: object = {}) => {
  const res = await call('POST', '/v1/assessments', w, {
    semesterId: w.sem,
    classId: w.classA,
    subjectId,
    componentId,
    title: `Penilaian ${Math.random().toString(36).slice(2, 6)}`,
    date: '2026-09-01',
    ...extra,
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string; category: string };
};

const saveScores = async (w: World, assessmentId: string, values: Record<string, number>) => {
  const res = await call('PUT', `/v1/assessments/${assessmentId}/scores`, w, {
    records: Object.entries(values).map(([studentId, value]) => ({ studentId, value })),
  });
  expect(res.statusCode, res.body).toBe(200);
};

/** Semua angka yang TIDAK boleh bergeser oleh komponen formatif (rekap mapel, matriks, rapor, daftar, portal). */
async function numbers(w: World) {
  const recapRes = (
    await call('GET', `/v1/grading/recap?semesterId=${w.sem}&classId=${w.classA}&subjectId=${w.mat}`, w)
  ).json();
  const [sem] = await db().select().from(semester).where(eq(semester.id, w.sem));
  const portal = async (studentId: string) => {
    const g = await withTenant(app.tenantDb, [w.schoolId], (tx) => gradesFor(tx, studentId, sem!));
    return { kkm: g.kkm, average: g.average, subjects: g.subjects };
  };
  return {
    recap: {
      kkm: recapRes.kkm,
      students: recapRes.students.map(
        (s: { studentId: string; final: number | null; predicate: string | null; belowKkm: boolean }) => ({
          studentId: s.studentId,
          final: s.final,
          predicate: s.predicate,
          belowKkm: s.belowKkm,
        }),
      ),
      stats: recapRes.stats,
    },
    matrix: (await call('GET', `/v1/grading/recap/class?semesterId=${w.sem}&classId=${w.classA}`, w))
      .json()
      .students.map((s: { studentId: string; grades: { subjectId: string; final: number | null }[] }) => ({
        studentId: s.studentId,
        grades: s.grades
          .filter((g) => g.subjectId === w.mat)
          .map((g) => ({ subjectId: g.subjectId, final: g.final })),
      })),
    list: (await call('GET', `/v1/report-cards?semesterId=${w.sem}&classId=${w.classA}`, w)).json(),
    docs: {
      ani: stable((await call('GET', `/v1/report-cards/${w.ani}?semesterId=${w.sem}`, w)).json()),
      budi: stable((await call('GET', `/v1/report-cards/${w.budi}?semesterId=${w.sem}`, w)).json()),
    },
    portal: { ani: await portal(w.ani), budi: await portal(w.budi) },
  };
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Kategori', slug: `yac-${run}` })
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
      'semester_grading_config',
      'score',
      'assessment',
      'grade_component',
      'grading_setting',
      'teaching_assignment',
      'teacher',
      'enrollment',
      'class_room',
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
  for (const id of extraUserIds) await db().delete(user).where(eq(user.id, id));
  await app.close();
});

describe('T3: formatif tidak memengaruhi nilai', () => {
  for (const mode of ['weighted_average', 'percentage', 'simple_average'] as const) {
    it(`mode ${mode}: nilai akhir, predikat, rekap, matriks, rapor, daftar, portal, dan finalisasi tak berubah`, async () => {
      const w = await makeWorld({ mode });
      const before = await numbers(w);
      expect(before.recap.students.map((s: { final: number }) => s.final)).toEqual(
        mode === 'simple_average' ? [85, 65] : [86, 66],
      );

      // Komponen formatif dengan bobot sembarang (diabaikan) dan skor ekstrem 0 dan 100, di MAT dan di IPA (formatif saja).
      const kuis = await addComponent(w, { name: 'Kuis', category: 'formative', weight: 50 });
      expect(kuis).toMatchObject({ category: 'formative', includeInFinal: false, weight: 0 });
      const kuisMat = await addAssessment(w, kuis.id, w.mat);
      await saveScores(w, kuisMat.id, { [w.ani]: 0, [w.budi]: 100 });
      const kuisIpa = await addAssessment(w, kuis.id, w.ipa);
      await saveScores(w, kuisIpa.id, { [w.ani]: 100, [w.budi]: 100 });

      const after = await numbers(w);
      expect(after).toEqual(before);

      // perComponent tetap memuat rata-rata formatif untuk tampilan, ditandai; ringkasan formatif terpisah.
      const recap = (
        await call('GET', `/v1/grading/recap?semesterId=${w.sem}&classId=${w.classA}&subjectId=${w.mat}`, w)
      ).json();
      expect(recap.components.find((c: { id: string }) => c.id === kuis.id)).toMatchObject({
        category: 'formative',
        includeInFinal: false,
        weight: 0,
      });
      expect(recap.components.find((c: { id: string }) => c.id === w.tugas).category).toBeUndefined();
      const ani = recap.students.find((s: { studentId: string }) => s.studentId === w.ani);
      const budi = recap.students.find((s: { studentId: string }) => s.studentId === w.budi);
      expect(ani.perComponent.find((p: { componentId: string }) => p.componentId === kuis.id).average).toBe(
        0,
      );
      expect(budi.perComponent.find((p: { componentId: string }) => p.componentId === kuis.id).average).toBe(
        100,
      );
      expect(ani.formative).toEqual({ average: 0, count: 1 });
      expect(budi.formative).toEqual({ average: 100, count: 1 });

      // Matriks: formatif per sel, terpisah dari final.
      const matrix = (
        await call('GET', `/v1/grading/recap/class?semesterId=${w.sem}&classId=${w.classA}`, w)
      ).json();
      const ipaCell = matrix.students[0].grades.find((g: { subjectId: string }) => g.subjectId === w.ipa);
      expect(ipaCell.final).toBeNull();
      expect(ipaCell.formative).toBeDefined();

      // Portal: formatif terpisah dan berlabel; mapel formatif-saja (IPA) tidak jadi baris nilai.
      const [sem] = await db().select().from(semester).where(eq(semester.id, w.sem));
      const portal = await withTenant(app.tenantDb, [w.schoolId], (tx) => gradesFor(tx, w.ani, sem!));
      expect(portal.subjects.map((s) => s.subjectId)).toEqual([w.mat]);
      expect(portal.subjects[0]!.components.map((c) => c.name)).toEqual(['Tugas', 'UAS']);
      expect(portal.formative?.map((f) => f.subjectId).sort()).toEqual([w.ipa, w.mat].sort());
      expect(portal.formative?.find((f) => f.subjectId === w.mat)?.components).toEqual([
        { name: 'Kuis', category: 'formative', average: 0 },
      ]);

      // Rapor: tidak memuat IPA (hanya formatif) dan finalisasi tanpa force tidak terhenti oleh IPA kosong.
      expect(after.docs.ani.subjects.map((s: { subjectId: string }) => s.subjectId)).toEqual([w.mat]);
      const fin = await call('POST', '/v1/report-cards/finalize', w, {
        semesterId: w.sem,
        classId: w.classA,
      });
      expect(fin.statusCode, fin.body).toBe(200);
      expect(fin.json()).toEqual({ finalized: 2 });
      const finalDoc = (await call('GET', `/v1/report-cards/${w.ani}?semesterId=${w.sem}`, w)).json();
      expect(finalDoc.status).toBe('final');
      expect(finalDoc.subjects).toEqual(before.docs.ani.subjects);
    });
  }

  it('penilaian purpose "initial" di komponen sumatif (langsung di DB) diabaikan dari nilai akhir dan mapel rapor', async () => {
    const w = await makeWorld({ bare: true });
    const [a] = await db()
      .insert(assessment)
      .values({
        schoolId: w.schoolId,
        semesterId: w.sem,
        classId: w.classA,
        subjectId: w.mat,
        componentId: w.tugas,
        title: 'Awal',
        date: '2026-08-01',
        purpose: 'initial',
      })
      .returning();
    await db().insert(score).values({
      schoolId: w.schoolId,
      assessmentId: a!.id,
      studentId: w.ani,
      value: 100,
      updatedBy: 'uji',
    });
    const recap = (
      await call('GET', `/v1/grading/recap?semesterId=${w.sem}&classId=${w.classA}&subjectId=${w.mat}`, w)
    ).json();
    expect(recap.students.every((s: { final: number | null }) => s.final === null)).toBe(true);
    const doc = (await call('GET', `/v1/report-cards/${w.ani}?semesterId=${w.sem}`, w)).json();
    expect(doc.subjects).toEqual([]);
    // Dengan satu penilaian biasa di komponen yang sama, hanya yang biasa dihitung.
    const [b] = await db()
      .insert(assessment)
      .values({
        schoolId: w.schoolId,
        semesterId: w.sem,
        classId: w.classA,
        subjectId: w.mat,
        componentId: w.tugas,
        title: 'Biasa',
        date: '2026-08-02',
      })
      .returning();
    await db().insert(score).values({
      schoolId: w.schoolId,
      assessmentId: b!.id,
      studentId: w.ani,
      value: 60,
      updatedBy: 'uji',
    });
    const recap2 = (
      await call('GET', `/v1/grading/recap?semesterId=${w.sem}&classId=${w.classA}&subjectId=${w.mat}`, w)
    ).json();
    expect(recap2.students.find((s: { studentId: string }) => s.studentId === w.ani).final).toBe(60);
  });

  it('komponen sumatif yang dikeluarkan dari nilai akhir (includeInFinal false) juga tidak dihitung', async () => {
    const w = await makeWorld();
    const before = await numbers(w);
    const latihan = await addComponent(w, { name: 'Latihan', weight: 30, includeInFinal: false });
    expect(latihan).toMatchObject({ category: 'summative', includeInFinal: false, weight: 30 });
    const a = await addAssessment(w, latihan.id, w.mat);
    await saveScores(w, a.id, { [w.ani]: 0, [w.budi]: 0 });
    expect(await numbers(w)).toEqual(before);
  });
});

describe('T4: mode persentase', () => {
  it('formatif tidak ikut jumlah 100 dan tidak menyumbang 0', async () => {
    const w = await makeWorld({ bare: true });
    const kuis = await addComponent(w, { name: 'Kuis', category: 'formative' });
    // Jumlah bobot sumatif 40 + 60 = 100: diterima walau ada komponen formatif.
    const ok = await call('PUT', '/v1/grading/settings', w, {
      kkm: 75,
      predicateA: 90,
      predicateB: 80,
      predicateC: 70,
      calculationMode: 'percentage',
    });
    expect(ok.statusCode, ok.body).toBe(200);
    // Menurunkan bobot sumatif menjadi 90 menolak mode persentase walau komponen formatif ada.
    const lower = await call('PUT', `/v1/grading/components/${w.tugas}`, w, { name: 'Tugas', weight: 30 });
    expect(lower.statusCode, lower.body).toBe(200);
    const bad = await call('PUT', '/v1/grading/settings', w, {
      kkm: 75,
      predicateA: 90,
      predicateB: 80,
      predicateC: 70,
      calculationMode: 'percentage',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('weights_sum_invalid');
    expect(bad.json().error.message).toContain('90');
    expect(kuis.weight).toBe(0);
  });

  it('komponen formatif tanpa skor tidak menarik nilai persentase', async () => {
    const w = await makeWorld({ mode: 'percentage' });
    const before = await numbers(w);
    await addComponent(w, { name: 'Kuis', category: 'formative' });
    expect(await numbers(w)).toEqual(before);
    expect(before.recap.students.map((s: { final: number }) => s.final)).toEqual([86, 66]);
  });
});

describe('komponen: kategori, bobot, dan validasi', () => {
  it('POST/PUT/GET: formatif memaksa includeInFinal false dan bobot 0; klien lama tetap diterima', async () => {
    const w = await makeWorld({ bare: true });
    // Klien lama: tanpa field baru -> sumatif, ikut nilai akhir.
    const lama = await addComponent(w, { name: 'Praktik', weight: 25 });
    expect(lama).toMatchObject({ category: 'summative', includeInFinal: true, weight: 25 });
    // Formatif: includeInFinal true yang dikirim dipaksa false.
    const f = await addComponent(w, {
      name: 'Observasi',
      category: 'formative',
      includeInFinal: true,
      weight: 40,
    });
    expect(f).toMatchObject({ category: 'formative', includeInFinal: false, weight: 0 });
    // PUT bergaya lama (nama dan bobot saja) mempertahankan kategori; bobot formatif tetap 0.
    const put = await call('PUT', `/v1/grading/components/${f.id}`, w, { name: 'Observasi 2', weight: 70 });
    expect(put.statusCode, put.body).toBe(200);
    expect(put.json()).toMatchObject({ category: 'formative', includeInFinal: false, weight: 0 });
    const putLama = await call('PUT', `/v1/grading/components/${lama.id}`, w, {
      name: 'Praktik',
      weight: 35,
    });
    expect(putLama.json()).toMatchObject({ category: 'summative', includeInFinal: true, weight: 35 });
    // Ubah formatif -> sumatif butuh bobot 1..100.
    const noWeight = await call('PUT', `/v1/grading/components/${f.id}`, w, {
      name: 'Observasi 2',
      category: 'summative',
    });
    expect(noWeight.statusCode).toBe(400);
    expect(noWeight.json().error.code).toBe('invalid_component_category');
    const toSum = await call('PUT', `/v1/grading/components/${f.id}`, w, {
      name: 'Observasi 2',
      category: 'summative',
      weight: 10,
    });
    expect(toSum.json()).toMatchObject({ category: 'summative', includeInFinal: true, weight: 10 });
    // GET memuat kategori.
    const list = (await call('GET', '/v1/grading/components', w)).json();
    expect(list.find((c: { id: string }) => c.id === f.id)).toMatchObject({ category: 'summative' });
  });

  it('validasi: sumatif ikut nilai akhir wajib bobot 1..100; kategori tak dikenal ditolak', async () => {
    const w = await makeWorld({ bare: true });
    for (const body of [
      { name: 'X', weight: 0 },
      { name: 'X' },
      { name: 'X', category: 'summative', weight: 0 },
    ]) {
      const res = await call('POST', '/v1/grading/components', w, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(res.json().error.code).toBe('invalid_component_category');
    }
    expect(
      (await call('POST', '/v1/grading/components', w, { name: 'X', category: 'lain', weight: 5 }))
        .statusCode,
    ).toBe(400);
    // Sumatif yang dikeluarkan dari nilai akhir boleh berbobot 0.
    const ok = await call('POST', '/v1/grading/components', w, { name: 'Y', includeInFinal: false });
    expect(ok.statusCode, ok.body).toBe(201);
    expect(ok.json()).toMatchObject({ category: 'summative', includeInFinal: false, weight: 0 });
    // Di DB: CHECK mengunci formatif tidak pernah masuk nilai akhir.
    await expect(
      db().insert(gradeComponent).values({
        schoolId: w.schoolId,
        name: 'Salah',
        weight: 0,
        category: 'formative',
        includeInFinal: true,
      }),
    ).rejects.toThrow();
  });
});

describe('penilaian: tanda dan turunan kategori', () => {
  it('purpose initial hanya di formatif; summativeScope hanya di sumatif; technique divalidasi', async () => {
    const w = await makeWorld({ bare: true });
    const kuis = await addComponent(w, { name: 'Kuis', category: 'formative' });
    const base = { semesterId: w.sem, classId: w.classA, subjectId: w.mat, title: 'T', date: '2026-09-01' };
    const post = (body: object) => call('POST', '/v1/assessments', w, { ...base, ...body });

    const awal = await post({ componentId: kuis.id, purpose: 'initial', technique: 'observation' });
    expect(awal.statusCode, awal.body).toBe(201);
    expect(awal.json()).toMatchObject({
      category: 'formative',
      includeInFinal: false,
      purpose: 'initial',
      summativeScope: null,
      technique: 'observation',
    });
    const bad1 = await post({ componentId: w.tugas, purpose: 'initial' });
    expect(bad1.statusCode).toBe(400);
    expect(bad1.json().error.code).toBe('initial_requires_formative');
    const bad2 = await post({ componentId: kuis.id, summativeScope: 'material' });
    expect(bad2.statusCode).toBe(400);
    expect(bad2.json().error.code).toBe('scope_requires_summative');
    expect((await post({ componentId: w.tugas, technique: 'tebak' })).statusCode).toBe(400);
    const sum = await post({ componentId: w.uas, summativeScope: 'end_of_semester', technique: 'test' });
    expect(sum.statusCode, sum.body).toBe(201);
    expect(sum.json()).toMatchObject({
      category: 'summative',
      summativeScope: 'end_of_semester',
      purpose: null,
    });
    // Klien lama: tanpa tanda sama sekali.
    const lama = await post({ componentId: w.tugas });
    expect(lama.statusCode).toBe(201);
    expect(lama.json()).toMatchObject({ purpose: null, summativeScope: null, technique: null });

    // PUT: dihilangkan = tetap; null = kosongkan; komponen baru harus cocok dengan tanda yang berlaku.
    const id = awal.json().id as string;
    const putBase = { componentId: kuis.id, title: 'T', date: '2026-09-01', maxScore: 100 };
    const keep = await call('PUT', `/v1/assessments/${id}`, w, putBase);
    expect(keep.json()).toMatchObject({ purpose: 'initial', technique: 'observation' });
    const toSum = await call('PUT', `/v1/assessments/${id}`, w, { ...putBase, componentId: w.tugas });
    expect(toSum.statusCode).toBe(400);
    expect(toSum.json().error.code).toBe('initial_requires_formative');
    const clear = await call('PUT', `/v1/assessments/${id}`, w, {
      ...putBase,
      componentId: w.tugas,
      purpose: null,
      technique: null,
    });
    expect(clear.statusCode, clear.body).toBe(200);
    expect(clear.json()).toMatchObject({ category: 'summative', purpose: null, technique: null });
    // Daftar memuat kategori turunan.
    const list = (await call('GET', `/v1/assessments?semesterId=${w.sem}&classId=${w.classA}`, w)).json();
    expect(list.find((a: { id: string }) => a.id === sum.json().id)).toMatchObject({ category: 'summative' });
  });
});

describe('T10: guard report_final dan component_not_in_semester', () => {
  it('ubah kategori komponen dan tanda penilaian ditolak saat final, diterima sesudah reopen', async () => {
    const w = await makeWorld({ mode: 'weighted_average' });
    const kuis = await addComponent(w, { name: 'Kuis', category: 'formative' });
    const a = await addAssessment(w, kuis.id, w.mat);
    await saveScores(w, a.id, { [w.ani]: 50, [w.budi]: 50 });
    const fin = await call('POST', '/v1/report-cards/finalize', w, { semesterId: w.sem, classId: w.classA });
    expect(fin.statusCode, fin.body).toBe(200);

    const category = await call('PUT', `/v1/grading/components/${kuis.id}`, w, {
      name: 'Kuis',
      category: 'summative',
      weight: 20,
    });
    expect(category.statusCode).toBe(409);
    expect(category.json().error.code).toBe('report_final');
    const tag = await call('PUT', `/v1/assessments/${a.id}`, w, {
      componentId: kuis.id,
      title: 'Kuis',
      date: '2026-09-01',
      maxScore: 100,
      purpose: 'initial',
    });
    expect(tag.statusCode).toBe(409);
    expect(tag.json().error.code).toBe('report_final');
    const tech = await call('PUT', `/v1/assessments/${a.id}`, w, {
      componentId: kuis.id,
      title: 'Kuis',
      date: '2026-09-01',
      maxScore: 100,
      technique: 'project',
    });
    expect(tech.json().error.code).toBe('report_final');
    // Komponen BARU boleh dibuat saat final (seperti sebelumnya), tetapi tidak berlaku pada semester beku.
    const late = await addComponent(w, { name: 'Susulan', category: 'formative' });
    const useLate = await call('POST', '/v1/assessments', w, {
      semesterId: w.sem,
      classId: w.classA,
      subjectId: w.ipa,
      componentId: late.id,
      title: 'S',
      date: '2026-09-02',
    });
    expect(useLate.statusCode).toBe(409);
    expect(useLate.json().error.code).toBe('report_final');

    const re = await call('POST', '/v1/report-cards/reopen', w, { semesterId: w.sem, classId: w.classA });
    expect(re.statusCode, re.body).toBe(200);
    const lateAgain = await call('POST', '/v1/assessments', w, {
      semesterId: w.sem,
      classId: w.classA,
      subjectId: w.ipa,
      componentId: late.id,
      title: 'S',
      date: '2026-09-02',
    });
    // Komponen yang dibuat sesudah pembekuan: salinan beku disinkronkan saat komponen dibuat (semester aktif, tanpa final)
    // hanya bila ia dibuat setelah reopen; yang dibuat saat final tidak ada di salinan.
    expect(lateAgain.statusCode).toBe(409);
    expect(lateAgain.json().error.code).toBe('component_not_in_semester');
    const syncNow = await call('POST', `/v1/semesters/${w.sem}/grading-config/sync`, w);
    expect(syncNow.statusCode, syncNow.body).toBe(200);
    expect(
      (
        await call('POST', '/v1/assessments', w, {
          semesterId: w.sem,
          classId: w.classA,
          subjectId: w.ipa,
          componentId: late.id,
          title: 'S',
          date: '2026-09-02',
        })
      ).statusCode,
    ).toBe(201);
    const changed = await call('PUT', `/v1/grading/components/${kuis.id}`, w, {
      name: 'Kuis',
      category: 'summative',
      weight: 20,
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(changed.json().category).toBe('summative');
    expect(
      (
        await call('PUT', `/v1/assessments/${a.id}`, w, {
          componentId: kuis.id,
          title: 'Kuis',
          date: '2026-09-01',
          maxScore: 100,
          summativeScope: 'material',
          technique: 'project',
        })
      ).statusCode,
    ).toBe(200);
  });
});

describe('T5: pembekuan kategori', () => {
  it('sekolah tanpa formatif: salinan tetap config_version 1, tanpa kunci kategori, matchesLive true', async () => {
    const w = await makeWorld();
    const fin = await call('POST', '/v1/report-cards/finalize', w, { semesterId: w.sem, classId: w.classA });
    expect(fin.statusCode, fin.body).toBe(200);
    const [row] = await db()
      .select()
      .from(semesterGradingConfig)
      .where(eq(semesterGradingConfig.semesterId, w.sem));
    expect(row!.configVersion).toBe(1);
    expect(row!.components).toEqual([
      { id: w.tugas, name: 'Tugas', weight: 40, sort: 0 },
      { id: w.uas, name: 'UAS', weight: 60, sort: 1 },
    ]);
    const status = (await call('GET', `/v1/semesters/${w.sem}/grading-config`, w)).json();
    expect(status.matchesLive).toBe(true);
    expect(status.components.every((c: object) => !('category' in c) && !('includeInFinal' in c))).toBe(true);
  });

  it('komponen formatif membuat salinan v2 sparse; semester beku tidak berubah oleh perubahan hidup', async () => {
    const w = await makeWorld();
    const kuis = await addComponent(w, { name: 'Kuis', category: 'formative' });
    const a = await addAssessment(w, kuis.id, w.mat);
    await saveScores(w, a.id, { [w.ani]: 10, [w.budi]: 10 });
    expect(
      (await call('POST', '/v1/report-cards/finalize', w, { semesterId: w.sem, classId: w.classA }))
        .statusCode,
    ).toBe(200);
    const [row] = await db()
      .select()
      .from(semesterGradingConfig)
      .where(eq(semesterGradingConfig.semesterId, w.sem));
    expect(row!.configVersion).toBe(2);
    expect(row!.components).toEqual([
      { id: w.tugas, name: 'Tugas', weight: 40, sort: 0 },
      { id: w.uas, name: 'UAS', weight: 60, sort: 1 },
      { id: kuis.id, name: 'Kuis', weight: 0, sort: 2, category: 'formative', includeInFinal: false },
    ]);
    expect((await call('GET', `/v1/semesters/${w.sem}/grading-config`, w)).json().matchesLive).toBe(true);

    // Ubah komponen hidup LANGSUNG di DB (melewati guard): salinan beku tetap memakai kategori lama.
    await db()
      .update(gradeComponent)
      .set({ category: 'summative', includeInFinal: true, weight: 50 })
      .where(eq(gradeComponent.id, kuis.id));
    const cfg = await withTenant(app.tenantDb, [w.schoolId], (tx) => loadGradingConfig(tx, w.sem));
    expect(cfg.components.find((c) => c.id === kuis.id)).toMatchObject({
      category: 'formative',
      includeInFinal: false,
      weight: 0,
    });
    expect((await call('GET', `/v1/semesters/${w.sem}/grading-config`, w)).json().matchesLive).toBe(false);
    // Rapor final tetap dari snapshot; rekap tetap tidak menghitung Kuis ke nilai akhir.
    const recap = (
      await call('GET', `/v1/grading/recap?semesterId=${w.sem}&classId=${w.classA}&subjectId=${w.mat}`, w)
    ).json();
    expect(recap.students.map((s: { final: number }) => s.final)).toEqual([86, 66]);
    // Daftar penilaian memakai kategori efektif semester (salinan beku), bukan kolom hidup.
    const list = (await call('GET', `/v1/assessments?semesterId=${w.sem}&classId=${w.classA}`, w)).json();
    expect(list.find((x: { id: string }) => x.id === a.id).category).toBe('formative');
  });

  it('aturan tulis-tembus pada semester aktif tanpa final: kategori ikut tersalin; versi mengikuti isi', async () => {
    const w = await makeWorld();
    const kuis = await addComponent(w, { name: 'Kuis', category: 'formative' });
    const fin = await call('POST', '/v1/report-cards/finalize', w, { semesterId: w.sem, classId: w.classA });
    expect(fin.statusCode, fin.body).toBe(200);
    expect(
      (await call('POST', '/v1/report-cards/reopen', w, { semesterId: w.sem, classId: w.classA })).statusCode,
    ).toBe(200);
    const frozen = async () =>
      (
        await db().select().from(semesterGradingConfig).where(eq(semesterGradingConfig.semesterId, w.sem))
      )[0]!;
    expect((await frozen()).configVersion).toBe(2);

    // Formatif -> sumatif: tulis-tembus menyalin; tidak ada isi v2 lagi, jadi kembali v1 tanpa kunci kategori.
    const toSum = await call('PUT', `/v1/grading/components/${kuis.id}`, w, {
      name: 'Kuis',
      category: 'summative',
      weight: 20,
    });
    expect(toSum.statusCode, toSum.body).toBe(200);
    expect(toSum.json().syncedSemesterId).toBe(w.sem);
    expect((await frozen()).configVersion).toBe(1);
    expect((await frozen()).components).toEqual([
      { id: w.tugas, name: 'Tugas', weight: 40, sort: 0 },
      { id: w.uas, name: 'UAS', weight: 60, sort: 1 },
      { id: kuis.id, name: 'Kuis', weight: 20, sort: 2 },
    ]);
    // Sumatif -> formatif: tersalin dan v2 lagi.
    const back = await call('PUT', `/v1/grading/components/${kuis.id}`, w, {
      name: 'Kuis',
      category: 'formative',
    });
    expect(back.statusCode, back.body).toBe(200);
    expect(back.json().syncedSemesterId).toBe(w.sem);
    expect((await frozen()).configVersion).toBe(2);
    expect((await call('GET', `/v1/semesters/${w.sem}/grading-config`, w)).json().matchesLive).toBe(true);
  });

  it('salinan v1 dibaca sebagai sumatif; komponen formatif baru di luar salinan ditolak dan sinkron membuatnya v2', async () => {
    const w = await makeWorld();
    await withTenant(app.tenantDb, [w.schoolId], (tx) =>
      freezeSemesterGradingConfig(tx, {
        schoolId: w.schoolId,
        semesterId: w.sem,
        origin: 'manual',
        actorId: null,
        overwrite: true,
      }),
    );
    // origin 'manual' mencegah tulis-tembus; salinan v1 tanpa kunci kategori.
    const [v1] = await db()
      .select()
      .from(semesterGradingConfig)
      .where(eq(semesterGradingConfig.semesterId, w.sem));
    expect(v1!.configVersion).toBe(1);
    const cfg = await withTenant(app.tenantDb, [w.schoolId], (tx) => loadGradingConfig(tx, w.sem));
    expect(cfg.components.map((c) => [c.category, c.includeInFinal])).toEqual([
      ['summative', true],
      ['summative', true],
    ]);
    const kuis = await addComponent(w, { name: 'Kuis', category: 'formative' });
    expect((await call('GET', `/v1/semesters/${w.sem}/grading-config`, w)).json().matchesLive).toBe(false);
    const rejected = await call('POST', '/v1/assessments', w, {
      semesterId: w.sem,
      classId: w.classA,
      subjectId: w.mat,
      componentId: kuis.id,
      title: 'K',
      date: '2026-09-01',
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe('component_not_in_semester');
    const sync = await call('POST', `/v1/semesters/${w.sem}/grading-config/sync`, w);
    expect(sync.statusCode, sync.body).toBe(200);
    const [v2] = await db()
      .select()
      .from(semesterGradingConfig)
      .where(eq(semesterGradingConfig.semesterId, w.sem));
    expect(v2!.configVersion).toBe(2);
    expect(sync.json().matchesLive).toBe(true);
  });
});

describe('T14: multi-tenant', () => {
  it('sekolah B tidak membaca atau mengubah komponen dan penilaian sekolah A', async () => {
    const a = await makeWorld();
    const b = await makeWorld({ bare: true });
    const kuisA = await addComponent(a, { name: 'Kuis', category: 'formative' });
    const asA = await addAssessment(a, kuisA.id, a.mat, { purpose: 'initial' });

    const listB = (await call('GET', '/v1/grading/components', b)).json();
    expect(listB.map((c: { id: string }) => c.id)).not.toContain(kuisA.id);
    expect(listB.map((c: { id: string }) => c.id)).not.toContain(a.tugas);
    const putB = await call('PUT', `/v1/grading/components/${kuisA.id}`, b, {
      name: 'X',
      category: 'summative',
      weight: 10,
    });
    expect(putB.statusCode).toBe(404);
    expect((await call('GET', `/v1/assessments?semesterId=${a.sem}`, b)).json()).toEqual([]);
    const putAs = await call('PUT', `/v1/assessments/${asA.id}`, b, {
      componentId: b.tugas,
      title: 'X',
      date: '2026-09-01',
      maxScore: 100,
      purpose: null,
    });
    expect(putAs.statusCode).toBe(404);
    // Komponen sekolah A tidak bisa dipakai penilaian sekolah B.
    const cross = await call('POST', '/v1/assessments', b, {
      semesterId: b.sem,
      classId: b.classA,
      subjectId: b.mat,
      componentId: kuisA.id,
      title: 'X',
      date: '2026-09-01',
    });
    expect(cross.statusCode).toBe(400);
    expect(cross.json().error.code).toBe('invalid_reference');
    // Data A utuh.
    const [still] = await db().select().from(assessment).where(eq(assessment.id, asA.id));
    expect(still).toMatchObject({ purpose: 'initial', componentId: kuisA.id });
  });
});

describe('T16: izin', () => {
  it('guru pengampu (grade:input tanpa grade:configure) membuat penilaian bertanda tetapi tidak mengubah komponen', async () => {
    const w = await makeWorld({ bare: true });
    const kuis = await addComponent(w, { name: 'Kuis', category: 'formative' });
    const denied = await call(
      'POST',
      '/v1/grading/components',
      w,
      { name: 'Z', category: 'formative' },
      w.teacherCookie,
    );
    expect(denied.statusCode).toBe(403);
    const deniedPut = await call(
      'PUT',
      `/v1/grading/components/${kuis.id}`,
      w,
      { name: 'Kuis', category: 'summative', weight: 10 },
      w.teacherCookie,
    );
    expect(deniedPut.statusCode).toBe(403);
    const made = await call(
      'POST',
      '/v1/assessments',
      w,
      {
        semesterId: w.sem,
        classId: w.classA,
        subjectId: w.mat,
        componentId: kuis.id,
        title: 'Awal',
        date: '2026-09-01',
        purpose: 'initial',
        technique: 'observation',
      },
      w.teacherCookie,
    );
    expect(made.statusCode, made.body).toBe(201);
    expect(made.json()).toMatchObject({ category: 'formative', purpose: 'initial', canInput: true });
    // Mapel yang tidak diampu: ditolak.
    const other = await call(
      'POST',
      '/v1/assessments',
      w,
      {
        semesterId: w.sem,
        classId: w.classA,
        subjectId: w.ipa,
        componentId: kuis.id,
        title: 'I',
        date: '2026-09-01',
      },
      w.teacherCookie,
    );
    expect(other.statusCode).toBe(403);
  });
});
