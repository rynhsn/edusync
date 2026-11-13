import { todayIn } from '@edusync/contracts';
import {
  academicYear,
  assessment,
  assignRoles,
  classRoom,
  enrollment,
  enrollmentChange,
  entitlement,
  eq,
  foundation,
  gradeComponent,
  member,
  role,
  rolePermission,
  school,
  schoolLevel,
  score,
  seedSchoolRoles,
  semester,
  sql,
  student,
  studentTransfer,
  subject,
  subscription,
  user,
  withTenant,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { historicalRosterOf } from './attendance-lib';
import { loadEnv } from './env';
import { semesterRosterOf } from './student-mobility-lib';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/**
 * Tahap 3C.1: mutasi murid dan riwayat rombel. Menguji (1) sekolah tanpa mutasi identik, (2) riwayat `enrollment_change` oleh
 * `PUT /v1/students/:id/class`, (3) penjaga `report_final` pada pindah rombel, (4) rapor final murid pindah tetap di daftar
 * kelas dan dapat difinalkan ulang, (5) roster semester menurut tanggal, (6) larangan semester genap tingkat akhir (K1) dan
 * penimpaan admin, (7) mutasi masuk/ubah/batal/lengkapi, (8) multi-tenant, RBAC, FK komposit.
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
let clerkCookie = '';
let teacherCookie = '';
let otherAdminCookie = '';
const userIds: string[] = [];

const ids = {
  year: '',
  oldYear: '',
  ganjil: '',
  genap: '',
  oldA: '',
  oldB: '',
  xiA: '',
  xiB: '',
  xiC: '',
  xiD: '',
  xiiA: '',
  oldClass: '',
  otherYear: '',
  mat: '',
  tugas: '',
  matXiA: '',
  matXiC: '',
  ani: '',
  budi: '',
  tono: '',
  dodi: '',
  eka: '',
  fira: '',
  gani: '',
  hadi: '',
  indra: '',
  joko: '',
  kiki: '',
  lala: '',
  citra: '',
  dedi: '',
  legacy: '',
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

const names = (rows: { name: string }[]) => rows.map((r) => r.name);
const listUrl = (semesterId: string, classId: string) =>
  `/v1/report-cards?semesterId=${semesterId}&classId=${classId}`;
const tenantTx = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app.tenantDb, [schoolId], fn);
const changesOf = (studentId: string) =>
  tenantTx((tx) => tx.select().from(enrollmentChange).where(eq(enrollmentChange.studentId, studentId)));
const enrollmentClass = async (studentId: string, yearId = ids.year) => {
  const rows = await tenantTx((tx) =>
    tx
      .select({ classId: enrollment.classId })
      .from(enrollment)
      .where(sql`${enrollment.studentId} = ${studentId} and ${enrollment.academicYearId} = ${yearId}`),
  );
  return rows[0]?.classId ?? null;
};

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Mutasi', slug: `ym-${run}` })
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
  const mkSchool = async (slug: string, name: string) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug: `${slug}-${run}`, name })
      .returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of ['grades', 'attendance']) {
      await db
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    return s!.id;
  };
  schoolId = await mkSchool('mut', 'Sekolah Mutasi');
  otherSchoolId = await mkSchool('mut2', 'Sekolah Lain');

  await db.insert(schoolLevel).values([
    { schoolId, code: 'XI', label: 'XI', sort: 2 },
    { schoolId, code: 'XII', label: 'XII', sort: 3 },
  ]);

  const mkYear = async (name: string, startsOn: string, endsOn: string, isActive: boolean) => {
    const [y] = await db
      .insert(academicYear)
      .values({ schoolId, name, startsOn, endsOn, isActive })
      .returning();
    return y!.id;
  };
  // Tahun berjalan: Ganjil memuat hari ini, Genap (semester terakhir) mulai 21 hari lagi. Tahun lalu: dua semester sudah lewat.
  ids.year = await mkYear('Berjalan', day(-100), day(200), true);
  ids.oldYear = await mkYear('Lalu', day(-400), day(-101), false);
  const mkSem = async (yearId: string, name: string, startsOn: string, endsOn: string, isActive = false) => {
    const [s] = await db
      .insert(semester)
      .values({ schoolId, academicYearId: yearId, name, startsOn, endsOn, isActive })
      .returning();
    return s!.id;
  };
  ids.ganjil = await mkSem(ids.year, 'Ganjil', day(-100), day(20), true);
  ids.genap = await mkSem(ids.year, 'Genap', day(21), day(200));
  ids.oldA = await mkSem(ids.oldYear, 'Ganjil lalu', day(-400), day(-260));
  ids.oldB = await mkSem(ids.oldYear, 'Genap lalu', day(-259), day(-101));

  const mkClass = async (yearId: string, name: string, level: string) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId, academicYearId: yearId, name, level })
      .returning();
    return c!.id;
  };
  ids.xiA = await mkClass(ids.year, 'XI A', 'XI');
  ids.xiB = await mkClass(ids.year, 'XI B', 'XI');
  ids.xiC = await mkClass(ids.year, 'XI C', 'XI');
  ids.xiD = await mkClass(ids.year, 'XI D', 'XI');
  ids.xiiA = await mkClass(ids.year, 'XII A', 'XII');
  ids.oldClass = await mkClass(ids.oldYear, 'XI Lama', 'XI');

  const mkStudent = async (
    name: string,
    status: 'active' | 'graduated' | 'transferred' | 'dropped',
    enrol: { academicYearId: string; classId: string } | null,
  ) => {
    const [st] = await db
      .insert(student)
      .values({ schoolId, name, gender: 'L', status, nis: `${name}-${run}`, nisn: `N-${name}-${run}` })
      .returning();
    if (enrol) await db.insert(enrollment).values({ schoolId, studentId: st!.id, ...enrol });
    return st!.id;
  };
  const inYear = (classId: string) => ({ academicYearId: ids.year, classId });
  ids.ani = await mkStudent('Ani', 'active', inYear(ids.xiA));
  ids.budi = await mkStudent('Budi', 'active', inYear(ids.xiA));
  ids.tono = await mkStudent('Tono', 'transferred', inYear(ids.xiA));
  ids.dodi = await mkStudent('Dodi', 'dropped', inYear(ids.xiA));
  ids.eka = await mkStudent('Eka', 'active', inYear(ids.xiC));
  ids.fira = await mkStudent('Fira', 'active', inYear(ids.xiC));
  ids.gani = await mkStudent('Gani', 'active', inYear(ids.xiiA));
  ids.hadi = await mkStudent('Hadi', 'active', inYear(ids.xiiA));
  ids.indra = await mkStudent('Indra', 'active', inYear(ids.xiiA));
  ids.legacy = await mkStudent('Legacy', 'transferred', inYear(ids.xiB));
  const lama = (classId = ids.oldClass) => ({ academicYearId: ids.oldYear, classId });
  ids.joko = await mkStudent('Joko', 'active', lama());
  ids.kiki = await mkStudent('Kiki', 'transferred', lama());
  ids.lala = await mkStudent('Lala', 'transferred', lama());
  ids.citra = await mkStudent('Citra', 'transferred', lama());
  ids.dedi = await mkStudent('Dedi', 'transferred', lama());
  // Mutasi keluar tahun lalu: Kiki keluar jauh setelah semester Genap lalu berakhir; Citra tepat pada hari terakhirnya (tidak
  // ikut: `effective_on` harus > `ends_on`); Dedi sehari sesudahnya (ikut). Lala pindah tanpa catatan (tetap dikecualikan).
  const out = (studentId: string, effectiveOn: string) => ({
    schoolId,
    studentId,
    direction: 'out' as const,
    effectiveOn,
    academicYearId: ids.oldYear,
    classId: ids.oldClass,
    reason: 'other',
    createdBy: 'uji',
  });
  await db
    .insert(studentTransfer)
    .values([out(ids.kiki, day(-50)), out(ids.citra, day(-101)), out(ids.dedi, day(-100))]);

  const [mat] = await db.insert(subject).values({ schoolId, code: 'MAT', name: 'Matematika' }).returning();
  ids.mat = mat!.id;
  const [tugas] = await db
    .insert(gradeComponent)
    .values({ schoolId, name: 'Tugas', weight: 100, sort: 0 })
    .returning();
  ids.tugas = tugas!.id;
  const mkAssessment = async (classId: string) => {
    const [a] = await db
      .insert(assessment)
      .values({
        schoolId,
        semesterId: ids.ganjil,
        classId,
        subjectId: ids.mat,
        componentId: ids.tugas,
        title: 'Tugas Mat',
        date: day(-10),
      })
      .returning();
    return a!.id;
  };
  ids.matXiA = await mkAssessment(ids.xiA);
  ids.matXiC = await mkAssessment(ids.xiC);
  for (const [assessmentId, studentId, value] of [
    [ids.matXiA, ids.ani, 90],
    [ids.matXiA, ids.budi, 80],
    [ids.matXiC, ids.eka, 85],
    [ids.matXiC, ids.fira, 70],
  ] as const) {
    await db.insert(score).values({ schoolId, assessmentId, studentId, value, updatedBy: 'uji' });
  }

  const admin = await makeUser('admin-mutasi');
  const [m] = await db.insert(member).values({ userId: admin.id, schoolId }).returning();
  await assignRoles(db, m!.id, schoolId, ['school_admin']);
  adminCookie = await login(admin.email);

  // Peran khusus: boleh mengelola siswa tetapi TANPA school:manage (tidak boleh menimpa larangan K1).
  const [clerkRole] = await db
    .insert(role)
    .values({ schoolId, key: 'clerk', name: 'Petugas tata usaha', isSystem: false })
    .returning();
  await db.insert(rolePermission).values(
    ['student:read', 'student:manage', 'class:read'].map((permission) => ({
      roleId: clerkRole!.id,
      schoolId,
      permission,
    })),
  );
  const clerk = await makeUser('clerk-mutasi');
  const [cm] = await db.insert(member).values({ userId: clerk.id, schoolId }).returning();
  await assignRoles(db, cm!.id, schoolId, ['clerk']);
  clerkCookie = await login(clerk.email);

  const teacher = await makeUser('guru-mutasi');
  const [tm] = await db.insert(member).values({ userId: teacher.id, schoolId }).returning();
  await assignRoles(db, tm!.id, schoolId, ['teacher']);
  teacherCookie = await login(teacher.email);

  const [oy] = await db
    .insert(academicYear)
    .values({ schoolId: otherSchoolId, name: 'Lain', startsOn: day(-100), endsOn: day(200), isActive: true })
    .returning();
  ids.otherYear = oy!.id;
  const otherAdmin = await makeUser('admin-lain');
  const [om] = await db.insert(member).values({ userId: otherAdmin.id, schoolId: otherSchoolId }).returning();
  await assignRoles(db, om!.id, otherSchoolId, ['school_admin']);
  otherAdminCookie = await login(otherAdmin.email);
}, 120_000);

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherSchoolId]) {
    for (const table of [
      'audit_log',
      'outbox',
      'report_card_snapshot',
      'report_card',
      'semester_grading_config',
      'enrollment_change',
      'student_transfer',
      'score',
      'assessment',
      'grade_component',
      'grading_setting',
      'report_setting',
      'enrollment',
      'class_room',
      'subject',
      'student',
      'school_level',
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

describe('sekolah tanpa mutasi: perilaku lama identik', () => {
  it('semesterRosterOf sama persis dengan historicalRosterOf (urutan dan isi) bila tidak ada mutasi/perpindahan', async () => {
    const sem = { id: ids.ganjil, academicYearId: ids.year, endsOn: day(20) };
    for (const classId of [ids.xiA, ids.xiB, ids.xiC, ids.xiD, ids.xiiA]) {
      const hist = await tenantTx((tx) => historicalRosterOf(tx, classId));
      const semRoster = await tenantTx((tx) => semesterRosterOf(tx, classId, sem));
      expect(semRoster.rows).toEqual(hist.rows);
    }
  });

  it('murid pindah/keluar lama tanpa catatan tetap dikecualikan dari daftar rapor kelas', async () => {
    const res = await call('GET', listUrl(ids.ganjil, ids.xiA), adminCookie);
    expect(res.statusCode).toBe(200);
    expect(names(res.json())).toEqual(['Ani', 'Budi']);
  });
});

describe('roster semester menurut tanggal mutasi', () => {
  it('keluar setelah semester berakhir ikut; tepat pada hari terakhir tidak; tanpa catatan tidak', async () => {
    const sem = { id: ids.oldB, academicYearId: ids.oldYear, endsOn: day(-101) };
    const roster = await tenantTx((tx) => semesterRosterOf(tx, ids.oldClass, sem));
    // Joko aktif, Kiki (day -50 > -101) dan Dedi (day -100 > -101) ikut; Citra (= ends_on) dan Lala (tanpa catatan) tidak.
    expect(names(roster.rows)).toEqual(['Dedi', 'Joko', 'Kiki']);
    // Pembacaan operasional tidak berubah: rosterOf/historicalRosterOf hanya aktif.
    const hist = await tenantTx((tx) => historicalRosterOf(tx, ids.oldClass));
    expect(names(hist.rows)).toEqual(['Joko']);
  });

  it('daftar rapor kelas tahun lalu memuat murid yang keluar sesudah semesternya (rapor final tidak hilang)', async () => {
    const res = await call('GET', listUrl(ids.oldB, ids.oldClass), adminCookie);
    expect(res.statusCode).toBe(200);
    expect(names(res.json())).toEqual(['Dedi', 'Joko', 'Kiki']);
  });
});

describe('riwayat rombel: PUT /v1/students/:id/class', () => {
  it('pindah rombel mencatat enrollment_change; ke rombel yang sama dan penempatan pertama tidak', async () => {
    const same = await call('PUT', `/v1/students/${ids.eka}/class`, adminCookie, { classId: ids.xiC });
    expect(same.statusCode).toBe(200);
    expect(await changesOf(ids.eka)).toHaveLength(0);

    const moved = await call('PUT', `/v1/students/${ids.eka}/class`, adminCookie, {
      classId: ids.xiD,
      effectiveOn: day(25),
      reason: 'Penataan ulang rombel',
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().classId).toBe(ids.xiD);
    const rows = await changesOf(ids.eka);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fromClassId: ids.xiC,
      toClassId: ids.xiD,
      effectiveOn: day(25),
      reason: 'Penataan ulang rombel',
      academicYearId: ids.year,
    });

    // Penempatan pertama (siswa baru tanpa enrollment) bukan perpindahan.
    const created = await call('POST', '/v1/students', adminCookie, {
      name: `Baru ${run}`,
      gender: 'L',
      classId: ids.xiB,
    });
    expect(created.statusCode).toBe(201);
    expect(await changesOf(created.json().id)).toHaveLength(0);
  });

  it('roster semester meluruskan rombel menurut tanggal efektif: pindah setelah Ganjil berakhir tetap di rombel lama untuk Ganjil', async () => {
    const ganjil = { id: ids.ganjil, academicYearId: ids.year, endsOn: day(20) };
    const genap = { id: ids.genap, academicYearId: ids.year, endsOn: day(200) };
    const at = (classId: string, sem: typeof ganjil) =>
      tenantTx((tx) => semesterRosterOf(tx, classId, sem)).then((r) => names(r.rows));
    expect(await at(ids.xiC, ganjil)).toEqual(['Eka', 'Fira']);
    expect(await at(ids.xiD, ganjil)).toEqual([]);
    expect(await at(ids.xiC, genap)).toEqual(['Fira']);
    expect(await at(ids.xiD, genap)).toEqual(['Eka']);
    // Daftar rapor (jalur baca) mengikuti roster semester itu.
    expect(names((await call('GET', listUrl(ids.ganjil, ids.xiC), adminCookie)).json())).toEqual([
      'Eka',
      'Fira',
    ]);
    expect(await call('GET', listUrl(ids.ganjil, ids.xiD), adminCookie).then((r) => r.json())).toEqual([]);
  });

  it('riwayat akademik menampilkan rombel kini dan perpindahannya', async () => {
    const res = await call('GET', `/v1/students/${ids.eka}/academic-history`, adminCookie);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ studentId: ids.eka, name: 'Eka', status: 'active' });
    expect(body.years).toHaveLength(1);
    expect(body.years[0]).toMatchObject({ academicYearId: ids.year, class: { name: 'XI D' } });
    expect(body.years[0].classChanges).toEqual([
      {
        effectiveOn: day(25),
        fromClassId: ids.xiC,
        fromClassName: 'XI C',
        toClassId: ids.xiD,
        toClassName: 'XI D',
        reason: 'Penataan ulang rombel',
      },
    ]);
    expect(body.years[0].transfers).toEqual([]);
  });

  it('mencabut dari kelas mencatat perpindahan ke null dan enrollment dihapus', async () => {
    const res = await call('PUT', `/v1/students/${ids.indra}/class`, adminCookie, { classId: null });
    expect(res.statusCode).toBe(200);
    expect(res.json().classId).toBeNull();
    const rows = await changesOf(ids.indra);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fromClassId: ids.xiiA, toClassId: null });
    expect(await enrollmentClass(ids.indra)).toBeNull();
    // Kembalikan penempatannya untuk tes berikutnya.
    const back = await call('PUT', `/v1/students/${ids.indra}/class`, adminCookie, { classId: ids.xiiA });
    expect(back.statusCode).toBe(200);
  });
});

describe('penjaga report_final pada pindah rombel', () => {
  it('rapor final: murid tidak dapat dipindah (409 report_final) dan rombelnya tidak berubah; kelas final menolak murid baru', async () => {
    const fin = await call('POST', '/v1/report-cards/finalize', adminCookie, {
      semesterId: ids.ganjil,
      classId: ids.xiA,
      force: true,
    });
    expect(fin.statusCode).toBe(200);
    expect(fin.json().finalized).toBe(2);

    const before = (await changesOf(ids.ani)).length;
    const blocked = await call('PUT', `/v1/students/${ids.ani}/class`, adminCookie, { classId: ids.xiB });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('report_final');
    expect(await enrollmentClass(ids.ani)).toBe(ids.xiA);
    expect((await changesOf(ids.ani)).length).toBe(before);

    // Mencabut juga ditolak.
    const removed = await call('PUT', `/v1/students/${ids.ani}/class`, adminCookie, { classId: null });
    expect(removed.statusCode).toBe(409);
    expect(await enrollmentClass(ids.ani)).toBe(ids.xiA);

    // Murid lain (tanpa rapor final) masuk ke kelas yang rapornya final: ditolak karena roster kelas final terkunci.
    const into = await call('PUT', `/v1/students/${ids.gani}/class`, adminCookie, { classId: ids.xiA });
    expect(into.statusCode).toBe(409);
    expect(into.json().error.code).toBe('report_final');
    expect(await enrollmentClass(ids.gani)).toBe(ids.xiiA);
  });

  it('tanggal efektif di luar semester final dan hari ini di luar semester: tetap diterima (hasil lama)', async () => {
    // Hari ini ada di Ganjil; kelas XI C/XI D tidak final, jadi pindah diterima seperti dulu.
    const res = await call('PUT', `/v1/students/${ids.fira}/class`, adminCookie, { classId: ids.xiD });
    expect(res.statusCode).toBe(200);
    const back = await call('PUT', `/v1/students/${ids.fira}/class`, adminCookie, { classId: ids.xiC });
    expect(back.statusCode).toBe(200);
  });
});

describe('rapor final murid pindah tidak hilang', () => {
  it('Budi pindah setelah Ganjil berakhir: tetap di daftar rapor kelas (final), bisa dibuka kembali dan difinalkan ulang', async () => {
    const res = await call('POST', `/v1/students/${ids.budi}/transfer-out`, adminCookie, {
      effectiveOn: day(25),
      reason: 'parent_relocation',
      counterpartSchoolName: 'SMA Tujuan',
      counterpartNpsn: '12345678',
      letterNumber: '421/001/2026',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      direction: 'out',
      kind: 'transfer',
      studentName: 'Budi',
      classId: ids.xiA,
      className: 'XI A',
      counterpartNpsn: '12345678',
    });
    const [stu] = await tenantTx((tx) => tx.select().from(student).where(eq(student.id, ids.budi)));
    expect(stu?.status).toBe('transferred');
    expect(await enrollmentClass(ids.budi)).toBe(ids.xiA);

    const list = (await call('GET', listUrl(ids.ganjil, ids.xiA), adminCookie)).json();
    expect(names(list)).toEqual(['Ani', 'Budi']);
    expect(list.map((r: { status: string }) => r.status)).toEqual(['final', 'final']);

    // Dokumen tunggal tetap terbaca dari snapshot.
    const doc = await call('GET', `/v1/report-cards/${ids.budi}?semesterId=${ids.ganjil}`, adminCookie);
    expect(doc.statusCode).toBe(200);
    expect(doc.json().status).toBe('final');

    const reopen = await call('POST', '/v1/report-cards/reopen', adminCookie, {
      semesterId: ids.ganjil,
      classId: ids.xiA,
    });
    expect(reopen.statusCode).toBe(200);
    expect(reopen.json().reopened).toBe(2);
    expect(names((await call('GET', listUrl(ids.ganjil, ids.xiA), adminCookie)).json())).toEqual([
      'Ani',
      'Budi',
    ]);
    const again = await call('POST', '/v1/report-cards/finalize', adminCookie, {
      semesterId: ids.ganjil,
      classId: ids.xiA,
      force: true,
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().finalized).toBe(2);
    const last = (await call('GET', listUrl(ids.ganjil, ids.xiA), adminCookie)).json();
    expect(last.map((r: { status: string }) => r.status)).toEqual(['final', 'final']);
  });

  it('jalur tulis tetap menolak murid pindah (tidak dapat dinilai lagi)', async () => {
    const res = await call('PUT', `/v1/assessments/${ids.matXiA}/scores`, adminCookie, {
      records: [{ studentId: ids.budi, value: 10 }],
    });
    // Rapor kelas final: ditolak oleh penjaga; setelah dibuka tetap 400 karena bukan roster aktif.
    expect([400, 409]).toContain(res.statusCode);
  });
});

describe('dokumen keberangkatan', () => {
  it('mutasi keluar semester berjalan membekukan dokumen rapor draf (keterangan nilai) tanpa baris report_card', async () => {
    const res = await call('POST', `/v1/students/${ids.fira}/transfer-out`, adminCookie, {
      effectiveOn: today,
      reason: 'school_choice',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().hasDepartureDocument).toBe(true);
    const detail = await call('GET', `/v1/student-transfers/${res.json().id}`, adminCookie);
    expect(detail.statusCode).toBe(200);
    const doc = detail.json().departureDocument;
    expect(doc.status).toBe('draft');
    expect(doc.subjects[0]).toMatchObject({ name: 'Matematika', final: 70 });
    const reports = await tenantTx((tx) =>
      tx.execute(sql`select count(*)::int as n from report_card where student_id = ${ids.fira}`),
    );
    expect((reports.rows[0] as { n: number }).n).toBe(0);
    // Daftar kelas semester berjalan tidak lagi memuat Fira (keluar pada/ sebelum akhir semester).
    expect(names((await call('GET', listUrl(ids.ganjil, ids.xiC), adminCookie)).json())).toEqual(['Eka']);
  });

  it('siswa yang sudah pindah tidak dapat dimutasi lagi (409 student_not_active), siswa tak dikenal 404', async () => {
    const again = await call('POST', `/v1/students/${ids.fira}/transfer-out`, adminCookie, {
      effectiveOn: today,
      reason: 'other',
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('student_not_active');
    const nobody = await call('POST', `/v1/students/${crypto.randomUUID()}/transfer-out`, adminCookie, {
      effectiveOn: today,
      reason: 'other',
    });
    expect(nobody.statusCode).toBe(404);
  });
});

describe('larangan semester genap tingkat akhir (K1)', () => {
  const body = (extra: object = {}) => ({ effectiveOn: day(30), reason: 'parent_relocation', ...extra });

  it('diblokir bawaan; tanpa hak school:manage penimpaan 403; admin dengan alasan menimpa dan tercatat audit', async () => {
    const blocked = await call('POST', `/v1/students/${ids.gani}/transfer-out`, adminCookie, body());
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('transfer_final_level_even_semester');
    expect(
      (await tenantTx((tx) => tx.select().from(student).where(eq(student.id, ids.gani))))[0]?.status,
    ).toBe('active');

    const clerkBlocked = await call('POST', `/v1/students/${ids.gani}/transfer-out`, clerkCookie, body());
    expect(clerkBlocked.statusCode).toBe(409);
    const clerkOverride = await call(
      'POST',
      `/v1/students/${ids.gani}/transfer-out`,
      clerkCookie,
      body({ exceptionReason: 'Mencoba menimpa' }),
    );
    expect(clerkOverride.statusCode).toBe(403);
    expect(clerkOverride.json().error.code).toBe('exception_requires_school_manage');

    const ok = await call(
      'POST',
      `/v1/students/${ids.gani}/transfer-out`,
      adminCookie,
      body({ exceptionReason: 'Pindah tugas orang tua ke luar negeri, disetujui dinas' }),
    );
    expect(ok.statusCode).toBe(201);
    expect(ok.json().exceptionReason).toBe('Pindah tugas orang tua ke luar negeri, disetujui dinas');
    const audits = await tenantTx((tx) =>
      tx.execute(
        sql`select details from audit_log where action = 'student.transfer_out' and entity_id = ${ids.gani}`,
      ),
    );
    expect((audits.rows[0] as { details: { override?: boolean } }).details.override).toBe(true);
  });

  it('putus sekolah tidak terkena larangan; semester ganjil tidak terkena; tingkat bukan akhir tidak terkena', async () => {
    const dropped = await call(
      'POST',
      `/v1/students/${ids.hadi}/transfer-out`,
      adminCookie,
      body({ kind: 'dropped', reason: 'dropped' }),
    );
    expect(dropped.statusCode).toBe(201);
    expect(dropped.json()).toMatchObject({ kind: 'dropped', exceptionReason: null });
    expect(
      (await tenantTx((tx) => tx.select().from(student).where(eq(student.id, ids.hadi))))[0]?.status,
    ).toBe('dropped');

    // Semester Ganjil di tingkat akhir: diterima tanpa penimpaan. Gunakan siswa baru di XII A.
    const [s] = await app.platformDb
      .insert(student)
      .values({ schoolId, name: 'Jaya', gender: 'L', status: 'active' })
      .returning();
    await app.platformDb
      .insert(enrollment)
      .values({ schoolId, studentId: s!.id, academicYearId: ids.year, classId: ids.xiiA });
    const ganjil = await call('POST', `/v1/students/${s!.id}/transfer-out`, adminCookie, {
      effectiveOn: today,
      reason: 'other',
    });
    expect(ganjil.statusCode).toBe(201);
    expect(ganjil.json().exceptionReason).toBeNull();
  });

  it('mutasi masuk ke tingkat akhir pada semester genap diblokir dan dapat ditimpa admin', async () => {
    const payload = (extra: object = {}) => ({
      name: `Pindahan Akhir ${run}`,
      gender: 'P',
      classId: ids.xiiA,
      effectiveOn: day(30),
      reason: 'parent_relocation',
      ...extra,
    });
    const blocked = await call('POST', '/v1/students/transfer-in', adminCookie, payload());
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('transfer_final_level_even_semester');
    // Tidak ada siswa setengah jadi.
    const ghost = await tenantTx((tx) =>
      tx
        .select()
        .from(student)
        .where(eq(student.name, `Pindahan Akhir ${run}`)),
    );
    expect(ghost).toHaveLength(0);
    const ok = await call(
      'POST',
      '/v1/students/transfer-in',
      adminCookie,
      payload({ exceptionReason: 'Dispensasi dinas pendidikan' }),
    );
    expect(ok.statusCode).toBe(201);
    expect(ok.json().transfer.exceptionReason).toBe('Dispensasi dinas pendidikan');
  });
});

describe('mutasi masuk', () => {
  it('membuat siswa aktif, penempatan, dan catatan masuk dengan sekolah asal', async () => {
    const res = await call('POST', '/v1/students/transfer-in', adminCookie, {
      name: `Pindahan ${run}`,
      gender: 'P',
      nis: `P-${run}`,
      classId: ids.xiB,
      effectiveOn: today,
      reason: 'parent_relocation',
      counterpartSchoolName: 'SMA Asal',
      counterpartNpsn: '87654321',
      letterNumber: 'MUT-01',
      letterDate: today,
    });
    expect(res.statusCode).toBe(201);
    const { transfer, student: stu } = res.json();
    expect(stu).toMatchObject({ status: 'active', classId: ids.xiB, className: 'XI B' });
    expect(transfer).toMatchObject({
      direction: 'in',
      kind: 'transfer',
      studentId: stu.id,
      classId: ids.xiB,
      counterpartSchoolName: 'SMA Asal',
      hasDepartureDocument: false,
    });
    const list = await call('GET', `/v1/students/${stu.id}/transfers`, adminCookie);
    expect(list.json().map((t: { id: string }) => t.id)).toEqual([transfer.id]);
    expect(await enrollmentClass(stu.id)).toBe(ids.xiB);

    const dup = await call('POST', '/v1/students/transfer-in', adminCookie, {
      name: 'Kembar',
      gender: 'P',
      nis: `P-${run}`,
      classId: ids.xiB,
      effectiveOn: today,
      reason: 'other',
    });
    expect(dup.statusCode).toBe(409);
  });

  it('validasi: kelas tak dikenal 400, NPSN bukan 8 angka 400', async () => {
    const base = { name: 'X', gender: 'L', effectiveOn: today, reason: 'other' };
    const noClass = await call('POST', '/v1/students/transfer-in', adminCookie, {
      ...base,
      classId: crypto.randomUUID(),
    });
    expect(noClass.statusCode).toBe(400);
    expect(noClass.json().error.code).toBe('invalid_reference');
    const badNpsn = await call('POST', '/v1/students/transfer-in', adminCookie, {
      ...base,
      classId: ids.xiB,
      counterpartNpsn: '123',
    });
    expect(badNpsn.statusCode).toBe(400);
  });
});

describe('ubah, batalkan, dan lengkapi mutasi', () => {
  it('ubah keterangan; batalkan mutasi keluar mengembalikan status aktif; mutasi masuk tidak dapat dibatalkan', async () => {
    const [stu] = await app.platformDb
      .insert(student)
      .values({ schoolId, name: 'Batal', gender: 'L', status: 'active' })
      .returning();
    await app.platformDb
      .insert(enrollment)
      .values({ schoolId, studentId: stu!.id, academicYearId: ids.year, classId: ids.xiB });
    const created = await call('POST', `/v1/students/${stu!.id}/transfer-out`, adminCookie, {
      effectiveOn: today,
      reason: 'other',
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const edited = await call('PUT', `/v1/student-transfers/${id}`, adminCookie, {
      reason: 'school_choice',
      reasonNote: 'Dikoreksi',
      counterpartSchoolName: 'SMK Baru',
      counterpartNpsn: null,
      letterNumber: 'SP-9',
      letterDate: today,
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ reason: 'school_choice', letterNumber: 'SP-9', direction: 'out' });

    const cancel = await call('DELETE', `/v1/student-transfers/${id}`, adminCookie);
    expect(cancel.statusCode).toBe(200);
    expect(
      (await tenantTx((tx) => tx.select().from(student).where(eq(student.id, stu!.id))))[0]?.status,
    ).toBe('active');
    expect((await call('GET', `/v1/student-transfers/${id}`, adminCookie)).statusCode).toBe(404);

    // Mutasi masuk tidak dapat dibatalkan.
    const inbound = (
      await call('GET', '/v1/student-transfers?direction=in', adminCookie).then((r) => r.json())
    ).items[0];
    const refused = await call('DELETE', `/v1/student-transfers/${inbound.id}`, adminCookie);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('transfer_not_cancellable');
  });

  it('batal ditolak bila status siswa sudah diubah (409 student_status_changed)', async () => {
    const list = (await call('GET', `/v1/student-transfers?studentId=${ids.fira}`, adminCookie)).json();
    expect(list.total).toBe(1);
    await call('PUT', `/v1/students/${ids.fira}`, adminCookie, {
      name: 'Fira',
      nis: `Fira-${run}`,
      nisn: `N-Fira-${run}`,
      gender: 'L',
      status: 'dropped',
    });
    const res = await call('DELETE', `/v1/student-transfers/${list.items[0].id}`, adminCookie);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('student_status_changed');
  });

  it('melengkapi murid pindah lama tanpa catatan: status tetap, tanpa dokumen keberangkatan, lalu tidak dapat diulang', async () => {
    const done = await call('POST', `/v1/students/${ids.legacy}/transfer-out`, adminCookie, {
      effectiveOn: day(-3),
      reason: 'parent_relocation',
      counterpartSchoolName: 'SMA Lama',
    });
    expect(done.statusCode).toBe(201);
    expect(done.json().hasDepartureDocument).toBe(false);
    expect(
      (await tenantTx((tx) => tx.select().from(student).where(eq(student.id, ids.legacy))))[0]?.status,
    ).toBe('transferred');
    const again = await call('POST', `/v1/students/${ids.legacy}/transfer-out`, adminCookie, {
      effectiveOn: day(-3),
      reason: 'other',
    });
    expect(again.statusCode).toBe(409);
  });

  it('daftar mutasi: total, filter arah dan tahun, urut terbaru', async () => {
    const all = (await call('GET', '/v1/student-transfers', adminCookie)).json();
    expect(all.total).toBeGreaterThanOrEqual(5);
    const outs = (await call('GET', '/v1/student-transfers?direction=out', adminCookie)).json();
    expect(outs.items.every((t: { direction: string }) => t.direction === 'out')).toBe(true);
    const dates = all.items.map((t: { effectiveOn: string }) => t.effectiveOn);
    expect(dates).toEqual([...dates].sort().reverse());
    const old = (
      await call('GET', `/v1/student-transfers?academicYearId=${ids.oldYear}`, adminCookie)
    ).json();
    expect(old.total).toBe(3);
  });
});

describe('multi-tenant, RBAC, FK komposit', () => {
  it('sekolah lain tidak melihat atau memutasi siswa sekolah ini', async () => {
    const list = await call('GET', '/v1/student-transfers', otherAdminCookie, undefined, otherSchoolId);
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({ total: 0, items: [] });
    const any = (await call('GET', '/v1/student-transfers', adminCookie)).json().items[0];
    const detail = await call(
      'GET',
      `/v1/student-transfers/${any.id}`,
      otherAdminCookie,
      undefined,
      otherSchoolId,
    );
    expect(detail.statusCode).toBe(404);
    const out = await call(
      'POST',
      `/v1/students/${ids.ani}/transfer-out`,
      otherAdminCookie,
      { effectiveOn: today, reason: 'other' },
      otherSchoolId,
    );
    expect(out.statusCode).toBe(404);
    const history = await call(
      'GET',
      `/v1/students/${ids.ani}/academic-history`,
      otherAdminCookie,
      undefined,
      otherSchoolId,
    );
    expect(history.statusCode).toBe(404);
    // Anggota sekolah ini tidak bisa memakai header sekolah lain.
    const foreign = await call('GET', '/v1/student-transfers', adminCookie, undefined, otherSchoolId);
    expect(foreign.statusCode).toBe(403);
  });

  it('FK komposit menolak rujukan silang sekolah (siswa, tahun, kelas) pada kedua tabel', async () => {
    const db = app.platformDb;
    const [otherStudent] = await db
      .insert(student)
      .values({ schoolId: otherSchoolId, name: 'Siswa Lain', gender: 'L' })
      .returning();
    const base = {
      schoolId: otherSchoolId,
      studentId: otherStudent!.id,
      direction: 'out' as const,
      effectiveOn: today,
      academicYearId: ids.otherYear,
      reason: 'other',
      createdBy: 'uji',
    };
    await expect(db.insert(studentTransfer).values({ ...base, studentId: ids.ani })).rejects.toThrow();
    await expect(db.insert(studentTransfer).values({ ...base, academicYearId: ids.year })).rejects.toThrow();
    await expect(db.insert(studentTransfer).values({ ...base, classId: ids.xiA })).rejects.toThrow();
    const change = {
      schoolId: otherSchoolId,
      studentId: otherStudent!.id,
      academicYearId: ids.otherYear,
      effectiveOn: today,
    };
    await expect(
      db
        .insert(enrollmentChange)
        .values({ ...change, studentId: ids.ani, toClassId: null, fromClassId: null }),
    ).rejects.toThrow();
    await expect(db.insert(enrollmentChange).values({ ...change, fromClassId: ids.xiA })).rejects.toThrow();
    await expect(db.insert(enrollmentChange).values({ ...change, toClassId: ids.xiB })).rejects.toThrow();
    // Sah: tanpa rujukan silang.
    await expect(db.insert(studentTransfer).values(base)).resolves.toBeDefined();
  });

  it('CHECK: putus sekolah hanya arah keluar; NPSN 8 angka; dua tabel baru memakai RLS yang dipaksa dengan kebijakan', async () => {
    const db = app.platformDb;
    await expect(
      db.insert(studentTransfer).values({
        schoolId,
        studentId: ids.ani,
        direction: 'in',
        kind: 'dropped',
        effectiveOn: today,
        academicYearId: ids.year,
        reason: 'other',
        createdBy: 'uji',
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(studentTransfer).values({
        schoolId,
        studentId: ids.ani,
        direction: 'out',
        effectiveOn: today,
        academicYearId: ids.year,
        reason: 'other',
        counterpartNpsn: '12AB',
        createdBy: 'uji',
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(enrollmentChange).values({
        schoolId,
        studentId: ids.ani,
        academicYearId: ids.year,
        fromClassId: ids.xiA,
        toClassId: ids.xiA,
        effectiveOn: today,
      }),
    ).rejects.toThrow();
    const rls = await db.execute<{ relname: string; rls: boolean; forced: boolean; policies: number }>(sql`
      select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced,
             (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
      from pg_class c where c.relname in ('student_transfer', 'enrollment_change') order by c.relname
    `);
    expect(rls.rows).toEqual([
      { relname: 'enrollment_change', rls: true, forced: true, policies: 1 },
      { relname: 'student_transfer', rls: true, forced: true, policies: 1 },
    ]);
  });

  it('RBAC: guru (hanya student:read) membaca tetapi tidak dapat memutasi; petugas tata usaha dapat memutasi', async () => {
    const read = await call('GET', '/v1/student-transfers', teacherCookie);
    expect(read.statusCode).toBe(200);
    const history = await call('GET', `/v1/students/${ids.ani}/academic-history`, teacherCookie);
    expect(history.statusCode).toBe(200);
    const write = await call('POST', `/v1/students/${ids.ani}/transfer-out`, teacherCookie, {
      effectiveOn: today,
      reason: 'other',
    });
    expect(write.statusCode).toBe(403);
    const inbound = await call('POST', '/v1/students/transfer-in', teacherCookie, {
      name: 'X',
      gender: 'L',
      classId: ids.xiB,
      effectiveOn: today,
      reason: 'other',
    });
    expect(inbound.statusCode).toBe(403);
    const any = (await call('GET', '/v1/student-transfers', adminCookie)).json().items[0];
    expect(
      (await call('PUT', `/v1/student-transfers/${any.id}`, teacherCookie, { reason: 'other' })).statusCode,
    ).toBe(403);
    expect((await call('DELETE', `/v1/student-transfers/${any.id}`, teacherCookie)).statusCode).toBe(403);
    const moved = await call('PUT', `/v1/students/${ids.ani}/class`, teacherCookie, { classId: ids.xiB });
    expect(moved.statusCode).toBe(403);
    // Petugas (student:manage tanpa school:manage) dapat memutasi di luar larangan.
    const [s] = await app.platformDb
      .insert(student)
      .values({ schoolId, name: 'Oleh Petugas', gender: 'L', status: 'active' })
      .returning();
    await app.platformDb
      .insert(enrollment)
      .values({ schoolId, studentId: s!.id, academicYearId: ids.year, classId: ids.xiB });
    const ok = await call('POST', `/v1/students/${s!.id}/transfer-out`, clerkCookie, {
      effectiveOn: today,
      reason: 'other',
    });
    expect(ok.statusCode).toBe(201);
  });
});
