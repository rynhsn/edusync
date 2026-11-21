import { DEFAULT_PREDICATE_DESCRIPTIONS } from '@edusync/contracts';
import {
  academicYear,
  and,
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
  learningFlow,
  learningFlowItem,
  learningObjective,
  learningOutcome,
  member,
  reportCard,
  reportCardSnapshot,
  reportSubjectNarrative,
  school,
  schoolLevel,
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
  withTenant,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { loadClassContext, loadReportExtras } from './report-card-lib';
import { narrativeHash } from './report-narrative-lib';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/**
 * Tahap 3.4 (rancangan fase 3, tes T12, T9, T14 dan bagian T1): narasi rapor dari TP. Urutan tinggi/rendah, seri (ATP, urutan TP),
 * batas item dan templat sekolah, semua tercapai, tanpa kandidat = teks v1 PERSIS dan tanpa `descriptionSource`, suntingan manual,
 * `stale`, hapus suntingan, finalisasi membekukan teks efektif, reopen dan finalisasi ulang, mode deskriptif, guard
 * `report_final`, hak sunting (K7), isolasi tenant, dan jumlah kueri tetap.
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let subscriptionId = '';
let subscriptionEnd = new Date();
const schoolIds: string[] = [];
const userIds: string[] = [];
const db = () => app.platformDb;
let seq = 0;

interface World {
  sid: string;
  year: string;
  sem: string;
  mat: string;
  comp: string;
  cls: string;
  cls8: string;
  admin: string;
  teacher: string;
  teacherOther: string;
  teacherHome: string;
  /** Nama siswa (huruf kecil) -> id. */
  S: Record<string, string>;
  /** Kode TP -> id TP. */
  tp: Record<string, string>;
  /** Kode TP -> id penilaian yang dikaitkan. */
  asm: Record<string, string>;
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
const call = (
  w: Pick<World, 'sid'>,
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  cookie: string,
  payload?: object,
) =>
  app.inject({
    method,
    url,
    headers: {
      cookie,
      'x-school-id': w.sid,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });
const code = (res: { json: () => { error: { code: string } } }) => res.json().error.code;
const strip = (doc: Record<string, unknown>) => {
  const { generatedAt: _g, ...rest } = doc;
  return rest;
};

async function makeSchool(tag: string) {
  const [s] = await db()
    .insert(school)
    .values({ foundationId, slug: `${tag}-${run}`, name: `Sekolah ${tag}` })
    .returning();
  schoolIds.push(s!.id);
  await seedSchoolRoles(db(), s!.id);
  await db()
    .insert(entitlement)
    .values({ schoolId: s!.id, moduleKey: 'grades', subscriptionId, validUntil: subscriptionEnd });
  const [y] = await db()
    .insert(academicYear)
    .values({
      schoolId: s!.id,
      name: '2000-2099',
      startsOn: '2000-01-01',
      endsOn: '2099-12-31',
      isActive: true,
    })
    .returning();
  const [se] = await db()
    .insert(semester)
    .values({
      schoolId: s!.id,
      academicYearId: y!.id,
      name: 'Ganjil',
      startsOn: '2026-07-01',
      endsOn: '2026-12-31',
      isActive: true,
    })
    .returning();
  const [m] = await db()
    .insert(subject)
    .values({ schoolId: s!.id, code: 'MAT', name: 'Matematika' })
    .returning();
  const [comp] = await db()
    .insert(gradeComponent)
    .values({ schoolId: s!.id, name: 'Tugas', weight: 100, sort: 0 })
    .returning();
  return { sid: s!.id, year: y!.id, sem: se!.id, mat: m!.id, comp: comp!.id };
}

async function addStudent(base: { sid: string; year: string }, name: string, classId: string) {
  const [st] = await db()
    .insert(student)
    .values({
      schoolId: base.sid,
      name,
      gender: 'L',
      status: 'active',
      nis: `${name}-${base.sid.slice(0, 6)}-${seq++}`,
    })
    .returning();
  await db()
    .insert(enrollment)
    .values({ schoolId: base.sid, studentId: st!.id, classId, academicYearId: base.year });
  return st!.id;
}

async function addAssessment(
  base: { sid: string; sem: string; mat: string; comp: string },
  classId: string,
  title: string,
  scores: Record<string, number | null>,
  objectiveId?: string,
) {
  const [a] = await db()
    .insert(assessment)
    .values({
      schoolId: base.sid,
      semesterId: base.sem,
      classId,
      subjectId: base.mat,
      componentId: base.comp,
      title,
      date: '2026-08-01',
      maxScore: 100,
    })
    .returning();
  for (const [studentId, value] of Object.entries(scores)) {
    if (value === null) continue;
    await db()
      .insert(score)
      .values({ schoolId: base.sid, assessmentId: a!.id, studentId, value, updatedBy: 'uji' });
  }
  if (objectiveId) {
    await db().insert(assessmentObjective).values({ schoolId: base.sid, assessmentId: a!.id, objectiveId });
  }
  return a!.id;
}

async function addObjective(base: { sid: string; mat: string }, label: string, sortOrder: number) {
  const [o] = await db()
    .insert(learningOutcome)
    .values({ schoolId: base.sid, subjectId: base.mat, phase: 'D', description: `CP ${label}` })
    .returning();
  const [t] = await db()
    .insert(learningObjective)
    .values({
      schoolId: base.sid,
      outcomeId: o!.id,
      code: label,
      description: `TP ${label}`,
      sortOrder,
      active: true,
    })
    .returning();
  return t!.id;
}

/** Skor per TP per siswa; siswa yang tidak disebut tidak punya skor di TP itu. */
const TP_SCORES: Record<string, Record<string, number>> = {
  M1: { ani: 95, budi: 90, dewi: 90 },
  M2: { ani: 85, budi: 90, dewi: 90 },
  M3: { ani: 70, budi: 80, dewi: 90 },
  M4: { ani: 50, budi: 90, dewi: 90 },
  M5: { ani: 60, budi: 85, dewi: 90 },
};

async function makeWorld(): Promise<World> {
  const base = await makeSchool('narasi');
  const [c7] = await db()
    .insert(classRoom)
    .values({ schoolId: base.sid, academicYearId: base.year, name: '7A', level: '7' })
    .returning();
  const [c8] = await db()
    .insert(classRoom)
    .values({ schoolId: base.sid, academicYearId: base.year, name: '8A', level: '8' })
    .returning();
  await db()
    .insert(schoolLevel)
    .values([
      { schoolId: base.sid, code: '7', label: 'Kelas 7', sort: 0 },
      { schoolId: base.sid, code: '8', label: 'Kelas 8', sort: 1, reportMode: 'descriptive' },
    ]);
  const S: Record<string, string> = {};
  for (const n of ['ani', 'budi', 'citra', 'dewi']) S[n] = await addStudent(base, n, c7!.id);
  for (const n of ['edo', 'fani']) S[n] = await addStudent(base, n, c8!.id);

  const tp: Record<string, string> = {};
  const asm: Record<string, string> = {};
  let order = 1;
  for (const label of Object.keys(TP_SCORES)) tp[label] = await addObjective(base, label, order++);
  // Penilaian tanpa kaitan TP: semua siswa kelas 7 mendapat 80 (Citra hanya punya ini, jadi tanpa TP berstatus).
  await addAssessment(base, c7!.id, 'Umum', { [S.ani!]: 80, [S.budi!]: 80, [S.citra!]: 80, [S.dewi!]: 80 });
  for (const [label, byStudent] of Object.entries(TP_SCORES)) {
    asm[label] = await addAssessment(
      base,
      c7!.id,
      `Tugas ${label}`,
      Object.fromEntries(Object.entries(byStudent).map(([n, v]) => [S[n]!, v])),
      tp[label],
    );
  }
  // Kelas 8 (mode deskriptif): Edo punya skor TP, Fani hanya penilaian tanpa TP.
  await addAssessment(base, c8!.id, 'Umum 8', { [S.edo!]: 80, [S.fani!]: 80 });
  await addAssessment(base, c8!.id, 'Tugas M1 (8)', { [S.edo!]: 95 }, tp.M1);

  const admin = await join('admin', base.sid, ['school_admin']);
  const tchr = await join('guru', base.sid, ['teacher']);
  const other = await join('guru-lain', base.sid, ['teacher']);
  const home = await join('wali', base.sid, ['teacher']);
  const [t1] = await db()
    .insert(teacher)
    .values({ schoolId: base.sid, name: 'Pak Mat', memberId: tchr.memberId })
    .returning();
  await db().insert(teacher).values({ schoolId: base.sid, name: 'Bu Lain', memberId: other.memberId });
  const [t3] = await db()
    .insert(teacher)
    .values({ schoolId: base.sid, name: 'Bu Wali', memberId: home.memberId })
    .returning();
  await db()
    .insert(teachingAssignment)
    .values({ schoolId: base.sid, classId: c7!.id, subjectId: base.mat, teacherId: t1!.id });
  await db().update(classRoom).set({ homeroomTeacherId: t3!.id }).where(eq(classRoom.id, c7!.id));
  return {
    ...base,
    cls: c7!.id,
    cls8: c8!.id,
    admin: admin.cookie,
    teacher: tchr.cookie,
    teacherOther: other.cookie,
    teacherHome: home.cookie,
    S,
    tp,
    asm,
  };
}

let w: World;
let other: World;

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Narasi', slug: `yn-${run}` })
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
  w = await makeWorld();
  const base = await makeSchool('narasi-b');
  const adminB = await join('admin-b', base.sid, ['school_admin']);
  other = { ...({} as World), ...base, admin: adminB.cookie };
}, 180_000);

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

