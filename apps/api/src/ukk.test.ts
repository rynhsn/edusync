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
  program,
  programConcentration,
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
  vocationalConcentration,
  vocationalField,
  vocationalProgram,
  withTenant,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { scoreStudents } from './graduation-lib';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/**
 * Fase 5, tahap 5.5 dan 5.6: UKK (kegiatan, penguji internal/eksternal, hasil dengan uji ulang, skala bawaan dan timpaan, nomor
 * sertifikat/surat keterangan, penanda lapor), blok UKK opsional di rapor (beku di snapshot), syarat kelulusan opsional, dan
 * dataset ekspor `ukk_results`. Sekolah tanpa sakelar `inReport`: dokumen rapor identik dengan sebelumnya.
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const NIK = '3273010101010099';

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let smk = '';
let smkB = '';
let smp = '';
let yearId = '';
let semId = '';
let sem2Id = '';
let classId = '';
let otherClassId = '';
let concId = '';
let conc2Id = '';
let partnerId = '';
let teacherA = '';
let teacherB = '';
let cookieAdmin = '';
let cookieAssessor = '';
let cookieOther = '';
let cookiePrincipal = '';
let cookieAdminB = '';
let cookieAdminSmp = '';
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
const code = (res: { json: () => { error: { code: string } } }) => res.json().error.code;
const A = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  call(method, url, cookieAdmin, smk, payload);
const as = (cookie: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  call(method, url, cookie, smk, payload);

const getDoc = async (studentId = stu.ani, semesterId = semId) => {
  const r = await A('GET', `/v1/report-cards/${studentId}?semesterId=${semesterId}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
};
const strip = (d: Record<string, unknown>) => {
  const { generatedAt: _g, ...rest } = d;
  return rest;
};

const ev = (extra: Record<string, unknown> = {}) => ({
  academicYearId: yearId,
  semesterId: semId,
  concentrationId: concId,
  pattern: 'lsp',
  title: 'UKK RPL 2026',
  ...extra,
});

type ResultsView = {
  bands: { code: string }[];
  weights: { practice: number; theory: number } | null;
  inReport: boolean;
  canAssess: boolean;
  students: {
    studentId: string;
    name: string;
    reportFinal: boolean;
    latestAttemptNo: number | null;
    attempts: {
      attemptNo: number;
      practiceScore: number | null;
      theoryScore: number | null;
      finalScore: number | null;
      bandCode: string | null;
      bandLabel: string | null;
      competent: boolean | null;
      certificateNo: string | null;
      statementNo: string | null;
    }[];
  }[];
};
const results = async (eventId: string, cookie = cookieAdmin): Promise<ResultsView> => {
  const r = await call('GET', `/v1/ukk/events/${eventId}/results`, cookie, smk);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
};
const attemptsOf = (v: ResultsView, studentId: string) =>
  v.students.find((s) => s.studentId === studentId)?.attempts ?? [];

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan UKK', slug: `yukk-${run}` })
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
  const mk = async (slug: string, profile: string) => {
    const [s] = await db()
      .insert(school)
      .values({ foundationId, slug: `${slug}-${run}`, name: `Sekolah ${slug}`, educationProfile: profile })
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
  smk = await mk('ukk-a', 'smk');
  smkB = await mk('ukk-b', 'smk');
  smp = await mk('ukk-smp', 'smp');

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

  // Struktur keahlian: satu bidang, satu program, dua konsentrasi; jurusan operasional "RPL" tertaut ke konsentrasi pertama.
  const [field] = await db()
    .insert(vocationalField)
    .values({ schoolId: smk, code: 'TIK', name: 'Teknologi' })
    .returning();
  const [vp] = await db()
    .insert(vocationalProgram)
    .values({ schoolId: smk, fieldId: field!.id, code: 'RPL', name: 'Rekayasa Perangkat Lunak' })
    .returning();
  const [c1] = await db()
    .insert(vocationalConcentration)
    .values({
      schoolId: smk,
      vocationalProgramId: vp!.id,
      code: 'RPL-1',
      name: 'Pemrograman Web',
      dapodikCode: 'D-RPL1',
    })
    .returning();
  concId = c1!.id;
  const [c2] = await db()
    .insert(vocationalConcentration)
    .values({ schoolId: smk, vocationalProgramId: vp!.id, code: 'RPL-2', name: 'Pemrograman Gim' })
    .returning();
  conc2Id = c2!.id;
  const [prog] = await db().insert(program).values({ schoolId: smk, code: 'RPL', name: 'RPL' }).returning();
  await db()
    .insert(programConcentration)
    .values({ schoolId: smk, programId: prog!.id, concentrationId: concId });
  const [c] = await db()
    .insert(classRoom)
    .values({ schoolId: smk, academicYearId: yearId, name: 'XII RPL 1', level: 'XII', programId: prog!.id })
    .returning();
  classId = c!.id;
  const [c3] = await db()
    .insert(classRoom)
    .values({ schoolId: smk, academicYearId: yearId, name: 'XII UMUM', level: 'XII' })
    .returning();
  otherClassId = c3!.id;
  for (const [key, name] of [
    ['ani', 'Ani'],
    ['budi', 'Budi'],
    ['citra', 'Citra'],
    ['dina', 'Dina'],
  ] as const) {
    const [s] = await db()
      .insert(student)
      .values({ schoolId: smk, name, gender: 'P', nik: key === 'ani' ? NIK : null, nisn: `${key}${run}` })
      .returning();
    stu[key] = s!.id;
    await db()
      .insert(enrollment)
      .values({
        schoolId: smk,
        studentId: s!.id,
        classId: key === 'dina' ? otherClassId : classId,
        academicYearId: yearId,
      });
  }
  // Satu mapel dinilai supaya rapor kelas dapat difinalkan.
  const [comp] = await db()
    .insert(gradeComponent)
    .values({ schoolId: smk, name: 'Tugas', weight: 100, sort: 0 })
    .returning();
  const [math] = await db()
    .insert(subject)
    .values({ schoolId: smk, code: 'MTK', name: 'Matematika' })
    .returning();
  const [a] = await db()
    .insert(assessment)
    .values({
      schoolId: smk,
      semesterId: semId,
      classId,
      subjectId: math!.id,
      componentId: comp!.id,
      title: 'Tugas',
      date: '2026-08-01',
    })
    .returning();
  for (const id of [stu.ani, stu.budi, stu.citra]) {
    await db()
      .insert(score)
      .values({ schoolId: smk, assessmentId: a!.id, studentId: id, value: 80, updatedBy: 'uji' });
  }

  cookieAdmin = (await join('admin', smk, ['school_admin'])).cookie;
  cookiePrincipal = (await join('kepsek', smk, ['principal'])).cookie;
  const asr = await join('penguji', smk, ['teacher']);
  cookieAssessor = asr.cookie;
  const oth = await join('guru-lain', smk, ['teacher']);
  cookieOther = oth.cookie;
  const [ta] = await db()
    .insert(teacher)
    .values({ schoolId: smk, name: 'Pak Penguji', memberId: asr.memberId })
    .returning();
  teacherA = ta!.id;
  const [tb] = await db()
    .insert(teacher)
    .values({ schoolId: smk, name: 'Bu Lain', memberId: oth.memberId })
    .returning();
  teacherB = tb!.id;
  cookieAdminB = (await join('adminb', smkB, ['school_admin'])).cookie;
  cookieAdminSmp = (await join('adminsmp', smp, ['school_admin'])).cookie;
  const p = await A('POST', '/v1/pkl/partners', { name: 'PT Uji Kompetensi' });
  partnerId = p.json().id;
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

const ids = { lsp: '', indep: '', empty: '' };
let baseline: Record<string, unknown> = {};

describe('gerbang: jenjang, izin, dan isolasi', () => {
  it('sekolah non-kejuruan 404 not_vocational; sekolah lain tidak melihat kegiatan', async () => {
    const r = await call('GET', '/v1/ukk/events', cookieAdminSmp, smp);
    expect([r.statusCode, code(r)]).toEqual([404, 'not_vocational']);
    const s = await call('GET', '/v1/vocational/settings/ukk', cookieAdminSmp, smp);
    expect([s.statusCode, code(s)]).toEqual([404, 'not_vocational']);
  });

  it('kepala sekolah dan guru hanya membaca; menulis 403', async () => {
    expect((await as(cookiePrincipal, 'GET', '/v1/ukk/events')).statusCode).toBe(200);
    expect((await as(cookieOther, 'GET', '/v1/ukk/events')).statusCode).toBe(200);
    for (const cookie of [cookiePrincipal, cookieOther]) {
      expect((await as(cookie, 'POST', '/v1/ukk/events', ev())).statusCode).toBe(403);
      expect(
        (
          await as(cookie, 'PUT', '/v1/vocational/settings/ukk', {
            bands: {},
            practiceWeight: null,
            theoryWeight: null,
            inReport: true,
            certificatePattern: null,
          })
        ).statusCode,
      ).toBe(403);
    }
  });
});

describe('pengaturan UKK', () => {
  it('belum disimpan: semua bawaan; skala bawaan berlabel sumber, industry berlabel periksa', async () => {
    const r = await A('GET', '/v1/vocational/settings/ukk');
    expect(r.statusCode, r.body).toBe(200);
    const s = r.json();
    expect(s).toMatchObject({
      bands: { lsp: null, industry: null, independent: null },
      practiceWeight: null,
      theoryWeight: null,
      inReport: false,
      certificatePattern: null,
      defaultCertificatePattern: 'UKK/{seq}/{code}/{year}',
    });
    expect(s.defaultBands.independent.map((b: { min: number }) => b.min)).toEqual([0, 61, 75, 91]);
    expect(s.bandSources.industry.verified).toBe(false);
    expect(s.bandSources.lsp.verified).toBe(true);
  });

  it('skala tidak sah, bobot tidak sah, dan pola tidak sah ditolak', async () => {
    const base = {
      bands: {},
      practiceWeight: null,
      theoryWeight: null,
      inReport: false,
      certificatePattern: null,
    };
    const gap = await A('PUT', '/v1/vocational/settings/ukk', {
      ...base,
      bands: { lsp: [{ code: 'a', label: 'A', min: 10, competent: true }] },
    });
    expect([gap.statusCode, code(gap)]).toEqual([400, 'invalid_bands']);
    const noCompetent = await A('PUT', '/v1/vocational/settings/ukk', {
      ...base,
      bands: { industry: [{ code: 'a', label: 'A', min: 0, competent: false }] },
    });
    expect([noCompetent.statusCode, code(noCompetent)]).toEqual([400, 'invalid_bands']);
    const weights = await A('PUT', '/v1/vocational/settings/ukk', {
      ...base,
      practiceWeight: 60,
      theoryWeight: 30,
    });
    expect([weights.statusCode, code(weights)]).toEqual([400, 'invalid_weights']);
    const half = await A('PUT', '/v1/vocational/settings/ukk', { ...base, practiceWeight: 70 });
    expect(half.statusCode).toBe(400);
    const pattern = await A('PUT', '/v1/vocational/settings/ukk', {
      ...base,
      certificatePattern: 'UKK/{nama}',
    });
    expect([pattern.statusCode, code(pattern)]).toEqual([400, 'invalid_pattern']);
  });
});

describe('kegiatan dan penguji', () => {
  it('membuat kegiatan, rujukan divalidasi, daftar dan filter', async () => {
    baseline = strip(await getDoc());
    expect(baseline).not.toHaveProperty('ukk');
    const bad = await A('POST', '/v1/ukk/events', ev({ semesterId: '0190a7f0-0000-7000-8000-000000000001' }));
    expect([bad.statusCode, code(bad)]).toEqual([400, 'invalid_reference']);
    const noConc = await A(
      'POST',
      '/v1/ukk/events',
      ev({ concentrationId: '0190a7f0-0000-7000-8000-000000000001' }),
    );
    expect([noConc.statusCode, code(noConc)]).toEqual([400, 'invalid_reference']);
    const noPartner = await A(
      'POST',
      '/v1/ukk/events',
      ev({ partnerId: '0190a7f0-0000-7000-8000-000000000001' }),
    );
    expect([noPartner.statusCode, code(noPartner)]).toEqual([400, 'invalid_reference']);
    const dates = await A('POST', '/v1/ukk/events', ev({ startsOn: '2026-12-02', endsOn: '2026-12-01' }));
    expect(dates.statusCode).toBe(400);

    const a = await A(
      'POST',
      '/v1/ukk/events',
      ev({
        schemeName: 'Skema Pemrogram Web',
        kkniLevel: 3,
        lspName: 'LSP P1 Uji',
        lspLicenseRef: 'BNSP/123',
        tukName: 'TUK Sekolah',
        startsOn: '2026-11-02',
        endsOn: '2026-11-06',
      }),
    );
    expect(a.statusCode, a.body).toBe(201);
    expect(a.json()).toMatchObject({
      status: 'draft',
      pattern: 'lsp',
      kkniLevel: 3,
      concentrationName: 'Pemrograman Web',
      semesterName: 'Ganjil',
      assessorCount: 0,
      studentCount: 0,
      canAssess: true,
      reportedToDinasAt: null,
      assessors: [],
    });
    ids.lsp = a.json().id;
    const b = await A(
      'POST',
      '/v1/ukk/events',
      ev({ pattern: 'independent', title: 'UKK Mandiri', partnerId, startsOn: '2026-11-09' }),
    );
    expect(b.statusCode, b.body).toBe(201);
    expect(b.json().partnerName).toBe('PT Uji Kompetensi');
    ids.indep = b.json().id;
    const list = await A('GET', `/v1/ukk/events?academicYearId=${yearId}`);
    expect(list.json().map((e: { id: string }) => e.id)).toEqual([ids.lsp, ids.indep]);
    expect((await A('GET', '/v1/ukk/events?pattern=independent')).json()).toHaveLength(1);
    expect((await A('GET', '/v1/ukk/events?status=closed')).json()).toHaveLength(0);
    expect((await A('GET', `/v1/ukk/events?concentrationId=${conc2Id}`)).json()).toHaveLength(0);
    // Sekolah lain tidak melihat dan tidak dapat mengubah.
    expect((await call('GET', '/v1/ukk/events', cookieAdminB, smkB)).json()).toEqual([]);
    const cross = await call('GET', `/v1/ukk/events/${ids.lsp}`, cookieAdminB, smkB);
    expect(cross.statusCode).toBe(404);
  });

  it('ganti penguji: internal (guru) dan eksternal; kembar digabung; guru tak dikenal ditolak', async () => {
    const r = await A('PUT', `/v1/ukk/events/${ids.lsp}/assessors`, {
      assessors: [
        { kind: 'internal', teacherId: teacherA },
        { kind: 'internal', teacherId: teacherA },
        {
          kind: 'external',
          name: 'Asesor LSP',
          institution: 'LSP P1 Uji',
          qualification: 'Asesor kompetensi',
        },
        { kind: 'external', name: 'asesor lsp' },
      ],
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().assessorCount).toBe(2);
    expect(r.json().assessors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'internal', teacherId: teacherA, teacherName: 'Pak Penguji' }),
        expect.objectContaining({ kind: 'external', name: 'Asesor LSP', institution: 'LSP P1 Uji' }),
      ]),
    );
    const bad = await A('PUT', `/v1/ukk/events/${ids.lsp}/assessors`, {
      assessors: [{ kind: 'internal', teacherId: '0190a7f0-0000-7000-8000-000000000001' }],
    });
    expect([bad.statusCode, code(bad)]).toEqual([400, 'invalid_reference']);
    // Daftar tidak berubah setelah penolakan.
    expect((await A('GET', `/v1/ukk/events/${ids.lsp}`)).json().assessorCount).toBe(2);
    const mine = await as(cookieAssessor, 'GET', '/v1/ukk/events');
    expect(mine.json().find((e: { id: string }) => e.id === ids.lsp).canAssess).toBe(true);
    const other = await as(cookieOther, 'GET', '/v1/ukk/events');
    expect(other.json().find((e: { id: string }) => e.id === ids.lsp).canAssess).toBe(false);
    // Penguji internal tidak boleh mengganti penguji (butuh ukk:manage).
    expect(
      (await as(cookieAssessor, 'PUT', `/v1/ukk/events/${ids.lsp}/assessors`, { assessors: [] })).statusCode,
    ).toBe(403);
  });
});

describe('hasil, skala bawaan, dan uji ulang', () => {
  it('peserta = murid rombel konsentrasi; murid lain 400; terlalu banyak butir 400', async () => {
    const v = await results(ids.lsp);
    expect(v.students.map((s) => s.name)).toEqual(['Ani', 'Budi', 'Citra']);
    expect(v.bands.map((b) => b.code)).toEqual(['bk', 'k']);
    expect(v.weights).toBeNull();
    expect(v.canAssess).toBe(true);
    const out = await A('PUT', `/v1/ukk/events/${ids.lsp}/results`, {
      items: [{ studentId: stu.dina, finalScore: 90 }],
    });
    expect([out.statusCode, code(out)]).toEqual([400, 'student_not_in_concentration']);
    const many = await A('PUT', `/v1/ukk/events/${ids.lsp}/results`, {
      items: Array.from({ length: 501 }, () => ({ studentId: stu.ani, finalScore: 80 })),
    });
    expect([many.statusCode, code(many)]).toEqual([400, 'too_many_items']);
  });

  it('pola LSP: batas 74.99 belum kompeten, 75 kompeten; kategori dibekukan di baris', async () => {
    const r = await A('PUT', `/v1/ukk/events/${ids.lsp}/results`, {
      items: [
        {
          studentId: stu.ani,
          finalScore: 75,
          practiceScore: 80,
          theoryScore: 70,
          passportUnits: ['J.620100.001', 'J.620100.002'],
        },
        { studentId: stu.budi, finalScore: 74.99, note: 'Hampir' },
        { studentId: stu.citra, finalScore: 40 },
      ],
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ saved: 3 });
    const v = await results(ids.lsp);
    expect(attemptsOf(v, stu.ani)[0]).toMatchObject({
      attemptNo: 1,
      finalScore: 75,
      bandCode: 'k',
      bandLabel: 'Kompeten',
      competent: true,
      practiceScore: 80,
      theoryScore: 70,
    });
    expect(attemptsOf(v, stu.budi)[0]).toMatchObject({ finalScore: 74.99, bandCode: 'bk', competent: false });
    expect(attemptsOf(v, stu.citra)[0]).toMatchObject({ competent: false });
    // Murid yang belum punya hasil tetap tampil; dihilangkan = tidak berubah.
    const again = await A('PUT', `/v1/ukk/events/${ids.lsp}/results`, {
      items: [{ studentId: stu.ani, note: 'Catatan baru' }],
    });
    expect(again.statusCode, again.body).toBe(200);
    expect(attemptsOf(await results(ids.lsp), stu.ani)[0]).toMatchObject({
      finalScore: 75,
      practiceScore: 80,
      competent: true,
    });
    expect((await A('GET', `/v1/ukk/events/${ids.lsp}`)).json().studentCount).toBe(3);
  });

  it('penguji internal boleh mengisi; guru lain dan kepala sekolah 403', async () => {
    const body = { items: [{ studentId: stu.citra, finalScore: 55 }] };
    const ok = await as(cookieAssessor, 'PUT', `/v1/ukk/events/${ids.lsp}/results`, body);
    expect(ok.statusCode, ok.body).toBe(200);
    for (const cookie of [cookieOther, cookiePrincipal]) {
      const no = await as(cookie, 'PUT', `/v1/ukk/events/${ids.lsp}/results`, body);
      expect(no.statusCode).toBe(403);
      expect(
        (await as(cookie, 'POST', `/v1/ukk/events/${ids.lsp}/results/${stu.citra}/retake`)).statusCode,
      ).toBe(403);
    }
    // Penguji internal kegiatan lain tidak otomatis boleh mengisi kegiatan ini.
    const noAssess = await as(cookieAssessor, 'PUT', `/v1/ukk/events/${ids.indep}/results`, body);
    expect(noAssess.statusCode).toBe(403);
    expect((await as(cookieAssessor, 'GET', `/v1/ukk/events/${ids.lsp}/results`)).json().canAssess).toBe(
      true,
    );
  });

  it('uji ulang: hanya setelah nilai terakhir ada; percobaan terakhir bernilai yang dipakai; maks 5', async () => {
    const none = await A('POST', `/v1/ukk/events/${ids.lsp}/results/${stu.dina}/retake`);
    expect([none.statusCode, code(none)]).toEqual([400, 'student_not_in_concentration']);
    const retake = await A('POST', `/v1/ukk/events/${ids.lsp}/results/${stu.budi}/retake`);
    expect(retake.statusCode, retake.body).toBe(201);
    expect(retake.json()).toEqual({ studentId: stu.budi, attemptNo: 2 });
    // Percobaan kosong: terakhir bernilai tetap percobaan 1; uji ulang lagi ditolak sampai percobaan 2 bernilai.
    let v = await results(ids.lsp);
    expect(v.students.find((s) => s.studentId === stu.budi)).toMatchObject({ latestAttemptNo: 1 });
    const early = await A('POST', `/v1/ukk/events/${ids.lsp}/results/${stu.budi}/retake`);
    expect([early.statusCode, code(early)]).toEqual([400, 'invalid_attempt']);
    const skip = await A('PUT', `/v1/ukk/events/${ids.lsp}/results`, {
      items: [{ studentId: stu.citra, attemptNo: 3, finalScore: 90 }],
    });
    expect([skip.statusCode, code(skip)]).toEqual([400, 'invalid_attempt']);
    const save = await A('PUT', `/v1/ukk/events/${ids.lsp}/results`, {
      items: [{ studentId: stu.budi, attemptNo: 2, finalScore: 82 }],
    });
    expect(save.statusCode, save.body).toBe(200);
    v = await results(ids.lsp);
    const budi = v.students.find((s) => s.studentId === stu.budi)!;
    expect(budi.latestAttemptNo).toBe(2);
    expect(budi.attempts.map((a) => [a.attemptNo, a.competent])).toEqual([
      [1, false],
      [2, true],
    ]);
    for (let n = 3; n <= 5; n++) {
      expect((await A('POST', `/v1/ukk/events/${ids.lsp}/results/${stu.budi}/retake`)).statusCode).toBe(201);
      await A('PUT', `/v1/ukk/events/${ids.lsp}/results`, {
        items: [{ studentId: stu.budi, attemptNo: n, finalScore: 80 }],
      });
    }
    const max = await A('POST', `/v1/ukk/events/${ids.lsp}/results/${stu.budi}/retake`);
    expect([max.statusCode, code(max)]).toEqual([409, 'max_attempts']);
  });

  it('pola mandiri: batas 60/61, 74/75, 90/91 dengan empat kategori', async () => {
    const scores = [
      [stu.ani, 60, 'bk', false],
      [stu.budi, 61, 'ck', false],
      [stu.citra, 74, 'ck', false],
    ] as const;
    const r1 = await A('PUT', `/v1/ukk/events/${ids.indep}/results`, {
      items: scores.map(([studentId, finalScore]) => ({ studentId, finalScore })),
    });
    expect(r1.statusCode, r1.body).toBe(200);
    let v = await results(ids.indep);
    for (const [studentId, , bandCode, competent] of scores) {
      expect(attemptsOf(v, studentId)[0], String(studentId)).toMatchObject({ bandCode, competent });
    }
    await A('PUT', `/v1/ukk/events/${ids.indep}/results`, {
      items: [
        { studentId: stu.ani, finalScore: 75 },
        { studentId: stu.budi, finalScore: 90 },
        { studentId: stu.citra, finalScore: 91 },
      ],
    });
    v = await results(ids.indep);
    expect(attemptsOf(v, stu.ani)[0]).toMatchObject({ bandLabel: 'Kompeten', competent: true });
    expect(attemptsOf(v, stu.budi)[0]).toMatchObject({ bandLabel: 'Kompeten', competent: true });
    expect(attemptsOf(v, stu.citra)[0]).toMatchObject({ bandLabel: 'Sangat Kompeten', competent: true });
  });
});

describe('skala timpaan dan bobot sekolah', () => {
  it('bobot 70:30 menghitung nilai akhir di server; butuh praktik dan teori', async () => {
    const s = await A('PUT', '/v1/vocational/settings/ukk', {
      bands: {
        independent: [
          { code: 'x', label: 'Tidak', min: 0, competent: false },
          { code: 'y', label: 'Lulus', min: 70, competent: true },
        ],
      },
      practiceWeight: 70,
      theoryWeight: 30,
      inReport: false,
      certificatePattern: '{seq}/UKK/{code}/{year}',
    });
    expect(s.statusCode, s.body).toBe(200);
    expect(s.json()).toMatchObject({
      practiceWeight: 70,
      theoryWeight: 30,
      certificatePattern: '{seq}/UKK/{code}/{year}',
    });
    expect(s.json().bands.independent).toHaveLength(2);
    expect(s.json().bands.lsp).toBeNull();
    expect((await results(ids.indep)).weights).toEqual({ practice: 70, theory: 30 });

    ids.empty = (
      await A(
        'POST',
        '/v1/ukk/events',
        ev({ pattern: 'independent', title: 'UKK berbobot', startsOn: '2026-11-16' }),
      )
    ).json().id;
    const r = await A('PUT', `/v1/ukk/events/${ids.empty}/results`, {
      items: [
        { studentId: stu.ani, practiceScore: 80, theoryScore: 50, finalScore: 10 },
        { studentId: stu.budi, practiceScore: 80 },
        { studentId: stu.citra, practiceScore: 60, theoryScore: 100 },
      ],
    });
    expect(r.statusCode, r.body).toBe(200);
    const v = await results(ids.empty);
    // 80*0.7 + 50*0.3 = 71 (isian finalScore diabaikan) -> kategori timpaan "Lulus" (>= 70).
    expect(attemptsOf(v, stu.ani)[0]).toMatchObject({ finalScore: 71, bandCode: 'y', competent: true });
    expect(attemptsOf(v, stu.budi)[0]).toMatchObject({ finalScore: null, bandCode: null, competent: null });
    expect(attemptsOf(v, stu.citra)[0]).toMatchObject({ finalScore: 72, competent: true });
    expect(v.bands.map((b) => b.code)).toEqual(['x', 'y']);
    // Pola lsp tetap memakai skala bawaan karena tidak ditimpa.
    expect((await results(ids.lsp)).bands.map((b) => b.code)).toEqual(['bk', 'k']);
    // Kembalikan ke bawaan.
    const back = await A('PUT', '/v1/vocational/settings/ukk', {
      bands: {},
      practiceWeight: null,
      theoryWeight: null,
      inReport: false,
      certificatePattern: null,
    });
    expect(back.json()).toMatchObject({
      bands: { lsp: null, industry: null, independent: null },
      practiceWeight: null,
    });
  });
});

describe('nomor sertifikat dan surat keterangan', () => {
  it('kompeten mendapat sertifikat, lainnya surat keterangan; idempoten; hanya yang bernilai', async () => {
    const r = await A('POST', `/v1/ukk/events/${ids.lsp}/numbers`);
    expect(r.statusCode, r.body).toBe(200);
    const out = r.json() as {
      numbered: { studentId: string; kind: string; number: string; attemptNo: number }[];
      skipped: number;
    };
    expect(out.numbered).toHaveLength(3);
    const byStudent = new Map(out.numbered.map((n) => [n.studentId, n]));
    expect(byStudent.get(stu.ani)).toMatchObject({ kind: 'certificate', attemptNo: 1 });
    // Budi: percobaan terakhir bernilai = 5 (80, kompeten) -> sertifikat; Citra 55 -> surat keterangan.
    expect(byStudent.get(stu.budi)).toMatchObject({ kind: 'certificate', attemptNo: 5 });
    expect(byStudent.get(stu.citra)).toMatchObject({ kind: 'statement' });
    expect(new Set(out.numbered.map((n) => n.number)).size).toBe(3);
    expect(out.numbered[0]!.number).toMatch(/^UKK\/001\/.+\/\d{4}$/);
    const again = await A('POST', `/v1/ukk/events/${ids.lsp}/numbers`);
    expect(again.json()).toEqual({ numbered: [], skipped: 3 });
    const v = await results(ids.lsp);
    expect(attemptsOf(v, stu.ani)[0]).toMatchObject({
      certificateNo: byStudent.get(stu.ani)!.number,
      statementNo: null,
    });
    expect(attemptsOf(v, stu.citra)[0]).toMatchObject({
      certificateNo: null,
      statementNo: byStudent.get(stu.citra)!.number,
    });
    // Mengubah hasil menjadi tidak kompeten melepas sertifikat; satu urutan nomor dipakai bersama.
    const flip = await A('PUT', `/v1/ukk/events/${ids.lsp}/results`, {
      items: [{ studentId: stu.ani, finalScore: 60 }],
    });
    expect(flip.statusCode, flip.body).toBe(200);
    expect(attemptsOf(await results(ids.lsp), stu.ani)[0]).toMatchObject({
      competent: false,
      certificateNo: null,
    });
    const renumber = await A('POST', `/v1/ukk/events/${ids.lsp}/numbers`);
    expect(renumber.json().numbered).toEqual([
      expect.objectContaining({ studentId: stu.ani, kind: 'statement' }),
    ]);
    // Nomor tidak bentrok lintas kegiatan: kegiatan lain melanjutkan urutan bebas.
    const other = await A('POST', `/v1/ukk/events/${ids.indep}/numbers`);
    const all = [
      ...out.numbered.filter((n) => n.studentId !== stu.ani),
      ...renumber.json().numbered,
      ...other.json().numbered,
    ].map((n: { number: string }) => n.number);
    expect(new Set(all).size).toBe(all.length);
    // Pengelola saja.
    expect((await as(cookieAssessor, 'POST', `/v1/ukk/events/${ids.lsp}/numbers`)).statusCode).toBe(403);
  });
});

describe('penanda lapor, kegiatan ditutup, dan penghapusan', () => {
  it('penanda lapor Dinas dan e-Rapor manual; null menghapus', async () => {
    const at = '2026-11-20T03:00:00.000Z';
    const r = await A('PUT', `/v1/ukk/events/${ids.lsp}/reporting`, {
      reportedToDinasAt: at,
      pushedToEraporAt: null,
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ reportedToDinasAt: at, pushedToEraporAt: null });
    const r2 = await A('PUT', `/v1/ukk/events/${ids.lsp}/reporting`, {
      reportedToDinasAt: null,
      pushedToEraporAt: at,
    });
    expect(r2.json()).toMatchObject({ reportedToDinasAt: null, pushedToEraporAt: at });
    expect(
      (
        await as(cookieAssessor, 'PUT', `/v1/ukk/events/${ids.lsp}/reporting`, {
          reportedToDinasAt: null,
          pushedToEraporAt: null,
        })
      ).statusCode,
    ).toBe(403);
  });

  it('konsentrasi tidak dapat diganti setelah ada hasil; hapus kegiatan bernilai 409 ukk_assessed', async () => {
    const e = (await A('GET', `/v1/ukk/events/${ids.lsp}`)).json();
    const body = {
      ...ev({ title: e.title, schemeName: e.schemeName, kkniLevel: e.kkniLevel, status: 'active' }),
      concentrationId: conc2Id,
    };
    const swap = await A('PUT', `/v1/ukk/events/${ids.lsp}`, body);
    expect([swap.statusCode, code(swap)]).toEqual([409, 'ukk_assessed']);
    const del = await A('DELETE', `/v1/ukk/events/${ids.lsp}`);
    expect([del.statusCode, code(del)]).toEqual([409, 'ukk_assessed']);
    // Kegiatan tanpa hasil boleh dihapus dan bebas diubah.
    const tmp = (await A('POST', '/v1/ukk/events', ev({ title: 'Sementara' }))).json().id as string;
    const upd = await A('PUT', `/v1/ukk/events/${tmp}`, { ...body, title: 'Sementara 2' });
    expect(upd.statusCode, upd.body).toBe(200);
    expect(upd.json().concentrationId).toBe(conc2Id);
    expect((await A('DELETE', `/v1/ukk/events/${tmp}`)).json()).toEqual({ ok: true });
    expect((await A('GET', `/v1/ukk/events/${tmp}`)).statusCode).toBe(404);
  });

  it('kegiatan ditutup: tulis hasil dan uji ulang 409 event_closed; dapat dibuka kembali', async () => {
    const e = (await A('GET', `/v1/ukk/events/${ids.indep}`)).json();
    const put = (status: string) =>
      A('PUT', `/v1/ukk/events/${ids.indep}`, {
        ...ev({ pattern: e.pattern, title: e.title, partnerId: e.partnerId, startsOn: e.startsOn, status }),
      });
    expect((await put('closed')).statusCode).toBe(200);
    const w = await A('PUT', `/v1/ukk/events/${ids.indep}/results`, {
      items: [{ studentId: stu.ani, finalScore: 99 }],
    });
    expect([w.statusCode, code(w)]).toEqual([409, 'event_closed']);
    const rt = await A('POST', `/v1/ukk/events/${ids.indep}/results/${stu.ani}/retake`);
    expect([rt.statusCode, code(rt)]).toEqual([409, 'event_closed']);
    // Hasil tetap terbaca.
    expect((await results(ids.indep)).students).toHaveLength(3);
    expect((await put('active')).statusCode).toBe(200);
    expect(
      (
        await A('PUT', `/v1/ukk/events/${ids.indep}/results`, {
          items: [{ studentId: stu.ani, finalScore: 99 }],
        })
      ).statusCode,
    ).toBe(200);
  });
});

describe('rapor: blok UKK opsional dan beku', () => {
  const enable = (inReport: boolean) =>
    A('PUT', '/v1/vocational/settings/ukk', {
      bands: {},
      practiceWeight: null,
      theoryWeight: null,
      inReport,
      certificatePattern: null,
    });

  it('sakelar mati: dokumen identik dengan sebelumnya walau hasil UKK ada', async () => {
    expect(strip(await getDoc())).toEqual(baseline);
  });

  it('sakelar menyala: kegiatan draft tidak ikut; aktif ikut dengan percobaan terakhir bernilai dan label beku', async () => {
    expect((await enable(true)).statusCode).toBe(200);
    // Kegiatan LSP masih draft: tidak muncul; hanya kegiatan mandiri (aktif) yang ikut.
    expect((await getDoc()).ukk.map((x: { title: string }) => x.title)).toEqual(['UKK Mandiri']);
    const e = (await A('GET', `/v1/ukk/events/${ids.lsp}`)).json();
    const act = await A('PUT', `/v1/ukk/events/${ids.lsp}`, {
      ...ev({
        title: e.title,
        schemeName: e.schemeName,
        kkniLevel: e.kkniLevel,
        lspName: e.lspName,
        lspLicenseRef: e.lspLicenseRef,
        tukName: e.tukName,
        startsOn: e.startsOn,
        endsOn: e.endsOn,
        status: 'active',
      }),
    });
    expect(act.statusCode, act.body).toBe(200);
    const doc = await getDoc(stu.budi);
    expect(doc.schemaVersion).toBe(2);
    expect(doc.ukk).toHaveLength(2);
    expect(doc.ukk[0]).toMatchObject({
      title: 'UKK RPL 2026',
      pattern: 'lsp',
      concentration: 'Pemrograman Web',
      attempt: 5,
      finalScore: 80,
      band: { code: 'k', label: 'Kompeten' },
      competent: true,
      certificateNo: expect.stringMatching(/^UKK\//),
    });
    expect(doc.ukk[0]).not.toHaveProperty('statementNo');
    // Murid yang tidak punya hasil / semester lain: tanpa kunci.
    expect(await getDoc(stu.dina)).not.toHaveProperty('ukk');
    const gen = await getDoc(stu.budi, sem2Id);
    expect(gen).not.toHaveProperty('ukk');
    // Dua kegiatan = dua butir terurut tanggal mulai; Citra (surat keterangan di kegiatan LSP).
    expect((await getDoc(stu.citra)).ukk[0]).toMatchObject({
      competent: false,
      statementNo: expect.stringMatching(/^UKK\//),
    });
    expect((await getDoc(stu.ani)).ukk.map((x: { title: string }) => x.title)).toEqual([
      'UKK RPL 2026',
      'UKK Mandiri',
    ]);
  });

  it('finalisasi membekukan blok; tulis hasil, uji ulang, dan penomoran 409 report_final; buka kembali melepasnya', async () => {
    const fin = await A('POST', '/v1/report-cards/finalize', { semesterId: semId, classId });
    expect(fin.statusCode, fin.body).toBe(200);
    const snap = await db().execute(
      sql`select schema_version, snapshot->'ukk' as ukk from report_card where school_id = ${smk} and student_id = ${stu.budi} and semester_id = ${semId}`,
    );
    expect(snap.rows[0]).toMatchObject({ schema_version: 2 });
    expect(snap.rows[0]!.ukk).toHaveLength(2);
    const frozen = strip(await getDoc(stu.budi));
    expect(frozen.status).toBe('final');
    // Hasil lalu berubah di sumber tidak mengubah rapor final; pengaturan juga tidak.
    const lock = await A('PUT', `/v1/ukk/events/${ids.lsp}/results`, {
      items: [{ studentId: stu.budi, attemptNo: 5, finalScore: 10 }],
    });
    expect([lock.statusCode, code(lock)]).toEqual([409, 'report_final']);
    const retake = await A('POST', `/v1/ukk/events/${ids.lsp}/results/${stu.budi}/retake`);
    expect([retake.statusCode, code(retake)]).toEqual([409, 'report_final']);
    const view = await results(ids.lsp);
    expect(view.students.find((s) => s.studentId === stu.budi)?.reportFinal).toBe(true);
    await enable(false);
    expect(strip(await getDoc(stu.budi))).toEqual(frozen);
    await enable(true);
    expect((await A('POST', '/v1/report-cards/reopen', { semesterId: semId, classId })).statusCode).toBe(200);
    expect(
      (
        await A('PUT', `/v1/ukk/events/${ids.lsp}/results`, {
          items: [{ studentId: stu.budi, attemptNo: 5, finalScore: 85 }],
        })
      ).statusCode,
    ).toBe(200);
  });

  it('rapor final tanpa sakelar: dokumen tanpa blok UKK dan hasil UKK tidak terkunci', async () => {
    await enable(false);
    expect((await A('POST', '/v1/report-cards/finalize', { semesterId: semId, classId })).statusCode).toBe(
      200,
    );
    expect(strip(await getDoc(stu.budi))).not.toHaveProperty('ukk');
    expect(
      (
        await A('PUT', `/v1/ukk/events/${ids.lsp}/results`, {
          items: [{ studentId: stu.budi, attemptNo: 5, finalScore: 80 }],
        })
      ).statusCode,
    ).toBe(200);
    expect((await A('POST', '/v1/report-cards/reopen', { semesterId: semId, classId })).statusCode).toBe(200);
  });
});

describe('syarat kelulusan UKK opsional dan ekspor', () => {
  const cfg = (extra: Record<string, unknown> = {}) => ({
    reportWeight: 100,
    examWeights: {},
    reportScope: 'all_levels' as const,
    reportLevels: [],
    rounding: 'integer' as const,
    minAverage: null,
    minSubjectScore: null,
    requiredSubjectIds: [],
    ...extra,
  });
  const suggest = (config: ReturnType<typeof cfg>) =>
    withTenant(app.tenantDb, [smk], (tx) =>
      scoreStudents(tx, { id: yearId }, config as never, [stu.ani, stu.budi, stu.citra, stu.dina]),
    );
  const codes = (m: Awaited<ReturnType<typeof suggest>>, id: string) =>
    m.get(id)!.suggestion.failures.map((f) => f.code);

  it('mati: tidak ada kegagalan UKK; menyala: hanya saran menurut status UKK terakhir', async () => {
    const off = await suggest(cfg());
    for (const id of Object.values(stu)) expect(codes(off, id)).not.toContain('ukk_missing');
    const on = await suggest(cfg({ requireUkkCompetent: true }));
    // Ani: lsp 60 (tidak kompeten) tetapi mandiri 99 (kompeten) -> kompeten pada salah satu kegiatan.
    expect(codes(on, stu.ani)).not.toContain('ukk_not_competent');
    expect(codes(on, stu.ani)).not.toContain('ukk_missing');
    // Budi: kompeten; Citra: lsp 55 (tidak) dan mandiri 91 (kompeten, kegiatan aktif); Dina: tidak ikut UKK.
    expect(codes(on, stu.budi)).not.toContain('ukk_not_competent');
    expect(codes(on, stu.dina)).toContain('ukk_missing');
  });

  it('ekspor ukk_results: semua percobaan, kategori beku, tanpa NIK, draft tidak ikut', async () => {
    const draft = (await A('POST', '/v1/ukk/events', ev({ title: 'Masih draft' }))).json().id as string;
    await A('PUT', `/v1/ukk/events/${draft}/results`, { items: [{ studentId: stu.ani, finalScore: 88 }] });
    const res = await A(
      'GET',
      `/v1/exports/academic?academicYearId=${yearId}&dataset=ukk_results&format=json`,
    );
    expect(res.statusCode, res.body).toBe(200);
    const j = res.json() as { columns: { key: string }[]; rows: Record<string, unknown>[] };
    expect(j.columns.map((c) => c.key)).not.toContain('nik');
    expect(res.body).not.toContain(NIK);
    expect(j.rows.some((r) => r.event_title === 'Masih draft')).toBe(false);
    const budi = j.rows.filter((r) => r.student_name === 'Budi' && r.event_title === 'UKK RPL 2026');
    expect(budi.map((r) => [r.attempt, r.is_latest])).toEqual([
      [1, false],
      [2, false],
      [3, false],
      [4, false],
      [5, true],
    ]);
    expect(budi[0]).toMatchObject({
      concentration_code: 'RPL-1',
      concentration_dapodik_code: 'D-RPL1',
      pattern: 'lsp',
      scheme_name: 'Skema Pemrogram Web',
      band_code: 'bk',
      competent: false,
      class_name: 'XII RPL 1',
    });
    expect(budi[4]).toMatchObject({ competent: true, band_label: 'Kompeten', final_score: 80 });
    const csv = await A(
      'GET',
      `/v1/exports/academic?academicYearId=${yearId}&dataset=ukk_results&format=csv`,
    );
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).not.toContain(NIK);
    // Filter semester kedua: kosong.
    const empty = await A(
      'GET',
      `/v1/exports/academic?academicYearId=${yearId}&semesterId=${sem2Id}&dataset=ukk_results&format=json`,
    );
    expect(empty.json().rows).toEqual([]);
  });
});
