import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FrozenComponent } from '@edusync/contracts';
import {
  academicYear,
  achievementCriteria,
  and,
  assessment,
  assignRoles,
  auditLog,
  classRoom,
  createDb,
  enrollment,
  entitlement,
  eq,
  foundation,
  gradeComponent,
  gradingSetting,
  member,
  reportCardSnapshot,
  school,
  schoolLevel,
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
import { loadGradingConfig } from './grading-config-lib';
import { verifyFinalReports } from './grading-verify-lib';
import { gradesFor } from './portal-lib';
import { loadClassContext } from './report-card-lib';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/**
 * Pembekuan konfigurasi nilai per semester (rancangan: docs/rancangan-pembekuan-konfigurasi-nilai.md, tahap A).
 * Setiap skenario memakai "dunia" sendiri (sekolah, tahun ajaran, dua semester, dua kelas) supaya tidak saling memengaruhi.
 * Nilai dasar (bobot Tugas 40, UAS 60, KKM 75): Ani 86, Budi 66 (kelas A), Citra 70 (kelas B).
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

interface World {
  schoolId: string;
  yearId: string;
  sem1: string;
  sem2: string;
  classA: string;
  classB: string;
  mat: string;
  tugas: string;
  uas: string;
  ani: string;
  budi: string;
  citra: string;
  /** Penilaian semester 1 (kelas A: tugas, uas; kelas B: tugas, uas). */
  asA: { tugas: string; uas: string };
  asB: { tugas: string; uas: string };
}

let worldSeq = 0;