const narrUrl = (x: World = w, classId = x.cls) =>
  `/v1/report-cards/narratives?semesterId=${x.sem}&classId=${classId}&subjectId=${x.mat}`;
const docUrl = (studentId: string, x: World = w) => `/v1/report-cards/${studentId}?semesterId=${x.sem}`;
const finalize = (classId: string, force = false, cookie = w.admin) =>
  call(w, 'POST', '/v1/report-cards/finalize', cookie, { semesterId: w.sem, classId, force });
const reopen = (classId: string) =>
  call(w, 'POST', '/v1/report-cards/reopen', w.admin, { semesterId: w.sem, classId });

interface NarrRow {
  studentId: string;
  generated: string | null;
  reportStatus?: string;
  generatedSource: 'objectives' | 'predicate' | null;
  manual: string | null;
  effective: string | null;
  source: 'manual' | 'objectives' | 'predicate' | null;
  stale?: true;
  objectives?: {
    assessed: number;
    achieved: number;
    high: { id: string; code: string | null; text: string }[];
    low: { id: string; code: string | null; text: string }[];
  };
}
async function rowOf(name: string, x: World = w, classId = x.cls, cookie = x.admin): Promise<NarrRow> {
  const res = await call(x, 'GET', narrUrl(x, classId), cookie);
  expect(res.statusCode, res.body).toBe(200);
  const row = (res.json().students as NarrRow[]).find((r) => r.studentId === x.S[name]);
  expect(row, name).toBeDefined();
  return row!;
}
async function docOf(name: string, x: World = w) {
  const res = await call(x, 'GET', docUrl(x.S[name]!, x), x.admin);
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
}
const putManual = (items: { studentId: string; text: string | null }[], cookie = w.admin) =>
  call(w, 'PUT', '/v1/report-cards/narratives', cookie, {
    semesterId: w.sem,
    classId: w.cls,
    subjectId: w.mat,
    items,
  });
