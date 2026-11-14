import {
  academicYear,
  assignRoles,
  classRoom,
  councilMeeting,
  createDb,
  enrollment,
  entitlement,
  eq,
  foundation,
  graduationDecision,
  graduationPolicy,
  member,
  promotionDecision,
  reportCard,
  school,
  schoolExam,
  schoolExamScore,
  schoolLevel,
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
import { buildGraduationList, loadPolicy, parseConfig } from './graduation-lib';

/**
 * Kelulusan (fase 3C.4): kebijakan, ujian satuan pendidikan, saran dari snapshot rapor final, penetapan dengan transkrip beku,
 * nomor SKL/ijazah, tautan berita acara, pengisian keputusan kenaikan (status `graduated` hanya berubah saat penerapan), sekolah
 * tanpa kebijakan identik dengan alur lama, izin, multi-tenant, FK komposit, dan jumlah kueri tetap.
 */

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const FAKE = '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let otherSchoolId = '';
let noModuleSchoolId = '';
let foundationId = '';
const userIds: string[] = [];
let adminCookie = '';
let curriculumCookie = '';
let principalCookie = '';
let operatorCookie = '';
let teacherCookie = '';
let otherCookie = '';
let noModuleCookie = '';

const years = {} as Record<'old' | 'y1' | 'y2' | 'other' | 'nomod', string>;
const cls = {} as Record<string, string>;
const stu = {} as Record<string, string>;
const sub = {} as Record<'mat' | 'ind' | 'other', string>;
let sem1 = '';
let sem2 = '';
let examId = '';
let exam2Id = '';
let otherExamId = '';

const db = () => app.platformDb;

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

async function member_(label: string, sid: string, roles: string[]) {
  const u = await makeUser(label);
  const [m] = await db().insert(member).values({ userId: u.id, schoolId: sid }).returning();
  await assignRoles(db(), m!.id, sid, roles);
  return login(u.email);
}

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
  sid = schoolId,
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

const y1 = (path: string) => `/v1/academic-years/${years.y1}${path}`;
const policyBody = (over: Record<string, unknown> = {}) => ({
  config: {
    reportWeight: 60,
    examWeights: { [examId]: 40 },
    reportScope: 'final_level',
    reportLevels: [],
    rounding: 'two_decimals',
    minAverage: 75,
    minSubjectScore: null,
    requiredSubjectIds: [],
    criteriaText: 'Rata-rata minimal 75.',
    ...((over.config as object) ?? {}),
  },
  sklNumberTemplate: '{seq:3}/SKL/{year}',
  announceOn: '2027-06-05',
  ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== 'config')),
});
const putPolicy = (over: Record<string, unknown> = {}, cookie = adminCookie) =>
  call('PUT', y1('/graduation-policy'), cookie, policyBody(over));
const getList = async (cookie = adminCookie, qs = '') => {
  const res = await call('GET', y1(`/graduations${qs}`), cookie);
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as {
    summary: Record<string, number>;
    exams: { id: string; name: string; weight: number }[];
    classes: { classId: string; studentCount: number; finalCount: number }[];
    students: {
      studentId: string;
      studentStatus: string;
      suggestion?: {
        average: number | null;
        meetsCriteria: boolean;
        incomplete: boolean;
        reportNotFinal: boolean;
        failures: { code: string }[];
        subjects: {
          subjectId: string;
          name: string;
          report: number | null;
          final: number | null;
          missing: string[];
        }[];
        reportSemesters: unknown[];
      };
      transcript?: {
        average: number | null;
        capturedAt: string;
        forced?: { reason: string };
        subjects: { subjectId: string; final: number | null }[];
        policy: { reportWeight: number; examWeights: { examId: string; weight: number }[] };
      };
      decision: {
        result: string | null;
        status: string;
        sklNumber: string | null;
        diplomaNumber: string | null;
        graduatedOn: string | null;
        meetingId?: string;
        promotionApplied: boolean;
      } | null;
    }[];
  };
};
type List = Awaited<ReturnType<typeof getList>>;
const row = async (list: Promise<List> | List, key: string) =>
  (await list).students.find((s) => s.studentId === stu[key])!;

const decide = (items: object[], cookie = adminCookie) =>
  call('PUT', y1('/graduations'), cookie, { decisions: items });
const finalize = (keys: string[], extra: object = {}, cookie = adminCookie) =>
  call('POST', y1('/graduations/finalize'), cookie, { studentIds: keys.map((k) => stu[k]), ...extra });
const reopen = (keys: string[], cookie = adminCookie) =>
  call('POST', y1('/graduations/reopen'), cookie, { studentIds: keys.map((k) => stu[k]) });
const wizardPut = (items: object[], yearId = years.y1) =>
  call('PUT', `/v1/academic-years/${yearId}/promotions`, adminCookie, { decisions: items });
const pdRow = (key: string) =>
  db()
    .select()
    .from(promotionDecision)
    .where(eq(promotionDecision.studentId, stu[key]!))
    .then((r) => r[0]);
const studentStatus = (key: string) =>
  db()
    .select({ status: student.status })
    .from(student)
    .where(eq(student.id, stu[key]!))
    .then((r) => r[0]!.status);