async function makeWorld(
  opts: { mode?: 'weighted_average' | 'percentage' | 'simple_average'; grades?: boolean } = {},
) {
  const label = `fz${run}${worldSeq++}`;
  const [s] = await db()
    .insert(school)
    .values({ foundationId, slug: label, name: `Sekolah ${label}` })
    .returning();
  const schoolId = s!.id;
  schoolIds.push(schoolId);
  await seedSchoolRoles(db(), schoolId);
  if (opts.grades !== false) {
    await db()
      .insert(entitlement)
      .values({ schoolId, moduleKey: 'grades', subscriptionId, validUntil: subscriptionEnd });
  }
  const [m] = await db().insert(member).values({ userId, schoolId }).returning();
  await assignRoles(db(), m!.id, schoolId, ['school_admin']);

  const [year] = await db()
    .insert(academicYear)
    .values({ schoolId, name: '2000-2099', startsOn: '2000-01-01', endsOn: '2099-12-31', isActive: true })
    .returning();
  const [sem1] = await db()
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
  const [sem2] = await db()
    .insert(semester)
    .values({
      schoolId,
      academicYearId: year!.id,
      name: 'Genap',
      startsOn: '2027-01-01',
      endsOn: '2027-06-30',
    })
    .returning();
  const mkClass = async (name: string) =>
    (
      await db()
        .insert(classRoom)
        .values({ schoolId, academicYearId: year!.id, name, level: '7' })
        .returning()
    )[0]!.id;
  const classA = await mkClass('7A');
  const classB = await mkClass('7B');
  const [mat] = await db().insert(subject).values({ schoolId, code: 'MAT', name: 'Matematika' }).returning();
  const mkStudent = async (name: string, classId: string) => {
    const [st] = await db()
      .insert(student)
      .values({ schoolId, name, gender: 'L', status: 'active', nis: `${name}-${label}` })
      .returning();
    await db().insert(enrollment).values({ schoolId, studentId: st!.id, classId, academicYearId: year!.id });
    return st!.id;
  };
  const ani = await mkStudent('Ani', classA);
  const budi = await mkStudent('Budi', classA);
  const citra = await mkStudent('Citra', classB);

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

  const mkAssessment = async (classId: string, componentId: string, title: string) =>
    (
      await db()
        .insert(assessment)
        .values({
          schoolId,
          semesterId: sem1!.id,
          classId,
          subjectId: mat!.id,
          componentId,
          title,
          date: '2026-08-01',
        })
        .returning()
    )[0]!.id;
  const asA = {
    tugas: await mkAssessment(classA, tugas, 'Tugas A'),
    uas: await mkAssessment(classA, uas, 'UAS A'),
  };
  const asB = {
    tugas: await mkAssessment(classB, tugas, 'Tugas B'),
    uas: await mkAssessment(classB, uas, 'UAS B'),
  };
  const put = (assessmentId: string, studentId: string, value: number) =>
    db().insert(score).values({ schoolId, assessmentId, studentId, value, updatedBy: 'uji' });
  await put(asA.tugas, ani, 80);
  await put(asA.uas, ani, 90);
  await put(asA.tugas, budi, 60);
  await put(asA.uas, budi, 70);
  await put(asB.tugas, citra, 70);
  await put(asB.uas, citra, 70);

  return {
    schoolId,
    yearId: year!.id,
    sem1: sem1!.id,
    sem2: sem2!.id,
    classA,
    classB,
    mat: mat!.id,
    tugas,
    uas,
    ani,
    budi,
    citra,
    asA,
    asB,
  } satisfies World;
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

const finalize = (w: World, classId = w.classA, semesterId = w.sem1) =>
  call('POST', '/v1/report-cards/finalize', w, { semesterId, classId });
const reopen = (w: World, classId = w.classA, semesterId = w.sem1) =>
  call('POST', '/v1/report-cards/reopen', w, { semesterId, classId });
const activate = (w: World, semesterId: string) => call('PUT', `/v1/semesters/${semesterId}/activate`, w);
const putSettings = (w: World, body: object) => call('PUT', '/v1/grading/settings', w, body);
const SETTINGS = { kkm: 75, predicateA: 90, predicateB: 80, predicateC: 70 };

const frozenRow = async (semesterId: string) =>
  (
    await db().select().from(semesterGradingConfig).where(eq(semesterGradingConfig.semesterId, semesterId))
  )[0];

const stable = <T extends { generatedAt?: string }>(doc: T) => ({ ...doc, generatedAt: undefined });

/** Semua permukaan yang menampilkan nilai satu semester: rekap, matriks, rapor, dan portal. */
async function surface(w: World, semesterId = w.sem1) {
  const recap = async (classId: string) =>
    (
      await call('GET', `/v1/grading/recap?semesterId=${semesterId}&classId=${classId}&subjectId=${w.mat}`, w)
    ).json();
  const matrix = async (classId: string) =>
    (await call('GET', `/v1/grading/recap/class?semesterId=${semesterId}&classId=${classId}`, w)).json();
  const doc = async (studentId: string) =>
    stable((await call('GET', `/v1/report-cards/${studentId}?semesterId=${semesterId}`, w)).json());
  const [sem] = await db().select().from(semester).where(eq(semester.id, semesterId));
  const portal = (studentId: string) =>
    withTenant(app.tenantDb, [w.schoolId], (tx) => gradesFor(tx, studentId, sem!));
  return {
    recapA: await recap(w.classA),
    recapB: await recap(w.classB),
    matrixA: await matrix(w.classA),
    matrixB: await matrix(w.classB),
    docs: { ani: await doc(w.ani), budi: await doc(w.budi), citra: await doc(w.citra) },
    portal: { ani: await portal(w.ani), budi: await portal(w.budi), citra: await portal(w.citra) },
  };
}

/** Ubah konfigurasi hidup LANGSUNG di DB (melewati guard), meniru bug, skrip, atau sekolah yang konfigurasinya bergeser. */
async function tamperLive(w: World) {
  await db()
    .insert(gradingSetting)
    .values({
      schoolId: w.schoolId,
      kkm: 95,
      predicateA: 99,
      predicateB: 98,
      predicateC: 97,
      calculationMode: 'simple_average',
    })
    .onConflictDoUpdate({
      target: gradingSetting.schoolId,
      set: { kkm: 95, predicateA: 99, predicateB: 98, predicateC: 97, calculationMode: 'simple_average' },
    });
  await db().update(gradeComponent).set({ weight: 1 }).where(eq(gradeComponent.id, w.tugas));
  await db().update(gradeComponent).set({ weight: 99 }).where(eq(gradeComponent.id, w.uas));
  await db()
    .insert(achievementCriteria)
    .values({ schoolId: w.schoolId, subjectId: w.mat, mode: 'numeric', threshold: 99 });
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Beku', slug: `yfz-${run}` })
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
      'school_level',
      'report_card_snapshot',
      'report_card',
      'semester_grading_config',
      'achievement_rubric_level',
      'achievement_criteria',
      'score',
      'assessment',
      'grade_component',
      'grading_setting',
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

describe('beku saat finalisasi', () => {
  it('finalisasi kelas pertama membuat baris beku yang sama dengan konfigurasi hidup, dan dokumen draf sama dengan snapshot', async () => {
    const w = await makeWorld();
    expect(await frozenRow(w.sem1)).toBeUndefined();
    const draft = stable((await call('GET', `/v1/report-cards/${w.ani}?semesterId=${w.sem1}`, w)).json());
    expect(draft.status).toBe('draft');
    expect(draft.subjects[0]).toMatchObject({ kkm: 75, final: 86 });

    expect((await finalize(w)).statusCode).toBe(200);
    const row = await frozenRow(w.sem1);
    expect(row).toMatchObject({
      schoolId: w.schoolId,
      kkm: 75,
      predicateA: 90,
      predicateB: 80,
      predicateC: 70,
      calculationMode: 'weighted_average',
      origin: 'finalize',
      configVersion: 1,
    });
    expect((row!.components as FrozenComponent[]).map((c) => [c.name, c.weight])).toEqual([
      ['Tugas', 40],
      ['UAS', 60],
    ]);
    expect(row!.frozenBy).toBe(userId);

    const final = stable((await call('GET', `/v1/report-cards/${w.ani}?semesterId=${w.sem1}`, w)).json());
    expect(final.status).toBe('final');
    expect({ ...final, status: undefined }).toEqual({ ...draft, status: undefined });
    // Semester lain tidak ikut dibekukan.
    expect(await frozenRow(w.sem2)).toBeUndefined();
  });

  it('semester final kebal: konfigurasi hidup diubah langsung di DB tidak menggeser rapor, rekap, matriks, portal, maupun kelas draf', async () => {
    const w = await makeWorld();
    expect((await finalize(w)).statusCode).toBe(200);
    const before = await surface(w);
    expect(before.recapA.settings).toMatchObject({ kkm: 75, calculationMode: 'weighted_average' });
    expect(before.recapB.students[0]).toMatchObject({ final: 70 });
    expect(before.docs.ani.status).toBe('final');
    expect(before.docs.citra.status).toBe('draft');

    await tamperLive(w);
    const after = await surface(w);
    expect(after).toEqual(before);
    // Kelas B (masih draf, semester yang sama) memakai salinan beku, bukan konfigurasi hidup yang kini KKM 95.
    expect(after.docs.citra.subjects[0]).toMatchObject({ kkm: 75, final: 70, belowKkm: true });
    expect(after.recapB.kkm).toBe(75);
  });

  it('buka kembali tidak menghapus baris beku; finalisasi ulang memakai salinan yang sama', async () => {
    const w = await makeWorld();
    expect((await finalize(w)).statusCode).toBe(200);
    const first = await frozenRow(w.sem1);
    const original = await surface(w);
    await tamperLive(w);

    expect((await reopen(w)).statusCode).toBe(200);
    const kept = await frozenRow(w.sem1);
    expect(kept).toBeDefined();
    expect(kept!.frozenAt).toEqual(first!.frozenAt);
    // Setelah dibuka kembali, draf dihitung dari salinan beku (bukan KKM 95 / mode rata-rata sederhana).
    const draftAni = stable((await call('GET', `/v1/report-cards/${w.ani}?semesterId=${w.sem1}`, w)).json());
    expect(draftAni.status).toBe('draft');
    expect(draftAni.subjects[0]).toMatchObject({ kkm: 75, final: 86 });

    // Finalisasi ulang tanpa mengubah skor: dokumen sama persis.
    expect((await finalize(w)).statusCode).toBe(200);
    const again = await surface(w);
    expect(again.docs.ani).toEqual(original.docs.ani);
    expect(again.docs.budi).toEqual(original.docs.budi);

    // Koreksi satu skor: hanya Budi pada mapel itu yang berubah.
    expect((await reopen(w)).statusCode).toBe(200);
    const put = await call('PUT', `/v1/assessments/${w.asA.tugas}/scores`, w, {
      records: [{ studentId: w.budi, value: 100 }],
    });
    expect(put.statusCode, put.body).toBe(200);
    expect((await finalize(w)).statusCode).toBe(200);
    const corrected = await surface(w);
    expect(corrected.docs.ani).toEqual(original.docs.ani);
    expect(corrected.docs.budi.subjects[0]).toMatchObject({ kkm: 75, final: 82 });
    expect(original.docs.budi.subjects[0]).toMatchObject({ kkm: 75, final: 66 });
  });

  it.each(['weighted_average', 'percentage', 'simple_average'] as const)(
    'komponen yang tak terpakai dihapus setelah beku: angka tidak berubah (mode %s)',
    async (mode) => {
      const w = await makeWorld({ mode });
      const [extra] = await db()
        .insert(gradeComponent)
        .values({ schoolId: w.schoolId, name: 'Sikap', weight: 5, sort: 9 })
        .returning();
      expect((await finalize(w)).statusCode).toBe(200);
      const before = await surface(w);
      const del = await call('DELETE', `/v1/grading/components/${extra!.id}`, w);
      expect(del.statusCode, del.body).toBe(200);
      expect(await surface(w)).toEqual(before);
      // Salinan beku masih memuat komponen itu.
      const ids = ((await frozenRow(w.sem1))!.components as FrozenComponent[]).map((c) => c.id);
      expect(ids).toContain(extra!.id);
      expect(before.recapA.settings.calculationMode).toBe(mode);
    },
  );

  it('KKTP per semester: kriteria yang diubah, dihapus, atau ditambah sesudah beku tidak memengaruhi semester itu', async () => {
    const w = await makeWorld();
    const created = await call('POST', '/v1/achievement-criteria', w, {
      subjectId: w.mat,
      levelCode: null,
      mode: 'numeric',
      threshold: 78,
    });
    expect(created.statusCode, created.body).toBe(201);
    expect((await finalize(w)).statusCode).toBe(200);
    const row = await frozenRow(w.sem1);
    expect(row!.criteria as unknown[]).toHaveLength(1);
    const before = await surface(w);
    expect(before.recapB.kkm).toBe(78);
    expect(before.docs.citra.subjects[0]).toMatchObject({ kkm: 78, belowKkm: true });

    await db()
      .update(achievementCriteria)
      .set({ threshold: 60 })
      .where(eq(achievementCriteria.id, created.json().id));
    await db().delete(achievementCriteria).where(eq(achievementCriteria.id, created.json().id));
    await db()
      .insert(achievementCriteria)
      .values({ schoolId: w.schoolId, subjectId: w.mat, mode: 'numeric', threshold: 50 });
    expect(await surface(w)).toEqual(before);
  });
});

describe('beku saat semester dinonaktifkan', () => {
  it('semester nonaktif berfinal: konfigurasi untuk semester berikutnya berubah tanpa menggeser semester lama', async () => {
    const w = await makeWorld();
    expect((await finalize(w)).statusCode).toBe(200);
    const before = await surface(w);

    expect((await activate(w, w.sem2)).statusCode).toBe(200);
    // Semester 2 tanpa rapor final: konfigurasi boleh diubah lewat API (sebelumnya mengubah angka semester 1).
    const res = await putSettings(w, { ...SETTINGS, kkm: 80 });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().syncedSemesterId).toBeUndefined();
    const comp = await call('PUT', `/v1/grading/components/${w.tugas}`, w, { name: 'Tugas', weight: 10 });
    expect(comp.statusCode, comp.body).toBe(200);

    expect(await surface(w, w.sem1)).toEqual(before);
    expect((await frozenRow(w.sem1))!.kkm).toBe(75);

    // Kelas yang sama pada semester 2 (hidup) memakai konfigurasi baru; semester 1 tetap memakai salinan bekunya.
    const mk = async (componentId: string, title: string, a: number, b: number) => {
      const [as] = await db()
        .insert(assessment)
        .values({
          schoolId: w.schoolId,
          semesterId: w.sem2,
          classId: w.classA,
          subjectId: w.mat,
          componentId,
          title,
          date: '2027-02-01',
        })
        .returning();
      await db()
        .insert(score)
        .values([
          { schoolId: w.schoolId, assessmentId: as!.id, studentId: w.ani, value: a, updatedBy: 'uji' },
          { schoolId: w.schoolId, assessmentId: as!.id, studentId: w.budi, value: b, updatedBy: 'uji' },
        ]);
    };
    await mk(w.tugas, 'T2', 80, 60);
    await mk(w.uas, 'U2', 90, 70);
    const s2 = (
      await call('GET', `/v1/grading/recap?semesterId=${w.sem2}&classId=${w.classA}&subjectId=${w.mat}`, w)
    ).json();
    expect(s2.kkm).toBe(80);
    expect(s2.components.find((c: { id: string }) => c.id === w.tugas).weight).toBe(10);
    expect(s2.students.find((s: { studentId: string }) => s.studentId === w.ani).final).not.toBe(86);
    const s1 = (
      await call('GET', `/v1/grading/recap?semesterId=${w.sem1}&classId=${w.classA}&subjectId=${w.mat}`, w)
    ).json();
    expect(s1.kkm).toBe(75);
    expect(s1.students.find((s: { studentId: string }) => s.studentId === w.ani).final).toBe(86);
    expect(await frozenRow(w.sem2)).toBeUndefined();
  });

  it('sudah lewat tetapi belum final: dibekukan saat dinonaktifkan, draf berhenti bergeser, finalisasi terlambat memakai aturan lama', async () => {
    const w = await makeWorld();
    const before = await surface(w);
    expect(await frozenRow(w.sem1)).toBeUndefined();

    expect((await activate(w, w.sem2)).statusCode).toBe(200);
    const row = await frozenRow(w.sem1);
    expect(row).toMatchObject({ origin: 'semester_closed', kkm: 75, frozenBy: userId });
    // Semester 2 tidak punya penilaian atau rapor: tidak dibekukan.
    expect(await frozenRow(w.sem2)).toBeUndefined();

    const res = await putSettings(w, {
      kkm: 90,
      predicateA: 95,
      predicateB: 85,
      predicateC: 75,
      calculationMode: 'simple_average',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await surface(w)).toEqual(before);

    // Finalisasi terlambat memakai konfigurasi saat semester ditutup.
    expect((await finalize(w)).statusCode).toBe(200);
    const doc = stable((await call('GET', `/v1/report-cards/${w.ani}?semesterId=${w.sem1}`, w)).json());
    expect(doc.status).toBe('final');
    expect(doc.subjects[0]).toMatchObject({ kkm: 75, final: 86 });

    // Mengaktifkan kembali semester 1 lalu menonaktifkannya lagi tidak menimpa salinan (idempoten), dan mengaktifkan
    // semester yang sama tidak membekukan apa pun.
    expect((await activate(w, w.sem1)).statusCode).toBe(200);
    expect((await activate(w, w.sem1)).statusCode).toBe(200);
    expect(await frozenRow(w.sem2)).toBeUndefined();
    expect((await frozenRow(w.sem1))!.origin).toBe('semester_closed');
  });
});

describe('guard dan tulis-tembus (aturan W)', () => {
  it('semester aktif beku tanpa rapor final: perubahan konfigurasi ditulis-tembus ke salinan dan dicatat di audit', async () => {
    const w = await makeWorld();
    expect((await finalize(w)).statusCode).toBe(200);
    // Selagi ada rapor final: guard lama (tidak berubah).
    const blocked = await putSettings(w, { ...SETTINGS, kkm: 80 });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('report_final');
    expect((await frozenRow(w.sem1))!.kkm).toBe(75);

    expect((await reopen(w)).statusCode).toBe(200);
    const res = await putSettings(w, { ...SETTINGS, kkm: 80 });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ kkm: 80, syncedSemesterId: w.sem1 });
    expect(await frozenRow(w.sem1)).toMatchObject({ kkm: 80, origin: 'sync', frozenBy: userId });
    const draft = stable((await call('GET', `/v1/report-cards/${w.ani}?semesterId=${w.sem1}`, w)).json());
    expect(draft.subjects[0]).toMatchObject({ kkm: 80 });

    const comp = await call('PUT', `/v1/grading/components/${w.tugas}`, w, { name: 'Tugas', weight: 50 });
    expect(comp.statusCode, comp.body).toBe(200);
    expect(comp.json().syncedSemesterId).toBe(w.sem1);
    const created = await call('POST', '/v1/grading/components', w, { name: 'Praktik', weight: 10 });
    expect(created.statusCode).toBe(201);
    expect(created.json().syncedSemesterId).toBe(w.sem1);
    const comps = (await frozenRow(w.sem1))!.components as FrozenComponent[];
    expect(comps.find((c) => c.id === w.tugas)!.weight).toBe(50);
    expect(comps.map((c) => c.name)).toContain('Praktik');
    const del = await call('DELETE', `/v1/grading/components/${created.json().id}`, w);
    expect(del.statusCode).toBe(200);
    expect(del.json().syncedSemesterId).toBe(w.sem1);
    expect(((await frozenRow(w.sem1))!.components as FrozenComponent[]).map((c) => c.name)).not.toContain(
      'Praktik',
    );

    const logs = await db()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.schoolId, w.schoolId), eq(auditLog.action, 'grading_config.sync')));
    expect(logs.length).toBeGreaterThanOrEqual(4);
    expect(logs[0]!.entityId).toBe(w.sem1);
  });

  it('semester aktif yang belum beku: tidak ada baris dibuat dan respons tidak membawa syncedSemesterId', async () => {
    const w = await makeWorld();
    const res = await putSettings(w, { ...SETTINGS, kkm: 70 });
    expect(res.statusCode, res.body).toBe(200);
    expect(Object.keys(res.json()).sort()).toEqual(
      ['calculationMode', 'kkm', 'predicateA', 'predicateB', 'predicateC'].sort(),
    );
    expect(await frozenRow(w.sem1)).toBeUndefined();
    const created = await call('POST', '/v1/grading/components', w, { name: 'Praktik', weight: 10 });
    expect(created.statusCode).toBe(201);
    expect('syncedSemesterId' in created.json()).toBe(false);
  });

  it('komponen baru tidak dijaga walau semester aktif berfinal, tetapi tidak menyentuh salinan beku', async () => {
    const w = await makeWorld();
    expect((await finalize(w)).statusCode).toBe(200);
    const created = await call('POST', '/v1/grading/components', w, { name: 'Praktik', weight: 10 });
    expect(created.statusCode, created.body).toBe(201);
    expect('syncedSemesterId' in created.json()).toBe(false);
    expect(((await frozenRow(w.sem1))!.components as FrozenComponent[]).map((c) => c.name)).toEqual([
      'Tugas',
      'UAS',
    ]);
  });

  it('komponen di luar salinan beku ditolak 409 component_not_in_semester pada penilaian; semester hidup menerimanya', async () => {
    const w = await makeWorld();
    expect((await finalize(w)).statusCode).toBe(200);
    const created = await call('POST', '/v1/grading/components', w, { name: 'Praktik', weight: 10 });
    const praktik = created.json().id as string;
    const body = (componentId: string, semesterId = w.sem1) => ({
      semesterId,
      classId: w.classB,
      subjectId: w.mat,
      componentId,
      title: 'Uji',
      date: '2026-09-01',
      maxScore: 100,
    });
    const rejected = await call('POST', '/v1/assessments', w, body(praktik));
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe('component_not_in_semester');
    expect(rejected.json().error.message).toContain('Praktik');
    const ok = await call('POST', '/v1/assessments', w, body(w.tugas));
    expect(ok.statusCode, ok.body).toBe(201);
    // Memindahkan penilaian ke komponen di luar salinan ditolak; mengubah judul saja (komponen sama) diterima.
    const move = await call('PUT', `/v1/assessments/${ok.json().id}`, w, {
      componentId: praktik,
      title: 'Uji',
      date: '2026-09-01',
      maxScore: 100,
    });
    expect(move.statusCode).toBe(409);
    expect(move.json().error.code).toBe('component_not_in_semester');
    const rename = await call('PUT', `/v1/assessments/${ok.json().id}`, w, {
      componentId: w.tugas,
      title: 'Uji baru',
      date: '2026-09-01',
      maxScore: 100,
    });
    expect(rename.statusCode, rename.body).toBe(200);
    // Semester 2 belum beku: komponen baru diterima.
    const live = await call('POST', '/v1/assessments', w, body(praktik, w.sem2));
    expect(live.statusCode, live.body).toBe(201);
  });
});