const setScore = (label: string, name: string, value: number) =>
  db()
    .update(score)
    .set({ value })
    .where(and(eq(score.assessmentId, w.asm[label]!), eq(score.studentId, w.S[name]!)));

const settingsBody = (extra: object = {}) => ({
  principalName: null,
  principalNip: null,
  city: null,
  address: null,
  ...DEFAULT_PREDICATE_DESCRIPTIONS,
  showRank: false,
  ...extra,
});

const ANI_TEXT =
  'Menunjukkan penguasaan yang baik dalam TP M1 dan TP M2. Perlu bimbingan dalam TP M4 dan TP M5.';

describe('T12: narasi otomatis dari TP', () => {
  it('urutan tinggi menurun dan rendah menaik, batas 2 per sisi, templat bawaan; murid, TP, dan jumlahnya di respons', async () => {
    const ani = await rowOf('ani');
    expect(ani.generated).toBe(ANI_TEXT);
    expect(ani.effective).toBe(ANI_TEXT);
    expect(ani.source).toBe('objectives');
    expect(ani.generatedSource).toBe('objectives');
    expect(ani.manual).toBeNull();
    expect(ani.stale).toBeUndefined();
    expect(ani.objectives).toMatchObject({ assessed: 5, achieved: 2 });
    expect(ani.objectives!.high.map((t) => t.code)).toEqual(['M1', 'M2']);
    expect(ani.objectives!.low.map((t) => t.code)).toEqual(['M4', 'M5']);
    expect(ani.objectives!.high[0]).toEqual({ id: w.tp.M1, code: 'M1', text: 'TP M1' });
  });

  it('semua tercapai: kalimat "perlu bimbingan" hilang; seri persen dipecah urutan TP', async () => {
    const budi = await rowOf('budi');
    expect(budi.objectives).toMatchObject({ assessed: 5, achieved: 5, low: [] });
    expect(budi.generated).toBe('Menunjukkan penguasaan yang baik dalam TP M1 dan TP M2.');
    expect(budi.generated).not.toContain('Perlu bimbingan');
  });

  it('tanpa kandidat = teks v1 PERSIS dan tanpa descriptionSource/objectives/schemaVersion (rapor draf dan final)', async () => {
    const citra = await rowOf('citra');
    expect(citra.objectives).toBeUndefined();
    expect(citra.source).toBe('predicate');
    expect(citra.generatedSource).toBe('predicate');
    expect(citra.generated).toBe(DEFAULT_PREDICATE_DESCRIPTIONS.descB);
    const doc = await docOf('citra');
    expect(doc.schemaVersion).toBeUndefined();
    expect(Object.keys(doc.subjects[0]).sort()).toEqual(
      ['belowKkm', 'description', 'final', 'kkm', 'name', 'predicate', 'subjectId'].sort(),
    );
    expect(doc.subjects[0].description).toBe(DEFAULT_PREDICATE_DESCRIPTIONS.descB);
  });

  it('dokumen draf murid ber-TP: description dari TP, descriptionSource objectives, objectives sparse, schemaVersion 2', async () => {
    const doc = await docOf('ani');
    expect(doc.schemaVersion).toBe(2);
    const sub = doc.subjects[0];
    expect(sub.description).toBe(ANI_TEXT);
    expect(sub.descriptionSource).toBe('objectives');
    expect(sub.objectives).toMatchObject({ assessed: 5, achieved: 2 });
    expect(sub.objectives.high.map((t: { code: string }) => t.code)).toEqual(['M1', 'M2']);
    // Murid lain di kelas yang sama tetap v1.
    expect((await docOf('citra')).schemaVersion).toBeUndefined();
  });

  it('seri persen dipecah urutan ATP terbit tahun itu, lalu urutan TP', async () => {
    expect((await rowOf('dewi')).generated).toBe('Menunjukkan penguasaan yang baik dalam TP M1 dan TP M2.');
    const [flow] = await db()
      .insert(learningFlow)
      .values({
        schoolId: w.sid,
        subjectId: w.mat,
        academicYearId: w.year,
        name: 'ATP uji',
        status: 'published',
      })
      .returning();
    // M3 pertama di ATP, lalu M1; M2 menyusul. ATP draf (tidak terbit) tidak dipakai.
    await db()
      .insert(learningFlowItem)
      .values([
        { schoolId: w.sid, flowId: flow!.id, objectiveId: w.tp.M3!, sortOrder: 0 },
        { schoolId: w.sid, flowId: flow!.id, objectiveId: w.tp.M1!, sortOrder: 1 },
        { schoolId: w.sid, flowId: flow!.id, objectiveId: w.tp.M2!, sortOrder: 2 },
      ]);
    const [draft] = await db()
      .insert(learningFlow)
      .values({
        schoolId: w.sid,
        subjectId: w.mat,
        academicYearId: w.year,
        name: 'ATP draf',
        status: 'draft',
        version: 2,
      })
      .returning();
    await db()
      .insert(learningFlowItem)
      .values({ schoolId: w.sid, flowId: draft!.id, objectiveId: w.tp.M5!, sortOrder: -5 });
    expect((await rowOf('dewi')).generated).toBe('Menunjukkan penguasaan yang baik dalam TP M3 dan TP M1.');
    // Persen berbeda tetap mengalahkan urutan ATP: pada Ani M3 tidak tercapai, jadi teksnya tidak berubah.
    expect((await rowOf('ani')).generated).toBe(ANI_TEXT);
  });

  it('keputusan guru (override) menjadi kandidat; TP tanpa skor dan tanpa keputusan diabaikan', async () => {
    // Citra: keputusan guru "belum tercapai" pada M1 (tanpa skor) -> satu kandidat.
    const res = await call(w, 'PUT', '/v1/grading/objective-achievement', w.admin, {
      semesterId: w.sem,
      classId: w.cls,
      subjectId: w.mat,
      records: [{ studentId: w.S.citra!, objectiveId: w.tp.M1!, achieved: false }],
    });
    expect(res.statusCode, res.body).toBe(200);
    const citra = await rowOf('citra');
    expect(citra.objectives).toMatchObject({ assessed: 1, achieved: 0, high: [] });
    expect(citra.generated).toBe('Perlu bimbingan dalam TP M1.');
    expect(citra.source).toBe('objectives');
    const doc = await docOf('citra');
    expect(doc.subjects[0].descriptionSource).toBe('objectives');
    expect(doc.schemaVersion).toBe(2);
    // Hapus keputusan: kembali v1 persis.
    const back = await call(w, 'PUT', '/v1/grading/objective-achievement', w.admin, {
      semesterId: w.sem,
      classId: w.cls,
      subjectId: w.mat,
      records: [
        { studentId: w.S.citra!, objectiveId: w.tp.M1!, achieved: null, levelLabel: null, note: null },
      ],
    });
    expect(back.statusCode, back.body).toBe(200);
    expect((await rowOf('citra')).source).toBe('predicate');
  });
});

