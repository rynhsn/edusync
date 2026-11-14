import { todayIn } from '@edusync/contracts';
import {
  academicYear,
  assessment,
  assignRoles,
  classRoom,
  classSubjectParticipation,
  enrollment,
  eq,
  foundation,
  gradeComponent,
  member,
  reportCard,
  school,
  score,
  seedSchoolRoles,
  semester,
  sql,
  student,
  studentSubjectEnrollment,
  subject,
  subjectChoiceRule,
  subscription,
  teacher,
  user,
  withTenant,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { historicalRosterOf, rosterOf } from './attendance-lib';
import { loadEnv } from './env';
import { subjectRosterOf, takersOf } from './subject-roster-lib';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/**
 * Tahap 3B.1: data pilihan mata pelajaran per murid. Menguji (1) sekolah tanpa penanda identik (roster per mapel = roster rombel),
 * (2) penanda partisipasi, (3) pilihan murid: batch, cakupan setahun/semester, ganti mulai semester, (4) isi dari agama,
 * (5) aturan pilihan (peringatan, enforce, ganti-batas), (6) penjaga report_final, (7) multi-tenant, FK komposit, RBAC.
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
let homeroomCookie = '';
let otherTeacherCookie = '';
let otherAdminCookie = '';
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
const base = () => `/v1/classes/${ids.xiA}`;
const put = (body: object, cookie = adminCookie) => call('PUT', `${base()}/subject-choices`, cookie, body);
const rowsOf = (studentId: string, subjectId: string) =>
  tenantTx((tx) =>
    tx
      .select({ semesterId: studentSubjectEnrollment.semesterId, source: studentSubjectEnrollment.source })
      .from(studentSubjectEnrollment)
      .where(
        sql`${studentSubjectEnrollment.studentId} = ${studentId} and ${studentSubjectEnrollment.subjectId} = ${subjectId}`,
      ),
  );

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Pilihan', slug: `yp-${run}` })
    .returning();
  foundationId = f!.id;
  await db.insert(subscription).values({
    foundationId,
    period: 'monthly',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
  });
  const mkSchool = async (slug: string, name: string) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug: `${slug}-${run}`, name })
      .returning();
    await seedSchoolRoles(db, s!.id);
    return s!.id;
  };
  schoolId = await mkSchool('pil', 'Sekolah Pilihan');
  otherSchoolId = await mkSchool('pil2', 'Sekolah Lain');

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

  const admin = await makeUser('admin-pilihan');
  const [am] = await db.insert(member).values({ userId: admin.id, schoolId }).returning();
  await assignRoles(db, am!.id, schoolId, ['school_admin']);
  adminCookie = await login(admin.email);

  const wali = await makeUser('wali-pilihan');
  const [wm] = await db.insert(member).values({ userId: wali.id, schoolId }).returning();
  await assignRoles(db, wm!.id, schoolId, ['teacher']);
  homeroomCookie = await login(wali.email);
  const [waliTeacher] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Wali Kelas', memberId: wm!.id })
    .returning();

  const other = await makeUser('guru-lain-pilihan');
  const [om] = await db.insert(member).values({ userId: other.id, schoolId }).returning();
  await assignRoles(db, om!.id, schoolId, ['teacher']);
  otherTeacherCookie = await login(other.email);

  const [c] = await db
    .insert(classRoom)
    .values({
      schoolId,
      academicYearId: ids.year,
      name: 'XI A',
      level: 'XI',
      homeroomTeacherId: waliTeacher!.id,
    })
    .returning();
  ids.xiA = c!.id;
  const [c2] = await db
    .insert(classRoom)
    .values({ schoolId, academicYearId: ids.year, name: 'XI B', level: 'XI' })
    .returning();
  ids.xiB = c2!.id;

  const mkSubject = async (code: string, extra: { religionVariant?: 'islam' | 'christian' } = {}) => {
    const [s] = await db
      .insert(subject)
      .values({ schoolId, code, name: code, ...extra })
      .returning();
    return s!.id;
  };
  ids.mat = await mkSubject('MAT');
  ids.fis = await mkSubject('FIS');
  ids.kim = await mkSubject('KIM');
  ids.bio = await mkSubject('BIO');
  ids.geo = await mkSubject('GEO');
  ids.seniM = await mkSubject('SENI-M');
  ids.seniR = await mkSubject('SENI-R');
  ids.pai = await mkSubject('PAI', { religionVariant: 'islam' });
  ids.pkr = await mkSubject('PKR', { religionVariant: 'christian' });

  const mkStudent = async (
    name: string,
    religion: 'islam' | 'christian' | 'other' | null,
    classId: string | null = ids.xiA!,
    status: 'active' | 'transferred' = 'active',
  ) => {
    const [st] = await db
      .insert(student)
      .values({ schoolId, name, gender: 'L', religion, status, nis: `${name}-${run}` })
      .returning();
    if (classId) {
      await db.insert(enrollment).values({ schoolId, studentId: st!.id, classId, academicYearId: ids.year! });
    }
    return st!.id;
  };
  ids.ani = await mkStudent('Ani', 'islam');
  ids.budi = await mkStudent('Budi', 'christian');
  ids.cici = await mkStudent('Cici', null);
  ids.dodi = await mkStudent('Dodi', 'other');
  ids.eka = await mkStudent('Eka', 'islam');
  ids.pindah = await mkStudent('Pindah', 'islam', ids.xiA, 'transferred');
  ids.lain = await mkStudent('Lain', 'islam', ids.xiB);

  // Skor Ani di FIS (tanpa penanda) untuk menguji `scoredStudents`.
  const [comp] = await db
    .insert(gradeComponent)
    .values({ schoolId, name: 'Tugas', weight: 100, sort: 0 })
    .returning();
  const [a] = await db
    .insert(assessment)
    .values({
      schoolId,
      semesterId: ids.ganjil,
      classId: ids.xiA,
      subjectId: ids.fis,
      componentId: comp!.id,
      title: 'Tugas Fis',
      date: day(-10),
    })
    .returning();
  await db
    .insert(score)
    .values({ schoolId, assessmentId: a!.id, studentId: ids.ani!, value: 80, updatedBy: 'uji' });

  const otherAdmin = await makeUser('admin-lain-pilihan');
  const [oam] = await db
    .insert(member)
    .values({ userId: otherAdmin.id, schoolId: otherSchoolId })
    .returning();
  await assignRoles(db, oam!.id, otherSchoolId, ['school_admin']);
  otherAdminCookie = await login(otherAdmin.email);
  const [os] = await db
    .insert(subject)
    .values({ schoolId: otherSchoolId, code: 'LAIN', name: 'Mapel Lain' })
    .returning();
  ids.otherSubject = os!.id;
}, 120_000);

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherSchoolId]) {
    for (const table of [
      'audit_log',
      'subject_choice_rule_subject',
      'subject_choice_rule',
      'student_subject_enrollment',
      'class_subject_participation',
      'report_card',
      'score',
      'assessment',
      'grade_component',
      'enrollment',
      'class_room',
      'teacher',
      'subject',
      'student',
      'semester',
      'academic_year',
      'member',
      'role',
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

describe('sekolah tanpa penanda (identik)', () => {
  it('roster per mapel = roster rombel dan takersOf null, tanpa kueri pilihan', async () => {
    const names = (r: { rows: { name: string }[] }) => r.rows.map((x) => x.name);
    await tenantTx(async (tx) => {
      expect(await takersOf(tx, { classId: ids.xiA!, semesterId: ids.ganjil! })).toBeNull();
      expect(names(await subjectRosterOf(tx, ids.xiA!, ids.fis!, ids.ganjil!))).toEqual(
        names(await rosterOf(tx, ids.xiA!)),
      );
      expect(names(await subjectRosterOf(tx, ids.xiA!, ids.fis!, ids.ganjil!, { historical: true }))).toEqual(
        names(await historicalRosterOf(tx, ids.xiA!)),
      );
    });
  });

  it('GET partisipasi: semua mapel rombel `all`, penilaian tetap terlihat', async () => {
    const res = await call('GET', `${base()}/subject-participation`, adminCookie);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.canManage).toBe(true);
    // Mapel rombel diturunkan dari penugasan/alokasi/penanda; FIS belum punya penugasan, jadi daftar kosong sampai ditandai.
    expect(body.subjects.every((s: { mode: string }) => s.mode === 'all')).toBe(true);
  });
});

describe('penanda partisipasi', () => {
  it('hanya admin atau wali kelas rombel itu yang boleh menulis', async () => {
    const body = { subjects: [{ subjectId: ids.fis, mode: 'selected' }] };
    expect((await call('PUT', `${base()}/subject-participation`, otherTeacherCookie, body)).statusCode).toBe(
      403,
    );
    expect((await call('GET', `${base()}/subject-participation`, otherTeacherCookie)).statusCode).toBe(200);
    const res = await call('PUT', `${base()}/subject-participation`, homeroomCookie, body);
    expect(res.statusCode).toBe(200);
    expect(res.json().subjects.find((s: { subjectId: string }) => s.subjectId === ids.fis)).toMatchObject({
      mode: 'selected',
      scoredStudents: 1,
    });
    // Wali kelas rombel lain tidak berhak di rombel B.
    expect(
      (await call('PUT', `/v1/classes/${ids.xiB}/subject-participation`, homeroomCookie, body)).statusCode,
    ).toBe(403);
  });

  it('menandai banyak mapel sekaligus dan idempoten; mapel tak dikenal 400', async () => {
    const subjects = [ids.fis, ids.kim, ids.bio, ids.geo, ids.seniM, ids.seniR, ids.pai, ids.pkr].map(
      (subjectId) => ({
        subjectId,
        mode: 'selected',
      }),
    );
    expect((await call('PUT', `${base()}/subject-participation`, adminCookie, { subjects })).statusCode).toBe(
      200,
    );
    const again = await call('PUT', `${base()}/subject-participation`, adminCookie, { subjects });
    expect(again.statusCode).toBe(200);
    expect(again.json().subjects.filter((s: { mode: string }) => s.mode === 'selected')).toHaveLength(8);
    const bad = await call('PUT', `${base()}/subject-participation`, adminCookie, {
      subjects: [{ subjectId: '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa', mode: 'selected' }],
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('invalid_reference');
    const cross = await call('PUT', `${base()}/subject-participation`, adminCookie, {
      subjects: [{ subjectId: ids.otherSubject, mode: 'selected' }],
    });
    expect(cross.statusCode).toBe(400);
  });
});

describe('pilihan murid', () => {
  it('mapel tanpa penanda, murid dari rombel lain, dan murid pindah ditolak', async () => {
    const r1 = await put({ set: [{ studentId: ids.ani, subjectId: ids.mat }] });
    expect(r1.statusCode).toBe(400);
    expect(r1.json().error.code).toBe('subject_not_selected_mode');
    const r2 = await put({ set: [{ studentId: ids.lain, subjectId: ids.fis }] });
    expect([r2.statusCode, r2.json().error.code]).toEqual([400, 'invalid_reference']);
    const r3 = await put({ set: [{ studentId: ids.pindah, subjectId: ids.fis }] });
    expect(r3.statusCode).toBe(400);
    expect((await put({})).statusCode).toBe(400);
  });

  it('menetapkan pilihan setahun: roster per mapel hanya pengambil, mapel tak berpenanda tetap semua', async () => {
    const res = await put({
      set: [
        { studentId: ids.ani, subjectId: ids.fis },
        { studentId: ids.ani, subjectId: ids.kim },
        { studentId: ids.budi, subjectId: ids.fis, note: 'minat' },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ created: 3, updated: 0, removed: 0 });
    // Ulang persis = tanpa perubahan.
    const same = await put({ set: [{ studentId: ids.ani, subjectId: ids.fis }] });
    expect(same.json()).toMatchObject({ created: 0, updated: 0, removed: 0 });
    await tenantTx(async (tx) => {
      const fis = await subjectRosterOf(tx, ids.xiA!, ids.fis!, ids.ganjil!);
      expect(fis.rows.map((r) => r.name)).toEqual(['Ani', 'Budi']);
      const kim = await subjectRosterOf(tx, ids.xiA!, ids.kim!, ids.genap!);
      expect(kim.rows.map((r) => r.name)).toEqual(['Ani']);
      const mat = await subjectRosterOf(tx, ids.xiA!, ids.mat!, ids.ganjil!);
      expect(mat.rows.map((r) => r.name)).toEqual(['Ani', 'Budi', 'Cici', 'Dodi', 'Eka']);
      const takers = await takersOf(tx, {
        classId: ids.xiA!,
        semesterId: ids.ganjil!,
        subjectIds: [ids.mat!, ids.fis!],
      });
      expect([...takers!.keys()]).toEqual([ids.fis]);
    });
    const matrix = (await call('GET', `${base()}/subject-choices`, adminCookie)).json();
    expect(matrix.students.map((s: { name: string }) => s.name)).toEqual([
      'Ani',
      'Budi',
      'Cici',
      'Dodi',
      'Eka',
    ]);
    expect(matrix.entries).toHaveLength(3);
    expect(matrix.entries.find((e: { note: string | null }) => e.note === 'minat')).toBeTruthy();
  });

  it('wali kelas boleh menulis; guru lain 403', async () => {
    expect(
      (await put({ set: [{ studentId: ids.eka, subjectId: ids.bio }] }, otherTeacherCookie)).statusCode,
    ).toBe(403);
    const res = await put({ set: [{ studentId: ids.eka, subjectId: ids.bio }] }, homeroomCookie);
    expect(res.statusCode).toBe(200);
  });

  it('cakupan: setahun dan semester tidak boleh bertumpuk; ganti mulai semester memecah baris', async () => {
    const overlap = await put({ set: [{ studentId: ids.ani, subjectId: ids.fis, semesterId: ids.genap }] });
    expect([overlap.statusCode, overlap.json().error.code]).toEqual([400, 'scope_overlap']);
    const foreign = await put({
      set: [{ studentId: ids.ani, subjectId: ids.fis, semesterId: '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa' }],
    });
    expect(foreign.json().error.code).toBe('invalid_reference');

    const res = await put({
      changeFrom: [{ studentId: ids.ani, subjectId: ids.fis, fromSemesterId: ids.genap, taking: false }],
    });
    expect(res.statusCode).toBe(200);
    expect(await rowsOf(ids.ani!, ids.fis!)).toEqual([{ semesterId: ids.ganjil, source: 'choice' }]);
    await tenantTx(async (tx) => {
      expect((await subjectRosterOf(tx, ids.xiA!, ids.fis!, ids.ganjil!)).rows.map((r) => r.name)).toEqual([
        'Ani',
        'Budi',
      ]);
      expect((await subjectRosterOf(tx, ids.xiA!, ids.fis!, ids.genap!)).rows.map((r) => r.name)).toEqual([
        'Budi',
      ]);
    });
    // Mengambil lagi mulai Genap menyatukan kembali menjadi satu baris setahun.
    const back = await put({
      changeFrom: [{ studentId: ids.ani, subjectId: ids.fis, fromSemesterId: ids.genap, taking: true }],
    });
    expect(back.statusCode).toBe(200);
    expect(await rowsOf(ids.ani!, ids.fis!)).toEqual([{ semesterId: null, source: 'choice' }]);
  });

  it('hapus: tanpa semesterId menghapus semua baris mapel itu', async () => {
    const res = await put({ remove: [{ studentId: ids.eka, subjectId: ids.bio }] });
    expect(res.json()).toMatchObject({ removed: 1 });
    expect(await rowsOf(ids.eka!, ids.bio!)).toEqual([]);
  });
});

describe('isi dari agama murid', () => {
  it('memetakan agama ke mapel agama berpenanda dan melaporkan yang tidak cocok tanpa menebak', async () => {
    const res = await call('POST', `${base()}/subject-choices/from-religion`, adminCookie, {});
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Ani dan Eka islam -> PAI; Budi christian -> PKR; Cici tanpa agama; Dodi `other` tanpa mapel belief.
    expect(body.created).toBe(3);
    expect(
      body.unmatched.map((u: { studentName: string; reason: string }) => [u.studentName, u.reason]).sort(),
    ).toEqual([
      ['Cici', 'no_religion'],
      ['Dodi', 'no_matching_subject'],
    ]);
    expect(await rowsOf(ids.ani!, ids.pai!)).toEqual([{ semesterId: null, source: 'religion' }]);
    expect(await rowsOf(ids.budi!, ids.pkr!)).toEqual([{ semesterId: null, source: 'religion' }]);
    const again = (await call('POST', `${base()}/subject-choices/from-religion`, adminCookie, {})).json();
    expect(again).toMatchObject({ created: 0, existing: 3 });
  });

  it('agama tidak cocok ditandai di matriks; murid yang sudah memilih agama lain tidak ditimpa', async () => {
    const set = await put({ set: [{ studentId: ids.cici, subjectId: ids.pkr, source: 'admin' }] });
    expect(set.statusCode).toBe(200);
    await put({ set: [{ studentId: ids.dodi, subjectId: ids.pkr, source: 'admin' }] });
    const matrix = (await call('GET', `${base()}/subject-choices`, adminCookie)).json();
    // Cici tanpa agama: tidak diketahui (tanpa tanda); Dodi `other` memilih mapel christian: tidak cocok.
    const mism = matrix.entries.filter((e: { religionMismatch?: boolean }) => e.religionMismatch);
    expect(mism.map((e: { studentId: string }) => e.studentId)).toEqual([ids.dodi]);
    await put({ remove: [{ studentId: ids.dodi, subjectId: ids.pkr }] });
    await tenantTx((tx) => tx.update(student).set({ religion: 'islam' }).where(eq(student.id, ids.dodi!)));
    await put({ set: [{ studentId: ids.dodi, subjectId: ids.pkr, source: 'admin' }] });
    const res = (
      await call('POST', `${base()}/subject-choices/from-religion`, adminCookie, { studentIds: [ids.dodi] })
    ).json();
    expect(res.unmatched).toEqual([expect.objectContaining({ reason: 'has_other_religion_choice' })]);
    await put({ remove: [{ studentId: ids.dodi, subjectId: ids.pkr }] });
    await put({ remove: [{ studentId: ids.cici, subjectId: ids.pkr }] });
  });
});

describe('aturan pilihan', () => {
  const ruleBody = (over: object) => ({
    academicYearId: ids.year,
    levelCode: 'XI',
    groupKey: 'x',
    label: 'Aturan',
    ...over,
  });

  it('CRUD aturan: hanya subject_choice:manage menulis; duplikat 409; rujukan tak valid 400', async () => {
    const body = ruleBody({
      groupKey: 'elective',
      label: 'Pilihan',
      minChoices: 2,
      maxChoices: 3,
      minOffered: 4,
      subjectIds: [ids.fis, ids.kim, ids.bio],
    });
    expect((await call('POST', '/v1/subject-choice-rules', homeroomCookie, body)).statusCode).toBe(403);
    const created = await call('POST', '/v1/subject-choice-rules', adminCookie, body);
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ enforce: false, subjectIds: expect.any(Array) });
    ids.elective = created.json().id;
    expect((await call('POST', '/v1/subject-choice-rules', adminCookie, body)).statusCode).toBe(409);
    const badRef = await call('POST', '/v1/subject-choice-rules', adminCookie, {
      ...body,
      groupKey: 'y',
      subjectIds: [ids.otherSubject],
    });
    expect([badRef.statusCode, badRef.json().error.code]).toEqual([400, 'invalid_reference']);
    const badRange = await call('POST', '/v1/subject-choice-rules', adminCookie, {
      ...body,
      groupKey: 'z',
      minChoices: 5,
    });
    expect(badRange.statusCode).toBe(400);
    const list = await call('GET', `/v1/subject-choice-rules?academicYearId=${ids.year}`, otherTeacherCookie);
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);
    const upd = await call('PUT', `/v1/subject-choice-rules/${ids.elective}`, adminCookie, {
      ...body,
      minOffered: 3,
    });
    expect(upd.json().minOffered).toBe(3);
    const upd2 = await call('PUT', `/v1/subject-choice-rules/${ids.elective}`, adminCookie, {
      ...body,
      minOffered: 4,
    });
    expect(upd2.json().minOffered).toBe(4);
  });

  it('bawaan hanya peringatan: simpan tetap berhasil dan ringkasan melaporkan yang kurang', async () => {
    const res = await put({ set: [{ studentId: ids.budi, subjectId: ids.kim }] });
    expect(res.statusCode).toBe(200);
    // Budi: FIS + KIM = 2 (batas 2-3) -> tanpa peringatan.
    expect(res.json().warnings).toEqual([]);
    const eka = await put({ set: [{ studentId: ids.eka, subjectId: ids.bio }] });
    expect(eka.json().warnings).toEqual([
      expect.objectContaining({ studentId: ids.eka, status: 'below_min', count: 1 }),
    ]);
    const sum = (await call('GET', `${base()}/subject-choices/summary`, adminCookie)).json();
    expect(sum.rules).toEqual([
      expect.objectContaining({ groupKey: 'elective', offered: 3, minOffered: 4, offeredOk: false }),
    ]);
    const byName = Object.fromEntries(sum.students.map((s: { name: string }) => [s.name, s]));
    expect(byName.Ani.results[0]).toMatchObject({ status: 'ok', count: 2 });
    expect(byName.Eka.warningCount).toBe(1);
    // Cici dan Dodi belum mengambil mapel berpenanda selain... PAI/PKR: Cici tidak punya apa pun.
    expect(sum.unchosen.map((u: { name: string }) => u.name)).toEqual(['Cici', 'Dodi']);
    const one = (await call('GET', `/v1/students/${ids.ani}/subject-choices`, adminCookie)).json();
    expect(one.classId).toBe(ids.xiA);
    expect(
      one.subjects
        .filter((s: { taking: boolean }) => s.taking)
        .map((s: { code: string }) => s.code)
        .sort(),
    ).toEqual(['FIS', 'KIM', 'PAI']);
  });

  it('aturan enforce menolak penyimpanan di luar batas (satu seni)', async () => {
    const arts = await call(
      'POST',
      '/v1/subject-choice-rules',
      adminCookie,
      ruleBody({
        groupKey: 'arts',
        label: 'Seni',
        minChoices: 1,
        maxChoices: 1,
        enforce: true,
        subjectIds: [ids.seniM, ids.seniR],
      }),
    );
    expect(arts.statusCode).toBe(201);
    ids.arts = arts.json().id;
    expect((await put({ set: [{ studentId: ids.ani, subjectId: ids.seniM }] })).statusCode).toBe(200);
    const two = await put({ set: [{ studentId: ids.ani, subjectId: ids.seniR }] });
    expect([two.statusCode, two.json().error.code]).toEqual([400, 'choice_rule_violation']);
    expect(await rowsOf(ids.ani!, ids.seniR!)).toEqual([]);
    // Mengganti satu seni dengan seni lain dalam satu batch lolos.
    const swap = await put({
      remove: [{ studentId: ids.ani, subjectId: ids.seniM }],
      set: [{ studentId: ids.ani, subjectId: ids.seniR }],
    });
    expect(swap.statusCode).toBe(200);
    expect(await rowsOf(ids.ani!, ids.seniM!)).toEqual([]);
  });

  it('batas ganti pilihan: 409 choice_locked, override hanya untuk curriculum:manage', async () => {
    const lock = await call(
      'POST',
      '/v1/subject-choice-rules',
      adminCookie,
      ruleBody({ groupKey: 'geo', label: 'Geo', lockedFromSemesterId: ids.ganjil, subjectIds: [ids.geo] }),
    );
    expect(lock.statusCode).toBe(201);
    const body = { set: [{ studentId: ids.ani, subjectId: ids.geo }] };
    const locked = await put(body);
    expect([locked.statusCode, locked.json().error.code]).toEqual([409, 'choice_locked']);
    expect((await put({ ...body, override: true }, homeroomCookie)).json().error.code).toBe('choice_locked');
    const ok = await put({ ...body, override: true });
    expect(ok.statusCode).toBe(200);
    const audit = await app.platformDb.execute(
      sql`select details from audit_log where school_id = ${schoolId} and action = 'subject_choice.save' order by created_at desc limit 1`,
    );
    expect((audit.rows[0] as { details: { override: boolean } }).details.override).toBe(true);
    await put({ remove: [{ studentId: ids.ani, subjectId: ids.geo }], override: true });
    const rules = (await call('GET', '/v1/subject-choice-rules', adminCookie)).json() as {
      id: string;
      groupKey: string;
    }[];
    await call(
      'DELETE',
      `/v1/subject-choice-rules/${rules.find((r) => r.groupKey === 'geo')!.id}`,
      adminCookie,
    );
    expect((await call('DELETE', `/v1/subject-choice-rules/${ids.arts}`, adminCookie)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/subject-choice-rules/${ids.arts}`, adminCookie)).statusCode).toBe(404);
  });
});

describe('penjaga report_final', () => {
  it('menolak perubahan pilihan pada semester yang rapor murid itu final; semester lain tetap boleh', async () => {
    await app.platformDb.insert(reportCard).values({
      schoolId,
      semesterId: ids.genap!,
      studentId: ids.eka!,
      classId: ids.xiA!,
      status: 'final',
      snapshot: {},
    });
    // Setahun mencakup Genap yang final -> 409; hanya Ganjil -> boleh (Genap tidak berubah).
    const yearWide = await put({ set: [{ studentId: ids.eka, subjectId: ids.kim }] });
    expect([yearWide.statusCode, yearWide.json().error.code]).toEqual([409, 'report_final']);
    const ganjil = await put({ set: [{ studentId: ids.eka, subjectId: ids.kim, semesterId: ids.ganjil }] });
    expect(ganjil.statusCode).toBe(200);
    const genap = await put({ set: [{ studentId: ids.eka, subjectId: ids.fis, semesterId: ids.genap }] });
    expect(genap.json().error.code).toBe('report_final');
    // Murid lain di rombel yang sama tidak terdampak (penjaga per murid).
    expect((await put({ set: [{ studentId: ids.dodi, subjectId: ids.fis }] })).statusCode).toBe(200);
  });

  it('penanda partisipasi ditolak bila rapor rombel sudah final; tanpa perubahan nyata tetap lolos', async () => {
    const add = await call('PUT', `${base()}/subject-participation`, adminCookie, {
      subjects: [{ subjectId: ids.mat, mode: 'selected' }],
    });
    expect([add.statusCode, add.json().error.code]).toEqual([409, 'report_final']);
    const noop = await call('PUT', `${base()}/subject-participation`, adminCookie, {
      subjects: [{ subjectId: ids.fis, mode: 'selected' }],
    });
    expect(noop.statusCode).toBe(200);
    const drop = await call('PUT', `${base()}/subject-participation`, adminCookie, {
      subjects: [{ subjectId: ids.fis, mode: 'all' }],
    });
    expect(drop.json().error.code).toBe('report_final');
    expect(
      (
        await tenantTx((tx) =>
          tx.select().from(classSubjectParticipation).where(eq(classSubjectParticipation.classId, ids.xiA!)),
        )
      ).length,
    ).toBe(8);
  });
});

describe('multi-tenant dan integritas', () => {
  it('sekolah lain tidak melihat rombel, aturan, atau pilihan', async () => {
    expect(
      (await call('GET', `${base()}/subject-choices`, otherAdminCookie, undefined, otherSchoolId)).statusCode,
    ).toBe(404);
    expect(
      (
        await call(
          'PUT',
          `${base()}/subject-participation`,
          otherAdminCookie,
          { subjects: [{ subjectId: ids.fis, mode: 'selected' }] },
          otherSchoolId,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', '/v1/subject-choice-rules', otherAdminCookie, undefined, otherSchoolId)).json(),
    ).toEqual([]);
    expect(
      (
        await call(
          'GET',
          `/v1/students/${ids.ani}/subject-choices`,
          otherAdminCookie,
          undefined,
          otherSchoolId,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await call(
          'DELETE',
          `/v1/subject-choice-rules/${ids.elective}`,
          otherAdminCookie,
          undefined,
          otherSchoolId,
        )
      ).statusCode,
    ).toBe(404);
  });

  it('FK komposit menolak mapel/murid/kelas sekolah lain pada semua tabel baru', async () => {
    const db = app.platformDb;
    await expect(
      db.insert(classSubjectParticipation).values({
        schoolId: otherSchoolId,
        classId: ids.xiA!,
        subjectId: ids.otherSubject!,
        updatedBy: 'uji',
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(studentSubjectEnrollment).values({
        schoolId: otherSchoolId,
        studentId: ids.ani!,
        subjectId: ids.otherSubject!,
        academicYearId: ids.year!,
        source: 'choice',
        createdBy: 'uji',
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(subjectChoiceRule).values({
        schoolId: otherSchoolId,
        academicYearId: ids.year!,
        levelCode: 'XI',
        groupKey: 'bocor',
        label: 'Bocor',
      }),
    ).rejects.toThrow();
    // CHECK sumber dan indeks unik parsial.
    await expect(
      db.insert(studentSubjectEnrollment).values({
        schoolId,
        studentId: ids.ani!,
        subjectId: ids.fis!,
        academicYearId: ids.year!,
        source: 'choice',
        createdBy: 'uji',
      }),
    ).rejects.toThrow();
  });
});