function snapshot(finals: { mat: number | null; ind: number | null }) {
  const subjects = [
    { subjectId: sub.mat, name: 'Matematika', final: finals.mat },
    { subjectId: sub.ind, name: 'Bahasa Indonesia', final: finals.ind },
  ].map((s) => ({ ...s, kkm: 70, predicate: null, description: null, belowKkm: false }));
  return {
    status: 'final',
    subjects,
    attendance: { sick: 0, excused: 0, absent: 0, late: 0 },
    rank: null,
    extracurriculars: [],
  };
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Kelulusan', slug: `ykl-${run}` })
    .returning();
  foundationId = f!.id;
  const [sb] = await db()
    .insert(subscription)
    .values({
      foundationId,
      period: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  const mkSchool = async (slug: string, modules: string[]) => {
    const [s] = await db()
      .insert(school)
      .values({ foundationId, slug: `${slug}-${run}`, name: `Sekolah ${slug}` })
      .returning();
    await seedSchoolRoles(db(), s!.id);
    for (const moduleKey of modules) {
      await db()
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sb!.id, validUntil: sb!.currentPeriodEnd });
    }
    return s!.id;
  };
  schoolId = await mkSchool('kl', ['grades']);
  otherSchoolId = await mkSchool('kl2', ['grades']);
  noModuleSchoolId = await mkSchool('kl3', ['attendance']);
  await db()
    .insert(schoolLevel)
    .values(['XI', 'XII'].map((code, i) => ({ schoolId, code, label: `Kelas ${code}`, sort: i + 1 })));
  await db()
    .insert(schoolLevel)
    .values(['XI', 'XII'].map((code, i) => ({ schoolId: noModuleSchoolId, code, label: code, sort: i + 1 })));

  const mkYear = async (
    key: keyof typeof years,
    name: string,
    startsOn: string,
    endsOn: string,
    sid = schoolId,
  ) => {
    const [y] = await db()
      .insert(academicYear)
      .values({ schoolId: sid, name, startsOn, endsOn, isActive: key === 'y1' || key === 'other' })
      .returning();
    years[key] = y!.id;
  };
  await mkYear('old', '2025/2026', '2025-07-14', '2026-06-30');
  await mkYear('y1', '2026/2027', '2026-07-13', '2027-06-30');
  await mkYear('y2', '2027/2028', '2027-07-12', '2028-06-30');
  await mkYear('other', '2026/2027', '2026-07-13', '2027-06-30', otherSchoolId);
  await mkYear('nomod', '2026/2027', '2026-07-13', '2027-06-30', noModuleSchoolId);
  const mkSem = async (name: string, startsOn: string, endsOn: string) => {
    const [s] = await db()
      .insert(semester)
      .values({ schoolId, academicYearId: years.y1, name, startsOn, endsOn })
      .returning();
    return s!.id;
  };
  sem1 = await mkSem('Ganjil', '2026-07-13', '2026-12-31');
  sem2 = await mkSem('Genap', '2027-01-04', '2027-06-30');

  const mkSubject = async (key: 'mat' | 'ind' | 'other', code: string, name: string, sid = schoolId) => {
    const [s] = await db().insert(subject).values({ schoolId: sid, code, name }).returning();
    sub[key] = s!.id;
  };
  await mkSubject('mat', 'MAT', 'Matematika');
  await mkSubject('ind', 'IND', 'Bahasa Indonesia');
  await mkSubject('other', 'OTH', 'Mapel Sekolah Lain', otherSchoolId);

  const mkClass = async (key: string, yearId: string, name: string, level: string, sid = schoolId) => {
    const [c] = await db()
      .insert(classRoom)
      .values({ schoolId: sid, academicYearId: yearId, name, level })
      .returning();
    cls[key] = c!.id;
  };
  await mkClass('A', years.y1, 'XII-A', 'XII');
  await mkClass('B', years.y1, 'XI-A', 'XI');
  await mkClass('L', years.old, 'XII-L', 'XII');
  await mkClass('otherC', years.other, 'XII-A', 'XII', otherSchoolId);

  const mkStudent = async (key: string, classKey: string, yearId: string, sid = schoolId) => {
    const [s] = await db()
      .insert(student)
      .values({ schoolId: sid, name: `Siswa ${key}`, gender: 'L', nis: `${key}-${run}` })
      .returning();
    stu[key] = s!.id;
    await db()
      .insert(enrollment)
      .values({ schoolId: sid, studentId: s!.id, classId: cls[classKey]!, academicYearId: yearId });
  };
  for (const k of ['g1', 'g2', 'g3', 'g4', 'g5']) await mkStudent(k, 'A', years.y1);
  await mkStudent('x1', 'B', years.y1);
  await mkStudent('gl', 'L', years.old);
  await mkStudent('foreign', 'otherC', years.other, otherSchoolId);

  const card = async (key: string, semId: string, finals: { mat: number | null; ind: number | null }) => {
    await db()
      .insert(reportCard)
      .values({
        schoolId,
        semesterId: semId,
        studentId: stu[key]!,
        classId: cls.A!,
        status: 'final',
        finalizedAt: new Date(),
        snapshot: snapshot(finals),
        schemaVersion: 2,
      });
  };
  await card('g1', sem1, { mat: 80, ind: 70 });
  await card('g1', sem2, { mat: 90, ind: 70 });
  await card('g2', sem1, { mat: 50, ind: 50 }); // semester genap belum final
  await card('g3', sem1, { mat: 60, ind: 60 });
  await card('g3', sem2, { mat: 60, ind: 60 });
  await card('g4', sem1, { mat: 90, ind: 90 });
  await card('g4', sem2, { mat: 90, ind: 90 });
  await card('g5', sem1, { mat: 85, ind: 85 });
  await card('g5', sem2, { mat: 85, ind: 85 });

  adminCookie = await member_('admin-kl', schoolId, ['school_admin']);
  curriculumCookie = await member_('kurikulum-kl', schoolId, ['curriculum']);
  principalCookie = await member_('kepsek-kl', schoolId, ['principal']);
  operatorCookie = await member_('operator-kl', schoolId, ['operator']);
  teacherCookie = await member_('guru-kl', schoolId, ['teacher']);
  otherCookie = await member_('admin-lain-kl', otherSchoolId, ['school_admin']);
  noModuleCookie = await member_('admin-nomod-kl', noModuleSchoolId, ['school_admin']);

  const [oe] = await db()
    .insert(schoolExam)
    .values({ schoolId: otherSchoolId, academicYearId: years.other, name: 'Ujian lain', form: 'written' })
    .returning();
  otherExamId = oe!.id;
});

