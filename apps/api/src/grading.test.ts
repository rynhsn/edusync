import {
  academicYear,
  assignRoles,
  classRoom,
  enrollment,
  entitlement,
  eq,
  foundation,
  member,
  school,
  seedSchoolRoles,
  semester,
  sql,
  student,
  subject,
  subscription,
  teacher,
  teachingAssignment,
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
let matCookie = '';
let ipaCookie = '';
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
  foreignClass: '',
  mat: '',
  ipa: '',
  foreignSubject: '',
  ani: '',
  budi: '',
  citra: '',
  alumni: '',
  dewi: '',
  foreignStudent: '',
  foreignComponent: '',
  tugas: '',
  uh: '',
  uts: '',
  uas: '',
  matTugas: '',
  matUh: '',
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

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Nilai', slug: `yn-${run}` })
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
  schoolId = await make(`nil-${run}`, ['grades']);
  noModuleId = await make(`nil-nomod-${run}`, []);
  otherId = await make(`nil-lain-${run}`, ['grades']);

  const year = async (sid: string, name: string, startsOn: string, endsOn: string, isActive: boolean) => {
    const [y] = await db
      .insert(academicYear)
      .values({ schoolId: sid, name, startsOn, endsOn, isActive })
      .returning();
    const [sem] = await db
      .insert(semester)
      .values({ schoolId: sid, academicYearId: y!.id, name: 'Ganjil', startsOn, endsOn, isActive })
      .returning();
    return { yearId: y!.id, semesterId: sem!.id };
  };
  const main = await year(schoolId, '2000-2099', '2000-01-01', '2099-12-31', true);
  ids.semester = main.semesterId;
  ids.otherYearSemester = (await year(schoolId, '1990-1999', '1990-01-01', '1999-12-31', false)).semesterId;
  const foreign = await year(otherId, '2000-2099', '2000-01-01', '2099-12-31', true);
  ids.foreignSemester = foreign.semesterId;

  const mkClass = async (sid: string, yearId: string, name: string) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId: sid, academicYearId: yearId, name, level: '7' })
      .returning();
    return c!.id;
  };
  ids.class7A = await mkClass(schoolId, main.yearId, '7A');
  ids.class7B = await mkClass(schoolId, main.yearId, '7B');
  ids.foreignClass = await mkClass(otherId, foreign.yearId, '7A');

  const mkSubject = async (sid: string, code: string, name: string) => {
    const [s] = await db.insert(subject).values({ schoolId: sid, code, name }).returning();
    return s!.id;
  };
  ids.mat = await mkSubject(schoolId, 'MAT', 'Matematika');
  ids.ipa = await mkSubject(schoolId, 'IPA', 'IPA');
  ids.foreignSubject = await mkSubject(otherId, 'MAT', 'Matematika');

  const mkStudent = async (
    sid: string,
    yearId: string,
    classId: string,
    name: string,
    status: 'active' | 'graduated' = 'active',
  ) => {
    const [s] = await db.insert(student).values({ schoolId: sid, name, gender: 'L', status }).returning();
    await db.insert(enrollment).values({ schoolId: sid, studentId: s!.id, classId, academicYearId: yearId });
    return s!.id;
  };
  ids.ani = await mkStudent(schoolId, main.yearId, ids.class7A, 'Ani');
  ids.budi = await mkStudent(schoolId, main.yearId, ids.class7A, 'Budi');
  ids.citra = await mkStudent(schoolId, main.yearId, ids.class7A, 'Citra');
  ids.alumni = await mkStudent(schoolId, main.yearId, ids.class7A, 'Alumni', 'graduated');
  ids.dewi = await mkStudent(schoolId, main.yearId, ids.class7B, 'Dewi');
  ids.foreignStudent = await mkStudent(otherId, foreign.yearId, ids.foreignClass, 'Siswa Lain');

  adminCookie = (await join('admin-nilai', schoolId, ['school_admin'])).cookie;
  const mat = await join('guru-mat', schoolId, ['teacher']);
  matCookie = mat.cookie;
  const ipa = await join('guru-ipa', schoolId, ['teacher']);
  ipaCookie = ipa.cookie;
  principalCookie = (await join('kepsek-nilai', schoolId, ['principal'])).cookie;
  curriculumCookie = (await join('kurikulum-nilai', schoolId, ['curriculum'])).cookie;
  noModuleCookie = (await join('admin-tanpa-modul-nilai', noModuleId, ['school_admin'])).cookie;
  otherCookie = (await join('admin-nilai-lain', otherId, ['school_admin'])).cookie;

  const [tMat] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Pak Mat', memberId: mat.memberId })
    .returning();
  const [tIpa] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Bu IPA', memberId: ipa.memberId })
    .returning();
  // Pak Mat mengampu Matematika di 7A; Bu IPA mengampu IPA hanya di 7B.
  await db.insert(teachingAssignment).values([
    { schoolId, classId: ids.class7A, subjectId: ids.mat, teacherId: tMat!.id },
    { schoolId, classId: ids.class7B, subjectId: ids.ipa, teacherId: tIpa!.id },
  ]);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, noModuleId, otherId]) {
    for (const table of [
      'audit_log',
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
});

const assessmentBody = (over: object = {}) => ({
  semesterId: ids.semester,
  classId: ids.class7A,
  subjectId: ids.mat,
  componentId: ids.tugas,
  title: 'Tugas 1',
  date: '2026-08-01',
  maxScore: 100,
  ...over,
});

describe('modul dan izin', () => {
  it('modul harus aktif, tanpa sesi 401, dan izin diperiksa', async () => {
    const blocked = await call('GET', '/v1/grading/settings', noModuleCookie, undefined, noModuleId);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('module_disabled');
    expect((await app.inject('/v1/grading/settings')).statusCode).toBe(401);
    for (const cookie of [adminCookie, matCookie, principalCookie, curriculumCookie]) {
      expect((await call('GET', '/v1/grading/settings', cookie)).statusCode).toBe(200);
      expect((await call('GET', '/v1/grading/components', cookie)).statusCode).toBe(200);
    }
    // Hanya pemegang grade:configure yang mengubah pengaturan dan komponen.
    const settings = { kkm: 75, predicateA: 90, predicateB: 80, predicateC: 70 };
    for (const cookie of [matCookie, principalCookie]) {
      expect((await call('PUT', '/v1/grading/settings', cookie, settings)).statusCode).toBe(403);
      expect(
        (await call('POST', '/v1/grading/components', cookie, { name: 'X', weight: 10 })).statusCode,
      ).toBe(403);
      expect((await call('POST', '/v1/grading/components/defaults', cookie)).statusCode).toBe(403);
    }
    // Kepala sekolah hanya membaca: tidak boleh membuat penilaian.
    expect((await call('POST', '/v1/assessments', principalCookie, assessmentBody())).statusCode).toBe(403);
  });
});

describe('pengaturan', () => {
  it('bawaan, ubah, dan validasi', async () => {
    const def = await call('GET', '/v1/grading/settings', adminCookie);
    expect(def.json()).toEqual({ kkm: 75, predicateA: 90, predicateB: 80, predicateC: 70 });

    const put = (body: object, cookie = adminCookie) => call('PUT', '/v1/grading/settings', cookie, body);
    const ok = await put({ kkm: 70, predicateA: 92, predicateB: 82, predicateC: 72 });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ kkm: 70, predicateA: 92, predicateB: 82, predicateC: 72 });
    expect((await call('GET', '/v1/grading/settings', matCookie)).json().kkm).toBe(70);
    // Kurikulum memegang grade:configure.
    expect(
      (await put({ kkm: 75, predicateA: 90, predicateB: 80, predicateC: 70 }, curriculumCookie)).statusCode,
    ).toBe(200);

    expect((await put({ kkm: 75, predicateA: 80, predicateB: 80, predicateC: 70 })).statusCode).toBe(400);
    expect((await put({ kkm: 75, predicateA: 90, predicateB: 70, predicateC: 80 })).statusCode).toBe(400);
    expect((await put({ kkm: 0, predicateA: 90, predicateB: 80, predicateC: 70 })).statusCode).toBe(400);
    expect((await put({ kkm: 101, predicateA: 90, predicateB: 80, predicateC: 70 })).statusCode).toBe(400);
    expect((await put({ kkm: 75, predicateA: 90, predicateB: 80, predicateC: 0 })).statusCode).toBe(400);
    expect((await call('GET', '/v1/grading/settings', adminCookie)).json().predicateA).toBe(90);
  });
});

