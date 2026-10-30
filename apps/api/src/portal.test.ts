import { createHash } from 'node:crypto';
import {
  academicYear,
  announcement,
  assessment,
  assignRoles,
  classRoom,
  dailyAttendance,
  enrollment,
  entitlement,
  eq,
  finFeeType,
  finInvoice,
  finPayment,
  finPaymentItem,
  foundation,
  gradeComponent,
  guardian,
  hafalanEntry,
  member,
  portalInvite,
  reportCard,
  school,
  score,
  seedSchoolRoles,
  semester,
  sql,
  student,
  studentGuardian,
  subject,
  subscription,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { todayInJakarta } from './attendance-lib';
import { loadEnv } from './env';
import { addDays } from './portal-lib';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const today = todayInJakarta();

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
const schoolIds: string[] = [];
const userIds: string[] = [];

let schoolId = '';
let partialId = '';
let noPortalId = '';
let otherId = '';
let adminCookie = '';
let operatorCookie = '';
let teacherCookie = '';
let partialAdminCookie = '';
let noPortalAdminCookie = '';
let otherAdminCookie = '';
let otherAdminEmail = '';

const ids = {
  year: '',
  sem: '',
  cls: '',
  ani: '',
  budi: '',
  citra: '',
  foreign: '',
  g1: '',
  g2: '',
  g3: '',
  spp: '',
  invOverdue: '',
  invFuture: '',
  subj: '',
  partialStudent: '',
  partialGuardian: '',
  noPortalStudent: '',
};

async function makeUser(label: string) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  return { id: res.user.id, email };
}
async function login(email: string, pw = password) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password: pw },
  });
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}
async function join(label: string, sid: string, roles: string[]) {
  const u = await makeUser(label);
  const [m] = await app.platformDb.insert(member).values({ userId: u.id, schoolId: sid }).returning();
  await assignRoles(app.platformDb, m!.id, sid, roles);
  return { cookie: await login(u.email), email: u.email };
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
const code = (res: { json: () => { error: { code: string } } }) => res.json().error.code;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Portal', slug: `yp-${run}` })
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
    schoolIds.push(s!.id);
    return s!.id;
  };
  schoolId = await make(`portal-${run}`, [
    'parent_portal',
    'attendance',
    'grades',
    'finance',
    'tahfidz',
    'announcements',
  ]);
  partialId = await make(`portal-sebagian-${run}`, ['parent_portal', 'attendance']);
  noPortalId = await make(`portal-tanpa-${run}`, ['attendance']);
  otherId = await make(`portal-lain-${run}`, ['parent_portal', 'attendance']);

  const yearOf = async (sid: string) => {
    const [y] = await db
      .insert(academicYear)
      .values({
        schoolId: sid,
        name: '2000-2099',
        startsOn: '2000-01-01',
        endsOn: '2099-12-31',
        isActive: true,
      })
      .returning();
    return y!.id;
  };
  ids.year = await yearOf(schoolId);
  const partialYear = await yearOf(partialId);
  const noPortalYear = await yearOf(noPortalId);
  const otherYear = await yearOf(otherId);

  const [sem] = await db
    .insert(semester)
    .values({
      schoolId,
      academicYearId: ids.year,
      name: 'Semester Uji',
      startsOn: '2000-01-01',
      endsOn: '2099-12-31',
      isActive: true,
    })
    .returning();
  ids.sem = sem!.id;

  const mkClass = async (sid: string, yearId: string, name: string) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId: sid, academicYearId: yearId, name, level: '7' })
      .returning();
    return c!.id;
  };
  ids.cls = await mkClass(schoolId, ids.year, '7A');
  const partialClass = await mkClass(partialId, partialYear, '7A');
  const noPortalClass = await mkClass(noPortalId, noPortalYear, '7A');
  const otherClass = await mkClass(otherId, otherYear, '7A');

  const mkStudent = async (sid: string, yearId: string, classId: string, name: string, nis: string) => {
    const [s] = await db.insert(student).values({ schoolId: sid, name, nis, gender: 'L' }).returning();
    await db.insert(enrollment).values({ schoolId: sid, studentId: s!.id, classId, academicYearId: yearId });
    return s!.id;
  };
  ids.ani = await mkStudent(schoolId, ids.year, ids.cls, 'Ani', 'P1');
  ids.budi = await mkStudent(schoolId, ids.year, ids.cls, 'Budi', 'P2');
  ids.citra = await mkStudent(schoolId, ids.year, ids.cls, 'Citra', 'P3');
  ids.foreign = await mkStudent(otherId, otherYear, otherClass, 'Siswa Lain', 'X1');
  ids.partialStudent = await mkStudent(partialId, partialYear, partialClass, 'Dina', 'S1');
  ids.noPortalStudent = await mkStudent(noPortalId, noPortalYear, noPortalClass, 'Eko', 'T1');

  const mkGuardian = async (sid: string, name: string, studentIds: string[]) => {
    const [g] = await db.insert(guardian).values({ schoolId: sid, name }).returning();
    for (const studentId of studentIds) {
      await db
        .insert(studentGuardian)
        .values({ schoolId: sid, studentId, guardianId: g!.id, relation: 'mother', isPrimary: true });
    }
    return g!.id;
  };
  ids.g1 = await mkGuardian(schoolId, 'Ibu Ani dan Budi', [ids.ani, ids.budi]);
  ids.g2 = await mkGuardian(schoolId, 'Bapak Citra', [ids.citra]);
  ids.g3 = await mkGuardian(schoolId, 'Wali Tanpa Anak', []);
  ids.partialGuardian = await mkGuardian(partialId, 'Ibu Dina', [ids.partialStudent]);

  // Absensi Ani: 3 hari tercatat dalam 30 hari terakhir, 1 di luar.
  const att = (date: string, status: 'present' | 'late' | 'sick') =>
    db.insert(dailyAttendance).values({ schoolId, studentId: ids.ani, date, status });
  await att(addDays(today, -1), 'present');
  await att(addDays(today, -2), 'late');
  await att(addDays(today, -3), 'sick');
  await att(addDays(today, -40), 'present');
  await db.insert(dailyAttendance).values({
    schoolId: partialId,
    studentId: ids.partialStudent,
    date: addDays(today, -1),
    status: 'present',
  });

  // Tagihan: Ani punya satu yang lewat jatuh tempo (dibayar sebagian) dan satu yang belum jatuh tempo.
  const [spp] = await db.insert(finFeeType).values({ schoolId, name: 'SPP', kind: 'monthly' }).returning();
  ids.spp = spp!.id;
  const mkInvoice = async (
    studentId: string,
    title: string,
    amount: number,
    dueDate: string,
    period: string,
  ) => {
    const [i] = await db
      .insert(finInvoice)
      .values({
        schoolId,
        studentId,
        academicYearId: ids.year,
        feeTypeId: ids.spp,
        period,
        title,
        amount,
        dueDate,
        createdBy: 'seed',
      })
      .returning();
    return i!.id;
  };
  ids.invOverdue = await mkInvoice(ids.ani, 'SPP Lama', 500_000, '2020-01-10', '2020-01');
  ids.invFuture = await mkInvoice(ids.ani, 'SPP Depan', 300_000, '2099-12-31', '2099-12');
  await mkInvoice(ids.citra, 'SPP Citra', 100_000, '2099-12-31', '2099-12');
  const [pay] = await db
    .insert(finPayment)
    .values({
      schoolId,
      receiptNo: `KWT-${run}-1`,
      studentId: ids.ani,
      method: 'cash',
      total: 200_000,
      recordedBy: 'seed',
    })
    .returning();
  await db
    .insert(finPaymentItem)
    .values({ schoolId, paymentId: pay!.id, invoiceId: ids.invOverdue, amount: 200_000 });
  // Kwitansi batal tidak boleh tampil maupun dihitung.
  const [voided] = await db
    .insert(finPayment)
    .values({
      schoolId,
      receiptNo: `KWT-${run}-2`,
      studentId: ids.ani,
      method: 'cash',
      total: 50_000,
      recordedBy: 'seed',
      voidedAt: new Date(),
    })
    .returning();
  await db
    .insert(finPaymentItem)
    .values({ schoolId, paymentId: voided!.id, invoiceId: ids.invOverdue, amount: 50_000 });

  // Nilai: satu komponen, satu mapel, satu penilaian.
  const [comp] = await db
    .insert(gradeComponent)
    .values({ schoolId, name: 'Ulangan Harian', weight: 100 })
    .returning();
  const [subj] = await db.insert(subject).values({ schoolId, code: 'MTK', name: 'Matematika' }).returning();
  ids.subj = subj!.id;
  const [asm] = await db
    .insert(assessment)
    .values({
      schoolId,
      semesterId: ids.sem,
      classId: ids.cls,
      subjectId: ids.subj,
      componentId: comp!.id,
      title: 'UH 1',
      date: '2020-03-01',
      maxScore: 100,
    })
    .returning();
  for (const [studentId, value] of [
    [ids.ani, 80],
    [ids.budi, 90],
    [ids.citra, 70],
  ] as const) {
    await db.insert(score).values({ schoolId, assessmentId: asm!.id, studentId, value, updatedBy: 'seed' });
  }

  // Rapor: Ani final (snapshot beku), Budi masih draft.
  const doc = {
    status: 'final',
    school: { name: 'Sekolah Uji', address: null, city: null },
    semester: { id: ids.sem, name: 'Semester Uji', academicYear: '2000-2099' },
    student: { id: ids.ani, name: 'Ani', nis: 'P1', nisn: null, className: '7A', level: '7' },
    subjects: [
      {
        subjectId: ids.subj,
        name: 'Matematika',
        kkm: 75,
        final: 80,
        predicate: 'B',
        description: 'Baik.',
        belowKkm: false,
      },
    ],
    extracurriculars: [],
    attendance: { sick: 1, excused: 0, absent: 0, late: 1 },
    homeroomNote: 'Pertahankan.',
    homeroomTeacher: null,
    principal: null,
    rank: null,
    generatedAt: new Date().toISOString(),
  };
  await db.insert(reportCard).values({
    schoolId,
    semesterId: ids.sem,
    studentId: ids.ani,
    classId: ids.cls,
    status: 'final',
    finalizedAt: new Date(),
    finalizedBy: 'seed',
    snapshot: doc,
  });
  await db
    .insert(reportCard)
    .values({ schoolId, semesterId: ids.sem, studentId: ids.budi, classId: ids.cls, status: 'draft' });

  // Tahfidz: Ani menyetor Al-Fatihah 1:1-1:7.
  await db.insert(hafalanEntry).values({
    schoolId,
    studentId: ids.ani,
    date: addDays(today, -1),
    kind: 'ziyadah',
    surahFrom: 1,
    ayahFrom: 1,
    surahTo: 1,
    ayahTo: 7,
    recordedBy: 'seed',
  });

  // Pengumuman: hanya yang terbit, audiens portal/all, dan belum kedaluwarsa yang tampil.
  const ann = (title: string, extra: Partial<typeof announcement.$inferInsert>) =>
    db.insert(announcement).values({
      schoolId,
      title,
      body: `Isi ${title}`,
      status: 'published',
      publishedAt: new Date(Date.now() - 60_000),
      createdBy: 'seed',
      ...extra,
    });
  await ann('Libur Semester', { audience: 'portal', pinned: true });
  await ann('Rapat Umum', { audience: 'all' });
  await ann('Khusus Staf', { audience: 'staff' });
  await ann('Konsep', { audience: 'portal', status: 'draft', publishedAt: null });
  await ann('Kedaluwarsa', { audience: 'portal', expiresAt: new Date(Date.now() - 1000) });

  adminCookie = (await join('admin-portal', schoolId, ['school_admin'])).cookie;
  operatorCookie = (await join('operator-portal', schoolId, ['operator'])).cookie;
  teacherCookie = (await join('guru-portal', schoolId, ['teacher'])).cookie;
  partialAdminCookie = (await join('admin-portal-sebagian', partialId, ['school_admin'])).cookie;
  noPortalAdminCookie = (await join('admin-portal-tanpa', noPortalId, ['school_admin'])).cookie;
  const other = await join('admin-portal-lain', otherId, ['school_admin']);
  otherAdminCookie = other.cookie;
  otherAdminEmail = other.email;
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of schoolIds) {
    for (const table of [
      'audit_log',
      'outbox',
      'portal_link',
      'portal_invite',
      'announcement',
      'report_card',
      'score',
      'assessment',
      'grade_component',
      'subject',
      'hafalan_entry',
      'daily_attendance',
      'fin_payment_item',
      'fin_payment',
      'fin_invoice',
      'fin_fee_type',
      'student_guardian',
      'guardian',
      'enrollment',
      'semester',
      'class_room',
      'student',
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

const invite = (body: object, cookie = adminCookie, sid = schoolId) =>
  call('POST', '/v1/portal/invites', cookie, body, sid);
const info = (token: string) => app.inject({ method: 'GET', url: `/v1/public/portal-invites/${token}` });
const accept = (token: string, body: object) =>
  app.inject({ method: 'POST', url: `/v1/public/portal-invites/${token}/accept`, payload: body });

/** Undang lalu terima lewat API; mengembalikan cookie sesi akun portal baru. */
async function onboard(
  body: object,
  label: string,
  opts: { cookie?: string; sid?: string } = {},
): Promise<{ cookie: string; email: string; token: string }> {
  const created = await invite(body, opts.cookie ?? adminCookie, opts.sid ?? schoolId);
  expect(created.statusCode).toBe(201);
  const { token } = created.json() as { token: string };
  const email = `${label}-${run}@example.test`;
  const res = await accept(token, { name: label, email, password });
  expect(res.statusCode).toBe(201);
  const row = await app.platformDb.select({ id: user.id }).from(user).where(eq(user.email, email));
  userIds.push(row[0]!.id);
  return { cookie: await login(email), email, token };
}

let guardianCookie = '';
let studentCookie = '';
let partialCookie = '';

describe('undangan portal (admin)', () => {
  it('izin: operator boleh (student:manage); guru dan akun tanpa modul ditolak', async () => {
    expect((await invite({ kind: 'guardian', guardianId: ids.g3 }, teacherCookie)).statusCode).toBe(403);
    const noModule = await invite(
      { kind: 'student', studentId: ids.noPortalStudent },
      noPortalAdminCookie,
      noPortalId,
    );
    expect(noModule.statusCode).toBe(403);
    expect(code(noModule)).toBe('module_disabled');
    expect((await call('GET', '/v1/portal/invites', teacherCookie)).statusCode).toBe(403);
    expect((await call('GET', '/v1/portal/accounts', teacherCookie)).statusCode).toBe(403);

    const res = await invite({ kind: 'student', studentId: ids.budi }, operatorCookie);
    expect(res.statusCode).toBe(201);
    expect((await call('DELETE', `/v1/portal/invites/${res.json().id}`, operatorCookie)).statusCode).toBe(
      200,
    );
  });

  it('wali tanpa siswa dan target salah sekolah ditolak (400), badan tidak konsisten ditolak', async () => {
    const orphan = await invite({ kind: 'guardian', guardianId: ids.g3 });
    expect(orphan.statusCode).toBe(400);
    expect(code(orphan)).toBe('invalid_reference');
    const foreign = await invite({ kind: 'student', studentId: ids.foreign });
    expect(foreign.statusCode).toBe(400);
    expect(code(foreign)).toBe('invalid_reference');
    const mixed = await invite({ kind: 'guardian', studentId: ids.ani });
    expect(mixed.statusCode).toBe(400);
  });

  it('membuat undangan: token tampil sekali, hanya hash tersimpan, 14 hari', async () => {
    const res = await invite({ kind: 'guardian', guardianId: ids.g1, email: 'Ibu.Ani@Example.test' });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token.length).toBeGreaterThan(30);
    expect(body.link).toContain(`/portal/invite/${body.token}`);
    expect(body.email).toBe('ibu.ani@example.test');
    expect(body.targetName).toBe('Ibu Ani dan Budi');
    const days = (Date.parse(body.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);

    const [row] = await app.platformDb.select().from(portalInvite).where(eq(portalInvite.id, body.id));
    expect(row!.tokenHash).toBe(hash(body.token));
    expect(JSON.stringify(row)).not.toContain(body.token);

    const list = await call('GET', '/v1/portal/invites', adminCookie);
    expect(list.statusCode).toBe(200);
    const item = list.json().find((i: { id: string }) => i.id === body.id);
    expect(item.expired).toBe(false);
    expect(item).not.toHaveProperty('token');
  });

  it('undangan baru untuk target yang sama menggantikan yang lama', async () => {
    const first = (await invite({ kind: 'student', studentId: ids.budi })).json();
    const second = (await invite({ kind: 'student', studentId: ids.budi })).json();
    expect((await info(first.token)).statusCode).toBe(410);
    expect((await info(second.token)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/portal/invites/${second.id}`, adminCookie)).statusCode).toBe(200);
  });

  it('mencabut undangan: tautan tidak berlaku; id asing 404', async () => {
    const created = (await invite({ kind: 'student', studentId: ids.budi })).json();
    expect((await call('DELETE', `/v1/portal/invites/${created.id}`, adminCookie)).statusCode).toBe(200);
    expect((await info(created.token)).statusCode).toBe(410);
    expect((await call('DELETE', `/v1/portal/invites/${created.id}`, adminCookie)).statusCode).toBe(404);
    // Admin sekolah lain tidak bisa mencabut undangan sekolah ini.
    const mine = (await invite({ kind: 'student', studentId: ids.budi })).json();
    const cross = await call('DELETE', `/v1/portal/invites/${mine.id}`, otherAdminCookie, undefined, otherId);
    expect(cross.statusCode).toBe(404);
    await call('DELETE', `/v1/portal/invites/${mine.id}`, adminCookie);
  });
});

describe('penerimaan undangan (publik)', () => {
  it('info undangan memuat sekolah, jenis, nama, dan menolak token acak', async () => {
    const created = (await invite({ kind: 'student', studentId: ids.citra })).json();
    const res = await info(created.token);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      kind: 'student',
      targetName: 'Citra',
      email: null,
      accountExists: false,
    });
    expect((await info('x'.repeat(43))).statusCode).toBe(410);
    await call('DELETE', `/v1/portal/invites/${created.id}`, adminCookie);
  });

  it('wali: menerima membuat akun, anggota, peran, dan tautan; token sekali pakai', async () => {
    const created = (
      await invite({ kind: 'guardian', guardianId: ids.g1, email: 'wali-ani@example.test' })
    ).json();

    // Email dikunci undangan.
    const wrong = await accept(created.token, { email: 'lain@example.test', password });
    expect(wrong.statusCode).toBe(400);
    expect(code(wrong)).toBe('email_mismatch');
    // Kata sandi pendek ditolak.
    expect(
      (await accept(created.token, { email: 'wali-ani@example.test', password: 'pendek' })).statusCode,
    ).toBe(400);

    const res = await accept(created.token, { name: 'Ibu Ani', email: 'wali-ani@example.test', password });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ kind: 'guardian', email: 'wali-ani@example.test' });
    const [u] = await app.platformDb
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, 'wali-ani@example.test'));
    userIds.push(u!.id);

    // Sekali pakai.
    const again = await accept(created.token, { name: 'Lagi', email: 'wali-ani@example.test', password });
    expect(again.statusCode).toBe(410);
    expect((await info(created.token)).statusCode).toBe(410);

    // Sudah tertaut: tidak bisa diundang lagi sampai akunnya dicabut.
    const re = await invite({ kind: 'guardian', guardianId: ids.g1 });
    expect(re.statusCode).toBe(409);
    expect(code(re)).toBe('already_linked');

    guardianCookie = await login('wali-ani@example.test');
    const me = await call('GET', '/v1/portal/me', guardianCookie);
    expect(me.statusCode).toBe(200);
    expect(me.json().kind).toBe('guardian');

    const accounts = (await call('GET', '/v1/portal/accounts', adminCookie)).json();
    const acc = accounts.find((a: { userEmail: string }) => a.userEmail === 'wali-ani@example.test');
    expect(acc).toMatchObject({ kind: 'guardian', targetId: ids.g1, status: 'active' });
  });

  it('undangan kedaluwarsa ditolak (info dan terima)', async () => {
    const created = (await invite({ kind: 'student', studentId: ids.citra })).json();
    await app.platformDb
      .update(portalInvite)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(portalInvite.id, created.id));
    expect((await info(created.token)).statusCode).toBe(410);
    const res = await accept(created.token, { email: `kadaluarsa-${run}@example.test`, password });
    expect(res.statusCode).toBe(410);
    // Tidak ada akun yang tertinggal.
    const left = await app.platformDb
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, `kadaluarsa-${run}@example.test`));
    expect(left).toHaveLength(0);
    // Daftar menandai kedaluwarsa.
    const list = (await call('GET', '/v1/portal/invites', adminCookie)).json();
    expect(list.find((i: { id: string }) => i.id === created.id).expired).toBe(true);
    await call('DELETE', `/v1/portal/invites/${created.id}`, adminCookie);
  });

  it('dua penerimaan bersamaan: hanya satu berhasil dan akun yang kalah tidak tertinggal', async () => {
    const created = (await invite({ kind: 'student', studentId: ids.citra })).json();
    const a = `balapan-a-${run}@example.test`;
    const b = `balapan-b-${run}@example.test`;
    const [ra, rb] = await Promise.all([
      accept(created.token, { email: a, password }),
      accept(created.token, { email: b, password }),
    ]);
    expect([ra.statusCode, rb.statusCode].sort()).toEqual([201, 410]);
    const winnerEmail = ra.statusCode === 201 ? a : b;
    const loserEmail = ra.statusCode === 201 ? b : a;
    const [w] = await app.platformDb.select({ id: user.id }).from(user).where(eq(user.email, winnerEmail));
    userIds.push(w!.id);
    const lost = await app.platformDb.select({ id: user.id }).from(user).where(eq(user.email, loserEmail));
    expect(lost).toHaveLength(0);
    studentCookie = await login(winnerEmail);
  });

  it('email yang sudah punya akun: kata sandi salah 401, benar menautkan akun yang sama', async () => {
    const created = (await invite({ kind: 'guardian', guardianId: ids.g2 })).json();
    expect(created.email).toBeNull();
    const bad = await accept(created.token, { email: otherAdminEmail, password: 'salah-salah-salah-1' });
    expect(bad.statusCode).toBe(401);
    expect(code(bad)).toBe('invalid_credentials');
    const info1 = await info(created.token);
    expect(info1.statusCode).toBe(200);
    const good = await accept(created.token, { email: otherAdminEmail, password });
    expect(good.statusCode).toBe(201);
    // Akun yang sama kini punya keanggotaan di dua sekolah.
    const cookie = await login(otherAdminEmail);
    const me = await call('GET', '/v1/portal/me', cookie);
    expect(me.statusCode).toBe(200);
    expect(me.json().children.map((c: { name: string }) => c.name)).toEqual(['Citra']);
    // Sekolah asalnya tetap berfungsi.
    expect((await call('GET', '/v1/members', cookie, undefined, otherId)).statusCode).toBe(200);
  });

  it('sekolah tanpa modul portal: info undangan 403 module_disabled', async () => {
    const token = 'z'.repeat(43);
    await app.platformDb.insert(portalInvite).values({
      schoolId: noPortalId,
      kind: 'student',
      studentId: ids.noPortalStudent,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + 86_400_000),
      createdBy: 'seed',
    });
    const res = await info(token);
    expect(res.statusCode).toBe(403);
    expect(code(res)).toBe('module_disabled');
    expect((await accept(token, { email: `tanpa-${run}@example.test`, password })).statusCode).toBe(403);
  });
});

describe('portal: akun dan isolasi', () => {
  it('akun portal hanya punya portal:read: endpoint admin dan data sekolah ditolak', async () => {
    expect((await invite({ kind: 'student', studentId: ids.ani }, guardianCookie)).statusCode).toBe(403);
    expect((await call('GET', '/v1/portal/accounts', guardianCookie)).statusCode).toBe(403);
    expect((await call('GET', '/v1/students', guardianCookie)).statusCode).toBe(403);
  });

  it('wali melihat dua anaknya saja; anak wali lain, siswa sekolah lain, dan id acak 404', async () => {
    const me = (await call('GET', '/v1/portal/me', guardianCookie)).json();
    expect(me.linked).toBe(true);
    expect(me.guardian.name).toBe('Ibu Ani dan Budi');
    expect(me.children.map((c: { name: string }) => c.name)).toEqual(['Ani', 'Budi']);
    expect(me.children[0]).toMatchObject({ className: '7A', level: '7', relation: 'mother' });
    expect(me.sections).toEqual({
      attendance: true,
      grades: true,
      finance: true,
      tahfidz: true,
      announcements: true,
    });

    const paths = ['overview', 'attendance', 'grades', 'invoices', 'report-cards', 'tahfidz'];
    for (const other of [ids.citra, ids.foreign, '0198f2c0-0000-7000-8000-000000000000']) {
      for (const p of paths) {
        const res = await call('GET', `/v1/portal/children/${other}/${p}`, guardianCookie);
        expect(res.statusCode, `${p} ${other}`).toBe(404);
        expect(code(res)).toBe('not_found');
      }
      const doc = await call('GET', `/v1/portal/children/${other}/report-cards/${ids.sem}`, guardianCookie);
      expect(doc.statusCode).toBe(404);
    }
    expect((await call('GET', `/v1/portal/children/${ids.budi}/overview`, guardianCookie)).statusCode).toBe(
      200,
    );
  });

  it('siswa hanya melihat dirinya', async () => {
    const me = (await call('GET', '/v1/portal/me', studentCookie)).json();
    expect(me.kind).toBe('student');
    expect(me.guardian).toBeNull();
    expect(me.children.map((c: { name: string }) => c.name)).toEqual(['Citra']);
    expect((await call('GET', `/v1/portal/children/${ids.citra}/overview`, studentCookie)).statusCode).toBe(
      200,
    );
    expect((await call('GET', `/v1/portal/children/${ids.ani}/overview`, studentCookie)).statusCode).toBe(
      404,
    );
    expect((await call('GET', `/v1/portal/children/${ids.budi}/invoices`, studentCookie)).statusCode).toBe(
      404,
    );
  });

  it('admin tanpa tautan portal: me kosong, data anak 404', async () => {
    const me = (await call('GET', '/v1/portal/me', adminCookie)).json();
    expect(me.linked).toBe(false);
    expect(me.children).toEqual([]);
    expect((await call('GET', `/v1/portal/children/${ids.ani}/overview`, adminCookie)).statusCode).toBe(404);
  });

  it('x-school-id sekolah lain: tidak bisa membaca lewat sekolah yang bukan miliknya', async () => {
    const res = await call(
      'GET',
      `/v1/portal/children/${ids.ani}/overview`,
      guardianCookie,
      undefined,
      otherId,
    );
    expect(res.statusCode).toBe(403);
  });

  it('tanpa sesi 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/portal/me',
      headers: { 'x-school-id': schoolId },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('portal: data anak', () => {
  it('ikhtisar Ani: kelas, absensi 30 hari, tagihan, nilai, rapor final, tahfidz, pengumuman', async () => {
    const res = await call('GET', `/v1/portal/children/${ids.ani}/overview`, guardianCookie);
    expect(res.statusCode).toBe(200);
    const o = res.json();
    expect(o.child).toMatchObject({ name: 'Ani', className: '7A', academicYear: '2000-2099' });

    expect(o.attendance.available).toBe(true);
    expect(o.attendance.counts).toEqual({ present: 1, late: 1, excused: 0, sick: 1, absent: 0 });
    expect(o.attendance.recorded).toBe(3);
    expect(o.attendance.percent).toBe(67);
    expect(o.attendance.from).toBe(addDays(today, -29));
    expect(o.attendance.to).toBe(today);
    expect(o.attendance.recentDays[0].date).toBe(addDays(today, -1));

    // 500.000 - 200.000 (kwitansi aktif) = 300.000 lewat jatuh tempo, ditambah 300.000 yang belum jatuh tempo.
    expect(o.invoices).toMatchObject({
      available: true,
      openCount: 2,
      outstandingTotal: 600_000,
      overdueTotal: 300_000,
    });
    expect(o.invoices.upcoming[0]).toMatchObject({ title: 'SPP Lama', outstanding: 300_000, overdue: true });

    expect(o.grades.recentScores[0]).toMatchObject({ subject: 'Matematika', title: 'UH 1', value: 80 });
    expect(o.reportCards.items).toHaveLength(1);
    expect(o.reportCards.items[0]).toMatchObject({ semesterName: 'Semester Uji', average: 80 });

    expect(o.tahfidz).toMatchObject({ available: true, ayahs: 7, streakDays: 1 });
    expect(o.tahfidz.lastEntryDate).toBe(addDays(today, -1));

    const titles = o.announcements.items.map((a: { title: string }) => a.title);
    expect(titles).toEqual(['Libur Semester', 'Rapat Umum']);
    expect(o.announcements.items[0].pinned).toBe(true);
  });

  it('absensi rinci: rentang kustom, rentang terlalu panjang 400', async () => {
    const wide = await call(
      'GET',
      `/v1/portal/children/${ids.ani}/attendance?from=${addDays(today, -60)}&to=${today}`,
      guardianCookie,
    );
    expect(wide.statusCode).toBe(200);
    expect(wide.json().recorded).toBe(4);
    expect(wide.json().days).toHaveLength(4);
    const bad = await call(
      'GET',
      `/v1/portal/children/${ids.ani}/attendance?from=2000-01-01&to=${today}`,
      guardianCookie,
    );
    expect(bad.statusCode).toBe(400);
    expect(code(bad)).toBe('invalid_range');
    const empty = await call('GET', `/v1/portal/children/${ids.budi}/attendance`, guardianCookie);
    expect(empty.json()).toMatchObject({ available: true, recorded: 0, percent: null, days: [] });
  });

  it('nilai rinci: nilai akhir per mapel, KKM, dan semester', async () => {
    const res = await call('GET', `/v1/portal/children/${ids.ani}/grades`, guardianCookie);
    expect(res.statusCode).toBe(200);
    const g = res.json();
    expect(g.available).toBe(true);
    expect(g.semester).toMatchObject({ id: ids.sem, name: 'Semester Uji' });
    expect(g.kkm).toBe(75);
    expect(g.average).toBe(80);
    expect(g.subjects[0]).toMatchObject({ name: 'Matematika', final: 80, predicate: 'B', belowKkm: false });
    expect(g.subjects[0].components[0]).toMatchObject({ name: 'Ulangan Harian', weight: 100, average: 80 });
    // Skor anak lain tidak bocor ke wali ini.
    const budi = (await call('GET', `/v1/portal/children/${ids.budi}/grades`, guardianCookie)).json();
    expect(budi.subjects[0].final).toBe(90);
    expect(
      (await call('GET', `/v1/portal/children/${ids.ani}/grades?semesterId=${ids.foreign}`, guardianCookie))
        .statusCode,
    ).toBe(404);
  });

  it('tagihan rinci: kwitansi batal tidak tampil', async () => {
    const res = await call('GET', `/v1/portal/children/${ids.ani}/invoices`, guardianCookie);
    expect(res.statusCode).toBe(200);
    const inv = res.json();
    expect(inv.invoices.map((i: { title: string }) => i.title)).toEqual(['SPP Lama', 'SPP Depan']);
    expect(inv.invoices[0]).toMatchObject({ paid: 200_000, outstanding: 300_000, status: 'partial' });
    expect(inv.receipts).toHaveLength(1);
    expect(inv.receipts[0]).toMatchObject({ total: 200_000, method: 'cash' });
    expect(inv.receipts[0].items[0]).toMatchObject({ title: 'SPP Lama', amount: 200_000 });
  });

  it('rapor: hanya yang final; dokumen beku tersedia, draft 404', async () => {
    const list = (await call('GET', `/v1/portal/children/${ids.ani}/report-cards`, guardianCookie)).json();
    expect(list.items).toHaveLength(1);
    const doc = await call('GET', `/v1/portal/children/${ids.ani}/report-cards/${ids.sem}`, guardianCookie);
    expect(doc.statusCode).toBe(200);
    expect(doc.json()).toMatchObject({ status: 'final', homeroomNote: 'Pertahankan.' });
    expect(doc.json().subjects[0]).toMatchObject({ name: 'Matematika', final: 80 });
    // Budi masih draft: tidak tampil.
    const budiList = (
      await call('GET', `/v1/portal/children/${ids.budi}/report-cards`, guardianCookie)
    ).json();
    expect(budiList.items).toEqual([]);
    expect(
      (await call('GET', `/v1/portal/children/${ids.budi}/report-cards/${ids.sem}`, guardianCookie))
        .statusCode,
    ).toBe(404);
  });

  it('tahfidz rinci: cakupan, juz, dan setoran terakhir', async () => {
    const res = await call('GET', `/v1/portal/children/${ids.ani}/tahfidz`, guardianCookie);
    expect(res.statusCode).toBe(200);
    const t = res.json();
    expect(t.available).toBe(true);
    expect(t.coverage.ayahs).toBe(7);
    expect(t.last30Days).toHaveLength(30);
    expect(t.recentEntries).toHaveLength(1);
    expect(t.recentEntries[0]).toMatchObject({ kind: 'ziyadah', ayahCount: 7 });
    expect(t.next).toEqual({ surah: 2, ayah: 1 });
  });
});

describe('portal: modul nonaktif', () => {
  it('sekolah hanya dengan portal dan absensi: bagian lain kosong, bukan galat', async () => {
    const created = await invite(
      { kind: 'guardian', guardianId: ids.partialGuardian },
      partialAdminCookie,
      partialId,
    );
    expect(created.statusCode).toBe(201);
    const email = `wali-sebagian-${run}@example.test`;
    expect((await accept(created.json().token, { email, password })).statusCode).toBe(201);
    const [u] = await app.platformDb.select({ id: user.id }).from(user).where(eq(user.email, email));
    userIds.push(u!.id);
    partialCookie = await login(email);

    const me = (await call('GET', '/v1/portal/me', partialCookie, undefined, partialId)).json();
    expect(me.sections).toEqual({
      attendance: true,
      grades: false,
      finance: false,
      tahfidz: false,
      announcements: false,
    });
    const sid = ids.partialStudent;
    const o = (
      await call('GET', `/v1/portal/children/${sid}/overview`, partialCookie, undefined, partialId)
    ).json();
    expect(o.attendance).toMatchObject({ available: true, recorded: 1, percent: 100 });
    expect(o.invoices).toMatchObject({ available: false, openCount: 0, outstandingTotal: 0, upcoming: [] });
    expect(o.grades).toMatchObject({ available: false, recentScores: [] });
    expect(o.reportCards).toMatchObject({ available: false, items: [] });
    expect(o.tahfidz).toMatchObject({ available: false, ayahs: 0 });
    expect(o.announcements).toMatchObject({ available: false, items: [] });

    for (const p of ['grades', 'invoices', 'report-cards', 'tahfidz']) {
      const res = await call('GET', `/v1/portal/children/${sid}/${p}`, partialCookie, undefined, partialId);
      expect(res.statusCode, p).toBe(200);
      expect(res.json().available, p).toBe(false);
    }
    expect(
      (await call('GET', `/v1/portal/children/${sid}/attendance`, partialCookie, undefined, partialId)).json()
        .available,
    ).toBe(true);
    const doc = await call(
      'GET',
      `/v1/portal/children/${sid}/report-cards/${ids.sem}`,
      partialCookie,
      undefined,
      partialId,
    );
    expect(doc.statusCode).toBe(403);
    expect(code(doc)).toBe('module_disabled');
  });

  it('modul portal dicabut: akun portal yang sudah ada ditolak 403', async () => {
    await app.platformDb.execute(
      sql`update entitlement set valid_until = now() - interval '1 day' where school_id = ${partialId} and module_key = 'parent_portal'`,
    );
    const res = await call('GET', '/v1/portal/me', partialCookie, undefined, partialId);
    expect(res.statusCode).toBe(403);
    expect(code(res)).toBe('module_disabled');
  });
});

describe('mencabut akun portal', () => {
  it('menghapus tautan dan menonaktifkan anggota; tautan sekali lagi 404; wali bisa diundang ulang', async () => {
    const onboarded = await onboard({ kind: 'student', studentId: ids.budi }, 'siswa-budi');
    expect((await call('GET', '/v1/portal/me', onboarded.cookie)).json().children).toHaveLength(1);

    const accounts = (await call('GET', '/v1/portal/accounts', adminCookie)).json();
    const acc = accounts.find((a: { userEmail: string }) => a.userEmail === onboarded.email);
    expect(acc.kind).toBe('student');

    const del = await call('DELETE', `/v1/portal/accounts/${acc.id}`, adminCookie);
    expect(del.statusCode).toBe(200);
    expect((await call('DELETE', `/v1/portal/accounts/${acc.id}`, adminCookie)).statusCode).toBe(404);

    const after = await call('GET', '/v1/portal/me', onboarded.cookie);
    expect(after.statusCode).toBe(403);

    // Akun lain tidak terpengaruh dan Budi bisa diundang ulang.
    expect((await call('GET', '/v1/portal/me', guardianCookie)).statusCode).toBe(200);
    const again = await invite({ kind: 'student', studentId: ids.budi });
    expect(again.statusCode).toBe(201);
    await call('DELETE', `/v1/portal/invites/${again.json().id}`, adminCookie);
  });

  it('admin sekolah lain tidak bisa mencabut akun sekolah ini', async () => {
    const accounts = (await call('GET', '/v1/portal/accounts', adminCookie)).json();
    const acc = accounts[0];
    const res = await call('DELETE', `/v1/portal/accounts/${acc.id}`, otherAdminCookie, undefined, otherId);
    expect(res.statusCode).toBe(404);
  });
});