describe('pengaturan narasi sekolah (templat dan jumlah item)', () => {
  it('bawaan: 2 item, templat null; PUT mengubah, GET mengembalikan, dan teks rapor mengikuti', async () => {
    const before = (await call(w, 'GET', '/v1/report-cards/settings', w.admin)).json();
    expect(before).toMatchObject({
      narrativeMaxItems: 2,
      narrativeHighTemplate: null,
      narrativeLowTemplate: null,
    });
    const put = await call(
      w,
      'PUT',
      '/v1/report-cards/settings',
      w.admin,
      settingsBody({
        narrativeMaxItems: 1,
        narrativeHighTemplate: 'Sangat menguasai {tp}.',
        narrativeLowTemplate: 'Perlu latihan: {tp}.',
      }),
    );
    expect(put.statusCode, put.body).toBe(200);
    expect(put.json()).toMatchObject({
      narrativeMaxItems: 1,
      narrativeHighTemplate: 'Sangat menguasai {tp}.',
      narrativeLowTemplate: 'Perlu latihan: {tp}.',
    });
    expect((await rowOf('ani')).generated).toBe('Sangat menguasai TP M1. Perlu latihan: TP M4.');
    expect((await docOf('ani')).subjects[0].description).toBe(
      'Sangat menguasai TP M1. Perlu latihan: TP M4.',
    );
    // Dihilangkan = tidak berubah.
    const keep = await call(w, 'PUT', '/v1/report-cards/settings', w.admin, settingsBody());
    expect(keep.json()).toMatchObject({
      narrativeMaxItems: 1,
      narrativeHighTemplate: 'Sangat menguasai {tp}.',
    });
    // null atau kosong = templat bawaan; 3 item.
    const reset = await call(
      w,
      'PUT',
      '/v1/report-cards/settings',
      w.admin,
      settingsBody({ narrativeMaxItems: 3, narrativeHighTemplate: null, narrativeLowTemplate: '' }),
    );
    expect(reset.json()).toMatchObject({
      narrativeMaxItems: 3,
      narrativeHighTemplate: null,
      narrativeLowTemplate: null,
    });
    expect((await rowOf('ani')).generated).toBe(
      'Menunjukkan penguasaan yang baik dalam TP M1 dan TP M2. Perlu bimbingan dalam TP M4, TP M5, dan TP M3.',
    );
    await call(w, 'PUT', '/v1/report-cards/settings', w.admin, settingsBody({ narrativeMaxItems: 2 }));
    expect((await rowOf('ani')).generated).toBe(ANI_TEXT);
  });

  it('templat tanpa {tp}, terlalu panjang, dan jumlah di luar 1-5 ditolak 400', async () => {
    for (const extra of [
      { narrativeHighTemplate: 'Bagus.' },
      { narrativeLowTemplate: 'Kurang.' },
      { narrativeHighTemplate: `${'x'.repeat(300)}{tp}` },
      { narrativeMaxItems: 0 },
      { narrativeMaxItems: 6 },
    ]) {
      const res = await call(w, 'PUT', '/v1/report-cards/settings', w.admin, settingsBody(extra));
      expect(res.statusCode, JSON.stringify(extra)).toBe(400);
    }
    expect((await call(w, 'GET', '/v1/report-cards/settings', w.admin)).json()).toMatchObject({
      narrativeMaxItems: 2,
      narrativeHighTemplate: null,
    });
  });

  it('pengaturan sekolah lain tidak terpengaruh (isolasi tenant)', async () => {
    await call(w, 'PUT', '/v1/report-cards/settings', w.admin, settingsBody({ narrativeMaxItems: 4 }));
    const b = (await call(other, 'GET', '/v1/report-cards/settings', other.admin)).json();
    expect(b.narrativeMaxItems).toBe(2);
    await call(w, 'PUT', '/v1/report-cards/settings', w.admin, settingsBody({ narrativeMaxItems: 2 }));
  });
});

