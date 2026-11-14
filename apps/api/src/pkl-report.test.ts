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

/**
 * Fase 5, tahap 5.3 dan 5.4: periode PKL ditautkan ke semester dan mapel PKL, bobot sekolah:industri, nomor sertifikat, kunci final
 * (409 report_final, termasuk lewat tautan pembimbing industri), dan nilai PKL di rapor, leger, dan ekspor lewat snapshot.
 * Periode tanpa tautan menghasilkan dokumen rapor yang identik dengan sebelumnya.
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let smk = '';
let smkB = '';
let yearId = '';
let semId = '';
let sem2Id = '';
let classId = '';
let pklSubject = '';
let mathSubject = '';
let teacherId = '';
let partnerA = '';
let partnerB = '';
let cookieAdmin = '';
let cookieSup = '';
let cookieAdminB = '';
const stu = { ani: '', budi: '', citra: '', dina: '' };
const userIds: string[] = [];
const schoolIds: string[] = [];
const db = () => app.platformDb;

async function join(label: string, schoolId: string, roles: string[]) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  const [m] = await db().insert(member).values({ userId: res.user.id, schoolId }).returning();
  await assignRoles(db(), m!.id, schoolId, roles);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return { cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join('; '), memberId: m!.id };
}
const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  schoolId: string,
  payload?: object,
) =>
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
const pub = (method: 'GET' | 'PUT', url: string, payload?: object) =>
  app.inject({
    method,
    url,
    ...(payload ? { headers: { 'content-type': 'application/json' }, payload } : {}),
  });
const code = (res: { json: () => { error: { code: string } } }) => res.json().error.code;
const A = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  call(method, url, cookieAdmin, smk, payload);

const getDoc = async (studentId = stu.ani, semesterId = semId) => {
  const r = await A('GET', `/v1/report-cards/${studentId}?semesterId=${semesterId}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
};
const strip = (d: Record<string, unknown>) => {
  const { generatedAt: _g, ...rest } = d;
  return rest;
};

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan PKL Rapor', slug: `ypr-${run}` })
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
  const mk = async (slug: string) => {
    const [s] = await db()
      .insert(school)
      .values({ foundationId, slug: `${slug}-${run}`, name: `Sekolah ${slug}`, educationProfile: 'smk' })
      .returning();
    schoolIds.push(s!.id);
    await seedSchoolRoles(db(), s!.id);
    for (const moduleKey of ['grades', 'internship']) {
      await db().insert(entitlement).values({
        schoolId: s!.id,
        moduleKey,
        subscriptionId: sub!.id,
        validUntil: sub!.currentPeriodEnd,
      });
    }
    return s!.id;
  };
  smk = await mk('pkr-a');
  smkB = await mk('pkr-b');

  const [y] = await db()
    .insert(academicYear)
    .values({
      schoolId: smk,
      name: '2026/2027',
      startsOn: '2026-07-13',
      endsOn: '2027-06-30',
      isActive: true,
    })
    .returning();
  yearId = y!.id;
  const [s1] = await db()
    .insert(semester)
    .values({
      schoolId: smk,
      academicYearId: yearId,
      name: 'Ganjil',
      startsOn: '2026-07-13',
      endsOn: '2026-12-20',
      isActive: true,
    })
    .returning();
  semId = s1!.id;
  const [s2] = await db()
    .insert(semester)
    .values({
      schoolId: smk,
      academicYearId: yearId,
      name: 'Genap',
      startsOn: '2027-01-04',
      endsOn: '2027-06-20',
    })
    .returning();
  sem2Id = s2!.id;
  const [c] = await db()
    .insert(classRoom)
    .values({ schoolId: smk, academicYearId: yearId, name: 'XII RPL 1', level: 'XII' })
    .returning();
  classId = c!.id;
  for (const [key, name] of [
    ['ani', 'Ani'],
    ['budi', 'Budi'],
    ['citra', 'Citra'],
    ['dina', 'Dina'],
  ] as const) {
    const [s] = await db().insert(student).values({ schoolId: smk, name, gender: 'P' }).returning();
    stu[key] = s!.id;
    await db()
      .insert(enrollment)
      .values({ schoolId: smk, studentId: s!.id, classId, academicYearId: yearId });
  }
  const [comp] = await db()
    .insert(gradeComponent)
    .values({ schoolId: smk, name: 'Tugas', weight: 100, sort: 0 })
    .returning();
  const [math] = await db()
    .insert(subject)
    .values({ schoolId: smk, code: 'MTK', name: 'Matematika', subjectGroup: 'general' })
    .returning();
  mathSubject = math!.id;
  const [pkl] = await db()
    .insert(subject)
    .values({
      schoolId: smk,
      code: 'PKL',
      name: 'Praktik Kerja Lapangan',
      subjectGroup: 'internship',
      kind: 'internship',
    })
    .returning();
  pklSubject = pkl!.id;
  const [a] = await db()
    .insert(assessment)
    .values({
      schoolId: smk,
      semesterId: semId,
      classId,
      subjectId: mathSubject,
      componentId: comp!.id,
      title: 'Tugas',
      date: '2026-08-01',
    })
    .returning();
  for (const [i, id] of Object.values(stu).entries()) {
    await db()
      .insert(score)
      .values({ schoolId: smk, assessmentId: a!.id, studentId: id, value: 80 + i, updatedBy: 'uji' });
  }
  const adm = await join('admin', smk, ['school_admin']);
  cookieAdmin = adm.cookie;
  const sup = await join('pembimbing', smk, ['teacher']);
  cookieSup = sup.cookie;
  const [t] = await db()
    .insert(teacher)
    .values({ schoolId: smk, name: 'Pak Pembimbing', memberId: sup.memberId })
    .returning();
  teacherId = t!.id;
  cookieAdminB = (await join('adminb', smkB, ['school_admin'])).cookie;

  const pa = await A('POST', '/v1/pkl/partners', { name: 'PT Maju Jaya' });
  partnerA = pa.json().id;
  const pb = await A('POST', '/v1/pkl/partners', { name: 'CV Karya Bersama' });
  partnerB = pb.json().id;
  await A('POST', '/v1/pkl/aspects/defaults');
});

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

const ids = { p1: '', p2: '', pa: '', pb: '', pc: '', token: '' };
let baseline: Record<string, unknown> = {};

const scoreAll = async (placementId: string, school_: number, industry?: number) => {
  const aspects = (await A('GET', '/v1/pkl/aspects')).json() as { id: string }[];
  const r = await A('PUT', `/v1/pkl/placements/${placementId}/scores`, {
    records: aspects.map((x) => ({ aspectId: x.id, value: school_ })),
  });
  expect(r.statusCode, r.body).toBe(200);
  if (industry !== undefined) {
    const tok = (await A('POST', `/v1/pkl/placements/${placementId}/access-link`)).json().token as string;
    const r2 = await pub('PUT', `/v1/public/pkl/${tok}/scores`, {
      records: aspects.map((x) => ({ aspectId: x.id, value: industry })),
    });
    expect(r2.statusCode, r2.body).toBe(200);
    return tok;
  }
  return null;
};

describe('periode tanpa tautan: perilaku lama persis', () => {
  it('periode, penempatan, dan nilai PKL tanpa tautan tidak mengubah dokumen rapor', async () => {
    baseline = strip(await getDoc());
    expect(baseline).not.toHaveProperty('internship');
    expect(baseline).not.toHaveProperty('schemaVersion');
    const p = await A('POST', '/v1/pkl/periods', {
      academicYearId: yearId,
      name: 'PKL lama',
      startsOn: '2026-07-20',
      endsOn: '2026-12-18',
    });
    expect(p.statusCode, p.body).toBe(201);
    expect(p.json()).toMatchObject({ semesterId: null, subjectId: null });
    ids.p1 = p.json().id;
    const pl = await A('POST', '/v1/pkl/placements', {
      periodId: ids.p1,
      partnerId: partnerA,
      studentIds: [stu.ani],
    });
    expect(pl.statusCode, pl.body).toBe(201);
    await scoreAll(pl.json().created[0].id, 88, 92);
    expect(strip(await getDoc())).toEqual(baseline);
    const sheet = await A('GET', `/v1/pkl/placements/${pl.json().created[0].id}/scores`);
    expect(sheet.json()).toMatchObject({ weights: null, reportLinked: false, certificateNo: null });
    expect(sheet.json().result.final).toBe(90);
    const settings = await A('GET', '/v1/vocational/settings/pkl');
    expect(settings.json()).toMatchObject({
      schoolWeight: null,
      industryWeight: null,
      certificatePattern: null,
      defaultCertificatePattern: 'PKL/{seq}/{code}/{year}',
    });
  });
});

describe('tautan periode (5.3): validasi', () => {
  const base = { academicYearId: '', name: 'PKL tertaut', startsOn: '2026-09-01', endsOn: '2026-12-01' };
  it('berpasangan, semester pada tahun periode, mapel aktif berjenis PKL; sekolah lain tidak terlihat', async () => {
    base.academicYearId = yearId;
    const only = await A('POST', '/v1/pkl/periods', { ...base, semesterId: semId });
    expect([only.statusCode, code(only)]).toEqual([400, 'pkl_link_incomplete']);
    const onlySubject = await A('POST', '/v1/pkl/periods', { ...base, subjectId: pklSubject });
    expect([onlySubject.statusCode, code(onlySubject)]).toEqual([400, 'pkl_link_incomplete']);
    const notPkl = await A('POST', '/v1/pkl/periods', { ...base, semesterId: semId, subjectId: mathSubject });
    expect([notPkl.statusCode, code(notPkl)]).toEqual([400, 'invalid_reference']);
    const noSem = await A('POST', '/v1/pkl/periods', {
      ...base,
      semesterId: '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
      subjectId: pklSubject,
    });
    expect([noSem.statusCode, code(noSem)]).toEqual([400, 'invalid_reference']);
    // Semester tahun ajaran lain.
    const [y2] = await db()
      .insert(academicYear)
      .values({ schoolId: smk, name: '2027/2028', startsOn: '2027-07-01', endsOn: '2028-06-30' })
      .returning();
    const [s3] = await db()
      .insert(semester)
      .values({
        schoolId: smk,
        academicYearId: y2!.id,
        name: 'Ganjil 2',
        startsOn: '2027-07-01',
        endsOn: '2027-12-20',
      })
      .returning();
    const otherYear = await A('POST', '/v1/pkl/periods', {
      ...base,
      semesterId: s3!.id,
      subjectId: pklSubject,
    });
    expect([otherYear.statusCode, code(otherYear)]).toEqual([400, 'invalid_reference']);
    // Mapel nonaktif.
    await db().update(subject).set({ active: false }).where(eq(subject.id, pklSubject));
    const inactive = await A('POST', '/v1/pkl/periods', {
      ...base,
      semesterId: semId,
      subjectId: pklSubject,
    });
    expect([inactive.statusCode, code(inactive)]).toEqual([400, 'invalid_reference']);
    await db().update(subject).set({ active: true }).where(eq(subject.id, pklSubject));
    // Sekolah lain tidak bisa memakai semester sekolah ini (RLS).
    const cross = await call('POST', '/v1/pkl/periods', cookieAdminB, smkB, {
      academicYearId: yearId,
      name: 'x',
      startsOn: '2026-09-01',
      endsOn: '2026-12-01',
      semesterId: semId,
      subjectId: pklSubject,
    });
    expect(cross.statusCode).toBe(400);
  });

  it('menautkan, mempertahankan tautan saat kunci dihilangkan, dan melepas dengan null', async () => {
    const created = await A('POST', '/v1/pkl/periods', { ...base, semesterId: semId, subjectId: pklSubject });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({ semesterId: semId, subjectId: pklSubject });
    ids.p2 = created.json().id;
    const keep = await A('PUT', `/v1/pkl/periods/${ids.p2}`, { ...base, name: 'PKL tertaut (ubah)' });
    expect(keep.json()).toMatchObject({
      name: 'PKL tertaut (ubah)',
      semesterId: semId,
      subjectId: pklSubject,
    });
    const unlink = await A('PUT', `/v1/pkl/periods/${ids.p2}`, {
      ...base,
      semesterId: null,
      subjectId: null,
    });
    expect(unlink.json()).toMatchObject({ semesterId: null, subjectId: null });
    const relink = await A('PUT', `/v1/pkl/periods/${ids.p2}`, {
      ...base,
      semesterId: semId,
      subjectId: pklSubject,
    });
    expect(relink.json()).toMatchObject({ semesterId: semId, subjectId: pklSubject });
    const half = await A('PUT', `/v1/pkl/periods/${ids.p2}`, {
      ...base,
      semesterId: null,
      subjectId: pklSubject,
    });
    expect([half.statusCode, code(half)]).toEqual([400, 'pkl_link_incomplete']);
    // Memindahkan periode ke tahun ajaran lain tanpa menyebut tautan: semester tautan tidak lagi pada tahun periode.
    const [y9] = await db()
      .insert(academicYear)
      .values({ schoolId: smk, name: '2030/2031', startsOn: '2030-07-01', endsOn: '2031-06-30' })
      .returning();
    const moved = await A('PUT', `/v1/pkl/periods/${ids.p2}`, { ...base, academicYearId: y9!.id });
    expect([moved.statusCode, code(moved)]).toEqual([400, 'invalid_reference']);
  });
});

describe('nilai PKL di rapor (5.4)', () => {
  it('murid berpenempatan mendapat baris mapel PKL dan blok internship; murid lain tidak; rumus lama tanpa bobot', async () => {
    const pl = await A('POST', '/v1/pkl/placements', {
      periodId: ids.p2,
      partnerId: partnerA,
      studentIds: [stu.ani, stu.budi],
      supervisorTeacherId: teacherId,
      industrySupervisorName: 'Pak Industri',
    });
    expect(pl.statusCode, pl.body).toBe(201);
    const created = pl.json().created as { id: string; studentId: string }[];
    ids.pa = created.find((x) => x.studentId === stu.ani)!.id;
    ids.pb = created.find((x) => x.studentId === stu.budi)!.id;
    // Ani: sekolah 80, industri 100 -> rata-rata 90 per aspek. Budi belum dinilai.
    ids.token = (await scoreAll(ids.pa, 80, 100))!;
    for (let i = 1; i <= 3; i++) {
      await A('POST', `/v1/pkl/placements/${ids.pa}/journals`, {
        date: `2026-09-0${i}`,
        activity: 'Kerja',
        present: i !== 3,
      });
    }

    const doc = await getDoc(stu.ani);
    expect(doc.schemaVersion).toBe(2);
    const row = doc.subjects.find((s: { name: string }) => s.name === 'Praktik Kerja Lapangan');
    expect(row).toMatchObject({
      subjectId: pklSubject,
      source: 'internship',
      final: 90,
      predicate: 'A',
      belowKkm: false,
    });
    expect(doc.subjects.find((s: { name: string }) => s.name === 'Matematika')).not.toHaveProperty('source');
    expect(doc.internship).toHaveLength(1);
    expect(doc.internship[0]).toMatchObject({
      periodName: 'PKL tertaut',
      partner: 'PT Maju Jaya',
      startsOn: '2026-09-01',
      endsOn: '2026-12-01',
      presentDays: 2,
      schoolSupervisor: 'Pak Pembimbing',
      industrySupervisor: 'Pak Industri',
      final: 90,
      predicate: 'A',
    });
    expect(doc.internship[0].aspects).toHaveLength(5);
    expect(doc.internship[0]).not.toHaveProperty('certificateNo');
    // Rata-rata ikut: (Matematika 80 + PKL 90) / 2 = 85.
    expect(
      (await A('GET', `/v1/report-cards?semesterId=${semId}&classId=${classId}`))
        .json()
        .find((r: { studentId: string }) => r.studentId === stu.ani),
    ).toMatchObject({ subjectsTotal: 2, subjectsGraded: 2, average: 85 });

    // Budi: terdaftar tetapi belum dinilai -> baris PKL ada dengan final null.
    const budi = await getDoc(stu.budi);
    expect(budi.subjects.find((s: { source?: string }) => s.source === 'internship')).toMatchObject({
      final: null,
    });
    // Dina tidak berpenempatan: tanpa baris PKL dan tanpa blok.
    const dina = await getDoc(stu.dina);
    expect(dina).not.toHaveProperty('internship');
    expect(dina.subjects.map((s: { name: string }) => s.name)).toEqual(['Matematika']);
    expect(dina).not.toHaveProperty('schemaVersion');
    // Mapel PKL tidak muncul di semester lain.
    expect(await getDoc(stu.ani, sem2Id)).not.toHaveProperty('internship');
  });

  it('penempatan batal tidak masuk rapor', async () => {
    const pl = await A('POST', '/v1/pkl/placements', {
      periodId: ids.p2,
      partnerId: partnerB,
      studentIds: [stu.citra],
    });
    const id = pl.json().created[0].id as string;
    expect((await getDoc(stu.citra)).internship).toHaveLength(1);
    await A('PUT', `/v1/pkl/placements/${id}`, { status: 'cancelled' });
    const doc = await getDoc(stu.citra);
    expect(doc).not.toHaveProperty('internship');
    expect(doc.subjects.map((s: { name: string }) => s.name)).toEqual(['Matematika']);
  });

  it('rotasi: dua penempatan pada mapel dan semester yang sama dirata-rata; rincian tiap tempat di blok internship', async () => {
    const p = await A('POST', '/v1/pkl/periods', {
      academicYearId: yearId,
      name: 'PKL rotasi',
      startsOn: '2026-11-01',
      endsOn: '2026-12-10',
      semesterId: semId,
      subjectId: pklSubject,
    });
    ids.pc = p.json().id;
    const pl = await A('POST', '/v1/pkl/placements', {
      periodId: ids.pc,
      partnerId: partnerB,
      studentIds: [stu.ani],
    });
    await scoreAll(pl.json().created[0].id, 70);
    const doc = await getDoc(stu.ani);
    expect(doc.subjects.filter((s: { source?: string }) => s.source === 'internship')).toHaveLength(1);
    expect(doc.subjects.find((s: { source?: string }) => s.source === 'internship').final).toBe(80);
    expect(doc.internship.map((e: { partner: string; final: number }) => [e.partner, e.final])).toEqual([
      ['PT Maju Jaya', 90],
      ['CV Karya Bersama', 70],
    ]);
    // Hapus periode rotasi supaya tes berikutnya sederhana.
    const placements = (await A('GET', `/v1/pkl/placements?periodId=${ids.pc}`)).json().items as {
      id: string;
    }[];
    for (const x of placements) {
      await A('PUT', `/v1/pkl/placements/${x.id}`, { status: 'cancelled' });
    }
    expect((await getDoc(stu.ani)).internship).toHaveLength(1);
  });
});

describe('bobot sekolah:industri (5.3)', () => {
  it('menolak bobot yang tidak sah dan pola tanpa {seq}; izin; sekolah lain tidak terpengaruh', async () => {
    for (const body of [
      { schoolWeight: 60, industryWeight: 30, certificatePattern: null },
      { schoolWeight: 70, industryWeight: null, certificatePattern: null },
    ]) {
      const r = await A('PUT', '/v1/vocational/settings/pkl', body);
      expect([r.statusCode, code(r)], JSON.stringify(body)).toEqual([400, 'invalid_weights']);
    }
    const outOfRange = await A('PUT', '/v1/vocational/settings/pkl', {
      schoolWeight: -10,
      industryWeight: 110,
      certificatePattern: null,
    });
    expect(outOfRange.statusCode).toBe(400);
    const bad = await A('PUT', '/v1/vocational/settings/pkl', {
      schoolWeight: null,
      industryWeight: null,
      certificatePattern: 'tanpa-urut',
    });
    expect([bad.statusCode, code(bad)]).toEqual([400, 'invalid_pattern']);
    const sup = await call('PUT', '/v1/vocational/settings/pkl', cookieSup, smk, {
      schoolWeight: null,
      industryWeight: null,
      certificatePattern: null,
    });
    expect(sup.statusCode).toBe(403);
    expect(
      (await call('GET', '/v1/vocational/settings/pkl', cookieAdminB, smkB)).json().schoolWeight,
    ).toBeNull();
  });

  it('70:30 menghitung ulang nilai di papan, lembar nilai, dan rapor; mengosongkan kembali ke rata-rata', async () => {
    const put = await A('PUT', '/v1/vocational/settings/pkl', {
      schoolWeight: 70,
      industryWeight: 30,
      certificatePattern: null,
    });
    expect(put.statusCode, put.body).toBe(200);
    expect(put.json()).toMatchObject({ schoolWeight: 70, industryWeight: 30 });
    // Ani: sekolah 80, industri 100 -> 80*.7 + 100*.3 = 86.
    const sheet = (await A('GET', `/v1/pkl/placements/${ids.pa}/scores`)).json();
    expect(sheet.weights).toEqual({ school: 70, industry: 30 });
    expect(sheet.result.final).toBe(86);
    const doc = await getDoc(stu.ani);
    expect(doc.subjects.find((s: { source?: string }) => s.source === 'internship').final).toBe(86);
    expect(doc.internship[0].final).toBe(86);
    const list = (await A('GET', `/v1/pkl/placements?periodId=${ids.p2}`)).json().items as {
      id: string;
      finalScore: number | null;
    }[];
    expect(list.find((x) => x.id === ids.pa)!.finalScore).toBe(86);
    // Pengaturan rapor kejuruan tidak tertimpa oleh simpanan bobot (dan sebaliknya).
    await A('PUT', '/v1/vocational/settings/report', { reportGrouped: false });
    expect((await A('GET', '/v1/vocational/settings/pkl')).json()).toMatchObject({ schoolWeight: 70 });

    const clear = await A('PUT', '/v1/vocational/settings/pkl', {
      schoolWeight: null,
      industryWeight: null,
      certificatePattern: null,
    });
    expect(clear.json()).toMatchObject({ schoolWeight: null, industryWeight: null });
    expect((await getDoc(stu.ani)).internship[0].final).toBe(90);
  });
});

describe('nomor sertifikat (5.3)', () => {
  it('hanya untuk penempatan selesai, unik, dapat dihapus; penomoran massal berurutan dan idempoten', async () => {
    const early = await A('PUT', `/v1/pkl/placements/${ids.pa}/certificate`, { certificateNo: 'SERT-1' });
    expect([early.statusCode, code(early)]).toEqual([409, 'placement_not_completed']);
    const none = await A('POST', `/v1/pkl/periods/${ids.p2}/certificates`);
    expect([none.statusCode, code(none)]).toEqual([409, 'placement_not_completed']);

    await A('PUT', `/v1/pkl/placements/${ids.pa}`, { status: 'active' });
    await A('PUT', `/v1/pkl/placements/${ids.pa}`, { status: 'completed' });
    const set = await A('PUT', `/v1/pkl/placements/${ids.pa}/certificate`, { certificateNo: 'SERT-1' });
    expect(set.statusCode, set.body).toBe(200);
    expect(set.json()).toEqual({ placementId: ids.pa, certificateNo: 'SERT-1' });
    expect((await getDoc(stu.ani)).internship[0].certificateNo).toBe('SERT-1');

    await A('PUT', `/v1/pkl/placements/${ids.pb}`, { status: 'active' });
    await A('PUT', `/v1/pkl/placements/${ids.pb}`, { status: 'completed' });
    const dup = await A('PUT', `/v1/pkl/placements/${ids.pb}/certificate`, { certificateNo: 'SERT-1' });
    expect([dup.statusCode, code(dup)]).toEqual([409, 'certificate_taken']);

    const guru = await call('PUT', `/v1/pkl/placements/${ids.pb}/certificate`, cookieSup, smk, {
      certificateNo: 'X',
    });
    expect(guru.statusCode).toBe(403);

    const bulk = await A('POST', `/v1/pkl/periods/${ids.p2}/certificates`);
    expect(bulk.statusCode, bulk.body).toBe(200);
    expect(bulk.json().skipped).toBe(1);
    expect(bulk.json().numbered).toHaveLength(1);
    expect(bulk.json().numbered[0].certificateNo).toMatch(/^PKL\/001\/.+\/\d{4}$/);
    const again = await A('POST', `/v1/pkl/periods/${ids.p2}/certificates`);
    expect(again.json()).toEqual({ numbered: [], skipped: 2 });

    const clear = await A('PUT', `/v1/pkl/placements/${ids.pa}/certificate`, { certificateNo: null });
    expect(clear.json().certificateNo).toBeNull();
    expect((await getDoc(stu.ani)).internship[0]).not.toHaveProperty('certificateNo');
    await A('PUT', `/v1/pkl/placements/${ids.pa}/certificate`, { certificateNo: 'SERT-1' });
  });

  it('pola sekolah dipakai penomoran massal', async () => {
    await A('PUT', '/v1/vocational/settings/pkl', {
      schoolWeight: null,
      industryWeight: null,
      certificatePattern: 'CERT-{seq}-{year}',
    });
    const [y3] = await db()
      .insert(academicYear)
      .values({ schoolId: smk, name: '2025/2026', startsOn: '2025-07-01', endsOn: '2026-06-30' })
      .returning();
    const p = await A('POST', '/v1/pkl/periods', {
      academicYearId: y3!.id,
      name: 'PKL pola',
      startsOn: '2025-09-01',
      endsOn: '2025-12-01',
    });
    const pl = await A('POST', '/v1/pkl/placements', {
      periodId: p.json().id,
      partnerId: partnerA,
      studentIds: [stu.dina],
    });
    const id = pl.json().created[0].id as string;
    await A('PUT', `/v1/pkl/placements/${id}`, { status: 'active' });
    await A('PUT', `/v1/pkl/placements/${id}`, { status: 'completed' });
    const bulk = await A('POST', `/v1/pkl/periods/${p.json().id}/certificates`);
    expect(bulk.json().numbered[0].certificateNo).toMatch(/^CERT-001-\d{4}$/);
    await A('PUT', '/v1/vocational/settings/pkl', {
      schoolWeight: null,
      industryWeight: null,
      certificatePattern: null,
    });
  });
});

describe('final: snapshot, kunci, leger, ekspor', () => {
  it('lengkapi nilai lalu finalkan; snapshot memuat baris dan blok PKL', async () => {
    await scoreAll(ids.pb, 60);
    const fin = await A('POST', '/v1/report-cards/finalize', { semesterId: semId, classId });
    expect(fin.statusCode, fin.body).toBe(200);
    const doc = await getDoc(stu.ani);
    expect(doc.status).toBe('final');
    expect(doc.schemaVersion).toBe(2);
    expect(doc.subjects.find((s: { source?: string }) => s.source).final).toBe(90);
    expect(doc.internship[0]).toMatchObject({ partner: 'PT Maju Jaya', certificateNo: 'SERT-1' });
    const snap = await db().execute(
      sql`select schema_version, snapshot->'internship' as internship from report_card where school_id = ${smk} and student_id = ${stu.ani} and semester_id = ${semId}`,
    );
    expect(snap.rows[0]).toMatchObject({ schema_version: 2 });
    expect(snap.rows[0]!.internship).toHaveLength(1);
  });

  it('nilai staf dan nilai lewat tautan industri ditolak 409 report_final; tautan menunjukkan terkunci', async () => {
    const aspects = (await A('GET', '/v1/pkl/aspects')).json() as { id: string }[];
    const records = [{ aspectId: aspects[0]!.id, value: 10 }];
    const staff = await A('PUT', `/v1/pkl/placements/${ids.pa}/scores`, { records });
    expect([staff.statusCode, code(staff)]).toEqual([409, 'report_final']);
    const guru = await call('PUT', `/v1/pkl/placements/${ids.pa}/scores`, cookieSup, smk, { records });
    expect([guru.statusCode, code(guru)]).toEqual([409, 'report_final']);
    const tok = (await A('POST', `/v1/pkl/placements/${ids.pa}/access-link`)).json().token as string;
    const industry = await pub('PUT', `/v1/public/pkl/${tok}/scores`, { records });
    expect([industry.statusCode, code(industry)]).toEqual([409, 'report_final']);
    const view = await pub('GET', `/v1/public/pkl/${tok}`);
    expect(view.json().reportLocked).toBe(true);
    expect((await A('GET', `/v1/pkl/placements/${ids.pa}/scores`)).json()).toMatchObject({
      reportLinked: true,
    });
    const cert = await A('PUT', `/v1/pkl/placements/${ids.pa}/certificate`, { certificateNo: null });
    expect([cert.statusCode, code(cert)]).toEqual([409, 'report_final']);
    // Nilai tetap sama.
    expect((await A('GET', `/v1/pkl/placements/${ids.pa}/scores`)).json().result.final).toBe(90);
  });

  it('mengganti atau melepas tautan semester yang rapornya final ditolak 409', async () => {
    const body = {
      academicYearId: yearId,
      name: 'PKL tertaut',
      startsOn: '2026-09-01',
      endsOn: '2026-12-01',
    };
    const unlink = await A('PUT', `/v1/pkl/periods/${ids.p2}`, {
      ...body,
      semesterId: null,
      subjectId: null,
    });
    expect([unlink.statusCode, code(unlink)]).toEqual([409, 'report_final']);
    const move = await A('PUT', `/v1/pkl/periods/${ids.p2}`, {
      ...body,
      semesterId: sem2Id,
      subjectId: pklSubject,
    });
    expect([move.statusCode, code(move)]).toEqual([409, 'report_final']);
    // Mengubah nama saja (tautan tetap) diizinkan.
    const rename = await A('PUT', `/v1/pkl/periods/${ids.p2}`, { ...body, name: 'PKL tertaut (nama baru)' });
    expect(rename.statusCode, rename.body).toBe(200);
    await A('PUT', `/v1/pkl/periods/${ids.p2}`, body);
  });

  it('bobot diubah sesudah final: rapor final tidak berubah; nilai hidup berubah', async () => {
    await A('PUT', '/v1/vocational/settings/pkl', {
      schoolWeight: 100,
      industryWeight: 0,
      certificatePattern: null,
    });
    const doc = await getDoc(stu.ani);
    expect(doc.status).toBe('final');
    expect(doc.internship[0].final).toBe(90);
    expect((await A('GET', `/v1/pkl/placements/${ids.pa}/scores`)).json().result.final).toBe(80);
    await A('PUT', '/v1/vocational/settings/pkl', {
      schoolWeight: null,
      industryWeight: null,
      certificatePattern: null,
    });
  });

  it('leger dan ekspor nilai akhir memuat PKL lewat snapshot', async () => {
    const ledger = await A('GET', `/v1/report-cards/ledger?semesterId=${semId}&classId=${classId}`);
    expect(ledger.statusCode, ledger.body).toBe(200);
    const text = JSON.stringify(ledger.json());
    expect(text).toContain('Praktik Kerja Lapangan');
    const ani = JSON.stringify(
      (ledger.json().students as { studentId: string }[]).find((r) => r.studentId === stu.ani),
    );
    expect(ani).toContain(pklSubject);
    const exp = await A(
      'GET',
      `/v1/exports/academic?academicYearId=${yearId}&semesterId=${semId}&dataset=final_grades&format=json`,
    );
    expect(exp.statusCode, exp.body).toBe(200);
    const rows = exp.json().rows as { student_name: string; subject_name: string; final_grade: number }[];
    expect(
      rows.find((r) => r.student_name === 'Ani' && r.subject_name === 'Praktik Kerja Lapangan'),
    ).toMatchObject({
      final_grade: 90,
    });
  });

  it('buka kembali rapor: nilai PKL dapat diubah lagi', async () => {
    const reopen = await A('POST', '/v1/report-cards/reopen', { semesterId: semId, classId });
    expect(reopen.statusCode, reopen.body).toBe(200);
    const aspects = (await A('GET', '/v1/pkl/aspects')).json() as { id: string }[];
    const r = await A('PUT', `/v1/pkl/placements/${ids.pa}/scores`, {
      records: aspects.map((x) => ({ aspectId: x.id, value: 80 })),
    });
    expect(r.statusCode, r.body).toBe(200);
  });
});

describe('periode tanpa tautan setelah semua ini', () => {
  it('melepas tautan semua periode mengembalikan dokumen ke garis dasar', async () => {
    const periods = (await A('GET', '/v1/pkl/periods')).json() as {
      id: string;
      name: string;
      academicYearId: string;
      startsOn: string;
      endsOn: string;
      semesterId: string | null;
    }[];
    for (const p of periods.filter((x) => x.semesterId)) {
      const r = await A('PUT', `/v1/pkl/periods/${p.id}`, {
        academicYearId: p.academicYearId,
        name: p.name,
        startsOn: p.startsOn,
        endsOn: p.endsOn,
        semesterId: null,
        subjectId: null,
      });
      expect(r.statusCode, r.body).toBe(200);
    }
    expect(strip(await getDoc(stu.ani))).toEqual(baseline);
  });
});