afterAll(async () => {
  for (const sid of [schoolId, otherSchoolId, noModuleSchoolId]) {
    for (const table of [
      'audit_log',
      'graduation_decision',
      'school_exam_score',
      'school_exam',
      'graduation_policy',
      'promotion_decision',
      'council_meeting_attendee',
      'council_meeting',
      'report_card',
      'enrollment',
      'student',
      'class_room',
      'subject',
      'semester',
      'school_level',
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

describe('sekolah tanpa kebijakan: alur lama identik', () => {
  it('daftar kelulusan 409 no_graduation_policy; wizard menyimpan dan menerapkan keputusan lulus seperti biasa', async () => {
    const res = await call('GET', y1('/graduations'), adminCookie);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('no_graduation_policy');
    expect((await call('GET', y1('/graduation-policy'), adminCookie)).json()).toEqual({ policy: null });

    // Tahun lama (tanpa kebijakan): keputusan graduate disimpan dan diterapkan ke status siswa seperti sebelumnya.
    const list = await call('GET', `/v1/academic-years/${years.old}/promotions`, adminCookie);
    expect(list.statusCode).toBe(200);
    expect(list.json()).not.toHaveProperty('graduationPolicy');
    expect(JSON.stringify(list.json())).not.toContain('graduationResult');
    const saved = await wizardPut([{ studentId: stu.gl, decision: 'graduate' }], years.old);
    expect(saved.statusCode, saved.body).toBe(200);
    const applied = await call('POST', `/v1/academic-years/${years.old}/promotions/apply`, adminCookie, {
      targetYearId: years.y1,
    });
    expect(applied.statusCode, applied.body).toBe(200);
    expect(applied.json().graduated).toBe(1);
    expect(await studentStatus('gl')).toBe('graduated');
  });
});

describe('izin dan gerbang', () => {
  it('guru dan tanpa login ditolak; kepala sekolah dan operator hanya membaca; modul nilai wajib', async () => {
    const e = examId || FAKE;
    for (const [method, url, body] of [
      ['GET', y1('/graduation-policy'), undefined],
      ['PUT', y1('/graduation-policy'), policyBody()],
      ['DELETE', y1('/graduation-policy'), undefined],
      ['GET', y1('/school-exams'), undefined],
      ['POST', y1('/school-exams'), { name: 'U', form: 'written' }],
      ['PUT', `/v1/school-exams/${e}`, { name: 'U', form: 'written' }],
      ['DELETE', `/v1/school-exams/${e}`, undefined],
      ['GET', `/v1/school-exams/${e}/scores`, undefined],
      ['PUT', `/v1/school-exams/${e}/scores`, { scores: [] }],
      ['GET', y1('/graduations'), undefined],
      ['PUT', y1('/graduations'), { decisions: [] }],
      ['POST', y1('/graduations/finalize'), { studentIds: [] }],
      ['POST', y1('/graduations/reopen'), { studentIds: [] }],
      ['PUT', y1('/graduations/diploma-numbers'), { items: [] }],
    ] as const) {
      expect((await call(method, url, teacherCookie, body)).statusCode, `guru ${method} ${url}`).toBe(403);
    }
    expect((await app.inject(y1('/graduations'))).statusCode).toBe(401);
    // Pembaca (kepala sekolah, operator) tidak boleh menulis.
    for (const cookie of [principalCookie, operatorCookie]) {
      expect((await call('PUT', y1('/graduation-policy'), cookie, policyBody())).statusCode).toBe(403);
      expect(
        (await call('POST', y1('/graduations/finalize'), cookie, { studentIds: [FAKE] })).statusCode,
      ).toBe(403);
      expect((await call('GET', y1('/graduation-policy'), cookie)).statusCode).toBe(200);
      expect((await call('GET', y1('/school-exams'), cookie)).statusCode).toBe(200);
    }
    // Sekolah tanpa modul `grades`: 403 module_disabled walau izin ada.
    const noMod = await call(
      'GET',
      `/v1/academic-years/${years.nomod}/graduation-policy`,
      noModuleCookie,
      undefined,
      noModuleSchoolId,
    );
    expect(noMod.statusCode).toBe(403);
    expect(noMod.json().error.code).toBe('module_disabled');
  });
});

describe('ujian satuan pendidikan dan nilainya', () => {
  it('membuat, mengubah, memvalidasi, dan mendaftar ujian', async () => {
    const bad = await call('POST', y1('/school-exams'), adminCookie, { name: ' ', form: 'written' });
    expect(bad.statusCode).toBe(400);
    expect(
      (await call('POST', y1('/school-exams'), adminCookie, { name: 'U', form: 'tebak' })).statusCode,
    ).toBe(400);
    expect(
      (
        await call('POST', y1('/school-exams'), adminCookie, {
          name: 'U',
          form: 'written',
          startsOn: '2027-05-02',
          endsOn: '2027-05-01',
        })
      ).statusCode,
    ).toBe(400);
    const c1 = await call('POST', y1('/school-exams'), adminCookie, {
      name: 'Ujian Sekolah',
      form: 'written',
      startsOn: '2027-04-10',
      endsOn: '2027-04-14',
    });
    expect(c1.statusCode, c1.body).toBe(201);
    examId = c1.json().id;
    const c2 = await call('POST', y1('/school-exams'), curriculumCookie, {
      name: 'Ujian Praktik',
      form: 'practical',
    });
    expect(c2.statusCode).toBe(201);
    exam2Id = c2.json().id;
    const upd = await call('PUT', `/v1/school-exams/${exam2Id}`, adminCookie, {
      name: 'Ujian Praktik 2',
      form: 'project',
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json()).toMatchObject({
      name: 'Ujian Praktik 2',
      form: 'project',
      scoreCount: 0,
      weight: null,
    });
    const list = await call('GET', y1('/school-exams'), adminCookie);
    expect(list.json().items.map((x: { name: string }) => x.name)).toEqual([
      'Ujian Sekolah',
      'Ujian Praktik 2',
    ]);
  });

  it('menyimpan nilai: hanya murid kelas tingkat akhir, mapel ada, tanpa ganda, nilai 0-100; null menghapus', async () => {
    const put = (scores: object[]) =>
      call('PUT', `/v1/school-exams/${examId}/scores`, adminCookie, { scores });
    const s = (key: string, subjectKey: 'mat' | 'ind', value: number | null) => ({
      studentId: stu[key],
      subjectId: sub[subjectKey],
      value,
    });
    expect((await put([s('x1', 'mat', 80)])).json().error.code).toBe('invalid_reference'); // kelas XI bukan tingkat akhir
    expect((await put([s('foreign', 'mat', 80)])).statusCode).toBe(400); // murid sekolah lain
    expect((await put([{ studentId: stu.g1, subjectId: sub.other, value: 80 }])).statusCode).toBe(400); // mapel sekolah lain
    expect((await put([s('g1', 'mat', 101)])).statusCode).toBe(400);
    expect((await put([s('g1', 'mat', -1)])).statusCode).toBe(400);
    expect((await put([s('g1', 'mat', 70), s('g1', 'mat', 71)])).json().error.code).toBe('duplicate_entry');

    const ok = await put([
      s('g1', 'mat', 70),
      s('g1', 'ind', 80),
      s('g2', 'mat', 50),
      s('g2', 'ind', 50),
      s('g3', 'mat', 40),
      s('g3', 'ind', 40),
      s('g5', 'mat', 85),
      s('g5', 'ind', 85),
      s('g4', 'mat', 55.5),
    ]);
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toEqual({ saved: 9, cleared: 0 });
    // g4 tanpa nilai mapel Indonesia: dibiarkan kosong; hapus satu nilai.
    expect((await put([s('g4', 'mat', null)])).json()).toEqual({ saved: 0, cleared: 1 });
    const g = await call('GET', `/v1/school-exams/${examId}/scores`, adminCookie);
    const body = g.json();
    expect(body.locked).toBe(false);
    expect(body.students.map((x: { studentId: string }) => x.studentId).sort()).toEqual(
      ['g1', 'g2', 'g3', 'g4', 'g5'].map((k) => stu[k]).sort(),
    );
    expect(body.scores).toHaveLength(8);
    expect((await call('GET', `/v1/school-exams/${otherExamId}/scores`, adminCookie)).statusCode).toBe(404);
  });
});

describe('kebijakan kelulusan', () => {
  it('memvalidasi bobot, ujian, mapel wajib, dan templat nomor', async () => {
    expect((await putPolicy({ config: { reportWeight: 0, examWeights: {} } })).statusCode).toBe(400);
    expect((await putPolicy({ config: { reportWeight: 120 } })).statusCode).toBe(400);
    expect((await putPolicy({ config: { examWeights: { [otherExamId]: 40 } } })).json().error.code).toBe(
      'invalid_reference',
    );
    expect((await putPolicy({ config: { requiredSubjectIds: [FAKE] } })).json().error.code).toBe(
      'invalid_reference',
    );
    expect((await putPolicy({ sklNumberTemplate: 'SKL/{year}' })).json().error.code).toBe('invalid_template');
    expect((await putPolicy({ sklNumberTemplate: '{seq}/{apa}' })).json().error.code).toBe(
      'invalid_template',
    );
    expect((await putPolicy({}, principalCookie)).statusCode).toBe(403);
  });

  it('menyimpan, membaca, dan mengganti kebijakan; ujian berbobot tidak bisa dihapus', async () => {
    const res = await putPolicy({});
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      sklNumberTemplate: '{seq:3}/SKL/{year}',
      announceOn: '2027-06-05',
      config: { reportWeight: 60, minAverage: 75, rounding: 'two_decimals' },
    });
    const got = (await call('GET', y1('/graduation-policy'), principalCookie)).json();
    expect(got.policy.config.examWeights).toEqual({ [examId]: 40 });
    const again = await putPolicy({ config: { minAverage: 75 } });
    expect(again.statusCode).toBe(200);
    expect(
      await db().select().from(graduationPolicy).where(eq(graduationPolicy.academicYearId, years.y1)),
    ).toHaveLength(1);
    const del = await call('DELETE', `/v1/school-exams/${examId}`, adminCookie);
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe('exam_in_use');
    const items = (await call('GET', y1('/school-exams'), adminCookie)).json().items;
    expect(items.find((i: { id: string }) => i.id === examId)).toMatchObject({ weight: 40, scoreCount: 8 });
  });
});

describe('saran nilai kelulusan (hanya dari snapshot rapor final)', () => {
  it('menghitung nilai tertimbang, rata-rata, ambang, kelengkapan, dan status rapor per murid', async () => {
    const list = await getList();
    const g1 = list.students.find((s) => s.studentId === stu.g1)!.suggestion!;
    const mat = g1.subjects.find((s) => s.subjectId === sub.mat)!;
    const ind = g1.subjects.find((s) => s.subjectId === sub.ind)!;
    // rapor (80+90)/2 = 85 dan ujian 70: 0,6*85 + 0,4*70 = 79; Indonesia 0,6*70 + 0,4*80 = 74
    expect([mat.report, mat.final, ind.report, ind.final]).toEqual([85, 79, 70, 74]);
    expect(g1).toMatchObject({
      average: 76.5,
      meetsCriteria: true,
      incomplete: false,
      reportNotFinal: false,
    });
    expect(g1.reportSemesters).toHaveLength(2);

    // g2: rapor semester genap belum final; g3 di bawah ambang; g4 tanpa nilai ujian.
    expect((await row(list, 'g2')).suggestion).toMatchObject({ reportNotFinal: true });
    const g3 = (await row(list, 'g3')).suggestion!;
    expect(g3).toMatchObject({ average: 52, meetsCriteria: false });
    expect(g3.failures).toEqual([{ code: 'below_average' }]);
    const g4 = (await row(list, 'g4')).suggestion!;
    expect(g4).toMatchObject({ incomplete: true, average: 90 });
    expect(g4.subjects.every((s) => s.missing.includes(examId))).toBe(true);
    // Hanya murid kelas tingkat akhir; kelas XI tidak ikut; tanpa keputusan.
    expect(list.students.map((s) => s.studentId)).not.toContain(stu.x1);
    expect(list.summary).toMatchObject({ total: 5, undecided: 5, final: 0 });
    expect(list.exams).toEqual([{ id: examId, name: 'Ujian Sekolah', weight: 40 }]);
  });

  it('rapor draf tidak pernah dipakai walau snapshot-nya ada; mengubah bobot mengubah saran', async () => {
    await db()
      .update(reportCard)
      .set({ status: 'draft', snapshot: snapshot({ mat: 100, ind: 100 }) })
      .where(eq(reportCard.studentId, stu.g5!));
    const g5 = (await row(getList(), 'g5')).suggestion!;
    expect(g5.reportNotFinal).toBe(true);
    expect(g5.subjects.every((s) => s.report === null && s.missing.includes('report'))).toBe(true);
    // Hanya ujian yang tersisa (85); nilai 100 pada rapor draf diabaikan.
    expect(g5.subjects.map((s) => s.final)).toEqual([85, 85]);
    await db()
      .update(reportCard)
      .set({ status: 'final', snapshot: snapshot({ mat: 85, ind: 85 }) })
      .where(eq(reportCard.studentId, stu.g5!));

    await putPolicy({ config: { reportWeight: 100, examWeights: { [examId]: 0 } } });
    const g1 = (await row(getList(), 'g1')).suggestion!;
    expect(g1.average).toBe(77.5); // hanya rapor: (85 + 70) / 2
    expect(g1.incomplete).toBe(false);
    await putPolicy({});
    expect((await row(getList(), 'g1')).suggestion!.average).toBe(76.5);
  });

  it('cakupan semua tingkat memakai rapor final tahun lain; cakupan tingkat menyaring menurut tingkat kelas', async () => {
    const [semOld] = await db()
      .insert(semester)
      .values({
        schoolId,
        academicYearId: years.old,
        name: 'Lama',
        startsOn: '2025-07-14',
        endsOn: '2025-12-31',
      })
      .returning();
    await db()
      .insert(reportCard)
      .values({
        schoolId,
        semesterId: semOld!.id,
        studentId: stu.g1!,
        classId: cls.L!,
        status: 'final',
        finalizedAt: new Date(),
        snapshot: snapshot({ mat: 40, ind: 40 }),
        schemaVersion: 2,
      });
    await putPolicy({ config: { reportScope: 'all_levels' } });
    const all = (await row(getList(), 'g1')).suggestion!;
    expect(all.reportSemesters).toHaveLength(3);
    expect(all.subjects.find((s) => s.subjectId === sub.mat)!.report).toBe(70); // (80+90+40)/3
    await putPolicy({ config: { reportScope: 'levels', reportLevels: ['XII'] } });
    expect((await row(getList(), 'g1')).suggestion!.reportSemesters).toHaveLength(3);
    await putPolicy({ config: { reportScope: 'levels', reportLevels: ['IX'] } });
    expect((await row(getList(), 'g1')).suggestion!.reportSemesters).toHaveLength(0);
    await putPolicy({});
    await db().delete(reportCard).where(eq(reportCard.semesterId, semOld!.id));
    await db().delete(semester).where(eq(semester.id, semOld!.id));
  });
});

describe('keputusan draf', () => {
  it('menyimpan draf: validasi murid, nomor unik, dan pertahankan yang dihilangkan', async () => {
    expect((await decide([{ studentId: stu.x1, result: 'graduated' }])).json().error.code).toBe(
      'student_not_in_final_class',
    );
    expect(
      (
        await decide([
          { studentId: stu.g1, result: 'graduated' },
          { studentId: stu.g1, result: null },
        ])
      ).json().error.code,
    ).toBe('duplicate_student');
    const ok = await decide([
      { studentId: stu.g1, result: 'graduated', graduatedOn: '2027-06-05', note: 'Memenuhi kriteria' },
      { studentId: stu.g3, result: 'not_graduated', note: 'Di bawah ambang' },
      { studentId: stu.g4, result: 'graduated', graduatedOn: '2027-06-05', diplomaNumber: 'DN-001' },
      { studentId: stu.g5, result: 'deferred' },
    ]);
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toEqual({ saved: 4 });
    // Dihilangkan = dipertahankan; draf tidak menyentuh keputusan kenaikan ataupun status murid.
    await decide([{ studentId: stu.g1, result: 'graduated' }]);
    const g1 = await row(getList(), 'g1');
    expect(g1.decision).toMatchObject({ result: 'graduated', graduatedOn: '2027-06-05', status: 'draft' });
    expect(await pdRow('g1')).toBeUndefined();
    expect(await studentStatus('g1')).toBe('active');
    // Nomor ijazah ganda ditolak (murid lain sudah memakainya).
    const dup = await decide([{ studentId: stu.g1, result: 'graduated', diplomaNumber: 'DN-001' }]);
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('number_taken');
    expect(
      (
        await decide([
          { studentId: stu.g1, result: 'graduated', sklNumber: 'x', diplomaNumber: 'DN-777' },
          { studentId: stu.g3, result: 'not_graduated', sklNumber: 'x' },
        ])
      ).json().error.code,
    ).toBe('number_taken');
  });

  it('nomor ijazah hanya untuk murid lulus; unik; dapat dikosongkan', async () => {
    const url = y1('/graduations/diploma-numbers');
    expect(
      (await call('PUT', url, adminCookie, { items: [{ studentId: stu.g3, diplomaNumber: 'DN-3' }] })).json()
        .error.code,
    ).toBe('invalid_reference');
    expect(
      (
        await call('PUT', url, adminCookie, { items: [{ studentId: stu.g1, diplomaNumber: 'DN-001' }] })
      ).json().error.code,
    ).toBe('number_taken');
    const ok = await call('PUT', url, adminCookie, {
      items: [{ studentId: stu.g1, diplomaNumber: 'DN-002' }],
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect((await row(getList(), 'g1')).decision!.diplomaNumber).toBe('DN-002');
    await call('PUT', url, adminCookie, { items: [{ studentId: stu.g1, diplomaNumber: null }] });
    expect((await row(getList(), 'g1')).decision!.diplomaNumber).toBeNull();
  });
});

describe('penetapan (finalisasi) dan transkrip beku', () => {
  it('menolak yang belum diputuskan, tanpa tanggal lulus, rapor belum final, dan nilai tidak lengkap; force perlu alasan', async () => {
    await decide([{ studentId: stu.g2, result: 'graduated' }]);
    expect((await finalize(['g2'])).json().error.code).toBe('graduated_on_required');
    await decide([{ studentId: stu.g2, result: 'graduated', graduatedOn: '2027-06-05' }]);
    const blocked = await finalize(['g2']);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('report_not_final');
    // g4: rapor final tetapi tanpa nilai ujian: nilai tidak lengkap.
    const incomplete = await finalize(['g4']);
    expect(incomplete.statusCode).toBe(409);
    expect(incomplete.json().error.code).toBe('scores_incomplete');
    expect((await finalize(['g4'], { force: true })).json().error.code).toBe('reason_required');
    // Satu murid bermasalah membatalkan seluruh permintaan (semua atau tidak sama sekali).
    expect((await finalize(['g1', 'g2'])).statusCode).toBe(409);
    expect((await row(getList(), 'g1')).decision!.status).toBe('draft');
    // Murid tanpa draf.
    expect((await finalize(['x1'])).statusCode).toBe(400);
    const dec = await db()
      .select()
      .from(graduationDecision)
      .where(eq(graduationDecision.academicYearId, years.y1));
    expect(dec.every((d) => d.status === 'draft')).toBe(true);
    expect(
      await db().select().from(promotionDecision).where(eq(promotionDecision.academicYearId, years.y1)),
    ).toHaveLength(0);
  });

  it('memfinalkan: transkrip beku, nomor SKL otomatis, keputusan kenaikan tertulis, status murid tetap aktif', async () => {
    const res = await finalize(['g1', 'g3', 'g5']);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({
      finalized: 3,
      graduated: 1,
      notGraduated: 1,
      deferred: 1,
      sklAssigned: 1,
      promotionWritten: 2,
    });
    const list = await getList();
    const g1 = list.students.find((s) => s.studentId === stu.g1)!;
    expect(g1.decision).toMatchObject({
      status: 'final',
      result: 'graduated',
      sklNumber: '001/SKL/2027',
      promotionApplied: false,
    });
    expect(g1.suggestion).toBeUndefined();
    expect(g1.transcript).toMatchObject({
      average: 76.5,
      policy: { reportWeight: 60, examWeights: [{ examId, weight: 40 }] },
    });
    expect(list.summary).toMatchObject({ final: 3, graduated: 3, notGraduated: 1, deferred: 1 }); // g2 dan g4 masih draf lulus
    // Keputusan kenaikan: lulus -> graduate, tidak lulus -> retain (alasan dari catatan), ditunda -> tidak ditulis.
    expect(await pdRow('g1')).toMatchObject({ decision: 'graduate', appliedAt: null, fromClassId: cls.A });
    expect(await pdRow('g3')).toMatchObject({
      decision: 'retain',
      reason: 'Di bawah ambang',
      appliedAt: null,
    });
    expect(await pdRow('g5')).toBeUndefined();
    // Status `graduated` hanya berubah di penerapan kenaikan.
    for (const k of ['g1', 'g3', 'g5']) expect(await studentStatus(k), k).toBe('active');
  });

  it('transkrip tetap beku walau data hidup berubah', async () => {
    await db().update(schoolExamScore).set({ value: 0 }).where(eq(schoolExamScore.studentId, stu.g1!));
    await db()
      .update(reportCard)
      .set({ snapshot: snapshot({ mat: 1, ind: 1 }) })
      .where(eq(reportCard.studentId, stu.g1!));
    const g1 = await row(getList(), 'g1');
    expect(g1.transcript!.average).toBe(76.5);
    expect(g1.transcript!.subjects.map((s) => s.final).sort()).toEqual([74, 79]);
    // Murid yang belum final tetap dihitung dari data terkini.
    expect((await row(getList(), 'g2')).suggestion).toBeDefined();
    await db()
      .update(schoolExamScore)
      .set({ value: 70 })
      .where(sql`${schoolExamScore.studentId} = ${stu.g1} and ${schoolExamScore.subjectId} = ${sub.mat}`);
    await db()
      .update(schoolExamScore)
      .set({ value: 80 })
      .where(sql`${schoolExamScore.studentId} = ${stu.g1} and ${schoolExamScore.subjectId} = ${sub.ind}`);
    await db()
      .update(reportCard)
      .set({ snapshot: snapshot({ mat: 80, ind: 70 }) })
      .where(sql`${reportCard.studentId} = ${stu.g1} and ${reportCard.semesterId} = ${sem1}`);
    await db()
      .update(reportCard)
      .set({ snapshot: snapshot({ mat: 90, ind: 70 }) })
      .where(sql`${reportCard.studentId} = ${stu.g1} and ${reportCard.semesterId} = ${sem2}`);
  });

  it('penetapan final mengunci kebijakan, ujian, nilai ujian, dan draf murid itu (graduation_final)', async () => {
    const expectFinal = (
      res: { statusCode: number; json: () => { error: { code: string } } },
      label: string,
    ) => {
      expect(res.statusCode, label).toBe(409);
      expect(res.json().error.code, label).toBe('graduation_final');
    };
    expectFinal(await putPolicy({}), 'kebijakan');
    expectFinal(await call('DELETE', y1('/graduation-policy'), adminCookie), 'hapus kebijakan');
    expectFinal(
      await call('POST', y1('/school-exams'), adminCookie, { name: 'Baru', form: 'other' }),
      'ujian baru',
    );
    expectFinal(
      await call('PUT', `/v1/school-exams/${exam2Id}`, adminCookie, { name: 'X', form: 'other' }),
      'ubah ujian',
    );
    expectFinal(await call('DELETE', `/v1/school-exams/${exam2Id}`, adminCookie), 'hapus ujian');
    expectFinal(
      await call('PUT', `/v1/school-exams/${examId}/scores`, adminCookie, {
        scores: [{ studentId: stu.g1, subjectId: sub.mat, value: 10 }],
      }),
      'nilai ujian',
    );
    expect((await call('GET', `/v1/school-exams/${examId}/scores`, adminCookie)).json().locked).toBe(true);
    expectFinal(await decide([{ studentId: stu.g1, result: 'not_graduated' }]), 'ubah keputusan final');
    expectFinal(await finalize(['g1']), 'finalkan ulang');
    // Murid lain yang masih draf tetap dapat diubah.
    expect((await decide([{ studentId: stu.g2, result: 'graduated', note: 'catatan' }])).statusCode).toBe(
      200,
    );
  });

  it('force dengan alasan: dibekukan di transkrip; nomor SKL melanjutkan urutan; nomor ijazah ketikan terjaga', async () => {
    const res = await finalize(['g2', 'g4'], {
      force: true,
      reason: 'Rapor genap menyusul, disetujui rapat',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ finalized: 2, sklAssigned: 2 });
    const list = await getList();
    const g2 = list.students.find((s) => s.studentId === stu.g2)!;
    const g4 = list.students.find((s) => s.studentId === stu.g4)!;
    expect(g2.decision!.sklNumber).toBe('002/SKL/2027');
    expect(g4.decision!.sklNumber).toBe('003/SKL/2027');
    expect(g2.transcript!.forced).toEqual({ reason: 'Rapor genap menyusul, disetujui rapat' });
    expect(list.students.find((s) => s.studentId === stu.g1)!.transcript!.forced).toBeUndefined();
    // g4 memakai nomor ijazah DN-001 yang diketik di draf; tetap terjaga setelah final dan dapat diganti.
    expect(g4.decision!.diplomaNumber).toBe('DN-001');
    const put = await call('PUT', y1('/graduations/diploma-numbers'), adminCookie, {
      items: [{ studentId: stu.g4, diplomaNumber: 'DN-004' }],
    });
    expect(put.statusCode, put.body).toBe(200);
    expect((await row(getList(), 'g4')).decision!.diplomaNumber).toBe('DN-004');
  });
});

describe('buka kembali penetapan', () => {
  it('membuang transkrip dan mencabut keputusan kenaikan yang ditulisnya; nomor SKL tetap; final ulang memakai nomor yang sama', async () => {
    expect((await reopen(['x1'])).statusCode).toBe(400);
    expect((await reopen(['g3', 'g5'])).statusCode).toBe(200);
    expect(await pdRow('g3')).toBeUndefined();
    const g3 = await row(getList(), 'g3');
    expect(g3.decision).toMatchObject({ status: 'draft', result: 'not_graduated' });
    expect(g3.suggestion).toBeDefined();
    expect(g3.transcript).toBeUndefined();
    // Belum final -> 409.
    const again = await reopen(['g3']);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('graduation_not_final');

    expect((await reopen(['g1'])).statusCode).toBe(200);
    expect((await row(getList(), 'g1')).decision!.sklNumber).toBe('001/SKL/2027');
    expect((await finalize(['g1'])).json()).toMatchObject({ finalized: 1, sklAssigned: 0 });
    expect((await row(getList(), 'g1')).decision!.sklNumber).toBe('001/SKL/2027');
  });
});

describe('tautan berita acara', () => {
  const meeting = (over: Record<string, unknown> = {}) =>
    call('POST', '/v1/council-meetings', adminCookie, {
      academicYearId: years.y1,
      kind: 'graduation',
      title: 'Rapat penetapan kelulusan',
      heldOn: '2027-06-03',
      ...over,
    });

  it('menautkan draf ke berita acara, menularkannya ke keputusan kenaikan, dan menguncinya saat berita acara final', async () => {
    const m1 = (await meeting()).json().id as string;
    const badRef = await decide([{ studentId: stu.g3, result: 'not_graduated', meetingId: FAKE }]);
    expect(badRef.json().error.code).toBe('invalid_reference');
    const m2 = (await meeting({ title: 'Final lebih dulu' })).json().id as string;
    expect((await call('POST', `/v1/council-meetings/${m2}/finalize`, adminCookie)).statusCode).toBe(200);
    const locked = await decide([{ studentId: stu.g3, result: 'not_graduated', meetingId: m2 }]);
    expect(locked.statusCode).toBe(409);
    expect(locked.json().error.code).toBe('meeting_final');
    // Berita acara tahun lain ditolak.
    const [other] = await db()
      .insert(councilMeeting)
      .values({
        schoolId,
        academicYearId: years.y2,
        kind: 'graduation',
        title: 'Tahun depan',
        heldOn: '2028-06-03',
        createdBy: 'uji',
      })
      .returning();
    const wrongYear = await decide([{ studentId: stu.g3, result: 'not_graduated', meetingId: other!.id }]);
    expect(wrongYear.json().error.code).toBe('invalid_reference');

    expect((await decide([{ studentId: stu.g3, result: 'not_graduated', meetingId: m1 }])).statusCode).toBe(
      200,
    );
    expect((await row(getList(), 'g3')).decision!.meetingId).toBe(m1);
    expect((await finalize(['g3'])).statusCode).toBe(200);
    expect(await pdRow('g3')).toMatchObject({ decision: 'retain', meetingId: m1, meetingDate: '2027-06-03' });
    // Berita acara difinalkan: buka kembali penetapan murid tertaut ditolak.
    expect((await call('POST', `/v1/council-meetings/${m1}/finalize`, adminCookie)).statusCode).toBe(200);
    const re = await reopen(['g3']);
    expect(re.statusCode).toBe(409);
    expect(re.json().error.code).toBe('meeting_final');
    // Setelah berita acara dibuka kembali, penetapan dapat dibuka kembali dan dibuat ulang.
    expect((await call('POST', `/v1/council-meetings/${m1}/reopen`, adminCookie)).statusCode).toBe(200);
    expect((await reopen(['g3'])).statusCode).toBe(200);
    expect((await finalize(['g3'])).statusCode).toBe(200);
    expect((await pdRow('g3'))!.meetingId).toBe(m1);
    await db().delete(councilMeeting).where(eq(councilMeeting.id, other!.id));
  });
});

describe('wizard kenaikan dan penerapan (status graduated hanya berubah di penerapan)', () => {
  it('daftar wizard menandai kebijakan dan hasil; keputusan lulus tanpa penetapan atau berbeda dari penetapan ditolak', async () => {
    const list = (await call('GET', y1('/promotions'), adminCookie)).json();
    expect(list.graduationPolicy).toBe(true);
    const students = list.classes.flatMap(
      (c: { students: { studentId: string; graduationResult?: string }[] }) => c.students,
    );
    const resultOf = (k: string) =>
      students.find((s: { studentId: string }) => s.studentId === stu[k])?.graduationResult;
    expect([resultOf('g1'), resultOf('g3'), resultOf('g5'), resultOf('x1')]).toEqual([
      'graduated',
      'not_graduated',
      undefined,
      undefined,
    ]);

    const undetermined = await wizardPut([{ studentId: stu.g5, decision: 'graduate' }]);
    expect(undetermined.statusCode).toBe(409);
    expect(undetermined.json().error.code).toBe('graduation_not_determined');
    expect((await wizardPut([{ studentId: stu.g1, decision: 'retain' }])).json().error.code).toBe(
      'graduation_final',
    );
    expect((await wizardPut([{ studentId: stu.g3, decision: 'graduate' }])).json().error.code).toBe(
      'graduation_final',
    );
    // Sama dengan penetapan: boleh (idempoten); murid tingkat bawah tidak terpengaruh.
    expect((await wizardPut([{ studentId: stu.g1, decision: 'graduate', note: 'sesuai' }])).statusCode).toBe(
      200,
    );
    expect((await wizardPut([{ studentId: stu.x1, decision: 'promote' }])).statusCode).toBe(200);
    // Murid ditunda boleh tinggal kelas di wizard, tidak boleh lulus.
    expect((await wizardPut([{ studentId: stu.g5, decision: 'retain' }])).statusCode).toBe(200);
    await db().delete(promotionDecision).where(eq(promotionDecision.studentId, stu.g5!));
  });

  it('penerapan: lulus hanya yang ditetapkan; keputusan lulus lama tanpa penetapan menjadi unplaced; tinggal kelas ditempatkan', async () => {
    // Keputusan `graduate` yang ada sebelum kebijakan dibuat (disisipkan langsung) tidak boleh meluluskan murid.
    await db().insert(promotionDecision).values({
      schoolId,
      academicYearId: years.y1,
      studentId: stu.g5!,
      fromClassId: cls.A!,
      decision: 'graduate',
      decidedBy: 'uji',
    });
    const roll = await call('POST', y1('/rollover'), adminCookie, {
      targetYearId: years.y2,
      copyClasses: true,
      copyAssignments: false,
      copyCurriculum: false,
      copyTeachingPlans: false,
    });
    expect(roll.statusCode, roll.body).toBe(200);
    for (const k of ['g1', 'g2', 'g3', 'g4', 'g5']) expect(await studentStatus(k), k).toBe('active');

    const dry = await call('POST', y1('/promotions/apply'), adminCookie, {
      targetYearId: years.y2,
      dryRun: true,
    });
    expect(dry.json().graduated).toBe(3);
    for (const k of ['g1', 'g2', 'g4']) expect(await studentStatus(k), `${k} setelah dryRun`).toBe('active');

    const res = await call('POST', y1('/promotions/apply'), adminCookie, { targetYearId: years.y2 });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ graduated: 3, retained: 1, placed: 1 });
    expect(body.unplaced).toEqual([
      expect.objectContaining({ studentId: stu.g5, reasonCode: 'graduation_not_determined' }),
    ]);
    for (const k of ['g1', 'g2', 'g4']) expect(await studentStatus(k), k).toBe('graduated');
    for (const k of ['g3', 'g5', 'x1']) expect(await studentStatus(k), k).toBe('active');
    await db().delete(promotionDecision).where(eq(promotionDecision.studentId, stu.g5!));
  });

  it('setelah diterapkan: penetapan tidak dapat dibuka kembali; lulusan tetap tampil di daftar, rapor, dan legger', async () => {
    const re = await reopen(['g1']);
    expect(re.statusCode).toBe(409);
    expect(re.json().error.code).toBe('promotion_applied');
    const g3 = await reopen(['g3']);
    expect(g3.json().error.code).toBe('promotion_applied'); // tinggal kelas sudah ditempatkan di tahun tujuan
    const g1 = await row(getList(), 'g1');
    expect(g1).toMatchObject({ studentStatus: 'graduated' });
    expect(g1.decision).toMatchObject({ status: 'final', promotionApplied: true });
    const ledger = await call(
      'GET',
      `/v1/report-cards/ledger?semesterId=${sem1}&classId=${cls.A}`,
      adminCookie,
    );
    expect(ledger.statusCode, ledger.body).toBe(200);
    expect(ledger.json().students.map((s: { studentId: string }) => s.studentId)).toContain(stu.g1);
    const cards = await call('GET', `/v1/report-cards?semesterId=${sem1}&classId=${cls.A}`, adminCookie);
    expect(JSON.stringify(cards.json())).toContain(stu.g1);
    // Keputusan wizard terakhir tidak bisa diubah (promotion_applied lebih dulu).
    expect((await wizardPut([{ studentId: stu.g1, decision: 'graduate' }])).json().error.code).toBe(
      'promotion_applied',
    );
  });
});

describe('multi-tenant dan FK komposit', () => {
  it('sekolah lain tidak melihat atau mengubah data; id sekolah lain ditolak di FK komposit', async () => {
    // Admin sekolah lain memakai x-school-id miliknya: tahun ajaran sekolah ini tidak ditemukan.
    for (const [method, url, body] of [
      ['GET', y1('/graduations'), undefined],
      ['GET', y1('/graduation-policy'), undefined],
      ['GET', y1('/school-exams'), undefined],
      ['PUT', y1('/graduations'), { decisions: [{ studentId: stu.g1, result: 'deferred' }] }],
      ['GET', `/v1/school-exams/${examId}/scores`, undefined],
    ] as const) {
      const res = await call(method, url, otherCookie, body, otherSchoolId);
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    // Memakai x-school-id sekolah ini tanpa menjadi anggotanya: 403.
    expect((await call('GET', y1('/graduations'), otherCookie, undefined, schoolId)).statusCode).toBe(403);

    const bad = (p: Promise<unknown>) => expect(p).rejects.toThrow();
    await bad(
      db()
        .insert(graduationDecision)
        .values({ schoolId, academicYearId: years.y1, studentId: stu.foreign!, classId: cls.A! }),
    );
    await bad(
      db()
        .insert(schoolExamScore)
        .values({ schoolId, examId, studentId: stu.g1!, subjectId: sub.other, value: 10, updatedBy: 'uji' }),
    );
    await bad(
      db().insert(schoolExamScore).values({
        schoolId,
        examId: otherExamId,
        studentId: stu.g1!,
        subjectId: sub.mat,
        value: 10,
        updatedBy: 'uji',
      }),
    );
    await bad(db().insert(graduationPolicy).values({ schoolId, academicYearId: years.other, config: {} }));
    await bad(
      db().insert(schoolExam).values({ schoolId, academicYearId: years.other, name: 'X', form: 'written' }),
    );
  });

  it('CHECK basis data: final wajib punya hasil dan transkrip; lulus final wajib bertanggal; nilai 0-100; nomor SKL unik', async () => {
    const bad = (p: Promise<unknown>) => expect(p).rejects.toThrow();
    const base = { schoolId, academicYearId: years.y2, classId: cls.A! };
    const [s] = await db().insert(student).values({ schoolId, name: 'Uji CHECK', gender: 'L' }).returning();
    await bad(
      db()
        .insert(graduationDecision)
        .values({ ...base, studentId: s!.id, status: 'final' }),
    );
    await bad(
      db()
        .insert(graduationDecision)
        .values({ ...base, studentId: s!.id, status: 'final', result: 'graduated', transcript: {} }),
    );
    await bad(
      db()
        .insert(schoolExamScore)
        .values({ schoolId, examId, studentId: s!.id, subjectId: sub.mat!, value: 100.5, updatedBy: 'u' }),
    );
    await bad(
      db().insert(schoolExam).values({
        schoolId,
        academicYearId: years.y2,
        name: 'Z',
        form: 'written',
        startsOn: '2028-05-02',
        endsOn: '2028-05-01',
      }),
    );
    // Nomor SKL unik per sekolah (indeks parsial), bukan per tahun.
    await bad(
      db()
        .insert(graduationDecision)
        .values({ ...base, studentId: s!.id, result: 'graduated', sklNumber: '001/SKL/2027' }),
    );
    await db().delete(student).where(eq(student.id, s!.id));
  });
});

describe('kebijakan dihapus: kembali ke alur lama', () => {
  it('draf ikut terhapus; daftar kembali 409 no_graduation_policy', async () => {
    // Tahun y2 (rollover) belum punya kebijakan: buat, simpan draf, hapus.
    const y2 = (p: string) => `/v1/academic-years/${years.y2}${p}`;
    const body = policyBody({ config: { examWeights: {} } });
    expect((await call('PUT', y2('/graduation-policy'), adminCookie, body)).statusCode).toBe(200);
    const q = await call('GET', y2('/graduations'), adminCookie);
    expect(q.statusCode, q.body).toBe(200);
    const ids = q.json().students.map((s: { studentId: string }) => s.studentId);
    expect(ids.length).toBeGreaterThan(0);
    const saved = await call('PUT', y2('/graduations'), adminCookie, {
      decisions: [{ studentId: ids[0], result: 'deferred' }],
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await call('DELETE', y2('/graduation-policy'), adminCookie)).statusCode).toBe(200);
    expect((await call('GET', y2('/graduation-policy'), adminCookie)).json()).toEqual({ policy: null });
    expect(
      await db().select().from(graduationDecision).where(eq(graduationDecision.academicYearId, years.y2)),
    ).toHaveLength(0);
    expect((await call('GET', y2('/graduations'), adminCookie)).json().error.code).toBe(
      'no_graduation_policy',
    );
  });
});

describe('jumlah kueri tidak bergantung pada jumlah murid', () => {
  it('daftar penetapan 3 dan 24 murid memakai kueri sama', async () => {
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
      const [q] = await db()
        .insert(academicYear)
        .values({ schoolId, name: 'Kueri', startsOn: '2030-07-01', endsOn: '2031-06-30' })
        .returning();
      const [c] = await db()
        .insert(classRoom)
        .values({ schoolId, academicYearId: q!.id, name: 'XII-Q', level: 'XII' })
        .returning();
      const [qs] = await db()
        .insert(semester)
        .values({ schoolId, academicYearId: q!.id, name: 'Q1', startsOn: '2030-07-01', endsOn: '2030-12-31' })
        .returning();
      const config = parseConfig({
        reportWeight: 60,
        examWeights: { [examId]: 40 },
        reportScope: 'final_level',
        rounding: 'integer',
        minAverage: null,
        minSubjectScore: null,
      });
      let made = 0;
      const add = async (n: number) => {
        for (let i = 0; i < n; i++) {
          made++;
          const [st] = await db()
            .insert(student)
            .values({ schoolId, name: `Q${made}`, gender: 'L', nis: `q${made}-${run}` })
            .returning();
          await db()
            .insert(enrollment)
            .values({ schoolId, studentId: st!.id, classId: c!.id, academicYearId: q!.id });
          if (made % 2 === 0) {
            await db()
              .insert(reportCard)
              .values({
                schoolId,
                semesterId: qs!.id,
                studentId: st!.id,
                classId: c!.id,
                status: 'final',
                finalizedAt: new Date(),
                snapshot: snapshot({ mat: 70 + made, ind: 80 }),
                schemaVersion: 2,
              });
          }
        }
      };
      const measure = async () => {
        queries = 0;
        let rows = 0;
        await withTenant(counting.db, [schoolId], async (tx) => {
          const list = await buildGraduationList(tx, { id: q!.id }, config);
          rows = list.students.length;
          expect(await loadPolicy(tx, q!.id)).toBeNull();
        });
        return { queries, rows };
      };
      await add(3);
      const small = await measure();
      await add(21);
      const big = await measure();
      expect([small.rows, big.rows]).toEqual([3, 24]);
      expect(big.queries).toBe(small.queries);
    } finally {
      await counting.pool.end();
    }
  }, 120_000);
});