describe('narasi manual, stale, finalisasi, reopen (T12 dan T9)', () => {
  it('guru pengampu menyunting: manual menang, sidik teks otomatis tersimpan, tidak stale; hapus = kembali otomatis', async () => {
    const put = await putManual([{ studentId: w.S.ani!, text: 'Ani rajin sekali.' }], w.teacher);
    expect(put.statusCode, put.body).toBe(200);
    expect(put.json()).toMatchObject({ saved: 1, removed: 0 });
    const [stored] = await db()
      .select()
      .from(reportSubjectNarrative)
      .where(eq(reportSubjectNarrative.studentId, w.S.ani!));
    expect(stored!.generatedHash).toBe(narrativeHash(ANI_TEXT));
    const row = await rowOf('ani');
    expect(row).toMatchObject({
      manual: 'Ani rajin sekali.',
      effective: 'Ani rajin sekali.',
      source: 'manual',
    });
    expect(row.generated).toBe(ANI_TEXT);
    expect(row.stale).toBeUndefined();
    const doc = await docOf('ani');
    expect(doc.subjects[0]).toMatchObject({ description: 'Ani rajin sekali.', descriptionSource: 'manual' });
    expect(doc.subjects[0].objectives).toMatchObject({ assessed: 5 });

    const del = await putManual([{ studentId: w.S.ani!, text: null }], w.admin);
    expect(del.json()).toMatchObject({ saved: 0, removed: 1 });
    const after = await rowOf('ani');
    expect(after).toMatchObject({ manual: null, effective: ANI_TEXT, source: 'objectives' });
    expect((await docOf('ani')).subjects[0].descriptionSource).toBe('objectives');
  });

  it('teks otomatis berubah sesudah disunting: stale true; menyimpan ulang menyegarkan sidik', async () => {
    await putManual([{ studentId: w.S.ani!, text: 'Ani rajin sekali.' }]);
    expect((await rowOf('ani')).stale).toBeUndefined();
    await setScore('M1', 'ani', 60); // M1 tidak tercapai lagi: teks otomatis berubah
    const row = await rowOf('ani');
    expect(row.stale).toBe(true);
    expect(row.manual).toBe('Ani rajin sekali.');
    expect(row.generated).not.toBe(ANI_TEXT);
    // Murid tanpa suntingan tidak pernah stale; suntingan tahap 3.2 tanpa sidik juga tidak.
    expect((await rowOf('budi')).stale).toBeUndefined();
    await putManual([{ studentId: w.S.budi!, text: 'Budi baik.' }]);
    await db()
      .update(reportSubjectNarrative)
      .set({ generatedHash: null })
      .where(eq(reportSubjectNarrative.studentId, w.S.budi!));
    await setScore('M4', 'budi', 10);
    expect((await rowOf('budi')).stale).toBeUndefined();
    await setScore('M4', 'budi', 90);
  });

  it('finalisasi: peringatan staleNarratives (tidak memblokir), teks efektif dibekukan, snapshot v2 sparse', async () => {
    const fin = await finalize(w.cls);
    expect(fin.statusCode, fin.body).toBe(200);
    expect(fin.json()).toEqual({ finalized: 4, staleNarratives: 1 });
    const ani = await docOf('ani');
    expect(ani.status).toBe('final');
    expect(ani.schemaVersion).toBe(2);
    expect(ani.subjects[0]).toMatchObject({ description: 'Ani rajin sekali.', descriptionSource: 'manual' });
    const budi = await docOf('budi');
    expect(budi.subjects[0]).toMatchObject({ description: 'Budi baik.', descriptionSource: 'manual' });
    const dewi = await docOf('dewi');
    expect(dewi.subjects[0]).toMatchObject({
      descriptionSource: 'objectives',
      description: 'Menunjukkan penguasaan yang baik dalam TP M3 dan TP M1.',
    });
    expect(dewi.subjects[0].objectives).toMatchObject({ assessed: 5, achieved: 5 });
    // Citra: v1 persis di snapshot final.
    const citra = await docOf('citra');
    expect(citra.schemaVersion).toBeUndefined();
    const [citraCard] = await db().select().from(reportCard).where(eq(reportCard.studentId, w.S.citra!));
    expect(citraCard!.schemaVersion).toBe(1);
    expect(JSON.stringify(citraCard!.snapshot)).not.toContain('descriptionSource');
    expect(JSON.stringify(citraCard!.snapshot)).not.toContain('objectives');
    const [dewiCard] = await db().select().from(reportCard).where(eq(reportCard.studentId, w.S.dewi!));
    expect(dewiCard!.schemaVersion).toBe(2);
  });

  it('rapor final tidak berubah walau data hidup berubah; GET narasi menampilkan teks otomatis terkini', async () => {
    const frozen = (await docOf('dewi')).subjects[0].description;
    await setScore('M3', 'dewi', 20); // data hidup menyimpang (jalur DB langsung, melewati guard)
    expect((await docOf('dewi')).subjects[0].description).toBe(frozen);
    const live = await rowOf('dewi');
    expect(live.generated).not.toBe(frozen);
    expect(live.reportStatus).toBe('final');
    await setScore('M3', 'dewi', 90);
  });

  it('guard report_final: penulisan ditolak 409 per siswa; siswa lain di kelas lain tetap dapat disunting', async () => {
    const res = await putManual([{ studentId: w.S.citra!, text: 'Citra manis.' }]);
    expect([res.statusCode, code(res)]).toEqual([409, 'report_final']);
    // Kelas 8 belum final: sunting diterima.
    const ok = await call(w, 'PUT', '/v1/report-cards/narratives', w.admin, {
      semesterId: w.sem,
      classId: w.cls8,
      subjectId: w.mat,
      items: [{ studentId: w.S.fani!, text: 'Fani berkembang.' }],
    });
    expect(ok.statusCode, ok.body).toBe(200);
    await call(w, 'PUT', '/v1/report-cards/narratives', w.admin, {
      semesterId: w.sem,
      classId: w.cls8,
      subjectId: w.mat,
      items: [{ studentId: w.S.fani!, text: null }],
    });
  });

  it('T9: reopen mempertahankan suntingan manual dan menghitung ulang otomatis; finalisasi ulang tanpa perubahan = snapshot sama', async () => {
    const before = Object.fromEntries(
      await Promise.all(
        ['ani', 'budi', 'citra', 'dewi'].map(async (n) => [n, strip(await docOf(n))] as const),
      ),
    );
    expect((await reopen(w.cls)).json()).toEqual({ reopened: 4 });
    // Manual tetap, otomatis dihitung ulang dari data terkini.
    const manual = await db()
      .select()
      .from(reportSubjectNarrative)
      .where(eq(reportSubjectNarrative.classId, w.cls));
    expect(manual.map((m) => m.text).sort()).toEqual(['Ani rajin sekali.', 'Budi baik.']);
    const draft = await docOf('ani');
    expect(draft.status).toBe('draft');
    expect(draft.subjects[0]).toMatchObject({
      description: 'Ani rajin sekali.',
      descriptionSource: 'manual',
    });
    // Ubah data lalu final ulang: teks otomatis baru dibekukan; manual tetap.
    await setScore('M1', 'dewi', 40);
    const changed = (await docOf('dewi')).subjects[0].description;
    expect(changed).not.toBe(
      ((before.dewi as { subjects: { description: string }[] }) ?? { subjects: [] }).subjects[0]?.description,
    );
    await setScore('M1', 'dewi', 90);
    // Segarkan sidik manual (otomatis berubah sejak disunting) lalu final ulang tanpa perubahan data.
    await putManual([
      { studentId: w.S.ani!, text: 'Ani rajin sekali.' },
      { studentId: w.S.budi!, text: 'Budi baik.' },
    ]);
    const fin = await finalize(w.cls);
    expect(fin.json()).toEqual({ finalized: 4 });
    for (const n of ['ani', 'budi', 'citra', 'dewi']) {
      expect(strip(await docOf(n)), n).toEqual(before[n]);
    }
    const history = await db()
      .select()
      .from(reportCardSnapshot)
      .where(and(eq(reportCardSnapshot.studentId, w.S.ani!), eq(reportCardSnapshot.kind, 'finalized')));
    expect(history).toHaveLength(2);
    await reopen(w.cls);
  });
});

