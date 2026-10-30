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
  sql,
  student,
  subscription,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { addMonths, discountFor, splitDiscount, splitEven } from './finance-lib';

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
let otherId = '';
let foundationId = '';
const userIds: string[] = [];
let adminCookie = '';
let teacherCookie = '';
let otherCookie = '';

const ids = {
  year: '',
  foreignYear: '',
  class7A: '',
  class8A: '',
  foreignClass: '',
  ani: '',
  budi: '',
  citra: '',
  dedi: '',
  alumni: '',
  foreignStudent: '',
  gedung: '',
  seragam: '',
  buku: '',
  praktik: '',
  study: '',
  spp: '',
  foreignFee: '',
  p50: '',
  a100: '',
  huge: '',
  seragamOnly: '',
  inactive: '',
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
  return login(u.email);
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
    .values({ name: 'Yayasan Keringanan', slug: `ykr-${run}` })
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
  const make = async (slug: string) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug, name: `Sekolah ${slug}` })
      .returning();
    await seedSchoolRoles(db, s!.id);
    await db.insert(entitlement).values({
      schoolId: s!.id,
      moduleKey: 'finance',
      subscriptionId: sub!.id,
      validUntil: sub!.currentPeriodEnd,
    });
    return s!.id;
  };
  schoolId = await make(`kr-${run}`);
  otherId = await make(`kr-lain-${run}`);

  const year = async (sid: string) => {
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
  ids.year = await year(schoolId);
  ids.foreignYear = await year(otherId);

  const mkClass = async (sid: string, yearId: string, name: string) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId: sid, academicYearId: yearId, name, level: '7' })
      .returning();
    return c!.id;
  };
  ids.class7A = await mkClass(schoolId, ids.year, '7A');
  ids.class8A = await mkClass(schoolId, ids.year, '8A');
  ids.foreignClass = await mkClass(otherId, ids.foreignYear, '7A');

  const mkStudent = async (
    sid: string,
    yearId: string,
    classId: string,
    name: string,
    nis: string,
    status: 'active' | 'graduated' = 'active',
  ) => {
    const [s] = await db
      .insert(student)
      .values({ schoolId: sid, name, nis, gender: 'L', status })
      .returning();
    await db.insert(enrollment).values({ schoolId: sid, studentId: s!.id, classId, academicYearId: yearId });
    return s!.id;
  };
  ids.ani = await mkStudent(schoolId, ids.year, ids.class7A, 'Ani', 'K1');
  ids.budi = await mkStudent(schoolId, ids.year, ids.class7A, 'Budi', 'K2');
  ids.citra = await mkStudent(schoolId, ids.year, ids.class7A, 'Citra', 'K3');
  ids.dedi = await mkStudent(schoolId, ids.year, ids.class8A, 'Dedi', 'K4');
  ids.alumni = await mkStudent(schoolId, ids.year, ids.class7A, 'Alumni', 'K5', 'graduated');
  ids.foreignStudent = await mkStudent(otherId, ids.foreignYear, ids.foreignClass, 'Siswa Lain', 'X1');

  adminCookie = await join('admin-kr', schoolId, ['school_admin']);
  teacherCookie = await join('guru-kr', schoolId, ['teacher']);
  otherCookie = await join('admin-kr-lain', otherId, ['school_admin']);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherId]) {
    for (const table of [
      'audit_log',
      'fin_payment_item',
      'fin_payment',
      'fin_invoice',
      'fin_student_discount',
      'fin_discount_rule',
      'fin_fee_plan',
      'fin_fee_type',
      'fin_counter',
      'enrollment',
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

const code = (res: { json: () => { error: { code: string } } }) => res.json().error.code;

interface Inv {
  id: string;
  studentName: string;
  title: string;
  period: string | null;
  amount: number;
  discount: number;
  discountReason: string | null;
  status: string;
  dueDate: string;
}
async function invoicesOf(feeTypeId: string, cookie = adminCookie): Promise<Inv[]> {
  const res = await call(
    'GET',
    `/v1/finance/invoices?academicYearId=${ids.year}&feeTypeId=${feeTypeId}&limit=100`,
    cookie,
  );
  expect(res.statusCode).toBe(200);
  return res.json().items as Inv[];
}
const byStudent = (items: Inv[], name: string) =>
  items.filter((i) => i.studentName === name).sort((a, b) => (a.period ?? '').localeCompare(b.period ?? ''));

const generate = (body: object, cookie = adminCookie) =>
  call('POST', '/v1/finance/invoices/generate', cookie, {
    academicYearId: ids.year,
    classId: null,
    period: null,
    ...body,
  });

async function feeType(name: string, kind: string) {
  const res = await call('POST', '/v1/finance/fee-types', adminCookie, { name, kind });
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}
async function plan(feeTypeId: string, amount: number) {
  const res = await call('PUT', '/v1/finance/fee-plans', adminCookie, {
    academicYearId: ids.year,
    feeTypeId,
    level: null,
    amount,
  });
  expect(res.statusCode).toBe(200);
}
async function rule(body: object) {
  const res = await call('POST', '/v1/finance/discount-rules', adminCookie, body);
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}
const assign = (ruleId: string, extra: object, cookie = adminCookie, sid = schoolId) =>
  call('POST', '/v1/finance/discounts/assign', cookie, { ruleId, academicYearId: ids.year, ...extra }, sid);

describe('pustaka cicilan dan diskon', () => {
  it('membagi nominal, diskon, dan tanggal dengan tepat', () => {
    expect(splitEven(1_000_001, 3)).toEqual([333_335, 333_333, 333_333]);
    expect(splitEven(10, 4)).toEqual([4, 2, 2, 2]);
    expect(splitDiscount(80_000, [33_335, 33_333, 33_333])).toEqual([26_668, 26_666, 26_666]);
    expect(splitDiscount(2, [1, 1, 1])).toEqual([1, 1, 0]);
    expect(splitDiscount(3, [1, 1, 1])).toEqual([1, 1, 1]);
    expect(discountFor(1_000_001, [{ name: 'a', kind: 'percent', value: 50 }])).toBe(500_000);
    expect(discountFor(1000, [{ name: 'a', kind: 'amount', value: 5000 }])).toBe(1000);
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2027-11-30', 3)).toBe('2028-02-29');
    expect(addMonths('2027-12-15', 1)).toBe('2028-01-15');
  });
});

describe('aturan keringanan', () => {
  it('CRUD, validasi, duplikat, rujukan dan izin', async () => {
    ids.gedung = await feeType('Uang Gedung', 'one_time');
    ids.seragam = await feeType('Seragam', 'one_time');
    ids.buku = await feeType('Buku', 'one_time');
    ids.praktik = await feeType('Praktik', 'one_time');
    ids.study = await feeType('Studi', 'one_time');
    ids.spp = await feeType('SPP', 'monthly');
    const foreign = await call(
      'POST',
      '/v1/finance/fee-types',
      otherCookie,
      { name: 'Lain', kind: 'one_time' },
      otherId,
    );
    ids.foreignFee = foreign.json().id;

    ids.p50 = await rule({ name: 'Beasiswa 50%', kind: 'percent', value: 50 });
    ids.a100 = await rule({ name: 'Keringanan 100rb', kind: 'amount', value: 100_000 });
    ids.huge = await rule({ name: 'Bebas biaya', kind: 'amount', value: 5_000_000 });
    ids.seragamOnly = await rule({
      name: 'Diskon seragam',
      kind: 'amount',
      value: 30_000,
      feeTypeId: ids.seragam,
    });
    ids.inactive = await rule({ name: 'Tidak aktif', kind: 'amount', value: 7777, active: false });

    for (const bad of [
      { name: 'x', kind: 'percent', value: 0 },
      { name: 'x', kind: 'percent', value: 101 },
      { name: 'x', kind: 'amount', value: 0 },
      { name: 'x', kind: 'amount', value: -5 },
      { name: '', kind: 'amount', value: 5 },
    ]) {
      expect((await call('POST', '/v1/finance/discount-rules', adminCookie, bad)).statusCode).toBe(400);
    }
    const dup = await call('POST', '/v1/finance/discount-rules', adminCookie, {
      name: 'Beasiswa 50%',
      kind: 'percent',
      value: 10,
    });
    expect(dup.statusCode).toBe(409);
    expect(code(dup)).toBe('conflict');
    const foreignRef = await call('POST', '/v1/finance/discount-rules', adminCookie, {
      name: 'Rujukan asing',
      kind: 'amount',
      value: 10,
      feeTypeId: ids.foreignFee,
    });
    expect(foreignRef.statusCode).toBe(400);
    expect(code(foreignRef)).toBe('invalid_reference');

    const list = await call('GET', '/v1/finance/discount-rules', adminCookie);
    expect(list.statusCode).toBe(200);
    const rules = list.json() as {
      id: string;
      name: string;
      feeTypeName: string | null;
      assignedCount: number;
    }[];
    expect(rules).toHaveLength(5);
    expect(rules.find((r) => r.id === ids.seragamOnly)?.feeTypeName).toBe('Seragam');

    const put = await call('PUT', `/v1/finance/discount-rules/${ids.a100}`, adminCookie, {
      name: 'Keringanan 100rb',
      kind: 'amount',
      value: 100_000,
      feeTypeId: null,
      active: true,
    });
    expect(put.statusCode).toBe(200);
    const putDup = await call('PUT', `/v1/finance/discount-rules/${ids.a100}`, adminCookie, {
      name: 'Beasiswa 50%',
      kind: 'amount',
      value: 100_000,
    });
    expect(putDup.statusCode).toBe(409);
    const missing = await call(
      'PUT',
      '/v1/finance/discount-rules/00000000-0000-4000-8000-000000000000',
      adminCookie,
      { name: 'z', kind: 'amount', value: 1 },
    );
    expect(missing.statusCode).toBe(404);

    // Izin dan lintas sekolah.
    expect((await call('GET', '/v1/finance/discount-rules', teacherCookie)).statusCode).toBe(403);
    expect(
      (
        await call('POST', '/v1/finance/discount-rules', teacherCookie, {
          name: 'q',
          kind: 'amount',
          value: 1,
        })
      ).statusCode,
    ).toBe(403);
    const otherList = await call('GET', '/v1/finance/discount-rules', otherCookie, undefined, otherId);
    expect(otherList.json()).toEqual([]);
    expect(
      (await call('DELETE', `/v1/finance/discount-rules/${ids.p50}`, otherCookie, undefined, otherId))
        .statusCode,
    ).toBe(404);

    // Hapus aturan yang belum dipasang.
    const temp = await rule({ name: 'Sementara', kind: 'percent', value: 5 });
    expect((await call('DELETE', `/v1/finance/discount-rules/${temp}`, adminCookie)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/finance/discount-rules/${temp}`, adminCookie)).statusCode).toBe(404);
  });
});

describe('pemasangan ke siswa', () => {
  it('pasang massal, duplikat dilewati, rujukan, lepas, dan in_use', async () => {
    const a1 = await assign(ids.p50, { studentIds: [ids.ani, ids.ani, ids.citra], reason: 'Yatim' });
    expect(a1.statusCode).toBe(200);
    expect(a1.json()).toEqual({ assigned: 2, skipped: 0 });
    const a2 = await assign(ids.p50, { studentIds: [ids.ani, ids.citra] });
    expect(a2.json()).toEqual({ assigned: 0, skipped: 2 });
    expect((await assign(ids.a100, { studentIds: [ids.budi, ids.citra] })).json()).toEqual({
      assigned: 2,
      skipped: 0,
    });
    // Via kelas: 8A hanya berisi Dedi.
    expect((await assign(ids.huge, { classId: ids.class8A })).json()).toEqual({ assigned: 1, skipped: 0 });
    expect((await assign(ids.seragamOnly, { studentIds: [ids.ani] })).json()).toEqual({
      assigned: 1,
      skipped: 0,
    });
    expect((await assign(ids.inactive, { studentIds: [ids.budi] })).statusCode).toBe(200);

    // Validasi.
    expect((await assign(ids.p50, {})).statusCode).toBe(400);
    expect((await assign(ids.p50, { studentIds: [ids.ani], classId: ids.class7A })).statusCode).toBe(400);
    const tooMany = Array.from(
      { length: 301 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    expect((await assign(ids.p50, { studentIds: tooMany })).statusCode).toBe(400);
    const foreignStudent = await assign(ids.p50, { studentIds: [ids.foreignStudent] });
    expect(foreignStudent.statusCode).toBe(400);
    expect(code(foreignStudent)).toBe('invalid_reference');
    expect((await assign(ids.p50, { classId: ids.foreignClass })).statusCode).toBe(400);
    // Sekolah lain memakai aturan/tahun milik sekolah ini.
    const leak = await assign(ids.p50, { studentIds: [ids.foreignStudent] }, otherCookie, otherId);
    expect(leak.statusCode).toBe(400);
    expect(code(leak)).toBe('invalid_reference');
    expect((await assign(ids.p50, { studentIds: [ids.ani] }, teacherCookie)).statusCode).toBe(403);

    // Daftar per siswa.
    const aniList = await call(
      'GET',
      `/v1/finance/students/${ids.ani}/discounts?academicYearId=${ids.year}`,
      adminCookie,
    );
    expect(aniList.statusCode).toBe(200);
    const items = aniList.json() as {
      id: string;
      rule: { name: string; kind: string; value: number };
      reason: string | null;
    }[];
    expect(items.map((i) => i.rule.name).sort()).toEqual(['Beasiswa 50%', 'Diskon seragam']);
    expect(items.find((i) => i.rule.name === 'Beasiswa 50%')).toMatchObject({
      reason: 'Yatim',
      rule: { kind: 'percent', value: 50 },
    });
    const otherView = await call(
      'GET',
      `/v1/finance/students/${ids.ani}/discounts?academicYearId=${ids.year}`,
      otherCookie,
      undefined,
      otherId,
    );
    expect(otherView.statusCode).toBe(404);

    // Aturan terpasang tidak bisa dihapus; lepas pemasangan lalu bisa.
    const inUse = await call('DELETE', `/v1/finance/discount-rules/${ids.inactive}`, adminCookie);
    expect(inUse.statusCode).toBe(409);
    expect(code(inUse)).toBe('in_use');
    const budiList = (
      await call('GET', `/v1/finance/students/${ids.budi}/discounts?academicYearId=${ids.year}`, adminCookie)
    ).json() as { id: string; rule: { name: string } }[];
    const inactiveLink = budiList.find((i) => i.rule.name === 'Tidak aktif')!;
    expect(
      (await call('DELETE', `/v1/finance/discounts/${inactiveLink.id}`, otherCookie, undefined, otherId))
        .statusCode,
    ).toBe(404);
    // Pemasangan aturan nonaktif dipertahankan agar diuji diabaikan saat generate.
  });
});

describe('generate: keringanan, gratis, cicilan', () => {
  it('diskon persen, nominal, campuran, dan batas sebesar nominal', async () => {
    await plan(ids.gedung, 1_000_001);
    const res = await generate({ feeTypeId: ids.gedung, dueDate: '2099-12-31' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ created: 4, skipped: 0, free: 0, discounted: 4, missingPlan: [] });
    const items = await invoicesOf(ids.gedung);
    expect(items).toHaveLength(4);
    const ani = byStudent(items, 'Ani')[0]!;
    expect(ani).toMatchObject({ amount: 1_000_001, discount: 500_000, discountReason: 'Beasiswa 50%' });
    // Aturan khusus seragam tidak berlaku untuk uang gedung.
    expect(byStudent(items, 'Budi')[0]).toMatchObject({
      discount: 100_000,
      discountReason: 'Keringanan 100rb',
    });
    const citra = byStudent(items, 'Citra')[0]!;
    expect(citra.discount).toBe(600_000);
    expect(citra.discountReason).toContain('Beasiswa 50%');
    expect(citra.discountReason).toContain('Keringanan 100rb');
    // Cap: 5.000.000 > nominal.
    expect(byStudent(items, 'Dedi')[0]).toMatchObject({ amount: 1_000_001, discount: 1_000_001 });

    // Idempoten dan tagihan yang ada tidak diubah.
    const again = await generate({ feeTypeId: ids.gedung, dueDate: '2099-12-31' });
    expect(again.json()).toMatchObject({ created: 0, skipped: 4, discounted: 0 });
  });

  it('tarif nol = gratis, tanpa tagihan', async () => {
    await plan(ids.buku, 0);
    const res = await generate({ feeTypeId: ids.buku, dueDate: '2099-12-31' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ created: 0, skipped: 0, free: 4, discounted: 0, missingPlan: [] });
    expect(await invoicesOf(ids.buku)).toHaveLength(0);
  });

  it('cicilan: sisa ke pertama, jatuh tempo bulanan, diskon proporsional, idempoten', async () => {
    await plan(ids.seragam, 100_001);
    const res = await generate({ feeTypeId: ids.seragam, dueDate: '2028-01-31', installments: 3 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ created: 12, skipped: 0, free: 0 });
    const items = await invoicesOf(ids.seragam);
    expect(items).toHaveLength(12);

    const ani = byStudent(items, 'Ani');
    expect(ani.map((i) => i.period)).toEqual(['C01', 'C02', 'C03']);
    expect(ani.map((i) => i.amount)).toEqual([33_335, 33_333, 33_333]);
    expect(ani.map((i) => i.dueDate)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31']);
    expect(ani.map((i) => i.title)).toEqual([
      'Seragam (cicilan 1/3) 2000-2099',
      'Seragam (cicilan 2/3) 2000-2099',
      'Seragam (cicilan 3/3) 2000-2099',
    ]);
    // 50% (50.000) + diskon seragam (30.000) = 80.000, dibagi proporsional.
    expect(ani.map((i) => i.discount)).toEqual([26_668, 26_666, 26_666]);
    expect(ani.reduce((a, i) => a + i.discount, 0)).toBe(80_000);
    expect(ani[0]!.discountReason).toContain('Diskon seragam');

    // Dedi: diskon dibatasi sebesar nominal (100.001) sehingga tiap cicilan lunas oleh diskon.
    const dedi = byStudent(items, 'Dedi');
    expect(dedi.map((i) => i.discount)).toEqual(dedi.map((i) => i.amount));
    expect(dedi.reduce((a, i) => a + i.amount, 0)).toBe(100_001);

    // Budi: aturan nonaktif diabaikan; hanya 100.000 yang berlaku.
    const budi = byStudent(items, 'Budi');
    expect(budi.reduce((a, i) => a + i.discount, 0)).toBe(100_000);
    expect(budi.every((i) => i.discount <= i.amount)).toBe(true);

    const again = await generate({ feeTypeId: ids.seragam, dueDate: '2028-01-31', installments: 3 });
    expect(again.json()).toMatchObject({ created: 0, skipped: 4 });
    expect(await invoicesOf(ids.seragam)).toHaveLength(12);
    // Tagihan utuh tidak dibuat setelah dicicil (hindari tertagih dua kali).
    const whole = await generate({ feeTypeId: ids.seragam, dueDate: '2028-01-31' });
    expect(whole.json()).toMatchObject({ created: 0, skipped: 4 });
  });

  it('cicilan ditolak untuk biaya bulanan dan di luar 2..12', async () => {
    await plan(ids.spp, 250_000);
    for (const [feeTypeId, installments, period] of [
      [ids.spp, 3, '2026-08'],
      [ids.praktik, 1, null],
      [ids.praktik, 13, null],
      [ids.praktik, 0, null],
    ] as const) {
      const res = await generate({ feeTypeId, installments, period, dueDate: '2030-01-10' });
      expect(res.statusCode).toBe(400);
      expect(code(res)).toBe('installments_invalid');
    }
    // Bulanan tanpa cicilan tetap berjalan dengan respons lama + field baru.
    const ok = await generate({ feeTypeId: ids.spp, period: '2026-08', dueDate: '2030-01-10' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ created: 4, skipped: 0, free: 0, discounted: 4 });
    const sppItems = await invoicesOf(ids.spp);
    // Aturan khusus seragam tidak berlaku; Ani 50% dari 250.000.
    expect(byStudent(sppItems, 'Ani')[0]).toMatchObject({
      discount: 125_000,
      discountReason: 'Beasiswa 50%',
    });
  });
});

describe('pecah tagihan menjadi cicilan', () => {
  it('sukses, has_payments, invoice_void, dan tidak bocor lintas sekolah', async () => {
    await plan(ids.praktik, 100_000);
    await plan(ids.study, 200_000);
    expect((await generate({ feeTypeId: ids.praktik, dueDate: '2030-03-31' })).statusCode).toBe(200);
    expect((await generate({ feeTypeId: ids.study, dueDate: '2030-03-31' })).statusCode).toBe(200);

    const aniPraktik = byStudent(await invoicesOf(ids.praktik), 'Ani')[0]!;
    expect(aniPraktik).toMatchObject({ amount: 100_000, discount: 50_000 });

    // Lintas sekolah dan izin.
    expect(
      (
        await call(
          'POST',
          `/v1/finance/invoices/${aniPraktik.id}/split`,
          otherCookie,
          { installments: 4, firstDueDate: '2030-03-31' },
          otherId,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await call('POST', `/v1/finance/invoices/${aniPraktik.id}/split`, teacherCookie, {
          installments: 4,
          firstDueDate: '2030-03-31',
        })
      ).statusCode,
    ).toBe(403);
    // Di luar rentang ditolak validasi.
    expect(
      (
        await call('POST', `/v1/finance/invoices/${aniPraktik.id}/split`, adminCookie, {
          installments: 1,
          firstDueDate: '2030-03-31',
        })
      ).statusCode,
    ).toBe(400);

    const res = await call('POST', `/v1/finance/invoices/${aniPraktik.id}/split`, adminCookie, {
      installments: 4,
      firstDueDate: '2030-03-31',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { voided: Inv; invoices: Inv[] };
    expect(body.voided).toMatchObject({ id: aniPraktik.id, status: 'void' });
    expect(body.invoices.map((i) => i.period)).toEqual(['C01', 'C02', 'C03', 'C04']);
    expect(body.invoices.map((i) => i.amount)).toEqual([25_000, 25_000, 25_000, 25_000]);
    expect(body.invoices.map((i) => i.discount)).toEqual([12_500, 12_500, 12_500, 12_500]);
    expect(body.invoices.map((i) => i.dueDate)).toEqual([
      '2030-03-31',
      '2030-04-30',
      '2030-05-31',
      '2030-06-30',
    ]);
    expect(body.invoices[0]!.title).toBe(`${aniPraktik.title} (cicilan 1/4)`);
    const after = byStudent(await invoicesOf(ids.praktik), 'Ani');
    expect(after).toHaveLength(5);
    expect(after.filter((i) => i.status === 'void')).toHaveLength(1);

    // Tagihan yang sudah dibatalkan tidak bisa dipecah lagi.
    const voided = await call('POST', `/v1/finance/invoices/${aniPraktik.id}/split`, adminCookie, {
      installments: 2,
      firstDueDate: '2030-03-31',
    });
    expect(voided.statusCode).toBe(409);
    expect(code(voided)).toBe('invoice_void');

    // Sudah ada pembayaran: ditolak dan tidak ada anak yang terbentuk (atomik).
    const budiStudy = byStudent(await invoicesOf(ids.study), 'Budi')[0]!;
    expect(budiStudy).toMatchObject({ amount: 200_000, discount: 100_000 });
    const paid = await call('POST', '/v1/finance/payments', adminCookie, {
      studentId: ids.budi,
      method: 'cash',
      paidAt: '2026-08-05T03:00:00Z',
      items: [{ invoiceId: budiStudy.id, amount: 50_000 }],
    });
    expect(paid.statusCode).toBe(201);
    const blocked = await call('POST', `/v1/finance/invoices/${budiStudy.id}/split`, adminCookie, {
      installments: 2,
      firstDueDate: '2030-03-31',
    });
    expect(blocked.statusCode).toBe(409);
    expect(code(blocked)).toBe('has_payments');
    const budiAfter = byStudent(await invoicesOf(ids.study), 'Budi');
    expect(budiAfter).toHaveLength(1);
    expect(budiAfter[0]!.status).not.toBe('void');
  });
});
