import {
  academicYear,
  and,
  assessment,
  assignRoles,
  classRoom,
  dailyAttendance,
  enrollment,
  entitlement,
  eq,
  extracurricular,
  extracurricularAssessment,
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

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let noModuleId = '';
let otherId = '';
let foundationId = '';
const userIds: string[] = [];
let adminCookie = '';
let waliCookie = '';
let lainCookie = '';
let principalCookie = '';
let curriculumCookie = '';
let noModuleCookie = '';
let otherCookie = '';

const ids = {
  semester: '',
  otherYearSemester: '',
  foreignSemester: '',
  class7A: '',
  class7B: '',
  otherYearClass: '',
  foreignClass: '',
  mat: '',
  ipa: '',
  tWali: '',
  tLain: '',
  tForeign: '',
  ani: '',
  budi: '',
  citra: '',
  alumni: '',
  dewi: '',
  foreignStudent: '',
  loneStudent: '',
  tugas: '',
  uts: '',
  matTugas: '',
  matUts: '',
  ipaTugas: '',
};

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
async function join(label: string, sid: string, roles: string[]) {
  const u = await makeUser(label);
  const [m] = await app.platformDb.insert(member).values({ userId: u.id, schoolId: sid }).returning();
  await assignRoles(app.platformDb, m!.id, sid, roles);
  return { cookie: await login(u.email), memberId: m!.id };
}

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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

const docUrl = (studentId: string, semesterId = ids.semester) =>
  `/v1/report-cards/${studentId}?semesterId=${semesterId}`;
const listUrl = (classId = ids.class7A, semesterId = ids.semester) =>
  `/v1/report-cards?semesterId=${semesterId}&classId=${classId}`;
const finalize = (cookie: string, payload: object = {}) =>
  call('POST', '/v1/report-cards/finalize', cookie, {
    semesterId: ids.semester,
    classId: ids.class7A,
    ...payload,
  });

/** Isi skor langsung ke database (null = tanpa baris skor). */
async function setScore(assessmentId: string, studentId: string, value: number | null) {
  if (value === null) return;
  await app.platformDb
    .insert(score)
    .values({ schoolId, assessmentId, studentId, value, updatedBy: 'uji' })
    .onConflictDoUpdate({ target: [score.assessmentId, score.studentId], set: { value } });
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Rapor', slug: `yr-${run}` })
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
  const make = async (slug: string, modules: string[]) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug, name: `Sekolah ${slug}` })
      .returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of modules) {
      await db
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    return s!.id;
  };
  schoolId = await make(`rpr-${run}`, ['grades']);
  noModuleId = await make(`rpr-nomod-${run}`, []);
  otherId = await make(`rpr-lain-${run}`, ['grades']);

  // Semester utama sempit (Juli-Desember 2026) di dalam tahun ajaran lebar, untuk menguji rentang absensi.
  const year = async (sid: string, name: string, startsOn: string, endsOn: string, isActive: boolean) => {
    const [y] = await db
      .insert(academicYear)
      .values({ schoolId: sid, name, startsOn, endsOn, isActive })
      .returning();
    return y!.id;
  };
  const mkSemester = async (
    sid: string,
    yearId: string,
    startsOn: string,
    endsOn: string,
    active = false,
  ) => {
    const [sem] = await db
      .insert(semester)
      .values({ schoolId: sid, academicYearId: yearId, name: 'Ganjil', startsOn, endsOn, isActive: active })
      .returning();
    return sem!.id;
  };
  const mainYear = await year(schoolId, '2000-2099', '2000-01-01', '2099-12-31', true);
  ids.semester = await mkSemester(schoolId, mainYear, '2026-07-01', '2026-12-31', true);
  const oldYear = await year(schoolId, '1990-1999', '1990-01-01', '1999-12-31', false);
  ids.otherYearSemester = await mkSemester(schoolId, oldYear, '1990-01-01', '1999-12-31');
  const foreignYear = await year(otherId, '2000-2099', '2000-01-01', '2099-12-31', true);
  ids.foreignSemester = await mkSemester(otherId, foreignYear, '2026-07-01', '2026-12-31', true);

  const mkClass = async (sid: string, yearId: string, name: string) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId: sid, academicYearId: yearId, name, level: '7' })
      .returning();
    return c!.id;
  };
  ids.class7A = await mkClass(schoolId, mainYear, '7A');
  ids.class7B = await mkClass(schoolId, mainYear, '7B');
  ids.otherYearClass = await mkClass(schoolId, oldYear, '7A');
  ids.foreignClass = await mkClass(otherId, foreignYear, '7A');

  const mkSubject = async (code: string, name: string) => {
    const [s] = await db.insert(subject).values({ schoolId, code, name }).returning();
    return s!.id;
  };
  ids.mat = await mkSubject('MAT', 'Matematika');
  ids.ipa = await mkSubject('IPA', 'IPA');

  const mkStudent = async (
    sid: string,
    yearId: string | null,
    classId: string | null,
    name: string,
    status: 'active' | 'graduated' = 'active',
  ) => {
    const [s] = await db
      .insert(student)
      .values({ schoolId: sid, name, gender: 'L', status, nis: `${name}-${run}`, nisn: `N-${name}-${run}` })
      .returning();
    if (yearId && classId) {
      await db
        .insert(enrollment)
        .values({ schoolId: sid, studentId: s!.id, classId, academicYearId: yearId });
    }
    return s!.id;
  };
  ids.ani = await mkStudent(schoolId, mainYear, ids.class7A, 'Ani');
  ids.budi = await mkStudent(schoolId, mainYear, ids.class7A, 'Budi');
  ids.citra = await mkStudent(schoolId, mainYear, ids.class7A, 'Citra');
  ids.alumni = await mkStudent(schoolId, mainYear, ids.class7A, 'Alumni', 'graduated');
  ids.dewi = await mkStudent(schoolId, mainYear, ids.class7B, 'Dewi');
  ids.loneStudent = await mkStudent(schoolId, null, null, 'Lepas');
  ids.foreignStudent = await mkStudent(otherId, foreignYear, ids.foreignClass, 'Siswa Lain');

  adminCookie = (await join('admin-rapor', schoolId, ['school_admin'])).cookie;
  const wali = await join('wali-rapor', schoolId, ['teacher']);
  waliCookie = wali.cookie;
  lainCookie = (await join('guru-lain-rapor', schoolId, ['teacher'])).cookie;
  principalCookie = (await join('kepsek-rapor', schoolId, ['principal'])).cookie;
  curriculumCookie = (await join('kurikulum-rapor', schoolId, ['curriculum'])).cookie;
  noModuleCookie = (await join('admin-tanpa-modul-rapor', noModuleId, ['school_admin'])).cookie;
  otherCookie = (await join('admin-rapor-lain', otherId, ['school_admin'])).cookie;

  const [tWali] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Bu Wali', nip: `NIP-W-${run}`, memberId: wali.memberId })
    .returning();
  const [tLain] = await db.insert(teacher).values({ schoolId, name: 'Pak Lain' }).returning();
  const [tForeign] = await db.insert(teacher).values({ schoolId: otherId, name: 'Guru Asing' }).returning();
  ids.tWali = tWali!.id;
  ids.tLain = tLain!.id;
  ids.tForeign = tForeign!.id;
  await db.update(classRoom).set({ homeroomTeacherId: ids.tWali }).where(eq(classRoom.id, ids.class7A));

  // Komponen Tugas (50) dan UTS (50); KKM bawaan 75, predikat A 90, B 80, C 70.
  const mkComponent = async (name: string, weight: number, sort: number) => {
    const [c] = await db.insert(gradeComponent).values({ schoolId, name, weight, sort }).returning();
    return c!.id;
  };
  ids.tugas = await mkComponent('Tugas', 50, 0);
  ids.uts = await mkComponent('UTS', 50, 1);
  const mkAssessment = async (subjectId: string, componentId: string, title: string) => {
    const [a] = await db
      .insert(assessment)
      .values({
        schoolId,
        semesterId: ids.semester,
        classId: ids.class7A,
        subjectId,
        componentId,
        title,
        date: '2026-08-01',
      })
      .returning();
    return a!.id;
  };
  ids.matTugas = await mkAssessment(ids.mat, ids.tugas, 'Tugas Mat');
  ids.matUts = await mkAssessment(ids.mat, ids.uts, 'UTS Mat');
  ids.ipaTugas = await mkAssessment(ids.ipa, ids.tugas, 'Tugas IPA');

  // Matematika: Ani (90, 80) = 85 B; Budi (70, 80) = 75 C; Citra (50, tanpa UTS) = 50 D.
  await setScore(ids.matTugas, ids.ani, 90);
  await setScore(ids.matUts, ids.ani, 80);
  await setScore(ids.matTugas, ids.budi, 70);
  await setScore(ids.matUts, ids.budi, 80);
  await setScore(ids.matTugas, ids.citra, 50);
  // IPA (Tugas saja): Ani 95 A; Budi tanpa skor; Citra 60 D.
  await setScore(ids.ipaTugas, ids.ani, 95);
  await setScore(ids.ipaTugas, ids.citra, 60);

  // Ekskul Ani semester ini; absensi dalam dan di luar rentang semester.
  const [pramuka] = await db.insert(extracurricular).values({ schoolId, name: 'Pramuka' }).returning();
  await db.insert(extracurricularAssessment).values({
    schoolId,
    extracurricularId: pramuka!.id,
    studentId: ids.ani,
    semesterId: ids.semester,
    predicate: 'A',
    note: 'Aktif dan disiplin',
    updatedBy: 'uji',
  });
  const att = (date: string, status: 'present' | 'late' | 'excused' | 'sick' | 'absent') => ({
    schoolId,
    studentId: ids.ani,
    date,
    status,
  });
  await db.insert(dailyAttendance).values([
    att('2026-07-01', 'sick'),
    att('2026-07-02', 'sick'),
    att('2026-07-03', 'excused'),
    att('2026-07-06', 'absent'),
    att('2026-07-07', 'late'),
    att('2026-07-08', 'present'),
    att('2026-12-31', 'absent'),
    // Di luar rentang semester: tidak dihitung.
    att('2026-06-30', 'sick'),
    att('2027-01-01', 'absent'),
  ]);
}, 90_000);

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, noModuleId, otherId]) {
    for (const table of [
      'audit_log',
      'report_card',
      'report_setting',
      'extracurricular_assessment',
      'extracurricular',
      'daily_attendance',
      'score',
      'assessment',
      'grade_component',
      'grading_setting',
      'teaching_assignment',
      'enrollment',
      'class_room',
      'subject',
      'student',
      'teacher',
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
}, 60_000);

describe('modul dan izin', () => {
  it('modul harus aktif, tanpa sesi 401, dan izin diperiksa', async () => {
    const blocked = await call('GET', '/v1/report-cards/settings', noModuleCookie, undefined, noModuleId);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('module_disabled');
    expect((await app.inject('/v1/report-cards/settings')).statusCode).toBe(401);
    for (const cookie of [adminCookie, waliCookie, principalCookie, curriculumCookie]) {
      expect((await call('GET', '/v1/report-cards/settings', cookie)).statusCode).toBe(200);
    }
    const body = { descA: 'a', descB: 'b', descC: 'c', descD: 'd' };
    // Hanya report_card:manage yang mengubah pengaturan dan membuka kembali rapor.
    for (const cookie of [waliCookie, principalCookie]) {
      expect((await call('PUT', '/v1/report-cards/settings', cookie, body)).statusCode).toBe(403);
      expect(
        (
          await call('POST', '/v1/report-cards/reopen', cookie, {
            semesterId: ids.semester,
            classId: ids.class7A,
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(
      (await call('PUT', '/v1/report-cards/settings', noModuleCookie, body, noModuleId)).statusCode,
    ).toBe(403);
  });
});

describe('pengaturan', () => {
  it('bawaan, ubah, kosong menjadi null, dan validasi', async () => {
    const def = (await call('GET', '/v1/report-cards/settings', adminCookie)).json();
    expect(def).toMatchObject({
      principalName: null,
      principalNip: null,
      city: null,
      address: null,
      showRank: false,
    });
    expect(def.descA).toContain('sangat baik');
    expect(def.descD).toContain('bimbingan');

    const body = {
      principalName: 'Drs. Kepala',
      principalNip: '1970',
      city: 'Bandung',
      address: 'Jl. Contoh 1',
      descA: 'Capaian A',
      descB: 'Capaian B',
      descC: 'Capaian C',
      descD: 'Capaian D',
      showRank: false,
    };
    const put = await call('PUT', '/v1/report-cards/settings', curriculumCookie, body);
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual(body);
    expect((await call('GET', '/v1/report-cards/settings', waliCookie)).json()).toEqual(body);

    const cleared = await call('PUT', '/v1/report-cards/settings', adminCookie, {
      ...body,
      principalNip: '  ',
      address: '',
    });
    expect(cleared.json()).toMatchObject({ principalName: 'Drs. Kepala', principalNip: null, address: null });
    await call('PUT', '/v1/report-cards/settings', adminCookie, body);

    expect(
      (await call('PUT', '/v1/report-cards/settings', adminCookie, { ...body, descA: '' })).statusCode,
    ).toBe(400);
    expect(
      (await call('PUT', '/v1/report-cards/settings', adminCookie, { ...body, descB: 'x'.repeat(501) }))
        .statusCode,
    ).toBe(400);
  });
});

describe('wali kelas pada kelas', () => {
  it('diterima, dikembalikan, divalidasi, dan opsional', async () => {
    const [yearRow] = await app.platformDb
      .select({ id: academicYear.id })
      .from(academicYear)
      .where(and(eq(academicYear.schoolId, schoolId), eq(academicYear.isActive, true)));
    const created = await call('POST', '/v1/classes', adminCookie, {
      academicYearId: yearRow!.id,
      name: '7C',
      level: '7',
      homeroomTeacherId: ids.tLain,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      name: '7C',
      homeroomTeacherId: ids.tLain,
      homeroomTeacherName: 'Pak Lain',
    });
    const classId = created.json().id;

    // Tanpa bidang itu: wali kelas tidak berubah; null mengosongkan.
    const keep = await call('PUT', `/v1/classes/${classId}`, adminCookie, { name: '7C', level: '7' });
    expect(keep.json()).toMatchObject({ homeroomTeacherId: ids.tLain, homeroomTeacherName: 'Pak Lain' });
    const swap = await call('PUT', `/v1/classes/${classId}`, adminCookie, {
      name: '7C',
      level: '7',
      homeroomTeacherId: ids.tWali,
    });
    expect(swap.json()).toMatchObject({ homeroomTeacherId: ids.tWali, homeroomTeacherName: 'Bu Wali' });
    const clear = await call('PUT', `/v1/classes/${classId}`, adminCookie, {
      name: '7C',
      level: '7',
      homeroomTeacherId: null,
    });
    expect(clear.json()).toMatchObject({ homeroomTeacherId: null, homeroomTeacherName: null });

    // Guru sekolah lain ditolak, baik saat membuat maupun mengubah.
    const foreign = await call('PUT', `/v1/classes/${classId}`, adminCookie, {
      name: '7C',
      level: '7',
      homeroomTeacherId: ids.tForeign,
    });
    expect(foreign.statusCode).toBe(400);
    expect(foreign.json().error.code).toBe('invalid_reference');
    const foreignCreate = await call('POST', '/v1/classes', adminCookie, {
      academicYearId: yearRow!.id,
      name: '7D',
      level: '7',
      homeroomTeacherId: ids.tForeign,
    });
    expect(foreignCreate.statusCode).toBe(400);

    const list = (await call('GET', `/v1/classes?academicYearId=${yearRow!.id}`, adminCookie)).json();
    const a = list.find((c: { name: string }) => c.name === '7A');
    expect(a).toMatchObject({ homeroomTeacherId: ids.tWali, homeroomTeacherName: 'Bu Wali' });
    expect(list.find((c: { name: string }) => c.name === '7B')).toMatchObject({
      homeroomTeacherId: null,
      homeroomTeacherName: null,
    });
  });
});

describe('daftar rapor kelas', () => {
  it('wali kelas dan peran lebar boleh; guru lain 403; rujukan divalidasi', async () => {
    const res = await call('GET', listUrl(), waliCookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      {
        studentId: ids.ani,
        name: 'Ani',
        nis: `Ani-${run}`,
        status: 'draft',
        hasNote: false,
        average: 90,
        subjectsGraded: 2,
        subjectsTotal: 2,
      },
      {
        studentId: ids.budi,
        name: 'Budi',
        nis: `Budi-${run}`,
        status: 'draft',
        hasNote: false,
        average: 75,
        subjectsGraded: 1,
        subjectsTotal: 2,
      },
      {
        studentId: ids.citra,
        name: 'Citra',
        nis: `Citra-${run}`,
        status: 'draft',
        hasNote: false,
        average: 55,
        subjectsGraded: 2,
        subjectsTotal: 2,
      },
    ]);
    for (const cookie of [adminCookie, principalCookie, curriculumCookie]) {
      expect((await call('GET', listUrl(), cookie)).statusCode).toBe(200);
    }
    const denied = await call('GET', listUrl(), lainCookie);
    expect(denied.statusCode).toBe(403);
    // Wali 7A bukan wali 7B.
    expect((await call('GET', listUrl(ids.class7B), waliCookie)).statusCode).toBe(403);

    // Kelas tanpa penilaian: tanpa mapel, rata-rata kosong.
    const b = (await call('GET', listUrl(ids.class7B), adminCookie)).json();
    expect(b).toEqual([
      expect.objectContaining({ name: 'Dewi', average: null, subjectsGraded: 0, subjectsTotal: 0 }),
    ]);

    const bad = (classId: string, semesterId: string, sid = schoolId, cookie = adminCookie) =>
      call('GET', listUrl(classId, semesterId), cookie, undefined, sid);
    expect((await bad(ids.class7A, ids.otherYearSemester)).statusCode).toBe(400);
    expect((await bad(ids.otherYearClass, ids.semester)).statusCode).toBe(400);
    expect((await bad(ids.foreignClass, ids.semester)).statusCode).toBe(400);
    expect((await bad(ids.class7A, ids.foreignSemester)).statusCode).toBe(400);
  });
});

describe('dokumen rapor draft', () => {
  it('angka, predikat, deskripsi otomatis, ekskul, dan absensi', async () => {
    const res = await call('GET', docUrl(ids.ani), waliCookie);
    expect(res.statusCode).toBe(200);
    const doc = res.json();
    expect(doc).toMatchObject({
      status: 'draft',
      school: { name: `Sekolah rpr-${run}`, address: 'Jl. Contoh 1', city: 'Bandung' },
      semester: { id: ids.semester, name: 'Ganjil', academicYear: '2000-2099' },
      student: {
        id: ids.ani,
        name: 'Ani',
        nis: `Ani-${run}`,
        nisn: `N-Ani-${run}`,
        className: '7A',
        level: '7',
      },
      extracurriculars: [{ name: 'Pramuka', predicate: 'A', note: 'Aktif dan disiplin' }],
      // 1 Jul-31 Des 2026: sakit 2, izin 1, alpa 2 (6 Jul dan 31 Des), terlambat 1; di luar rentang dan hadir tak dihitung.
      attendance: { sick: 2, excused: 1, absent: 2, late: 1 },
      homeroomNote: null,
      homeroomTeacher: { name: 'Bu Wali', nip: `NIP-W-${run}` },
      principal: { name: 'Drs. Kepala', nip: '1970' },
      rank: null,
    });
    expect(Number.isNaN(Date.parse(doc.generatedAt))).toBe(false);
    // Mapel urut nama; deskripsi dari pengaturan menurut predikat.
    expect(doc.subjects).toEqual([
      {
        subjectId: ids.ipa,
        name: 'IPA',
        kkm: 75,
        final: 95,
        predicate: 'A',
        description: 'Capaian A',
        belowKkm: false,
      },
      {
        subjectId: ids.mat,
        name: 'Matematika',
        kkm: 75,
        final: 85,
        predicate: 'B',
        description: 'Capaian B',
        belowKkm: false,
      },
    ]);

    const budi = (await call('GET', docUrl(ids.budi), adminCookie)).json();
    expect(budi.subjects).toEqual([
      {
        subjectId: ids.ipa,
        name: 'IPA',
        kkm: 75,
        final: null,
        predicate: null,
        description: null,
        belowKkm: false,
      },
      {
        subjectId: ids.mat,
        name: 'Matematika',
        kkm: 75,
        final: 75,
        predicate: 'C',
        description: 'Capaian C',
        belowKkm: false,
      },
    ]);
    expect(budi.extracurriculars).toEqual([]);
    expect(budi.attendance).toEqual({ sick: 0, excused: 0, absent: 0, late: 0 });

    const citra = (await call('GET', docUrl(ids.citra), principalCookie)).json();
    expect(citra.subjects).toEqual([
      expect.objectContaining({
        name: 'IPA',
        final: 60,
        predicate: 'D',
        description: 'Capaian D',
        belowKkm: true,
      }),
      expect.objectContaining({ name: 'Matematika', final: 50, predicate: 'D', belowKkm: true }),
    ]);
  });

  it('akses dan rujukan', async () => {
    expect((await call('GET', docUrl(ids.ani), lainCookie)).statusCode).toBe(403);
    expect((await call('GET', docUrl(ids.ani), curriculumCookie)).statusCode).toBe(200);
    // Siswa tanpa pendaftaran di tahun ajaran itu, siswa tahun lain, dan siswa sekolah lain: 404 / 400.
    expect((await call('GET', docUrl(ids.loneStudent), adminCookie)).statusCode).toBe(404);
    expect((await call('GET', docUrl(ids.ani, ids.otherYearSemester), adminCookie)).statusCode).toBe(404);
    expect((await call('GET', docUrl(ids.foreignStudent), adminCookie)).statusCode).toBe(404);
    expect((await call('GET', docUrl(ids.ani, ids.foreignSemester), adminCookie)).statusCode).toBe(400);
    expect((await call('GET', '/v1/report-cards/tidak-uuid?semesterId=x', adminCookie)).statusCode).toBe(400);
  });
});

describe('peringkat', () => {
  it('hanya muncul bila pengaturan menampilkannya, menurut rata-rata nilai akhir', async () => {
    const settings = {
      principalName: 'Drs. Kepala',
      principalNip: '1970',
      city: 'Bandung',
      address: 'Jl. Contoh 1',
      descA: 'Capaian A',
      descB: 'Capaian B',
      descC: 'Capaian C',
      descD: 'Capaian D',
    };
    expect(
      (await call('PUT', '/v1/report-cards/settings', adminCookie, { ...settings, showRank: true })).json()
        .showRank,
    ).toBe(true);
    const rank = async (id: string) => (await call('GET', docUrl(id), adminCookie)).json().rank;
    // Rata-rata: Ani 90, Budi 75, Citra 55.
    expect(await rank(ids.ani)).toEqual({ position: 1, of: 3 });
    expect(await rank(ids.budi)).toEqual({ position: 2, of: 3 });
    expect(await rank(ids.citra)).toEqual({ position: 3, of: 3 });
    await call('PUT', '/v1/report-cards/settings', adminCookie, { ...settings, showRank: false });
    expect(await rank(ids.ani)).toBeNull();
  });
});

describe('catatan wali kelas', () => {
  const note = (cookie: string, studentId: string, text: string | null, semesterId = ids.semester) =>
    call('PUT', '/v1/report-cards/note', cookie, { semesterId, studentId, note: text });

  it('wali kelas dan pemegang kelola boleh; yang lain 403; batas 500', async () => {
    const ok = await note(waliCookie, ids.ani, '  Pertahankan prestasimu.  ');
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ ok: true, note: 'Pertahankan prestasimu.' });
    expect((await call('GET', docUrl(ids.ani), adminCookie)).json().homeroomNote).toBe(
      'Pertahankan prestasimu.',
    );
    const list = (await call('GET', listUrl(), waliCookie)).json();
    expect(list.find((s: { name: string }) => s.name === 'Ani').hasNote).toBe(true);
    expect(list.find((s: { name: string }) => s.name === 'Budi').hasNote).toBe(false);

    expect((await note(adminCookie, ids.budi, 'Perlu belajar lebih giat.')).statusCode).toBe(200);
    expect((await note(curriculumCookie, ids.budi, 'Oleh kurikulum.')).statusCode).toBe(200);
    // Guru lain, kepala sekolah (hanya baca), dan wali kelas bukan kelas siswa itu.
    expect((await note(lainCookie, ids.ani, 'x')).statusCode).toBe(403);
    expect((await note(principalCookie, ids.ani, 'x')).statusCode).toBe(403);
    expect((await note(waliCookie, ids.dewi, 'x')).statusCode).toBe(403);
    expect((await note(adminCookie, ids.ani, 'x'.repeat(501))).statusCode).toBe(400);
    expect((await note(adminCookie, ids.ani, 'x'.repeat(500))).statusCode).toBe(200);

    expect((await note(adminCookie, ids.loneStudent, 'x')).statusCode).toBe(404);
    expect((await note(adminCookie, ids.foreignStudent, 'x')).statusCode).toBe(404);
    expect((await note(adminCookie, ids.ani, 'x', ids.foreignSemester)).statusCode).toBe(400);

    // Null dan teks kosong menghapus catatan.
    expect((await note(waliCookie, ids.ani, null)).json().note).toBeNull();
    expect((await note(waliCookie, ids.budi, '   ')).json().note).toBeNull();
    expect((await call('GET', docUrl(ids.ani), adminCookie)).json().homeroomNote).toBeNull();
    await note(waliCookie, ids.ani, 'Pertahankan prestasimu.');
  });
});

describe('finalisasi, snapshot, dan buka kembali', () => {
  it('nilai belum lengkap ditolak kecuali force; hak akses', async () => {
    expect((await finalize(lainCookie)).statusCode).toBe(403);
    expect((await finalize(principalCookie)).statusCode).toBe(403);
    expect((await finalize(waliCookie, { semesterId: ids.foreignSemester })).statusCode).toBe(400);
    // Kelas tanpa penilaian dianggap belum lengkap.
    const empty = await call('POST', '/v1/report-cards/finalize', adminCookie, {
      semesterId: ids.semester,
      classId: ids.class7B,
    });
    expect(empty.statusCode).toBe(409);
    expect(empty.json().error.code).toBe('grades_incomplete');
    expect((await call('GET', docUrl(ids.dewi), adminCookie)).json().status).toBe('draft');

    // Budi tanpa nilai IPA dan Ani lengkap: 1 siswa belum lengkap (Citra punya keduanya).
    const res = await finalize(waliCookie);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('grades_incomplete');
    expect(res.json().error.message).toContain('1 siswa');
    expect((await call('GET', docUrl(ids.ani), adminCookie)).json().status).toBe('draft');
  });

  it('force membekukan dokumen; perubahan nilai dan pengaturan sesudahnya tidak berpengaruh', async () => {
    const before = (await call('GET', docUrl(ids.ani), adminCookie)).json();
    const res = await finalize(waliCookie, { force: true });
    expect(res.statusCode).toBe(200);
    // Siswa lulus (Alumni) tidak ikut.
    expect(res.json()).toEqual({ finalized: 3 });

    const frozen = (await call('GET', docUrl(ids.ani), waliCookie)).json();
    expect(frozen.status).toBe('final');
    expect({ ...frozen, status: 'draft', generatedAt: before.generatedAt }).toEqual(before);

    // Ubah nilai dan pengaturan sesudah final.
    await app.platformDb
      .update(score)
      .set({ value: 10 })
      .where(and(eq(score.assessmentId, ids.matTugas), eq(score.studentId, ids.ani)));
    await call('PUT', '/v1/report-cards/settings', adminCookie, {
      principalName: 'Pengganti',
      descA: 'Deskripsi baru',
      descB: 'b',
      descC: 'c',
      descD: 'd',
      showRank: true,
    });
    const after = (await call('GET', docUrl(ids.ani), adminCookie)).json();
    expect(after).toEqual(frozen);
    expect(after.subjects.find((s: { name: string }) => s.name === 'Matematika').final).toBe(85);
    expect(after.principal).toEqual({ name: 'Drs. Kepala', nip: '1970' });

    // Daftar memakai snapshot: rata-rata Ani tetap 90 dan status final.
    const list = (await call('GET', listUrl(), adminCookie)).json();
    expect(list.map((s: { status: string }) => s.status)).toEqual(['final', 'final', 'final']);
    expect(list[0]).toMatchObject({ name: 'Ani', average: 90, hasNote: true });
    expect(list[1]).toMatchObject({ name: 'Budi', average: 75, subjectsGraded: 1, subjectsTotal: 2 });
  });

  it('catatan ditolak 409 report_final saat final', async () => {
    const res = await call('PUT', '/v1/report-cards/note', waliCookie, {
      semesterId: ids.semester,
      studentId: ids.ani,
      note: 'Ubah',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('report_final');
    expect(
      (
        await call('PUT', '/v1/report-cards/note', adminCookie, {
          semesterId: ids.semester,
          studentId: ids.budi,
          note: 'Ubah',
        })
      ).statusCode,
    ).toBe(409);
  });

  it('buka kembali hanya pemegang kelola; rapor kembali draft dengan nilai terkini', async () => {
    const reopen = (cookie: string) =>
      call('POST', '/v1/report-cards/reopen', cookie, { semesterId: ids.semester, classId: ids.class7A });
    expect((await reopen(waliCookie)).statusCode).toBe(403);
    expect(
      (
        await call('POST', '/v1/report-cards/reopen', adminCookie, {
          semesterId: ids.semester,
          classId: ids.foreignClass,
        })
      ).statusCode,
    ).toBe(400);
    const res = await reopen(curriculumCookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ reopened: 3 });
    expect((await reopen(adminCookie)).json()).toEqual({ reopened: 0 });

    const doc = (await call('GET', docUrl(ids.ani), adminCookie)).json();
    expect(doc.status).toBe('draft');
    // Nilai Matematika Ani kini (10 + 80) / 2 = 45; deskripsi dan peringkat mengikuti pengaturan terbaru.
    expect(doc.subjects.find((s: { name: string }) => s.name === 'Matematika')).toMatchObject({
      final: 45,
      predicate: 'D',
      description: 'd',
      belowKkm: true,
    });
    expect(doc.principal).toEqual({ name: 'Pengganti', nip: null });
    // Rata-rata Ani kini 70 (45 dan 95), di bawah Budi (75).
    expect(doc.rank).toEqual({ position: 2, of: 3 });
    // Catatan wali kelas tetap ada dan dapat diubah lagi.
    expect(doc.homeroomNote).toBe('Pertahankan prestasimu.');
    expect(
      (
        await call('PUT', '/v1/report-cards/note', waliCookie, {
          semesterId: ids.semester,
          studentId: ids.ani,
          note: 'Perbaiki Matematika.',
        })
      ).statusCode,
    ).toBe(200);
  });

  it('finalisasi tanpa force berhasil bila nilai lengkap, dan dapat difinalkan ulang', async () => {
    await setScore(ids.ipaTugas, ids.budi, 85);
    const res = await finalize(waliCookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ finalized: 3 });
    const budi = (await call('GET', docUrl(ids.budi), adminCookie)).json();
    expect(budi.status).toBe('final');
    expect(budi.subjects.find((s: { name: string }) => s.name === 'IPA')).toMatchObject({
      final: 85,
      predicate: 'B',
    });
    expect(budi.homeroomNote).toBeNull();
    expect((await call('GET', docUrl(ids.ani), adminCookie)).json().homeroomNote).toBe(
      'Perbaiki Matematika.',
    );
    // Finalisasi ulang menimpa snapshot tanpa gagal.
    expect((await finalize(adminCookie)).statusCode).toBe(200);
  });
});

describe('lintas sekolah', () => {
  it('tidak ada kebocoran data rapor, pengaturan, maupun tulis', async () => {
    const other = (method: 'GET' | 'PUT' | 'POST', url: string, payload?: object) =>
      call(method, url, otherCookie, payload, otherId);
    // Pengaturan sekolah lain tetap bawaan.
    const settings = (await other('GET', '/v1/report-cards/settings')).json();
    expect(settings.principalName).toBeNull();
    expect(settings.descA).toContain('sangat baik');
    // Siswa dan kelas sekolah ini tidak terlihat dari sekolah lain.
    expect((await other('GET', docUrl(ids.ani, ids.foreignSemester))).statusCode).toBe(404);
    expect((await other('GET', listUrl(ids.class7A, ids.foreignSemester))).statusCode).toBe(400);
    expect(
      (
        await other('PUT', '/v1/report-cards/note', {
          semesterId: ids.foreignSemester,
          studentId: ids.ani,
          note: 'x',
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await other('POST', '/v1/report-cards/finalize', {
          semesterId: ids.foreignSemester,
          classId: ids.class7A,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await other('POST', '/v1/report-cards/reopen', { semesterId: ids.semester, classId: ids.class7A }))
        .statusCode,
    ).toBe(400);
    // Rapor sekolah lain sendiri: kosong dan satu siswa.
    const own = (await other('GET', listUrl(ids.foreignClass, ids.foreignSemester))).json();
    expect(own).toEqual([expect.objectContaining({ name: 'Siswa Lain', status: 'draft', subjectsTotal: 0 })]);
    // Rapor final sekolah ini tidak berubah oleh semua percobaan di atas.
    expect((await call('GET', docUrl(ids.ani), adminCookie)).json().status).toBe('final');
  });
});