describe('hak sunting dan isolasi tenant', () => {
  it('K7: pengampu dan pemegang report_card:manage menyunting; wali kelas non-pengampu hanya membaca; guru lain 403', async () => {
    expect((await putManual([{ studentId: w.S.citra!, text: 'Citra manis.' }], w.teacher)).statusCode).toBe(
      200,
    );
    const home = await putManual([{ studentId: w.S.citra!, text: 'Wali menulis.' }], w.teacherHome);
    expect([home.statusCode, code(home)]).toEqual([403, 'forbidden']);
    expect((await putManual([{ studentId: w.S.citra!, text: 'Lain.' }], w.teacherOther)).statusCode).toBe(
      403,
    );
    // Wali kelas membaca (termasuk teks otomatis dan stale); guru lain yang tidak mengampu tidak.
    const read = await call(w, 'GET', narrUrl(), w.teacherHome);
    expect(read.statusCode).toBe(200);
    expect((await call(w, 'GET', narrUrl(), w.teacherOther)).statusCode).toBe(403);
    expect((await putManual([{ studentId: w.S.citra!, text: 'Admin menulis.' }], w.admin)).statusCode).toBe(
      200,
    );
    await putManual([{ studentId: w.S.citra!, text: null }]);
  });

  it('sekolah B tidak dapat membaca atau menulis narasi sekolah A (400 invalid_reference)', async () => {
    const get = await call(other, 'GET', narrUrl(w), other.admin);
    expect([get.statusCode, code(get)]).toEqual([400, 'invalid_reference']);
    const put = await call(other, 'PUT', '/v1/report-cards/narratives', other.admin, {
      semesterId: w.sem,
      classId: w.cls,
      subjectId: w.mat,
      items: [{ studentId: w.S.ani!, text: 'Sisipan lintas sekolah.' }],
    });
    expect([put.statusCode, code(put)]).toEqual([400, 'invalid_reference']);
    const [leak] = await db()
      .select()
      .from(reportSubjectNarrative)
      .where(eq(reportSubjectNarrative.text, 'Sisipan lintas sekolah.'));
    expect(leak).toBeUndefined();
    const doc = await call(other, 'GET', docUrl(w.S.ani!, w), other.admin);
    expect(doc.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe('mode deskriptif: TP memenuhi kelengkapan', () => {
  it('tanpa deskripsi (manual atau TP) finalisasi ditolak; deskripsi dari TP dan manual sama-sama memenuhi', async () => {
    const res = await call(w, 'POST', '/v1/report-cards/finalize', w.admin, {
      semesterId: w.sem,
      classId: w.cls8,
      force: false,
    });
    // Edo lengkap lewat TP; hanya Fani yang kurang.
    expect([res.statusCode, code(res)]).toEqual([409, 'grades_incomplete']);
    expect(res.json().error.message).toContain('1 murid');
    expect(res.json().error.message).toContain('deskripsi');
    const edo = await docOf('edo');
    expect(edo.reportMode).toBe('descriptive');
    expect(edo.subjects[0]).toMatchObject({ descriptionSource: 'objectives' });
    // Mode deskriptif tanpa TP dan tanpa manual: tidak ada teks predikat (tidak membocorkan predikat).
    expect((await docOf('fani')).subjects[0].description).toBeNull();
    expect((await rowOf('fani', w, w.cls8)).generated).toBeNull();
    const list = (
      await call(w, 'GET', `/v1/report-cards?semesterId=${w.sem}&classId=${w.cls8}`, w.admin)
    ).json() as { studentId: string; subjectsGraded: number; subjectsTotal: number }[];
    expect(list.find((s) => s.studentId === w.S.edo)).toMatchObject({ subjectsGraded: 1, subjectsTotal: 1 });
    expect(list.find((s) => s.studentId === w.S.fani)).toMatchObject({ subjectsGraded: 0, subjectsTotal: 1 });

    await call(w, 'PUT', '/v1/report-cards/narratives', w.admin, {
      semesterId: w.sem,
      classId: w.cls8,
      subjectId: w.mat,
      items: [{ studentId: w.S.fani!, text: 'Fani berkembang.' }],
    });
    const fin = await call(w, 'POST', '/v1/report-cards/finalize', w.admin, {
      semesterId: w.sem,
      classId: w.cls8,
      force: false,
    });
    expect(fin.statusCode, fin.body).toBe(200);
    expect(fin.json()).toEqual({ finalized: 2 });
    const frozenList = (
      await call(w, 'GET', `/v1/report-cards?semesterId=${w.sem}&classId=${w.cls8}`, w.admin)
    ).json() as { studentId: string; subjectsGraded: number }[];
    expect(frozenList.map((s) => s.subjectsGraded)).toEqual([1, 1]);
  });
});

describe('jumlah kueri tetap (tanpa N+1)', () => {
  it('memuat konteks kelas + narasi TP memakai jumlah kueri sama untuk 3 dan 24 siswa', async () => {
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
      const build = async (tag: string, n: number) => {
        const base = await makeSchool(`q-${tag}`);
        const [cls] = await db()
          .insert(classRoom)
          .values({ schoolId: base.sid, academicYearId: base.year, name: 'Q', level: '7' })
          .returning();
        const ids: string[] = [];
        for (let i = 0; i < n; i++) ids.push(await addStudent(base, `S${i}`, cls!.id));
        for (let t = 0; t < 4; t++) {
          const tpId = await addObjective(base, `Q${t}`, t);
          await addAssessment(
            base,
            cls!.id,
            `Q${t}`,
            Object.fromEntries(ids.map((id, i) => [id, 40 + ((i * 7 + t * 13) % 60)])),
            tpId,
          );
        }
        return { base, clsId: cls!.id, ids };
      };
      const measure = async (b: Awaited<ReturnType<typeof build>>) => {
        queries = 0;
        const out = await withTenant(counting.db, [b.base.sid], async (tx) => {
          const [sem] = await tx.select().from(semester).where(eq(semester.id, b.base.sem));
          const [cls] = await tx.select().from(classRoom).where(eq(classRoom.id, b.clsId));
          const c = await loadClassContext(tx, sem!, cls!);
          const extras = await loadReportExtras(tx, c);
          return extras.objectives.size;
        });
        expect(out).toBe(b.ids.length);
        return queries;
      };
      const small = await measure(await build('kecil', 3));
      const big = await measure(await build('besar', 24));
      expect(big).toBe(small);
      expect(big).toBeLessThanOrEqual(45);
    } finally {
      await counting.pool.end();
    }
  }, 120_000);
});
