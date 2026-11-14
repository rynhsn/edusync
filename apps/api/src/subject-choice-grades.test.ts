import { todayIn } from '@edusync/contracts';
import {
  academicYear,
  assessment,
  assignRoles,
  classRoom,
  createDb,
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
  user,
  withTenant,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { verifyFinalReports } from './grading-verify-lib';
import { loadClassContext, loadReportExtras } from './report-card-lib';
import { subjectRosterOf, takersForPairs } from './subject-roster-lib';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/**
 * Tahap 3B.2: pilihan mapel memengaruhi nilai, rapor, dan portal. Menguji (1) sekolah tanpa penanda identik di semua jalur
 * (termasuk setelah penanda dinyalakan lalu dimatikan), (2) roster per mapel di skor, rekap, matriks, TP, remedial, narasi,
 * hitungan total/filled, ujian, (3) rapor per murid (mapel, kelengkapan finalisasi, rata-rata, peringkat), (4) portal,
 * (5) pilihan berbeda antar semester, (6) roster historis lulusan, (7) penjaga report_final, verifikasi pembekuan, (8) multi-tenant,
 * RBAC, dan jumlah kueri yang tidak bergantung pada jumlah murid.
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const today = todayIn('Asia/Jakarta');
const day = (n: number) => addDays(today, n);

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let otherSchoolId = '';
let foundationId = '';
let adminCookie = '';
let teacherCookie = '';
let otherAdminCookie = '';
let aniPortal = '';
let ciciPortal = '';
const userIds: string[] = [];
const ids: Record<string, string> = {};

async function makeUser(label: string) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  return { id: res.user.id, email };
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

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
  sid: string = schoolId,
) =>
  app.inject({
    method,
    url,
    headers: {
      cookie,
      'x-school-id': sid,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

const tenantTx = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app.tenantDb, [schoolId], fn);
const descs = { descA: 'Sangat baik', descB: 'Baik', descC: 'Cukup', descD: 'Perlu bimbingan' };
const code = (res: { json: () => { error?: { code?: string } } }) => res.json().error?.code;

const scoreQuery = (subjectKey: string, classKey = 'xiA', semKey = 'ganjil') =>
  `semesterId=${ids[semKey]}&classId=${ids[classKey]}&subjectId=${ids[subjectKey]}`;
const classQuery = (classKey = 'xiA', semKey = 'ganjil') =>
  `semesterId=${ids[semKey]}&classId=${ids[classKey]}`;

const mark = (classKey: string, subjects: { subjectId: string; mode: 'selected' | 'all' }[]) =>
  call('PUT', `/v1/classes/${ids[classKey]}/subject-participation`, adminCookie, { subjects });
const choose = (classKey: string, body: object) =>
  call('PUT', `/v1/classes/${ids[classKey]}/subject-choices`, adminCookie, body);

const assessmentIds: Record<string, string> = {};
async function seedAssessment(
  key: string,
  classKey: string,
  subjectKey: string,
  semKey: string,
  values: Record<string, number>,
) {
  const db = app.platformDb;
  const [a] = await db
    .insert(assessment)
    .values({
      schoolId,
      semesterId: ids[semKey]!,
      classId: ids[classKey]!,
      subjectId: ids[subjectKey]!,
      componentId: ids.component!,
      title: `Ulangan ${key}`,
      date: day(-10),
      maxScore: 100,
    })
    .returning();
  assessmentIds[key] = a!.id;
  for (const [studentKey, value] of Object.entries(values)) {
    await db
      .insert(score)
      .values({ schoolId, assessmentId: a!.id, studentId: ids[studentKey]!, value, updatedBy: 'uji' });
  }
}

const names = (rows: { name: string }[]) => rows.map((r) => r.name);
const stripGenerated = <T extends { generatedAt?: unknown }>(doc: T) => {
  const { generatedAt: _generatedAt, ...rest } = doc;
  return rest;
};

/** Semua keluaran yang dipengaruhi pilihan mapel, untuk membandingkan sebelum/sesudah. */
async function observe() {
  const get = async (url: string, cookie = adminCookie) => {
    const res = await call('GET', url, cookie);
    expect(res.statusCode, url).toBe(200);
    return res.json();
  };
  // Urutan skor terbaru bergantung pada waktu simpan; yang dibandingkan isinya.
  const portal = async (studentId: string, cookie: string) => {
    const res = await get(`/v1/portal/children/${studentId}/grades`, cookie);
    res.recentScores.sort((a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title));
    return res;
  };
  const doc = await get(`/v1/report-cards/${ids.ani}?semesterId=${ids.ganjil}`);
  const docCici = await get(`/v1/report-cards/${ids.cici}?semesterId=${ids.ganjil}`);
  return {
    scoresFis: await get(`/v1/assessments/${assessmentIds.fis}/scores`),
    scoresMat: await get(`/v1/assessments/${assessmentIds.mat}/scores`),
    views: await get(`/v1/assessments?${classQuery()}`),
    recapFis: await get(`/v1/grading/recap?${scoreQuery('fis')}`),
    recapMat: await get(`/v1/grading/recap?${scoreQuery('mat')}`),
    matrix: await get(`/v1/grading/recap/class?${classQuery()}`),
    objective: await get(`/v1/grading/objective-achievement?${scoreQuery('fis')}`),
    candidates: await get(`/v1/grading/remedial-candidates?${scoreQuery('fis')}`),
    attempts: await get(`/v1/assessments/${assessmentIds.fis}/remedial-attempts`),
    narratives: await get(`/v1/report-cards/narratives?${scoreQuery('fis')}`),
    list: await get(`/v1/report-cards?${classQuery()}`),
    doc: stripGenerated(doc),
    docCici: stripGenerated(docCici),
    portalAni: await portal(ids.ani!, aniPortal),
    portalCici: await portal(ids.cici!, ciciPortal),
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
    .values({ name: 'Yayasan Nilai Pilihan', slug: `ynp-${run}` })
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
  const mkSchool = async (slug: string, name: string, modules: string[]) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug: `${slug}-${run}`, name })
      .returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of modules) {
      await db
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    return s!.id;
  };
  schoolId = await mkSchool('nlp', 'Sekolah Nilai Pilihan', ['grades', 'exams', 'parent_portal']);
  otherSchoolId = await mkSchool('nlp2', 'Sekolah Lain', ['grades']);

  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: 'Berjalan', startsOn: day(-100), endsOn: day(200), isActive: true })
    .returning();
  ids.year = y!.id;
  const mkSem = async (name: string, startsOn: string, endsOn: string, isActive = false) => {
    const [s] = await db
      .insert(semester)
      .values({ schoolId, academicYearId: ids.year!, name, startsOn, endsOn, isActive })
      .returning();
    return s!.id;
  };
  ids.ganjil = await mkSem('Ganjil', day(-100), day(20), true);
  ids.genap = await mkSem('Genap', day(21), day(200));

  const admin = await makeUser('admin-nilai-pilihan');
  const [am] = await db.insert(member).values({ userId: admin.id, schoolId }).returning();
  await assignRoles(db, am!.id, schoolId, ['school_admin']);
  adminCookie = await login(admin.email);
  const guru = await makeUser('guru-nilai-pilihan');
  const [gm] = await db.insert(member).values({ userId: guru.id, schoolId }).returning();
  await assignRoles(db, gm!.id, schoolId, ['teacher']);
  teacherCookie = await login(guru.email);

  const mkClass = async (name: string) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId, academicYearId: ids.year!, name, level: 'XI' })
      .returning();
    return c!.id;
  };
  ids.xiA = await mkClass('XI A');
  ids.xiB = await mkClass('XI B');
  ids.xiC = await mkClass('XI C');

  const mkSubject = async (subjectCode: string, name: string) => {
    const [s] = await db.insert(subject).values({ schoolId, code: subjectCode, name }).returning();
    return s!.id;
  };
  ids.mat = await mkSubject('MAT', 'Matematika');
  ids.fis = await mkSubject('FIS', 'Fisika');
  ids.kim = await mkSubject('KIM', 'Kimia');

  const mkStudent = async (
    key: string,
    name: string,
    classKey: string,
    status: 'active' | 'graduated' = 'active',
  ) => {
    const [st] = await db
      .insert(student)
      .values({ schoolId, name, gender: 'L', status, nis: `${key}-${run}` })
      .returning();
    ids[key] = st!.id;
    await db
      .insert(enrollment)
      .values({ schoolId, studentId: st!.id, classId: ids[classKey]!, academicYearId: ids.year! });
  };
  await mkStudent('ani', 'Ani', 'xiA');
  await mkStudent('budi', 'Budi', 'xiA');
  await mkStudent('cici', 'Cici', 'xiA');
  await mkStudent('dodi', 'Dodi', 'xiA');
  await mkStudent('eka', 'Eka', 'xiB');
  await mkStudent('fani', 'Fani', 'xiB');
  await mkStudent('lulus1', 'Lulus Satu', 'xiC', 'graduated');
  await mkStudent('lulus2', 'Lulus Dua', 'xiC', 'graduated');

  const [comp] = await db
    .insert(gradeComponent)
    .values({ schoolId, name: 'Ulangan', weight: 100, sort: 0 })
    .returning();
  ids.component = comp!.id;

  // XI A: MAT semua murid; FIS dan KIM kelak berpenanda. Skor FIS Cici adalah skor lama yang tersembunyi bila FIS berpenanda.
  await seedAssessment('mat', 'xiA', 'mat', 'ganjil', { ani: 80, budi: 70, cici: 60, dodi: 90 });
  await seedAssessment('fis', 'xiA', 'fis', 'ganjil', { ani: 85, budi: 60, cici: 50 });
  await seedAssessment('kim', 'xiA', 'kim', 'ganjil', { ani: 90 });
  await seedAssessment('fisGenap', 'xiA', 'fis', 'genap', { ani: 55, budi: 65 });
  // XI C (lulusan): roster historis per mapel.
  await seedAssessment('fisC', 'xiC', 'fis', 'ganjil', { lulus1: 88, lulus2: 40 });
  await seedAssessment('matC', 'xiC', 'mat', 'ganjil', { lulus1: 70, lulus2: 75 });

  // Akun portal murid (Ani dan Cici).
  const onboard = async (studentKey: string, label: string) => {
    const created = await call('POST', '/v1/portal/invites', adminCookie, {
      kind: 'student',
      studentId: ids[studentKey],
    });
    expect(created.statusCode, created.body).toBe(201);
    const email = `${label}-${run}@example.test`;
    const res = await app.inject({
      method: 'POST',
      url: `/v1/public/portal-invites/${created.json().token}/accept`,
      payload: { name: label, email, password },
    });
    expect(res.statusCode, res.body).toBe(201);
    const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    userIds.push(u!.id);
    return login(email);
  };
  aniPortal = await onboard('ani', 'ani-portal-nilai');
  ciciPortal = await onboard('cici', 'cici-portal-nilai');

  const otherAdmin = await makeUser('admin-lain-nilai-pilihan');
  const [oam] = await db
    .insert(member)
    .values({ userId: otherAdmin.id, schoolId: otherSchoolId })
    .returning();
  await assignRoles(db, oam!.id, otherSchoolId, ['school_admin']);
  otherAdminCookie = await login(otherAdmin.email);
}, 180_000);

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherSchoolId]) {
    for (const table of [
      'audit_log',
      'outbox',
      'portal_link',
      'portal_invite',
      'report_card_snapshot',
      'report_card',
      'report_setting',
      'score_remedial_attempt',
      'score',
      'assessment',
      'exam_answer',
      'exam_attempt',
      'exam_question',
      'exam',
      'question',
      'grade_component',
      'student_subject_enrollment',
      'class_subject_participation',
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
      await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
    await db.delete(school).where(eq(school.id, sid));
  }
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

let before: Awaited<ReturnType<typeof observe>>;

describe('sekolah tanpa penanda partisipasi: hasil identik', () => {
  it('semua murid tampil di semua mapel dan rapor memuat semua mapel', async () => {
    before = await observe();
    expect(names(before.scoresFis.students)).toEqual(['Ani', 'Budi', 'Cici', 'Dodi']);
    expect(names(before.recapFis.students)).toEqual(['Ani', 'Budi', 'Cici', 'Dodi']);
    expect(before.matrix.students.every((s: { grades: object[] }) => s.grades.length === 3)).toBe(true);
    expect(JSON.stringify(before.matrix)).not.toContain('notTaken');
    expect(before.doc.subjects.map((s: { name: string }) => s.name)).toEqual([
      'Fisika',
      'Kimia',
      'Matematika',
    ]);
    const fisView = before.views.find((v: { id: string }) => v.id === assessmentIds.fis);
    expect(fisView).toMatchObject({ total: 4, filled: 3 });
    expect(before.portalCici.subjects.map((s: { name: string }) => s.name)).toEqual([
      'Fisika',
      'Kimia',
      'Matematika',
    ]);
  });

  it('finalisasi menuntut semua mapel kelas untuk setiap murid (409 grades_incomplete)', async () => {
    const res = await call('POST', '/v1/report-cards/finalize', adminCookie, {
      semesterId: ids.ganjil,
      classId: ids.xiA,
    });
    expect([res.statusCode, code(res)]).toEqual([409, 'grades_incomplete']);
  });

  it('batch pengambil: tanpa penanda tidak memuat apa pun selain pembacaan penanda', async () => {
    await tenantTx(async (tx) => {
      const map = await takersForPairs(tx, [
        { classId: ids.xiA!, semesterId: ids.ganjil!, subjectId: ids.fis! },
      ]);
      expect(map.size).toBe(0);
    });
  });
});

describe('penanda dinyalakan, pilihan diisi', () => {
  it('menyiapkan penanda FIS dan KIM serta pilihan murid', async () => {
    expect(
      (
        await mark('xiA', [
          { subjectId: ids.fis!, mode: 'selected' },
          { subjectId: ids.kim!, mode: 'selected' },
        ])
      ).statusCode,
    ).toBe(200);
    const res = await choose('xiA', {
      set: [
        { studentId: ids.ani, subjectId: ids.fis },
        { studentId: ids.ani, subjectId: ids.kim },
        { studentId: ids.budi, subjectId: ids.fis },
      ],
    });
    expect(res.statusCode, res.body).toBe(200);
  });

  it('lembar skor dan rekap per mapel hanya memuat pengambil; mapel tanpa penanda tetap semua', async () => {
    const fis = (await call('GET', `/v1/assessments/${assessmentIds.fis}/scores`, adminCookie)).json();
    expect(names(fis.students)).toEqual(['Ani', 'Budi']);
    const mat = (await call('GET', `/v1/assessments/${assessmentIds.mat}/scores`, adminCookie)).json();
    expect(names(mat.students)).toEqual(['Ani', 'Budi', 'Cici', 'Dodi']);
    const kim = (await call('GET', `/v1/assessments/${assessmentIds.kim}/scores`, adminCookie)).json();
    expect(names(kim.students)).toEqual(['Ani']);

    const recapFis = (await call('GET', `/v1/grading/recap?${scoreQuery('fis')}`, adminCookie)).json();
    expect(names(recapFis.students)).toEqual(['Ani', 'Budi']);
    expect(recapFis.stats).toMatchObject({ filled: 2, belowKkmCount: 1 });
    const recapMat = (await call('GET', `/v1/grading/recap?${scoreQuery('mat')}`, adminCookie)).json();
    expect(names(recapMat.students)).toEqual(['Ani', 'Budi', 'Cici', 'Dodi']);
  });

  it('hitungan total/filled penilaian hanya atas pengambil (skor lama murid lain tidak dihitung)', async () => {
    const views = (await call('GET', `/v1/assessments?${classQuery()}`, adminCookie)).json() as {
      id: string;
      total: number;
      filled: number;
    }[];
    const of = (key: string) => views.find((v) => v.id === assessmentIds[key]);
    expect(of('fis')).toMatchObject({ total: 2, filled: 2 });
    expect(of('kim')).toMatchObject({ total: 1, filled: 1 });
    expect(of('mat')).toMatchObject({ total: 4, filled: 4 });
  });

  it('menyimpan skor: pengambil boleh; bukan pengambil 400 student_not_taking_subject; bukan anggota tetap invalid_reference', async () => {
    const notTaking = await call('PUT', `/v1/assessments/${assessmentIds.fis}/scores`, adminCookie, {
      records: [{ studentId: ids.cici, value: 70 }],
    });
    expect([notTaking.statusCode, code(notTaking)]).toEqual([400, 'student_not_taking_subject']);
    const mixed = await call('PUT', `/v1/assessments/${assessmentIds.fis}/scores`, adminCookie, {
      records: [
        { studentId: ids.ani, value: 85 },
        { studentId: ids.dodi, value: 70 },
      ],
    });
    expect(code(mixed)).toBe('student_not_taking_subject');
    const stranger = await call('PUT', `/v1/assessments/${assessmentIds.fis}/scores`, adminCookie, {
      records: [{ studentId: ids.eka, value: 70 }],
    });
    expect([stranger.statusCode, code(stranger)]).toEqual([400, 'invalid_reference']);
    const ok = await call('PUT', `/v1/assessments/${assessmentIds.fis}/scores`, adminCookie, {
      records: [{ studentId: ids.ani, value: 85 }],
    });
    expect(ok.statusCode).toBe(200);
    // Mapel tanpa penanda: murid mana pun di rombel tetap boleh dinilai.
    const mat = await call('PUT', `/v1/assessments/${assessmentIds.mat}/scores`, adminCookie, {
      records: [{ studentId: ids.cici, value: 60 }],
    });
    expect(mat.statusCode).toBe(200);
    // Skor lama Cici tidak dihapus.
    const kept = await tenantTx((tx) =>
      tx
        .select({ value: score.value })
        .from(score)
        .where(sql`${score.assessmentId} = ${assessmentIds.fis} and ${score.studentId} = ${ids.cici}`),
    );
    expect(kept[0]?.value).toBe(50);
  });

  it('matriks kelas menandai sel mapel yang tidak diambil dengan notTaken dan tanpa nilai', async () => {
    const m = (await call('GET', `/v1/grading/recap/class?${classQuery()}`, adminCookie)).json();
    const cellOf = (studentName: string, subjectKey: string) =>
      m.students
        .find((s: { name: string }) => s.name === studentName)
        .grades.find((g: { subjectId: string }) => g.subjectId === ids[subjectKey]);
    expect(cellOf('Cici', 'fis')).toEqual({
      subjectId: ids.fis,
      final: null,
      predicate: null,
      notTaken: true,
    });
    expect(cellOf('Dodi', 'kim')).toMatchObject({ final: null, notTaken: true });
    expect(cellOf('Budi', 'kim')).toMatchObject({ notTaken: true });
    expect(cellOf('Ani', 'fis')).toMatchObject({ final: 85 });
    expect(cellOf('Ani', 'fis')).not.toHaveProperty('notTaken');
    expect(cellOf('Cici', 'mat')).toMatchObject({ final: 60 });
    expect(cellOf('Cici', 'mat')).not.toHaveProperty('notTaken');
  });

  it('ketercapaian TP, remedial, dan narasi hanya memuat pengambil', async () => {
    const tp = (
      await call('GET', `/v1/grading/objective-achievement?${scoreQuery('fis')}`, adminCookie)
    ).json();
    expect(names(tp.students)).toEqual(['Ani', 'Budi']);
    const tpPut = await call('PUT', '/v1/grading/objective-achievement', adminCookie, {
      semesterId: ids.ganjil,
      classId: ids.xiA,
      subjectId: ids.fis,
      records: [{ studentId: ids.cici, objectiveId: crypto.randomUUID(), achieved: true }],
    });
    expect([tpPut.statusCode, code(tpPut)]).toEqual([400, 'student_not_taking_subject']);

    // KKM 75: Budi (60) perlu remedial; Cici (skor lama 50) tersembunyi.
    const cand = (
      await call('GET', `/v1/grading/remedial-candidates?${scoreQuery('fis')}`, adminCookie)
    ).json();
    expect(names(cand.students)).toEqual(['Budi']);
    const sheet = (
      await call('GET', `/v1/assessments/${assessmentIds.fis}/remedial-attempts`, adminCookie)
    ).json();
    expect(names(sheet.students)).toEqual(['Ani', 'Budi']);
    const attempt = await call(
      'POST',
      `/v1/assessments/${assessmentIds.fis}/remedial-attempts`,
      adminCookie,
      {
        records: [{ studentId: ids.cici, value: 80 }],
      },
    );
    expect([attempt.statusCode, code(attempt)]).toEqual([400, 'student_not_taking_subject']);
    const okAttempt = await call(
      'POST',
      `/v1/assessments/${assessmentIds.fis}/remedial-attempts`,
      adminCookie,
      {
        records: [{ studentId: ids.budi, value: 80 }],
      },
    );
    expect(okAttempt.statusCode, okAttempt.body).toBe(201);
    // Hapus percobaan agar nilai kembali seperti semula untuk pemeriksaan berikutnya (kebijakan bawaan hanya mencatat).
    await app.platformDb.execute(sql`delete from score_remedial_attempt where school_id = ${schoolId}`);

    const narr = (await call('GET', `/v1/report-cards/narratives?${scoreQuery('fis')}`, adminCookie)).json();
    expect(names(narr.students)).toEqual(['Ani', 'Budi']);
    const narrPut = await call('PUT', '/v1/report-cards/narratives', adminCookie, {
      semesterId: ids.ganjil,
      classId: ids.xiA,
      subjectId: ids.fis,
      items: [{ studentId: ids.cici, text: 'Tidak boleh' }],
    });
    expect([narrPut.statusCode, code(narrPut)]).toEqual([400, 'student_not_taking_subject']);
    const narrMat = (
      await call('GET', `/v1/report-cards/narratives?${scoreQuery('mat')}`, adminCookie)
    ).json();
    expect(names(narrMat.students)).toEqual(['Ani', 'Budi', 'Cici', 'Dodi']);
  });
});

describe('rapor per murid', () => {
  it('daftar rapor: jumlah mapel dan kelengkapan per murid hanya atas mapel yang diambil', async () => {
    const rows = (await call('GET', `/v1/report-cards?${classQuery()}`, adminCookie)).json() as {
      name: string;
      subjectsGraded: number;
      subjectsTotal: number;
      average: number | null;
    }[];
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(by.Ani).toMatchObject({ subjectsTotal: 3, subjectsGraded: 3, average: 85 });
    expect(by.Budi).toMatchObject({ subjectsTotal: 2, subjectsGraded: 2, average: 65 });
    expect(by.Cici).toMatchObject({ subjectsTotal: 1, subjectsGraded: 1, average: 60 });
    expect(by.Dodi).toMatchObject({ subjectsTotal: 1, subjectsGraded: 1, average: 90 });
  });

  it('dokumen rapor: hanya mapel yang diambil, bentuk dokumen tidak berubah', async () => {
    const doc = async (key: string) =>
      (await call('GET', `/v1/report-cards/${ids[key]}?semesterId=${ids.ganjil}`, adminCookie)).json();
    const subjectNames = (d: { subjects: { name: string }[] }) => d.subjects.map((s) => s.name);
    expect(subjectNames(await doc('ani'))).toEqual(['Fisika', 'Kimia', 'Matematika']);
    expect(subjectNames(await doc('budi'))).toEqual(['Fisika', 'Matematika']);
    expect(subjectNames(await doc('cici'))).toEqual(['Matematika']);
    expect(subjectNames(await doc('dodi'))).toEqual(['Matematika']);
    const cici = await doc('cici');
    expect(Object.keys(cici.subjects[0]).sort()).toEqual(Object.keys((await doc('ani')).subjects[0]).sort());
  });

  it('peringkat memakai rata-rata mapel yang diambil masing-masing', async () => {
    const set = await call('PUT', '/v1/report-cards/settings', adminCookie, { ...descs, showRank: true });
    expect(set.statusCode, set.body).toBe(200);
    const rank = async (key: string) =>
      (await call('GET', `/v1/report-cards/${ids[key]}?semesterId=${ids.ganjil}`, adminCookie)).json().rank;
    // Dodi 90 (MAT), Ani 85, Budi 65, Cici 60.
    expect(await rank('dodi')).toEqual({ position: 1, of: 4 });
    expect(await rank('ani')).toEqual({ position: 2, of: 4 });
    expect(await rank('budi')).toEqual({ position: 3, of: 4 });
    expect(await rank('cici')).toEqual({ position: 4, of: 4 });
    // Kembali ke pengaturan bawaan (tanpa baris) supaya pemeriksaan berikutnya membandingkan dengan keadaan awal.
    await app.platformDb.execute(sql`delete from report_setting where school_id = ${schoolId}`);
  });

  it('mematikan penanda mengembalikan semua keluaran persis seperti sebelum dinyalakan; menyalakan lagi menyaring', async () => {
    const off = await mark('xiA', [
      { subjectId: ids.fis!, mode: 'all' },
      { subjectId: ids.kim!, mode: 'all' },
    ]);
    expect(off.statusCode, off.body).toBe(200);
    expect(await observe()).toEqual(before);
    const on = await mark('xiA', [
      { subjectId: ids.fis!, mode: 'selected' },
      { subjectId: ids.kim!, mode: 'selected' },
    ]);
    expect(on.statusCode, on.body).toBe(200);
    const recap = (await call('GET', `/v1/grading/recap?${scoreQuery('fis')}`, adminCookie)).json();
    expect(names(recap.students)).toEqual(['Ani', 'Budi']);
  });
});

describe('portal', () => {
  it('anak hanya melihat mapel yang ia ambil, termasuk skor terbaru', async () => {
    const ani = (await call('GET', `/v1/portal/children/${ids.ani}/grades`, aniPortal)).json();
    expect(names(ani.subjects)).toEqual(['Fisika', 'Kimia', 'Matematika']);
    expect(ani.average).toBe(85);
    const cici = (await call('GET', `/v1/portal/children/${ids.cici}/grades`, ciciPortal)).json();
    expect(names(cici.subjects)).toEqual(['Matematika']);
    expect(cici.average).toBe(60);
    expect(cici.recentScores.map((s: { subject: string }) => s.subject)).toEqual(['Matematika']);
    expect(ani.recentScores.map((s: { subject: string }) => s.subject).sort()).toContain('Fisika');
    // Bentuk respons tidak berubah: tidak ada kunci baru.
    expect(Object.keys(cici).sort()).toEqual(Object.keys(before.portalCici).sort());
  });
});

describe('pilihan berbeda antar semester', () => {
  it('changeFrom pada semester genap hanya memengaruhi genap', async () => {
    // Ani dan Budi mengambil FIS setahun (Budi) / setahun lalu berhenti mulai genap (Ani).
    const res = await choose('xiA', {
      changeFrom: [{ studentId: ids.ani, subjectId: ids.fis, fromSemesterId: ids.genap, taking: false }],
    });
    expect(res.statusCode, res.body).toBe(200);
    const ganjil = (await call('GET', `/v1/grading/recap?${scoreQuery('fis')}`, adminCookie)).json();
    expect(names(ganjil.students)).toEqual(['Ani', 'Budi']);
    const genap = (
      await call('GET', `/v1/grading/recap?${scoreQuery('fis', 'xiA', 'genap')}`, adminCookie)
    ).json();
    expect(names(genap.students)).toEqual(['Budi']);
    const scoresGenap = (
      await call('GET', `/v1/assessments/${assessmentIds.fisGenap}/scores`, adminCookie)
    ).json();
    expect(names(scoresGenap.students)).toEqual(['Budi']);
    const putGenap = await call('PUT', `/v1/assessments/${assessmentIds.fisGenap}/scores`, adminCookie, {
      records: [{ studentId: ids.ani, value: 50 }],
    });
    expect(code(putGenap)).toBe('student_not_taking_subject');
    // Rapor genap: Ani tidak punya baris Fisika, Budi punya.
    const ani = (
      await call('GET', `/v1/report-cards/${ids.ani}?semesterId=${ids.genap}`, adminCookie)
    ).json();
    const budi = (
      await call('GET', `/v1/report-cards/${ids.budi}?semesterId=${ids.genap}`, adminCookie)
    ).json();
    expect(ani.subjects.map((s: { name: string }) => s.name)).toEqual([]);
    expect(budi.subjects.map((s: { name: string }) => s.name)).toEqual(['Fisika']);
    // Pada semester ganjil Ani tetap mengambil Fisika.
    const aniGanjil = (
      await call('GET', `/v1/report-cards/${ids.ani}?semesterId=${ids.ganjil}`, adminCookie)
    ).json();
    expect(aniGanjil.subjects.map((s: { name: string }) => s.name)).toContain('Fisika');
    // Kembalikan.
    const back = await choose('xiA', {
      changeFrom: [{ studentId: ids.ani, subjectId: ids.fis, fromSemesterId: ids.genap, taking: true }],
    });
    expect(back.statusCode).toBe(200);
  });
});

describe('roster historis (lulusan) per mapel', () => {
  it('rekap dan skor memuat lulusan hanya untuk mapel yang diambilnya', async () => {
    expect((await mark('xiC', [{ subjectId: ids.fis!, mode: 'selected' }])).statusCode).toBe(200);
    // Lulusan tidak aktif sehingga pilihan ditulis langsung; kolom `source` mengikuti CHECK.
    await app.platformDb.execute(sql`
      insert into student_subject_enrollment (school_id, student_id, subject_id, academic_year_id, source, created_by)
      values (${schoolId}, ${ids.lulus1}, ${ids.fis}, ${ids.year}, 'choice', 'uji')`);
    const fis = (await call('GET', `/v1/grading/recap?${scoreQuery('fis', 'xiC')}`, adminCookie)).json();
    expect(names(fis.students)).toEqual(['Lulus Satu']);
    const mat = (await call('GET', `/v1/grading/recap?${scoreQuery('mat', 'xiC')}`, adminCookie)).json();
    expect(names(mat.students)).toEqual(['Lulus Dua', 'Lulus Satu']);
    const scoresFis = (await call('GET', `/v1/assessments/${assessmentIds.fisC}/scores`, adminCookie)).json();
    expect(names(scoresFis.students)).toEqual(['Lulus Satu']);
    await tenantTx(async (tx) => {
      const r = await subjectRosterOf(tx, ids.xiC!, ids.fis!, ids.ganjil!, { historical: true });
      expect(names(r.rows)).toEqual(['Lulus Satu']);
    });
    const list = (await call('GET', `/v1/report-cards?${classQuery('xiC')}`, adminCookie)).json() as {
      name: string;
      subjectsTotal: number;
    }[];
    expect(Object.fromEntries(list.map((r) => [r.name, r.subjectsTotal]))).toEqual({
      'Lulus Satu': 2,
      'Lulus Dua': 1,
    });
  });
});

describe('ujian: dorong nilai', () => {
  it('hanya murid yang mengambil mapel ujian yang diberi skor; sisanya dilewati dan dihitung', async () => {
    expect((await mark('xiB', [{ subjectId: ids.fis!, mode: 'selected' }])).statusCode).toBe(200);
    expect((await choose('xiB', { set: [{ studentId: ids.eka, subjectId: ids.fis }] })).statusCode).toBe(200);
    const ex = (
      await call('POST', '/v1/exams', adminCookie, {
        title: 'Uji Fisika',
        semesterId: ids.ganjil,
        subjectId: ids.fis,
        classIds: [ids.xiB],
        mode: 'paper',
        examDate: day(-5),
      })
    ).json();
    const q = (
      await call('POST', '/v1/exam/questions', adminCookie, {
        subjectId: ids.fis,
        type: 'mcq',
        body: 'Satu',
        options: [
          { key: 'A', text: 'satu' },
          { key: 'B', text: 'dua' },
        ],
        answer: 'B',
        points: 10,
      })
    ).json();
    const full = (
      await call('POST', `/v1/exams/${ex.id}/questions`, adminCookie, { questionIds: [q.id] })
    ).json();
    const questionId = full.questions[0].id as string;
    const save = await call('PUT', `/v1/exams/${ex.id}/scoresheet`, adminCookie, {
      records: [
        { studentId: ids.eka, answers: [{ questionId, answer: 'B' }] },
        { studentId: ids.fani, answers: [{ questionId, answer: 'B' }] },
      ],
    });
    expect(save.statusCode, save.body).toBe(200);
    const push = await call('POST', `/v1/exams/${ex.id}/grades`, adminCookie, {
      componentId: ids.component,
    });
    expect(push.statusCode, push.body).toBe(200);
    expect(push.json()).toEqual({ assessments: 1, scores: 1, skippedNotTaking: 1 });
    const rows = await app.platformDb
      .select({ studentId: score.studentId })
      .from(score)
      .innerJoin(assessment, eq(assessment.id, score.assessmentId))
      .where(eq(assessment.examId, ex.id));
    expect(rows.map((r) => r.studentId)).toEqual([ids.eka]);
  });
});

describe('pembekuan, penjaga report_final, dan konsistensi lintas layar', () => {
  it('menjadikan Dodi/Cici lengkap tanpa force: finalisasi tidak menuntut mapel yang tidak diambil', async () => {
    const res = await call('POST', '/v1/report-cards/finalize', adminCookie, {
      semesterId: ids.ganjil,
      classId: ids.xiA,
    });
    expect(res.statusCode, res.body).toBe(200);
  });

  it('dokumen final dari snapshot: mapel per murid tetap, bentuk sama', async () => {
    const doc = async (key: string) =>
      (await call('GET', `/v1/report-cards/${ids[key]}?semesterId=${ids.ganjil}`, adminCookie)).json();
    const cici = await doc('cici');
    expect(cici.status).toBe('final');
    expect(cici.subjects.map((s: { name: string }) => s.name)).toEqual(['Matematika']);
    expect((await doc('ani')).subjects.map((s: { name: string }) => s.name)).toEqual([
      'Fisika',
      'Kimia',
      'Matematika',
    ]);
    const list = (await call('GET', `/v1/report-cards?${classQuery()}`, adminCookie)).json() as {
      name: string;
      status: string;
      subjectsTotal: number;
    }[];
    expect(list.every((r) => r.status === 'final')).toBe(true);
    expect(Object.fromEntries(list.map((r) => [r.name, r.subjectsTotal]))).toEqual({
      Ani: 3,
      Budi: 2,
      Cici: 1,
      Dodi: 1,
    });
  });

  it('rekap, matriks, dan rapor satu murid sepakat (konsistensi rekap/matriks/rapor/portal)', async () => {
    const matrix = (await call('GET', `/v1/grading/recap/class?${classQuery()}`, adminCookie)).json();
    const recapFis = (await call('GET', `/v1/grading/recap?${scoreQuery('fis')}`, adminCookie)).json();
    const budiCell = matrix.students
      .find((s: { name: string }) => s.name === 'Budi')
      .grades.find((g: { subjectId: string }) => g.subjectId === ids.fis);
    const budiRecap = recapFis.students.find((s: { name: string }) => s.name === 'Budi');
    expect(budiCell.final).toBe(budiRecap.final);
    const docBudi = (
      await call('GET', `/v1/report-cards/${ids.budi}?semesterId=${ids.ganjil}`, adminCookie)
    ).json();
    expect(docBudi.subjects.find((s: { name: string }) => s.name === 'Fisika').final).toBe(budiRecap.final);
    const portalBudi = await tenantTx(async (tx) => {
      const { gradesFor } = await import('./portal-lib');
      const [sem] = await tx.select().from(semester).where(eq(semester.id, ids.ganjil!));
      return gradesFor(tx, ids.budi!, sem!);
    });
    expect(portalBudi.subjects.map((s) => [s.name, s.final])).toEqual([
      ['Fisika', budiRecap.final],
      ['Matematika', 70],
    ]);
  });

  it('verifikasi pembekuan memakai roster yang sama: tanpa selisih', async () => {
    const results = await tenantTx((tx) => verifyFinalReports(tx));
    const mine = results.filter((r) => r.classId === ids.xiA);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.diffs).toEqual([]);
  });

  it('penjaga report_final tetap berlaku: pilihan murid dan penanda tidak bisa diubah setelah final', async () => {
    const choice = await choose('xiA', { set: [{ studentId: ids.dodi, subjectId: ids.fis }] });
    expect([choice.statusCode, code(choice)]).toEqual([409, 'report_final']);
    const marker = await mark('xiA', [{ subjectId: ids.fis!, mode: 'all' }]);
    expect([marker.statusCode, code(marker)]).toEqual([409, 'report_final']);
    const scorePut = await call('PUT', `/v1/assessments/${assessmentIds.fis}/scores`, adminCookie, {
      records: [{ studentId: ids.ani, value: 10 }],
    });
    expect([scorePut.statusCode, code(scorePut)]).toEqual([409, 'report_final']);
  });
});

describe('mematikan penanda mengembalikan perilaku semula (kelas lain)', () => {
  it('kelas tanpa final: hasil setelah penanda dimatikan identik dengan sebelum dinyalakan', async () => {
    // XI C belum final: bandingkan rekap historis sebelum/sesudah.
    const read = async () => ({
      fis: (await call('GET', `/v1/grading/recap?${scoreQuery('fis', 'xiC')}`, adminCookie)).json(),
      list: (await call('GET', `/v1/report-cards?${classQuery('xiC')}`, adminCookie)).json(),
    });
    const marked = await read();
    expect(names(marked.fis.students)).toEqual(['Lulus Satu']);
    expect((await mark('xiC', [{ subjectId: ids.fis!, mode: 'all' }])).statusCode).toBe(200);
    const off = await read();
    expect(names(off.fis.students)).toEqual(['Lulus Dua', 'Lulus Satu']);
    expect(off.list.map((r: { subjectsTotal: number }) => r.subjectsTotal)).toEqual([2, 2]);
  });
});

describe('multi-tenant dan RBAC', () => {
  it('sekolah lain tidak melihat rombel kita dan pengambil tidak bocor lintas tenant', async () => {
    const res = await call(
      'GET',
      `/v1/grading/recap?${scoreQuery('fis')}`,
      otherAdminCookie,
      undefined,
      otherSchoolId,
    );
    expect(res.statusCode).toBe(400);
    expect(code(res)).toBe('invalid_reference');
    await withTenant(app.tenantDb, [otherSchoolId], async (tx) => {
      const map = await takersForPairs(tx, [
        { classId: ids.xiA!, semesterId: ids.ganjil!, subjectId: ids.fis! },
      ]);
      expect(map.size).toBe(0);
    });
  });

  it('guru tanpa penugasan tetap 403 di jalur skor dan rekap', async () => {
    expect((await call('GET', `/v1/grading/recap?${scoreQuery('fis')}`, teacherCookie)).statusCode).toBe(403);
    expect(
      (
        await call('PUT', `/v1/assessments/${assessmentIds.mat}/scores`, teacherCookie, {
          records: [{ studentId: ids.ani, value: 80 }],
        })
      ).statusCode,
    ).toBe(403);
  });
});

describe('jumlah kueri tidak bergantung pada jumlah murid', () => {
  it('memuat konteks rapor kelas memakai kueri sama untuk 3 dan 24 murid, dan paling banyak 1 lebih banyak dari kelas tanpa penanda', async () => {
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
      const db = app.platformDb;
      const build = async (tag: string, n: number, withMarker: boolean) => {
        const [cls] = await db
          .insert(classRoom)
          .values({ schoolId, academicYearId: ids.year!, name: `Q-${tag}`, level: 'XII' })
          .returning();
        const [a] = await db
          .insert(assessment)
          .values({
            schoolId,
            semesterId: ids.ganjil!,
            classId: cls!.id,
            subjectId: ids.fis!,
            componentId: ids.component!,
            title: `Q-${tag}`,
            date: day(-5),
            maxScore: 100,
          })
          .returning();
        for (let i = 0; i < n; i++) {
          const [st] = await db
            .insert(student)
            .values({ schoolId, name: `Q${tag}${i}`, gender: 'L', nis: `q${tag}${i}-${run}` })
            .returning();
          await db
            .insert(enrollment)
            .values({ schoolId, studentId: st!.id, classId: cls!.id, academicYearId: ids.year! });
          await db
            .insert(score)
            .values({ schoolId, assessmentId: a!.id, studentId: st!.id, value: 50 + i, updatedBy: 'uji' });
          if (withMarker && i % 2 === 0) {
            await db.execute(sql`
              insert into student_subject_enrollment (school_id, student_id, subject_id, academic_year_id, source, created_by)
              values (${schoolId}, ${st!.id}, ${ids.fis}, ${ids.year}, 'choice', 'uji')`);
          }
        }
        if (withMarker) {
          await db.execute(sql`
            insert into class_subject_participation (school_id, class_id, subject_id, mode, updated_by)
            values (${schoolId}, ${cls!.id}, ${ids.fis}, 'selected', 'uji')`);
        }
        return cls!.id;
      };
      const measure = async (classId: string) => {
        queries = 0;
        await withTenant(counting.db, [schoolId], async (tx) => {
          const [sem] = await tx.select().from(semester).where(eq(semester.id, ids.ganjil!));
          const [cls] = await tx.select().from(classRoom).where(eq(classRoom.id, classId));
          const c = await loadClassContext(tx, sem!, cls!);
          await loadReportExtras(tx, c);
        });
        return queries;
      };
      const small = await measure(await build('kecil', 3, true));
      const big = await measure(await build('besar', 24, true));
      const plain = await measure(await build('polos', 24, false));
      expect(big).toBe(small);
      expect(big - plain).toBeLessThanOrEqual(1);
    } finally {
      await counting.pool.end();
    }
  }, 120_000);
});