describe('komponen', () => {
  it('pasang bawaan hanya bila kosong', async () => {
    const res = await call('POST', '/v1/grading/components/defaults', adminCookie);
    expect(res.statusCode).toBe(201);
    const list = res.json();
    expect(list.map((c: { name: string; weight: number }) => [c.name, c.weight])).toEqual([
      ['Tugas', 20],
      ['Ulangan Harian', 30],
      ['UTS', 20],
      ['UAS', 30],
    ]);
    const idOf = (name: string) => list.find((c: { name: string }) => c.name === name).id;
    ids.tugas = idOf('Tugas');
    ids.uh = idOf('Ulangan Harian');
    ids.uts = idOf('UTS');
    ids.uas = idOf('UAS');
    const again = await call('POST', '/v1/grading/components/defaults', adminCookie);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('not_empty');
  });

  it('tambah, nama unik, validasi bobot, ubah, hapus', async () => {
    const created = await call('POST', '/v1/grading/components', adminCookie, {
      name: 'Praktikum',
      weight: 10,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: 'Praktikum', weight: 10, sort: 4, assessmentCount: 0 });
    const id = created.json().id;

    expect(
      (await call('POST', '/v1/grading/components', adminCookie, { name: 'Praktikum', weight: 5 }))
        .statusCode,
    ).toBe(409);
    expect(
      (await call('POST', '/v1/grading/components', adminCookie, { name: 'Nol', weight: 0 })).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', '/v1/grading/components', adminCookie, { name: 'Besar', weight: 101 })).statusCode,
    ).toBe(400);

    const upd = await call('PUT', `/v1/grading/components/${id}`, adminCookie, {
      name: 'Praktik',
      weight: 15,
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json()).toMatchObject({ name: 'Praktik', weight: 15 });
    expect(
      (await call('PUT', `/v1/grading/components/${id}`, adminCookie, { name: 'UTS', weight: 15 }))
        .statusCode,
    ).toBe(409);
    expect(
      (await call('PUT', `/v1/grading/components/${id}`, otherCookie, { name: 'X', weight: 15 }, otherId))
        .statusCode,
    ).toBe(404);

    expect((await call('DELETE', `/v1/grading/components/${id}`, adminCookie)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/grading/components/${id}`, adminCookie)).statusCode).toBe(404);
    const list = (await call('GET', '/v1/grading/components', matCookie)).json();
    expect(list.map((c: { name: string }) => c.name)).toEqual(['Tugas', 'Ulangan Harian', 'UTS', 'UAS']);
  });
});

describe('penilaian', () => {
  it('guru pengampu dan pemegang configure boleh membuat; guru lain ditolak', async () => {
    const byTeacher = await call('POST', '/v1/assessments', matCookie, assessmentBody());
    expect(byTeacher.statusCode).toBe(201);
    expect(byTeacher.json()).toMatchObject({
      title: 'Tugas 1',
      className: '7A',
      subjectName: 'Matematika',
      componentName: 'Tugas',
      teacherName: 'Pak Mat',
      maxScore: 100,
      filled: 0,
      total: 3,
      canInput: true,
    });
    ids.matTugas = byTeacher.json().id;

    // Guru IPA tidak mengampu Matematika di 7A, juga tidak IPA di 7A.
    expect((await call('POST', '/v1/assessments', ipaCookie, assessmentBody())).statusCode).toBe(403);
    expect(
      (await call('POST', '/v1/assessments', ipaCookie, assessmentBody({ subjectId: ids.ipa }))).statusCode,
    ).toBe(403);
    // Guru Mat mengampu Matematika di 7A saja.
    expect(
      (await call('POST', '/v1/assessments', matCookie, assessmentBody({ subjectId: ids.ipa }))).statusCode,
    ).toBe(403);
    expect(
      (await call('POST', '/v1/assessments', matCookie, assessmentBody({ classId: ids.class7B }))).statusCode,
    ).toBe(403);

    const uh = await call(
      'POST',
      '/v1/assessments',
      adminCookie,
      assessmentBody({ componentId: ids.uh, title: 'UH 1', maxScore: 50 }),
    );
    expect(uh.statusCode).toBe(201);
    ids.matUh = uh.json().id;
    const uts = await call(
      'POST',
      '/v1/assessments',
      adminCookie,
      assessmentBody({ componentId: ids.uts, title: 'UTS Ganjil' }),
    );
    expect(uts.statusCode).toBe(201);
    ids.matUts = uts.json().id;
    // Admin menilai mapel yang tidak punya pengampu: teacherId kosong.
    const ipa = await call(
      'POST',
      '/v1/assessments',
      adminCookie,
      assessmentBody({ subjectId: ids.ipa, title: 'Tugas IPA' }),
    );
    expect(ipa.statusCode).toBe(201);
    expect(ipa.json().teacherId).toBeNull();
    ids.ipaTugas = ipa.json().id;
  });

  it('validasi isian dan rujukan, termasuk lintas sekolah', async () => {
    const post = (over: object) => call('POST', '/v1/assessments', adminCookie, assessmentBody(over));
    expect((await post({ maxScore: 0 })).statusCode).toBe(400);
    expect((await post({ maxScore: 1001 })).statusCode).toBe(400);
    expect((await post({ title: '  ' })).statusCode).toBe(400);
    expect((await post({ date: 'kemarin' })).statusCode).toBe(400);
    for (const over of [
      { classId: ids.foreignClass },
      { subjectId: ids.foreignSubject },
      { semesterId: ids.foreignSemester },
      { semesterId: ids.otherYearSemester }, // tahun ajaran berbeda dari kelas
      { componentId: ids.foreignComponent || crypto.randomUUID() },
      { classId: crypto.randomUUID() },
    ]) {
      const res = await post(over);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('invalid_reference');
    }
  });

  it('daftar dibatasi untuk guru, lengkap untuk configure/kepala sekolah', async () => {
    const all = (await call('GET', '/v1/assessments', adminCookie)).json();
    expect(all).toHaveLength(4);
    expect((await call('GET', '/v1/assessments', principalCookie)).json()).toHaveLength(4);
    expect((await call('GET', '/v1/assessments', curriculumCookie)).json()).toHaveLength(4);

    const mine = (await call('GET', '/v1/assessments', matCookie)).json();
    expect(mine.map((a: { title: string }) => a.title).sort()).toEqual(['Tugas 1', 'UH 1', 'UTS Ganjil']);
    expect((await call('GET', '/v1/assessments', ipaCookie)).json()).toEqual([]);

    const filtered = await call(
      'GET',
      `/v1/assessments?semesterId=${ids.semester}&classId=${ids.class7A}&subjectId=${ids.ipa}`,
      adminCookie,
    );
    expect(filtered.json().map((a: { title: string }) => a.title)).toEqual(['Tugas IPA']);
    // Admin tidak punya hak input pada daftar milik guru? Admin memegang configure, jadi boleh.
    expect(all.every((a: { canInput: boolean }) => a.canInput)).toBe(true);
    const principalView = (await call('GET', '/v1/assessments', principalCookie)).json();
    expect(principalView.every((a: { canInput: boolean }) => !a.canInput)).toBe(true);
  });

  it('my-assignments: guru hanya pasangan yang diampu, configure/kepala sekolah semua', async () => {
    const mat = (await call('GET', '/v1/grading/my-assignments', matCookie)).json();
    expect(mat).toEqual({ all: false, items: [{ classId: ids.class7A, subjectId: ids.mat }] });
    const ipa = (await call('GET', '/v1/grading/my-assignments', ipaCookie)).json();
    expect(ipa).toEqual({ all: false, items: [{ classId: ids.class7B, subjectId: ids.ipa }] });
    for (const c of [adminCookie, principalCookie, curriculumCookie]) {
      expect((await call('GET', '/v1/grading/my-assignments', c)).json()).toEqual({ all: true, items: [] });
    }
  });

  it('ubah penilaian: otorisasi, skor maksimum tidak di bawah skor yang ada', async () => {
    const body = { componentId: ids.tugas, title: 'Tugas 1 (revisi)', date: '2026-08-02', maxScore: 100 };
    const upd = await call('PUT', `/v1/assessments/${ids.matTugas}`, matCookie, body);
    expect(upd.statusCode).toBe(200);
    expect(upd.json()).toMatchObject({ title: 'Tugas 1 (revisi)', date: '2026-08-02' });
    expect((await call('PUT', `/v1/assessments/${ids.matTugas}`, ipaCookie, body)).statusCode).toBe(403);
    expect((await call('PUT', `/v1/assessments/${ids.matTugas}`, principalCookie, body)).statusCode).toBe(
      403,
    );
    expect(
      (await call('PUT', `/v1/assessments/${ids.matTugas}`, otherCookie, body, otherId)).statusCode,
    ).toBe(404);
    expect(
      (
        await call('PUT', `/v1/assessments/${ids.matTugas}`, adminCookie, {
          ...body,
          componentId: crypto.randomUUID(),
        })
      ).statusCode,
    ).toBe(400);
    await call('PUT', `/v1/assessments/${ids.matTugas}`, matCookie, { ...body, title: 'Tugas 1' });
  });
});

describe('skor', () => {
  const scoresOf = (id: string, cookie = adminCookie) => call('GET', `/v1/assessments/${id}/scores`, cookie);
  const save = (id: string, records: object[], cookie = adminCookie) =>
    call('PUT', `/v1/assessments/${id}/scores`, cookie, { records });

  it('roster hanya siswa aktif kelas, urut nama, dengan skor kosong', async () => {
    const res = await scoresOf(ids.matTugas, matCookie);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.canInput).toBe(true);
    expect(body.assessment.id).toBe(ids.matTugas);
    expect(body.students.map((s: { name: string }) => s.name)).toEqual(['Ani', 'Budi', 'Citra']);
    expect(body.students.every((s: { value: number | null }) => s.value === null)).toBe(true);
    // Kepala sekolah membaca tetapi tidak mengisi.
    const asPrincipal = await scoresOf(ids.matTugas, principalCookie);
    expect(asPrincipal.statusCode).toBe(200);
    expect(asPrincipal.json().canInput).toBe(false);
    // Guru yang tidak mengampu ditolak.
    expect((await scoresOf(ids.matTugas, ipaCookie)).statusCode).toBe(403);
    expect((await scoresOf(crypto.randomUUID())).statusCode).toBe(404);
  });

  it('batas 0..skor maksimum, bukan anggota kelas, dan otorisasi', async () => {
    const over = await save(ids.matUh, [{ studentId: ids.ani, value: 51 }]);
    expect(over.statusCode).toBe(400);
    expect(over.json().error.code).toBe('invalid_score');
    expect((await save(ids.matUh, [{ studentId: ids.ani, value: -1 }])).statusCode).toBe(400);
    expect((await save(ids.matUh, [{ studentId: ids.ani, value: 50 }])).statusCode).toBe(200);
    expect((await save(ids.matUh, [{ studentId: ids.ani, value: 0 }])).statusCode).toBe(200);

    for (const studentId of [ids.dewi, ids.alumni, ids.foreignStudent, crypto.randomUUID()]) {
      const res = await save(ids.matUh, [{ studentId, value: 10 }]);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('invalid_reference');
    }
    // Seluruh permintaan ditolak bila satu catatan salah.
    expect(
      (
        await save(ids.matUh, [
          { studentId: ids.budi, value: 10 },
          { studentId: ids.dewi, value: 10 },
        ])
      ).statusCode,
    ).toBe(400);
    expect((await scoresOf(ids.matUh)).json().students[1].value).toBeNull();

    expect((await save(ids.matUh, [{ studentId: ids.ani, value: 10 }], ipaCookie)).statusCode).toBe(403);
    expect((await save(ids.matUh, [{ studentId: ids.ani, value: 10 }], principalCookie)).statusCode).toBe(
      403,
    );
    expect(
      (await call('PUT', `/v1/assessments/${ids.matUh}/scores`, otherCookie, { records: [] }, otherId))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await call(
          'PUT',
          `/v1/assessments/${ids.matUh}/scores`,
          otherCookie,
          { records: [{ studentId: ids.ani, value: 1 }] },
          otherId,
        )
      ).statusCode,
    ).toBe(404);
  });

  it('simpan angka yang dipakai rekap, null mengosongkan, dan filled terhitung', async () => {
    expect(
      (
        await save(
          ids.matTugas,
          [
            { studentId: ids.ani, value: 90 },
            { studentId: ids.budi, value: 60, note: 'terlambat' },
          ],
          matCookie,
        )
      ).json(),
    ).toEqual({ saved: 2 });
    await save(ids.matUh, [
      { studentId: ids.ani, value: 45 }, // 90%
      { studentId: ids.budi, value: 25 }, // 50%
      { studentId: ids.citra, value: 33 },
    ]);
    await save(ids.matUts, [
      { studentId: ids.ani, value: 80 },
      { studentId: ids.budi, value: null }, // belum diisi
    ]);
    // Citra dikosongkan kembali.
    await save(ids.matUh, [{ studentId: ids.citra, value: null }]);

    const tugas = (await scoresOf(ids.matTugas)).json();
    expect(tugas.students.map((s: { value: number | null }) => s.value)).toEqual([90, 60, null]);
    expect(tugas.students[1].note).toBe('terlambat');
    expect(tugas.assessment).toMatchObject({ filled: 2, total: 3 });
    const uh = (await scoresOf(ids.matUh)).json();
    expect(uh.students.map((s: { value: number | null }) => s.value)).toEqual([45, 25, null]);
    expect(uh.assessment.filled).toBe(2);
    // Menimpa skor yang sama tidak menggandakan baris.
    await save(ids.matTugas, [{ studentId: ids.ani, value: 90 }], matCookie);
    expect((await scoresOf(ids.matTugas)).json().assessment.filled).toBe(2);
  });

  it('skor maksimum tidak boleh di bawah skor yang sudah ada', async () => {
    const body = { componentId: ids.uh, title: 'UH 1', date: '2026-08-01', maxScore: 40 };
    const res = await call('PUT', `/v1/assessments/${ids.matUh}`, adminCookie, body);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('score_exceeds_max');
    expect(
      (await call('PUT', `/v1/assessments/${ids.matUh}`, adminCookie, { ...body, maxScore: 50 })).statusCode,
    ).toBe(200);
  });
});

describe('rekap', () => {
  const recap = (cookie = adminCookie, extra = '') =>
    call(
      'GET',
      `/v1/grading/recap?semesterId=${ids.semester}&classId=${ids.class7A}&subjectId=${ids.mat}${extra}`,
      cookie,
    );
  const setSettings = (body: object) => call('PUT', '/v1/grading/settings', adminCookie, body);

  it('nilai akhir tertimbang, bobot dinormalisasi atas komponen yang punya skor', async () => {
    const res = await recap(matCookie);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.settings).toEqual({ kkm: 75, predicateA: 90, predicateB: 80, predicateC: 70 });
    expect(body.components.map((c: { name: string; weight: number }) => [c.name, c.weight])).toEqual([
      ['Tugas', 20],
      ['Ulangan Harian', 30],
      ['UTS', 20],
      ['UAS', 30],
    ]);
    expect(body.students.map((s: { name: string }) => s.name)).toEqual(['Ani', 'Budi', 'Citra']);
    const [ani, budi, citra] = body.students;

    // Ani: Tugas 90, UH 90, UTS 80, UAS kosong => (90*20 + 90*30 + 80*20) / 70 = 87.14
    expect(ani.perComponent.map((c: { average: number | null }) => c.average)).toEqual([90, 90, 80, null]);
    expect(ani.final).toBe(87.14);
    expect(ani.predicate).toBe('B');
    expect(ani.belowKkm).toBe(false);
    // Budi: Tugas 60, UH 50, UTS kosong, UAS kosong => (60*20 + 50*30) / 50 = 54
    expect(budi.perComponent.map((c: { average: number | null }) => c.average)).toEqual([60, 50, null, null]);
    expect(budi.final).toBe(54);
    expect(budi.predicate).toBe('D');
    expect(budi.belowKkm).toBe(true);
    // Citra tidak punya skor sama sekali.
    expect(citra).toMatchObject({ final: null, predicate: null, belowKkm: false });
    expect(citra.perComponent.every((c: { average: number | null }) => c.average === null)).toBe(true);

    expect(body.stats.filled).toBe(2);
    expect(body.stats.belowKkmCount).toBe(1);
    expect(body.stats.min).toBe(54);
    expect(body.stats.max).toBe(87.14);
    expect(body.stats.average).toBeCloseTo(70.57, 2);
  });

  it('mengikuti KKM dan batas predikat yang diubah', async () => {
    await setSettings({ kkm: 90, predicateA: 85, predicateB: 60, predicateC: 50 });
    const body = (await recap(adminCookie)).json();
    expect(body.students[0]).toMatchObject({ final: 87.14, predicate: 'A', belowKkm: true });
    expect(body.students[1]).toMatchObject({ final: 54, predicate: 'C', belowKkm: true });
    expect(body.stats.belowKkmCount).toBe(2);
    await setSettings({ kkm: 75, predicateA: 90, predicateB: 80, predicateC: 70 });
  });

  it('rekap tanpa penilaian: semua kosong dan statistik null', async () => {
    const res = await call(
      'GET',
      `/v1/grading/recap?semesterId=${ids.semester}&classId=${ids.class7B}&subjectId=${ids.ipa}`,
      ipaCookie,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().students).toHaveLength(1);
    expect(res.json().stats).toEqual({ average: null, min: null, max: null, belowKkmCount: 0, filled: 0 });
  });

  it('otorisasi dan rujukan', async () => {
    expect((await recap(principalCookie)).statusCode).toBe(200);
    expect((await recap(curriculumCookie)).statusCode).toBe(200);
    expect((await recap(ipaCookie)).statusCode).toBe(403);
    const bad = await call(
      'GET',
      `/v1/grading/recap?semesterId=${ids.foreignSemester}&classId=${ids.class7A}&subjectId=${ids.mat}`,
      adminCookie,
    );
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('invalid_reference');
    expect((await call('GET', '/v1/grading/recap', adminCookie)).statusCode).toBe(400);
  });

  it('rekap kelas: matriks mapel x siswa', async () => {
    // Skor IPA Ani untuk mengisi kolom kedua.
    await call('PUT', `/v1/assessments/${ids.ipaTugas}/scores`, adminCookie, {
      records: [{ studentId: ids.ani, value: 100 }],
    });
    const res = await call(
      'GET',
      `/v1/grading/recap/class?semesterId=${ids.semester}&classId=${ids.class7A}`,
      adminCookie,
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.subjects.map((s: { name: string }) => s.name)).toEqual(['IPA', 'Matematika']);
    expect(body.students.map((s: { name: string }) => s.name)).toEqual(['Ani', 'Budi', 'Citra']);
    const gradesOf = (name: string) =>
      Object.fromEntries(
        body.students
          .find((s: { name: string }) => s.name === name)
          .grades.map((g: { subjectId: string; final: number | null; predicate: string | null }) => [
            g.subjectId,
            [g.final, g.predicate],
          ]),
      );
    expect(gradesOf('Ani')).toEqual({ [ids.ipa]: [100, 'A'], [ids.mat]: [87.14, 'B'] });
    expect(gradesOf('Budi')).toEqual({ [ids.ipa]: [null, null], [ids.mat]: [54, 'D'] });
    expect(gradesOf('Citra')).toEqual({ [ids.ipa]: [null, null], [ids.mat]: [null, null] });

    // Pemegang configure, kepala sekolah, kurikulum, dan guru yang mengajar di kelas itu boleh.
    const url = `/v1/grading/recap/class?semesterId=${ids.semester}&classId=${ids.class7A}`;
    for (const cookie of [principalCookie, curriculumCookie, matCookie]) {
      expect((await call('GET', url, cookie)).statusCode).toBe(200);
    }
    // Guru IPA hanya mengajar di 7B.
    expect((await call('GET', url, ipaCookie)).statusCode).toBe(403);
    expect(
      (
        await call(
          'GET',
          `/v1/grading/recap/class?semesterId=${ids.semester}&classId=${ids.class7B}`,
          ipaCookie,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call(
          'GET',
          `/v1/grading/recap/class?semesterId=${ids.semester}&classId=${ids.foreignClass}`,
          adminCookie,
        )
      ).statusCode,
    ).toBe(400);
  });
});

describe('hapus penilaian dan komponen terpakai', () => {
  it('komponen yang dipakai penilaian ditolak 409 in_use', async () => {
    const res = await call('DELETE', `/v1/grading/components/${ids.tugas}`, adminCookie);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('in_use');
    const list = (await call('GET', '/v1/grading/components', adminCookie)).json();
    expect(list.find((c: { name: string }) => c.name === 'Tugas').assessmentCount).toBe(2);
  });

  it('menghapus penilaian ikut menghapus skornya; otorisasi dijaga', async () => {
    expect((await call('DELETE', `/v1/assessments/${ids.matUts}`, ipaCookie)).statusCode).toBe(403);
    expect(
      (await call('DELETE', `/v1/assessments/${ids.matUts}`, otherCookie, undefined, otherId)).statusCode,
    ).toBe(404);
    const before = await app.platformDb.execute(
      sql`select count(*)::int as n from score where assessment_id = ${ids.matUts}`,
    );
    expect((before.rows[0] as { n: number }).n).toBe(2);
    expect((await call('DELETE', `/v1/assessments/${ids.matUts}`, matCookie)).statusCode).toBe(200);
    const after = await app.platformDb.execute(
      sql`select count(*)::int as n from score where assessment_id = ${ids.matUts}`,
    );
    expect((after.rows[0] as { n: number }).n).toBe(0);
    expect((await call('DELETE', `/v1/assessments/${ids.matUts}`, matCookie)).statusCode).toBe(404);
    // UTS tak lagi punya skor: Ani kini hanya Tugas 90 dan UH 90 => 90.
    const recap = await call(
      'GET',
      `/v1/grading/recap?semesterId=${ids.semester}&classId=${ids.class7A}&subjectId=${ids.mat}`,
      adminCookie,
    );
    expect(recap.json().students[0].final).toBe(90);
    // Komponen UTS kini bebas dipakai dan boleh dihapus.
    expect((await call('DELETE', `/v1/grading/components/${ids.uts}`, adminCookie)).statusCode).toBe(200);
  });
});

describe('isolasi sekolah', () => {
  it('data sekolah lain tidak terlihat dan tidak bisa diubah', async () => {
    expect((await call('GET', '/v1/assessments', otherCookie, undefined, otherId)).json()).toEqual([]);
    expect((await call('GET', '/v1/grading/components', otherCookie, undefined, otherId)).json()).toEqual([]);
    expect((await call('GET', '/v1/grading/settings', otherCookie, undefined, otherId)).json().kkm).toBe(75);
    expect(
      (await call('GET', `/v1/assessments/${ids.matTugas}/scores`, otherCookie, undefined, otherId))
        .statusCode,
    ).toBe(404);
    // Komponen sekolah lain dibuat lewat API sekolah itu, lalu dipakai dari sekolah ini: ditolak.
    const foreign = await call(
      'POST',
      '/v1/grading/components',
      otherCookie,
      { name: 'Komponen Lain', weight: 50 },
      otherId,
    );
    expect(foreign.statusCode).toBe(201);
    const res = await call(
      'POST',
      '/v1/assessments',
      adminCookie,
      assessmentBody({ componentId: foreign.json().id }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_reference');
    expect(
      (await call('DELETE', `/v1/grading/components/${foreign.json().id}`, adminCookie)).statusCode,
    ).toBe(404);
    // Pengaturan sekolah ini tidak memengaruhi sekolah lain.
    await call('PUT', '/v1/grading/settings', adminCookie, {
      kkm: 60,
      predicateA: 90,
      predicateB: 80,
      predicateC: 70,
    });
    expect((await call('GET', '/v1/grading/settings', otherCookie, undefined, otherId)).json().kkm).toBe(75);
    await call('PUT', '/v1/grading/settings', adminCookie, {
      kkm: 75,
      predicateA: 90,
      predicateB: 80,
      predicateC: 70,
    });
  });
});