describe('balapan finalisasi dan pengaturan', () => {
  it.each([1, 2, 3])('berjalan bersamaan: hasil akhir konsisten (percobaan %i)', async () => {
    const w = await makeWorld();
    const [fin, set] = await Promise.all([finalize(w), putSettings(w, { ...SETTINGS, kkm: 80 })]);
    expect(fin.statusCode, fin.body).toBe(200);
    const row = await frozenRow(w.sem1);
    const doc = (await call('GET', `/v1/report-cards/${w.ani}?semesterId=${w.sem1}`, w)).json();
    expect(doc.status).toBe('final');
    if (set.statusCode === 200) {
      // Pengaturan masuk lebih dulu: finalisasi membekukan konfigurasi baru.
      expect(row!.kkm).toBe(80);
      expect(doc.subjects[0].kkm).toBe(80);
    } else {
      // Finalisasi masuk lebih dulu: pengaturan ditolak guard dan salinan tetap konfigurasi lama.
      expect(set.statusCode).toBe(409);
      expect(set.json().error.code).toBe('report_final');
      expect(row!.kkm).toBe(75);
      expect(doc.subjects[0].kkm).toBe(75);
    }
  });
});

describe('multi-tenant', () => {
  it('sekolah lain tidak membaca semester beku sekolah ini, dan salinan tidak memuat komponen sekolah lain', async () => {
    const a = await makeWorld();
    const b = await makeWorld();
    expect((await finalize(a)).statusCode).toBe(200);
    expect((await finalize(b)).statusCode).toBe(200);

    const cross = await call(
      'GET',
      `/v1/grading/recap?semesterId=${a.sem1}&classId=${b.classA}&subjectId=${b.mat}`,
      b,
    );
    expect(cross.statusCode).toBe(400);
    expect(cross.json().error.code).toBe('invalid_reference');
    const seen = await withTenant(app.tenantDb, [b.schoolId], (tx) =>
      tx.select().from(semesterGradingConfig),
    );
    expect(seen.map((r) => r.semesterId)).toEqual([b.sem1]);

    const rowA = await frozenRow(a.sem1);
    const text = JSON.stringify([rowA!.components, rowA!.criteria]);
    for (const id of [b.tugas, b.uas, b.mat]) expect(text).not.toContain(id);
    expect((rowA!.components as FrozenComponent[]).map((c) => c.id).sort()).toEqual([a.tugas, a.uas].sort());
    // Konteks sekolah B tidak bisa memuat konfigurasi efektif semester A (tanpa baris, jadi jatuh ke konfigurasi B yang hidup).
    const cfg = await withTenant(app.tenantDb, [b.schoolId], (tx) => loadGradingConfig(tx, a.sem1));
    expect(cfg.frozen).toBeNull();
  });
});

describe('jumlah kueri dan sumber pemuat', () => {
  it('memuat konfigurasi semester beku memakai lebih sedikit kueri daripada semester hidup, dan jumlahnya tetap', async () => {
    const url = process.env.DATABASE_URL!;
    const counting = createDb(url);
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
      const count = async (w: World) => {
        const [sem] = await db().select().from(semester).where(eq(semester.id, w.sem1));
        const [cls] = await db().select().from(classRoom).where(eq(classRoom.id, w.classA));
        queries = 0;
        await withTenant(counting.db, [w.schoolId], (tx) => loadClassContext(tx, sem!, cls!));
        return queries;
      };
      const live = await makeWorld();
      await db()
        .insert(achievementCriteria)
        .values({ schoolId: live.schoolId, subjectId: live.mat, mode: 'numeric', threshold: 70 });
      const frozen = await makeWorld();
      await db()
        .insert(achievementCriteria)
        .values({ schoolId: frozen.schoolId, subjectId: frozen.mat, mode: 'numeric', threshold: 70 });
      expect((await finalize(frozen)).statusCode).toBe(200);
      const nLive = await count(live);
      const nFrozen = await count(frozen);
      // Salinan: 1 kueri menggantikan pengaturan, komponen, kriteria, dan level (4 kueri, pada sekolah dengan kriteria).
      expect(nFrozen).toBeLessThanOrEqual(nLive - 3);
      // Ambang tetap supaya N+1 tidak menyusup: konteks satu kelas tidak bergantung pada jumlah siswa.
      expect(nFrozen).toBeLessThanOrEqual(16);
      // Frozen tetap sama walau siswa bertambah.
      await db()
        .insert(student)
        .values({
          schoolId: frozen.schoolId,
          name: 'Dodi',
          gender: 'L',
          status: 'active',
          nis: `dodi-${run}`,
        });
      const [extra] = await db()
        .select()
        .from(student)
        .where(and(eq(student.schoolId, frozen.schoolId), eq(student.name, 'Dodi')));
      await db().insert(enrollment).values({
        schoolId: frozen.schoolId,
        studentId: extra!.id,
        classId: frozen.classA,
        academicYearId: frozen.yearId,
      });
      expect(await count(frozen)).toBe(nFrozen);
    } finally {
      await counting.pool.end();
    }
  });

  it('setiap pemanggil computeGrades memuat konfigurasi lewat loadGradingConfig, dan pemuat hidup tidak dipakai di luar daftar putih', () => {
    const root = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) files.push(p);
      }
    };
    walk(root);
    const rel = (p: string) => p.slice(root.length).replaceAll('\\', '/');
    const offenders: string[] = [];
    for (const p of files) {
      const src = readFileSync(p, 'utf8');
      const r = rel(p);
      if (/\bcomputeGrades\(/.test(src) && !src.includes('loadGradingConfig(') && r !== 'grading-lib.ts') {
        offenders.push(`${r}: computeGrades tanpa loadGradingConfig`);
      }
      // Pemecah KKM hidup hanya boleh dipakai pemuat efektif.
      if (
        /\bloadKktpResolver(ForClass)?\(/.test(src) &&
        !['kktp-lib.ts', 'grading-config-lib.ts'].includes(r)
      ) {
        offenders.push(`${r}: memakai pemecah KKM hidup`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('gerbang modul grades pada KKTP', () => {
  it('sekolah tanpa modul grades: tulis dan resolve 403 module_disabled, daftar tetap bisa dibaca', async () => {
    const w = await makeWorld({ grades: false });
    const fake = '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';
    const body = { subjectId: w.mat, mode: 'numeric', threshold: 70 };
    for (const [method, url, payload] of [
      ['POST', '/v1/achievement-criteria', body],
      ['PUT', `/v1/achievement-criteria/${fake}`, body],
      ['DELETE', `/v1/achievement-criteria/${fake}`, undefined],
      ['GET', `/v1/achievement-criteria/resolve?subjectId=${w.mat}`, undefined],
    ] as const) {
      const res = await call(method, url, w, payload);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
      expect(res.json().error.code).toBe('module_disabled');
    }
    const list = await call('GET', '/v1/achievement-criteria', w);
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({ criteria: [] });
  });
});

/* ---------- Tahap B: L5 (tumpangan snapshot), L6 (status dan sinkron), 0095 (arsip rapor tahan hapus) ---------- */

/** Pengguna kedua pada sekolah world dengan satu peran bawaan; mengembalikan cookie sesinya. */
async function cookieFor(w: World, roleKey: string) {
  const email = `${roleKey}-${run}-${worldSeq++}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: roleKey, email, password } });
  extraUserIds.push(res.user.id);
  const [m] = await db().insert(member).values({ userId: res.user.id, schoolId: w.schoolId }).returning();
  await assignRoles(db(), m!.id, w.schoolId, [roleKey]);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

const status = (w: World, semesterId = w.sem1, who = cookie) =>
  call('GET', `/v1/semesters/${semesterId}/grading-config`, w, undefined, who);
const sync = (w: World, semesterId = w.sem1, who = cookie) =>
  call('POST', `/v1/semesters/${semesterId}/grading-config/sync`, w, undefined, who);

/** Daftar tingkat sekolah (kriteria KKTP berjenjang mensyaratkan tingkat yang terdaftar). */
const addLevels = (w: World) =>
  db()
    .insert(schoolLevel)
    .values(['7', '8'].map((code, sort) => ({ schoolId: w.schoolId, code, label: `Kelas ${code}`, sort })));

/** Ubah KKM hidup langsung di DB (sekolah uji belum punya baris pengaturan, jadi upsert). */
const setLiveKkm = (w: World, kkm: number) =>
  db()
    .insert(gradingSetting)
    .values({ schoolId: w.schoolId, kkm })
    .onConflictDoUpdate({ target: gradingSetting.schoolId, set: { kkm } });

type RecapStudent = { studentId: string; name: string; final: number | null; source?: string };

describe('L5 tumpangan snapshot pada kelas yang rapornya final', () => {
  it('rekap, matriks, dan portal kelas final memakai angka snapshot walau salinan beku bergeser; kelas draf dan semester hidup tidak berlabel', async () => {
    const w = await makeWorld();
    expect((await finalize(w)).statusCode).toBe(200);
    const before = await surface(w);
    expect(before.recapA.source).toBe('report');
    expect(before.recapA.students.map((s: RecapStudent) => s.source)).toEqual(['report', 'report']);
    expect(before.matrixA.source).toBe('report');
    expect(before.portal.ani.source).toBe('report');
    expect(before.portal.ani.subjects[0]!.source).toBe('report');
    // Kelas B masih draf pada semester yang sama: jalur hidup, tanpa field baru.
    for (const doc of [before.recapB, before.matrixB, before.portal.citra])
      expect('source' in doc).toBe(false);
    expect('source' in before.recapB.students[0]).toBe(false);
    expect('source' in before.portal.citra.subjects[0]!).toBe(false);
    // Semester 2 tidak beku dan tanpa penilaian: tidak ada label.
    const live = await surface(w, w.sem2);
    expect('source' in live.recapA).toBe(false);
    expect('source' in live.matrixA).toBe(false);
    expect('source' in live.portal.ani).toBe(false);

    // Geser salinan beku: mode rata-rata sederhana (Ani 85, Budi 65 bila dihitung ulang) dan KKM 95.
    await db()
      .update(semesterGradingConfig)
      .set({ calculationMode: 'simple_average', kkm: 95 })
      .where(eq(semesterGradingConfig.semesterId, w.sem1));
    const after = await surface(w);
    const finals = (r: { students: RecapStudent[] }) => r.students.map((s) => [s.studentId, s.final]);
    expect(finals(after.recapA)).toEqual(finals(before.recapA));
    expect(after.recapA.students.map((s: { final: number }) => s.final)).toEqual([86, 66]);
    expect(after.recapA.kkm).toBe(75);
    expect(after.recapA.stats).toEqual(before.recapA.stats);
    expect(after.matrixA.students).toEqual(before.matrixA.students);
    expect(after.portal.ani.subjects[0]).toMatchObject({
      final: 86,
      predicate: 'B',
      kkm: 75,
      belowKkm: false,
    });
    expect(after.portal.ani.average).toBe(86);
    expect(after.portal.budi.subjects[0]).toMatchObject({ final: 66, predicate: 'D', belowKkm: true });
    // Rincian komponen dihitung dari salinan beku (bobot tetap), bukan dari snapshot.
    expect(after.portal.ani.subjects[0]!.components.map((c: { name: string }) => c.name)).toEqual([
      'Tugas',
      'UAS',
    ]);
    // Kelas draf mengikuti salinan beku (kini rata-rata sederhana, KKM 95), bukan snapshot.
    expect(after.recapB.kkm).toBe(95);
    expect('source' in after.recapB).toBe(false);
  });

  it('tingkat kelas diubah setelah final (jenjang KKTP bergeser): KKM dan belowKkm tetap dari snapshot', async () => {
    const w = await makeWorld();
    await addLevels(w);
    const created = await call('POST', '/v1/achievement-criteria', w, {
      subjectId: w.mat,
      levelCode: '7',
      mode: 'numeric',
      threshold: 78,
    });
    expect(created.statusCode, created.body).toBe(201);
    expect((await finalize(w)).statusCode).toBe(200);
    await db().update(classRoom).set({ level: '8' }).where(eq(classRoom.id, w.classA));
    const url = `/v1/grading/recap?semesterId=${w.sem1}&classId=${w.classA}&subjectId=${w.mat}`;
    const recap = (await call('GET', url, w)).json();
    expect(recap.source).toBe('report');
    expect(recap.kkm).toBe(78);
    expect(recap.students.find((s: RecapStudent) => s.studentId === w.budi)).toMatchObject({
      final: 66,
      belowKkm: true,
      source: 'report',
    });
    const [sem] = await db().select().from(semester).where(eq(semester.id, w.sem1));
    const portal = await withTenant(app.tenantDb, [w.schoolId], (tx) => gradesFor(tx, w.ani, sem!));
    expect(portal.subjects[0]).toMatchObject({ kkm: 78, final: 86, belowKkm: false, source: 'report' });
    // Kelas B (draf) tidak berlabel dan KKM-nya dihitung dari konfigurasi efektif dengan tingkat kelasnya sendiri.
    const recapB = (
      await call('GET', `/v1/grading/recap?semesterId=${w.sem1}&classId=${w.classB}&subjectId=${w.mat}`, w)
    ).json();
    expect(recapB.kkm).toBe(78);
    expect('source' in recapB).toBe(false);
  });

  it('siswa tanpa baris snapshot di kelas final dihitung dari salinan beku dan tidak berlabel', async () => {
    const w = await makeWorld();
    expect((await finalize(w)).statusCode).toBe(200);
    const [dewi] = await db()
      .insert(student)
      .values({
        schoolId: w.schoolId,
        name: 'Dewi',
        gender: 'P',
        status: 'active',
        nis: `Dewi-${w.schoolId}`,
      })
      .returning();
    await db()
      .insert(enrollment)
      .values({ schoolId: w.schoolId, studentId: dewi!.id, classId: w.classA, academicYearId: w.yearId });
    for (const a of [w.asA.tugas, w.asA.uas]) {
      await db()
        .insert(score)
        .values({ schoolId: w.schoolId, assessmentId: a, studentId: dewi!.id, value: 100, updatedBy: 'uji' });
    }
    const recap = (
      await call('GET', `/v1/grading/recap?semesterId=${w.sem1}&classId=${w.classA}&subjectId=${w.mat}`, w)
    ).json();
    expect(recap.source).toBe('report');
    const d = recap.students.find((s: RecapStudent) => s.name === 'Dewi') as RecapStudent;
    expect(d.final).toBe(100);
    expect('source' in d).toBe(false);
    expect(recap.students.filter((s: RecapStudent) => s.source === 'report')).toHaveLength(2);
    const matrix = (
      await call('GET', `/v1/grading/recap/class?semesterId=${w.sem1}&classId=${w.classA}`, w)
    ).json();
    const row = matrix.students.find((s: { name: string }) => s.name === 'Dewi');
    expect(row.grades[0].final).toBe(100);
    expect('source' in row).toBe(false);
  });

  it('setelah dibuka kembali, kelas itu kembali dihitung dari salinan beku tanpa label', async () => {
    const w = await makeWorld();
    expect((await finalize(w)).statusCode).toBe(200);
    expect((await reopen(w)).statusCode).toBe(200);
    const s = await surface(w);
    expect('source' in s.recapA).toBe(false);
    expect('source' in s.matrixA).toBe(false);
    expect('source' in s.portal.ani).toBe(false);
  });
});

describe('L6 status dan sinkron konfigurasi beku per semester', () => {
  it('status mengikuti siklus: hidup, beku saat final, berbeda dari hidup, sinkron ditolak saat final lalu diterima dan idempoten', async () => {
    const w = await makeWorld();
    const initial = await status(w);
    expect(initial.statusCode, initial.body).toBe(200);
    expect(initial.json()).toMatchObject({
      semesterId: w.sem1,
      frozen: false,
      origin: null,
      frozenAt: null,
      matchesLive: true,
      finalClassCount: 0,
      finalReportCount: 0,
    });

    expect((await finalize(w)).statusCode).toBe(200);
    const frozen = (await status(w)).json();
    expect(frozen).toMatchObject({
      frozen: true,
      origin: 'finalize',
      matchesLive: true,
      finalClassCount: 1,
      finalReportCount: 2,
      settings: { kkm: 75, calculationMode: 'weighted_average' },
    });
    expect(frozen.frozenAt).toEqual(expect.any(String));
    expect(frozen.components.map((c: { name: string }) => c.name)).toEqual(['Tugas', 'UAS']);

    await tamperLive(w);
    expect((await status(w)).json().matchesLive).toBe(false);

    const blocked = await sync(w);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('report_final');
    expect(blocked.json().error.message).toContain('7A');
    expect((await frozenRow(w.sem1))!.kkm).toBe(75);

    expect((await reopen(w)).statusCode).toBe(200);
    const applied = await sync(w);
    expect(applied.statusCode, applied.body).toBe(200);
    expect(applied.json()).toMatchObject({
      frozen: true,
      origin: 'sync',
      matchesLive: true,
      changed: true,
      finalClassCount: 0,
      settings: { kkm: 95, calculationMode: 'simple_average' },
    });
    expect(await frozenRow(w.sem1)).toMatchObject({ kkm: 95, origin: 'sync', frozenBy: userId });
    const again = await sync(w);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ changed: false, matchesLive: true, origin: 'sync' });

    const logs = await db()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.schoolId, w.schoolId), eq(auditLog.action, 'grading_config.sync')));
    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(logs.every((l) => l.entityId === w.sem1)).toBe(true);
  });

  it('sinkron membuat salinan untuk semester yang belum beku (semester mana pun, asal belum berfinal)', async () => {
    const w = await makeWorld();
    expect(await frozenRow(w.sem2)).toBeUndefined();
    const res = await sync(w, w.sem2);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ frozen: true, origin: 'sync', changed: true, matchesLive: true });
    expect(await frozenRow(w.sem2)).toMatchObject({ origin: 'sync', kkm: 75 });
    // Hanya semester itu yang ikut: semester 1 tetap hidup.
    expect(await frozenRow(w.sem1)).toBeUndefined();
  });

  it('izin: guru boleh membaca status tetapi tidak menyinkronkan; modul grades wajib; semester sekolah lain 404', async () => {
    const w = await makeWorld();
    const teacher = await cookieFor(w, 'teacher');
    expect((await status(w, w.sem1, teacher)).statusCode).toBe(200);
    const denied = await sync(w, w.sem1, teacher);
    expect(denied.statusCode).toBe(403);
    expect(await frozenRow(w.sem1)).toBeUndefined();

    const noModule = await makeWorld({ grades: false });
    for (const res of [await status(noModule), await sync(noModule)]) {
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('module_disabled');
    }

    const other = await makeWorld();
    // Sekolah lain tidak membaca atau menyinkronkan semester sekolah ini, dan tidak ada baris yang terbentuk.
    for (const res of [await status(other, w.sem1), await sync(other, w.sem1)]) {
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
    }
    expect(await frozenRow(w.sem1)).toBeUndefined();
    const none = '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';
    expect((await status(w, none)).statusCode).toBe(404);
    expect((await sync(w, none)).statusCode).toBe(404);
    expect((await call('GET', '/v1/semesters/bukan-uuid/grading-config', w)).statusCode).toBe(400);
  });

  it('GET /v1/grading/settings membawa activeSemesterConfig hanya bila semester aktif beku', async () => {
    const w = await makeWorld();
    const plain = (await call('GET', '/v1/grading/settings', w)).json();
    expect('activeSemesterConfig' in plain).toBe(false);

    expect((await finalize(w)).statusCode).toBe(200);
    const withFinal = (await call('GET', '/v1/grading/settings', w)).json();
    expect(withFinal.activeSemesterConfig).toMatchObject({
      semesterId: w.sem1,
      frozen: true,
      origin: 'finalize',
      matchesLive: true,
      hasFinal: true,
    });
    expect(withFinal.activeSemesterConfig.frozenAt).toEqual(expect.any(String));

    expect((await reopen(w)).statusCode).toBe(200);
    await setLiveKkm(w, 60);
    const stale = (await call('GET', '/v1/grading/settings', w)).json();
    expect(stale.kkm).toBe(60);
    expect(stale.activeSemesterConfig).toMatchObject({ matchesLive: false, hasFinal: false });
  });

  it('resolve?semesterId memakai salinan beku; tanpa semesterId tetap konfigurasi hidup', async () => {
    const w = await makeWorld();
    await addLevels(w);
    const created = await call('POST', '/v1/achievement-criteria', w, {
      subjectId: w.mat,
      levelCode: '7',
      mode: 'numeric',
      threshold: 78,
    });
    expect(created.statusCode, created.body).toBe(201);
    expect((await finalize(w)).statusCode).toBe(200);
    await db()
      .update(achievementCriteria)
      .set({ threshold: 60 })
      .where(eq(achievementCriteria.id, created.json().id));
    await setLiveKkm(w, 70);

    const base = `/v1/achievement-criteria/resolve?subjectId=${w.mat}&levelCode=7`;
    const hidup = (await call('GET', base, w)).json();
    expect(hidup).toMatchObject({ kkm: 60, schoolKkm: 70, scope: 'subject_level' });
    expect('frozen' in hidup).toBe(false);
    const beku = await call('GET', `${base}&semesterId=${w.sem1}`, w);
    expect(beku.statusCode, beku.body).toBe(200);
    expect(beku.json()).toMatchObject({ kkm: 78, schoolKkm: 75, scope: 'subject_level', frozen: true });
    // Semester yang belum beku: sama dengan konfigurasi hidup.
    const live2 = (await call('GET', `${base}&semesterId=${w.sem2}`, w)).json();
    expect(live2).toMatchObject({ kkm: 60, schoolKkm: 70 });
    expect('frozen' in live2).toBe(false);
    const other = await makeWorld();
    const foreign = await call(
      'GET',
      `/v1/achievement-criteria/resolve?subjectId=${other.mat}&semesterId=${w.sem1}`,
      other,
    );
    expect(foreign.statusCode).toBe(404);
  });
});

describe('0095 arsip rapor tahan hapus', () => {
  it('kelas atau semester yang masih dirujuk snapshot tidak dapat dihapus (409 in_use); snapshot tetap ada', async () => {
    const w = await makeWorld();
    const [cls] = await db()
      .insert(classRoom)
      .values({ schoolId: w.schoolId, academicYearId: w.yearId, name: 'Lama', level: '7' })
      .returning();
    await db()
      .insert(reportCardSnapshot)
      .values({
        schoolId: w.schoolId,
        semesterId: w.sem2,
        studentId: w.ani,
        classId: cls!.id,
        version: 1,
        kind: 'finalized',
        snapshot: { catatan: 'arsip' },
      });
    const countSnapshots = async () =>
      (await db().select().from(reportCardSnapshot).where(eq(reportCardSnapshot.schoolId, w.schoolId)))
        .length;

    const delClass = await call('DELETE', `/v1/classes/${cls!.id}`, w);
    expect(delClass.statusCode, delClass.body).toBe(409);
    expect(delClass.json().error.code).toBe('in_use');
    const delSemester = await call('DELETE', `/v1/semesters/${w.sem2}`, w);
    expect(delSemester.statusCode, delSemester.body).toBe(409);
    expect(delSemester.json().error.code).toBe('in_use');
    expect(await countSnapshots()).toBe(1);
    expect((await db().select().from(classRoom).where(eq(classRoom.id, cls!.id))).length).toBe(1);
    expect((await db().select().from(semester).where(eq(semester.id, w.sem2))).length).toBe(1);

    // Setelah arsipnya tidak ada, penghapusan berjalan seperti biasa.
    await db().delete(reportCardSnapshot).where(eq(reportCardSnapshot.schoolId, w.schoolId));
    expect((await call('DELETE', `/v1/classes/${cls!.id}`, w)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/semesters/${w.sem2}`, w)).statusCode).toBe(200);
  });
});

describe('verifikasi baca-saja rapor final terhadap konfigurasi hari ini', () => {
  it('melaporkan nol selisih bila konfigurasi tak berubah, dan selisih final/predikat/KKM per siswa bila berubah', async () => {
    const w = await makeWorld();
    expect((await finalize(w)).statusCode).toBe(200);
    const run1 = await withTenant(app.tenantDb, [w.schoolId], (tx) => verifyFinalReports(tx));
    expect(run1).toHaveLength(1);
    expect(run1[0]).toMatchObject({ className: '7A', students: 2, changedStudents: 0, diffs: [] });

    await tamperLive(w);
    const run2 = await withTenant(app.tenantDb, [w.schoolId], (tx) => verifyFinalReports(tx));
    expect(run2[0]!.changedStudents).toBe(2);
    const fields = new Set(run2[0]!.diffs.map((d) => d.field));
    expect([...fields].sort()).toEqual(['final', 'kkm', 'predicate']);
    expect(run2[0]!.diffs.find((d) => d.studentId === w.ani && d.field === 'kkm')).toMatchObject({
      report: 75,
      today: 99,
    });
    // Hanya membaca: salinan beku dan snapshot tidak berubah.
    expect((await frozenRow(w.sem1))!.kkm).toBe(75);
  });
});
