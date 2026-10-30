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

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const thisYear = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' })
  .format(new Date())
  .slice(0, 4);

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let noModuleId = '';
let otherId = '';
let foundationId = '';
const userIds: string[] = [];
let adminCookie = '';
let treasurerCookie = '';
let operatorCookie = '';
let principalCookie = '';
let teacherCookie = '';
let noModuleCookie = '';
let otherCookie = '';

const ids = {
  year: '',
  foreignYear: '',
  class7A: '',
  class8A: '',
  class9A: '',
  foreignClass: '',
  ani: '',
  budi: '',
  citra: '',
  fajar: '',
  alumni: '',
  foreignStudent: '',
  spp: '',
  gedung: '',
  foreignFee: '',
  aniAug: '',
  budiAug: '',
  citraAug: '',
  fajarAug: '',
  citraSep: '',
  aniGedung: '',
  budiGedung: '',
  p1: '',
  p2: '',
  p3: '',
  p4: '',
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
    .values({ name: 'Yayasan Keuangan', slug: `yk-${run}` })
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
  schoolId = await make(`keu-${run}`, ['finance']);
  noModuleId = await make(`keu-nomod-${run}`, []);
  otherId = await make(`keu-lain-${run}`, ['finance']);

  const year = async (sid: string, name: string) => {
    const [y] = await db
      .insert(academicYear)
      .values({ schoolId: sid, name, startsOn: '2000-01-01', endsOn: '2099-12-31', isActive: true })
      .returning();
    return y!.id;
  };
  ids.year = await year(schoolId, '2000-2099');
  ids.foreignYear = await year(otherId, '2000-2099');

  const mkClass = async (sid: string, yearId: string, name: string, level: string) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId: sid, academicYearId: yearId, name, level })
      .returning();
    return c!.id;
  };
  ids.class7A = await mkClass(schoolId, ids.year, '7A', '7');
  ids.class8A = await mkClass(schoolId, ids.year, '8A', '8');
  ids.class9A = await mkClass(schoolId, ids.year, '9A', '9');
  ids.foreignClass = await mkClass(otherId, ids.foreignYear, '7A', '7');

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
  ids.ani = await mkStudent(schoolId, ids.year, ids.class7A, 'Ani', 'N1');
  ids.budi = await mkStudent(schoolId, ids.year, ids.class7A, 'Budi', 'N2');
  ids.citra = await mkStudent(schoolId, ids.year, ids.class8A, 'Citra', 'N3');
  ids.fajar = await mkStudent(schoolId, ids.year, ids.class9A, 'Fajar', 'N4');
  ids.alumni = await mkStudent(schoolId, ids.year, ids.class7A, 'Alumni', 'N5', 'graduated');
  ids.foreignStudent = await mkStudent(otherId, ids.foreignYear, ids.foreignClass, 'Siswa Lain', 'X1');

  adminCookie = await join('admin-keu', schoolId, ['school_admin']);
  treasurerCookie = await join('bendahara-keu', schoolId, ['treasurer']);
  operatorCookie = await join('operator-keu', schoolId, ['operator']);
  principalCookie = await join('kepsek-keu', schoolId, ['principal']);
  teacherCookie = await join('guru-keu', schoolId, ['teacher']);
  noModuleCookie = await join('admin-tanpa-modul-keu', noModuleId, ['school_admin']);
  otherCookie = await join('admin-keu-lain', otherId, ['school_admin']);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, noModuleId, otherId]) {
    for (const table of [
      'audit_log',
      'fin_payment_item',
      'fin_payment',
      'fin_invoice',
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
const seq = (receiptNo: string) => {
  const m = new RegExp(`^KWT-${thisYear}-(\\d{6})$`).exec(receiptNo);
  expect(m).not.toBeNull();
  return Number(m![1]);
};

const DUE_AUG = '2020-08-10';
const DUE_SEP = '2020-09-10';
const DUE_GEDUNG = '2099-12-31';

const generate = (body: object, cookie = adminCookie) =>
  call('POST', '/v1/finance/invoices/generate', cookie, {
    academicYearId: ids.year,
    classId: null,
    ...body,
  });
const pay = (body: object, cookie = treasurerCookie) =>
  call('POST', '/v1/finance/payments', cookie, { method: 'cash', ...body });
async function invoices(query: string, cookie = adminCookie) {
  const res = await call('GET', `/v1/finance/invoices?academicYearId=${ids.year}${query}`, cookie);
  expect(res.statusCode).toBe(200);
  return res.json() as {
    items: {
      id: string;
      studentName: string;
      title: string;
      amount: number;
      discount: number;
      paid: number;
      outstanding: number;
      status: string;
      overdue: boolean;
      className: string | null;
      feeTypeName: string;
      period: string | null;
      nis: string | null;
    }[];
    total: number;
  };
}
const invoiceOf = async (id: string, studentId: string) => {
  const res = await call(
    'GET',
    `/v1/finance/invoices?academicYearId=${ids.year}&studentId=${studentId}`,
    adminCookie,
  );
  return (res.json().items as { id: string; paid: number; outstanding: number; status: string }[]).find(
    (i) => i.id === id,
  )!;
};

describe('modul dan izin', () => {
  it('modul harus aktif, tanpa sesi 401, dan izin diperiksa', async () => {
    const blocked = await call('GET', '/v1/finance/fee-types', noModuleCookie, undefined, noModuleId);
    expect(blocked.statusCode).toBe(403);
    expect(code(blocked)).toBe('module_disabled');
    expect((await app.inject('/v1/finance/fee-types')).statusCode).toBe(401);
    // Guru tidak punya izin keuangan sama sekali.
    expect((await call('GET', '/v1/finance/fee-types', teacherCookie)).statusCode).toBe(403);
    expect((await call('GET', '/v1/finance/payments', teacherCookie)).statusCode).toBe(403);
    // Admin, bendahara, operator, dan kepala sekolah boleh membaca.
    for (const cookie of [adminCookie, treasurerCookie, operatorCookie, principalCookie]) {
      expect((await call('GET', '/v1/finance/fee-types', cookie)).statusCode).toBe(200);
      expect((await call('GET', '/v1/finance/payments', cookie)).statusCode).toBe(200);
    }
    // Operator dan kepala sekolah hanya membaca.
    for (const cookie of [operatorCookie, principalCookie]) {
      expect(
        (await call('POST', '/v1/finance/fee-types', cookie, { name: 'X', kind: 'monthly' })).statusCode,
      ).toBe(403);
      expect(
        (
          await call('POST', '/v1/finance/payments', cookie, {
            studentId: ids.ani,
            method: 'cash',
            items: [{ invoiceId: ids.ani, amount: 1000 }],
          })
        ).statusCode,
      ).toBe(403);
    }
    // Bendahara boleh mengelola dan membayar (diuji lengkap di bawah).
    const mk = await call('POST', '/v1/finance/fee-types', treasurerCookie, {
      name: 'Uji Bendahara',
      kind: 'one_time',
    });
    expect(mk.statusCode).toBe(201);
    expect((await call('DELETE', `/v1/finance/fee-types/${mk.json().id}`, treasurerCookie)).statusCode).toBe(
      200,
    );
  });
});

describe('jenis biaya dan tarif', () => {
  it('tambah, nama unik, ubah, validasi', async () => {
    const spp = await call('POST', '/v1/finance/fee-types', adminCookie, { name: 'SPP', kind: 'monthly' });
    expect(spp.statusCode).toBe(201);
    expect(spp.json()).toMatchObject({
      name: 'SPP',
      kind: 'monthly',
      active: true,
      planCount: 0,
      invoiceCount: 0,
    });
    ids.spp = spp.json().id;
    const gedung = await call('POST', '/v1/finance/fee-types', adminCookie, {
      name: 'Uang Gedung',
      kind: 'one_time',
    });
    ids.gedung = gedung.json().id;
    const dup = await call('POST', '/v1/finance/fee-types', adminCookie, { name: 'SPP', kind: 'yearly' });
    expect(dup.statusCode).toBe(409);
    expect(code(dup)).toBe('conflict');
    expect(
      (await call('POST', '/v1/finance/fee-types', adminCookie, { name: ' ', kind: 'monthly' })).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', '/v1/finance/fee-types', adminCookie, { name: 'Y', kind: 'weekly' })).statusCode,
    ).toBe(400);
    const renamed = await call('PUT', `/v1/finance/fee-types/${ids.gedung}`, adminCookie, {
      name: 'Uang Gedung',
      kind: 'one_time',
      active: true,
    });
    expect(renamed.statusCode).toBe(200);
    expect(
      (await call('PUT', `/v1/finance/fee-types/${ids.year}`, adminCookie, { name: 'Z', kind: 'yearly' }))
        .statusCode,
    ).toBe(404);
    const foreign = await call(
      'POST',
      '/v1/finance/fee-types',
      otherCookie,
      { name: 'SPP', kind: 'monthly' },
      otherId,
    );
    expect(foreign.statusCode).toBe(201);
    ids.foreignFee = foreign.json().id;
    const list = await call('GET', '/v1/finance/fee-types', adminCookie);
    expect(list.json().map((f: { name: string }) => f.name)).toEqual(['SPP', 'Uang Gedung']);
  });

  it('tarif: upsert, tingkat berbeda terpisah, validasi, hapus', async () => {
    const put = (body: object, cookie = adminCookie) =>
      call('PUT', '/v1/finance/fee-plans', cookie, { academicYearId: ids.year, ...body });
    const all = await put({ feeTypeId: ids.spp, level: null, amount: 90_000 });
    expect(all.statusCode).toBe(200);
    expect(all.json()).toMatchObject({ feeTypeName: 'SPP', level: null, amount: 90_000 });
    // Upsert: nilai diganti, id tetap, baris tidak ganda (level null diperlakukan sebagai nilai tersendiri).
    const again = await put({ feeTypeId: ids.spp, level: null, amount: 100_000 });
    expect(again.json().id).toBe(all.json().id);
    expect(again.json().amount).toBe(100_000);
    const l7 = await put({ feeTypeId: ids.spp, level: '7', amount: 150_000 });
    expect(l7.json().id).not.toBe(all.json().id);
    expect((await put({ feeTypeId: ids.spp, level: ' ', amount: 100_000 })).json().id).toBe(all.json().id);
    expect((await put({ feeTypeId: ids.gedung, level: '7', amount: 500_000 })).statusCode).toBe(200);

    expect((await put({ feeTypeId: ids.spp, level: '7', amount: -1 })).statusCode).toBe(400);
    expect((await put({ feeTypeId: ids.spp, level: '7', amount: 1.5 })).statusCode).toBe(400);
    const badFee = await put({ feeTypeId: ids.foreignFee, level: null, amount: 1 });
    expect(badFee.statusCode).toBe(400);
    expect(code(badFee)).toBe('invalid_reference');
    const badYear = await call('PUT', '/v1/finance/fee-plans', adminCookie, {
      academicYearId: ids.foreignYear,
      feeTypeId: ids.spp,
      level: null,
      amount: 1,
    });
    expect(code(badYear)).toBe('invalid_reference');
    expect((await put({ feeTypeId: ids.spp, level: null, amount: 1 }, operatorCookie)).statusCode).toBe(403);

    const list = await call('GET', `/v1/finance/fee-plans?academicYearId=${ids.year}`, operatorCookie);
    expect(list.statusCode).toBe(200);
    expect(
      list
        .json()
        .map((p: { feeTypeName: string; level: string | null; amount: number }) => [
          p.feeTypeName,
          p.level,
          p.amount,
        ]),
    ).toEqual([
      ['SPP', null, 100_000],
      ['SPP', '7', 150_000],
      ['Uang Gedung', '7', 500_000],
    ]);

    // Tarif sementara dapat dihapus; hapus kedua kali 404.
    const tmp = await put({ feeTypeId: ids.spp, level: '99', amount: 5 });
    expect((await call('DELETE', `/v1/finance/fee-plans/${tmp.json().id}`, adminCookie)).statusCode).toBe(
      200,
    );
    expect((await call('DELETE', `/v1/finance/fee-plans/${tmp.json().id}`, adminCookie)).statusCode).toBe(
      404,
    );
    expect((await call('DELETE', `/v1/finance/fee-plans/${all.json().id}`, operatorCookie)).statusCode).toBe(
      403,
    );
  });
});

describe('buat tagihan massal', () => {
  it('periode wajib untuk bulanan dan harus kosong untuk lainnya', async () => {
    for (const period of [null, '2026-13', 'Agustus', '2026-8']) {
      const res = await generate({ feeTypeId: ids.spp, period, dueDate: DUE_AUG });
      expect(res.statusCode).toBe(400);
      expect(code(res)).toBe('period_required');
    }
    const extra = await generate({ feeTypeId: ids.gedung, period: '2026-08', dueDate: DUE_GEDUNG });
    expect(extra.statusCode).toBe(400);
    expect(code(extra)).toBe('period_required');
    const badRef = await generate({ feeTypeId: ids.foreignFee, period: '2026-08', dueDate: DUE_AUG });
    expect(code(badRef)).toBe('invalid_reference');
    const badClass = await generate({
      feeTypeId: ids.spp,
      period: '2026-08',
      classId: ids.foreignClass,
      dueDate: DUE_AUG,
    });
    expect(code(badClass)).toBe('invalid_reference');
    expect(
      (await generate({ feeTypeId: ids.spp, period: '2026-08', dueDate: DUE_AUG }, operatorCookie))
        .statusCode,
    ).toBe(403);
  });

  it('tarif tingkat menang atas tarif umum, idempoten, siswa tanpa tarif dilaporkan', async () => {
    const first = await generate({ feeTypeId: ids.spp, period: '2026-08', dueDate: DUE_AUG });
    expect(first.statusCode).toBe(200);
    // Ani, Budi (tingkat 7: 150.000), Citra dan Fajar (tarif umum: 100.000); alumni tidak ikut.
    expect(first.json()).toEqual({ created: 4, skipped: 0, missingPlan: [] });
    const again = await generate({ feeTypeId: ids.spp, period: '2026-08', dueDate: DUE_AUG });
    expect(again.json()).toEqual({ created: 0, skipped: 4, missingPlan: [] });

    const list = await invoices('&period=2026-08');
    expect(list.total).toBe(4);
    const by = (name: string) => list.items.find((i) => i.studentName === name)!;
    expect(by('Ani')).toMatchObject({
      title: 'SPP Agustus 2026',
      amount: 150_000,
      discount: 0,
      paid: 0,
      outstanding: 150_000,
      status: 'unpaid',
      className: '7A',
      feeTypeName: 'SPP',
      period: '2026-08',
      nis: 'N1',
      overdue: true,
    });
    expect(by('Citra').amount).toBe(100_000);
    expect(by('Fajar').amount).toBe(100_000);
    expect(list.items.some((i) => i.studentName === 'Alumni')).toBe(false);
    ids.aniAug = by('Ani').id;
    ids.budiAug = by('Budi').id;
    ids.citraAug = by('Citra').id;
    ids.fajarAug = by('Fajar').id;

    // Hanya tarif tingkat 7: kelas lain dilaporkan tanpa tarif. Biaya sekali bayar berperiode null.
    const gedung = await generate({ feeTypeId: ids.gedung, period: null, dueDate: DUE_GEDUNG });
    expect(gedung.json().created).toBe(2);
    expect(gedung.json().skipped).toBe(0);
    expect(
      gedung
        .json()
        .missingPlan.map((m: { name: string; className: string; level: string }) => [
          m.name,
          m.className,
          m.level,
        ]),
    ).toEqual([
      ['Citra', '8A', '8'],
      ['Fajar', '9A', '9'],
    ]);
    const gl = await invoices(`&feeTypeId=${ids.gedung}`);
    expect(gl.items.map((i) => [i.studentName, i.title, i.amount])).toEqual([
      ['Ani', 'Uang Gedung 2000-2099', 500_000],
      ['Budi', 'Uang Gedung 2000-2099', 500_000],
    ]);
    ids.aniGedung = gl.items.find((i) => i.studentName === 'Ani')!.id;
    ids.budiGedung = gl.items.find((i) => i.studentName === 'Budi')!.id;

    // Filter kelas.
    const sep = await generate({
      feeTypeId: ids.spp,
      period: '2026-09',
      classId: ids.class8A,
      dueDate: DUE_SEP,
    });
    expect(sep.json()).toEqual({ created: 1, skipped: 0, missingPlan: [] });
    ids.citraSep = (await invoices('&period=2026-09')).items[0]!.id;
  });

  it('jenis biaya yang dipakai tidak bisa dihapus atau diubah jenisnya', async () => {
    const del = await call('DELETE', `/v1/finance/fee-types/${ids.spp}`, adminCookie);
    expect(del.statusCode).toBe(409);
    expect(code(del)).toBe('in_use');
    const kind = await call('PUT', `/v1/finance/fee-types/${ids.spp}`, adminCookie, {
      name: 'SPP',
      kind: 'yearly',
      active: true,
    });
    expect(code(kind)).toBe('in_use');
    const fee = (await call('GET', '/v1/finance/fee-types', adminCookie)).json() as {
      name: string;
      planCount: number;
      invoiceCount: number;
    }[];
    expect(fee.find((f) => f.name === 'SPP')).toMatchObject({ planCount: 2, invoiceCount: 5 });
    // Nonaktif tidak boleh dipakai membuat tagihan baru.
    const tmp = await call('POST', '/v1/finance/fee-types', adminCookie, {
      name: 'Lama',
      kind: 'one_time',
      active: false,
    });
    expect(code(await generate({ feeTypeId: tmp.json().id, period: null, dueDate: DUE_GEDUNG }))).toBe(
      'inactive',
    );
    expect((await call('DELETE', `/v1/finance/fee-types/${tmp.json().id}`, adminCookie)).statusCode).toBe(
      200,
    );
  });
});

describe('diskon', () => {
  it('diskon dibatasi nominal tagihan dan pembayaran yang ada', async () => {
    const put = (id: string, body: object, cookie = adminCookie) =>
      call('PUT', `/v1/finance/invoices/${id}`, cookie, {
        discountReason: 'Anak guru',
        dueDate: DUE_AUG,
        ...body,
      });
    const ok = await put(ids.budiAug, { discount: 50_000 });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      amount: 150_000,
      discount: 50_000,
      outstanding: 100_000,
      discountReason: 'Anak guru',
    });
    const tooBig = await put(ids.budiAug, { discount: 150_001 });
    expect(tooBig.statusCode).toBe(400);
    expect(code(tooBig)).toBe('invalid_discount');
    expect((await put(ids.budiAug, { discount: -1 })).statusCode).toBe(400);
    expect((await put(ids.budiAug, { discount: 1000 }, operatorCookie)).statusCode).toBe(403);
    expect((await put(ids.year, { discount: 0 })).statusCode).toBe(404);
    // Tanggal jatuh tempo ikut berubah.
    const due = await put(ids.budiAug, { discount: 50_000, dueDate: '2020-08-20' });
    expect(due.json().dueDate).toBe('2020-08-20');
    await put(ids.budiAug, { discount: 50_000, dueDate: DUE_AUG });
  });
});

describe('pembayaran', () => {
  it('sebagian, lunas, melebihi sisa, lintas siswa, dan nomor kwitansi berurutan', async () => {
    const p1 = await pay({
      studentId: ids.ani,
      paidAt: '2026-08-05T03:00:00Z',
      note: 'Dibayar ibu',
      items: [{ invoiceId: ids.aniAug, amount: 50_000 }],
    });
    expect(p1.statusCode).toBe(201);
    ids.p1 = p1.json().id;
    expect(await invoiceOf(ids.aniAug, ids.ani)).toMatchObject({
      paid: 50_000,
      outstanding: 100_000,
      status: 'partial',
    });

    const p2 = await pay({
      studentId: ids.ani,
      paidAt: '2026-08-05T04:00:00Z',
      items: [{ invoiceId: ids.aniAug, amount: 100_000 }],
    });
    expect(p2.statusCode).toBe(201);
    ids.p2 = p2.json().id;
    expect(await invoiceOf(ids.aniAug, ids.ani)).toMatchObject({
      paid: 150_000,
      outstanding: 0,
      status: 'paid',
    });

    // Melebihi sisa, tagihan milik siswa lain, tagihan tak dikenal, tagihan ganda, dan validasi bentuk.
    const over = await pay({ studentId: ids.ani, items: [{ invoiceId: ids.aniAug, amount: 1 }] });
    expect(over.statusCode).toBe(409);
    expect(code(over)).toBe('overpay');
    const cross = await pay({ studentId: ids.ani, items: [{ invoiceId: ids.budiAug, amount: 1000 }] });
    expect(cross.statusCode).toBe(400);
    expect(code(cross)).toBe('invalid_reference');
    expect(code(await pay({ studentId: ids.ani, items: [{ invoiceId: ids.year, amount: 1000 }] }))).toBe(
      'invalid_reference',
    );
    expect(
      code(
        await pay({
          studentId: ids.ani,
          items: [
            { invoiceId: ids.aniGedung, amount: 1000 },
            { invoiceId: ids.aniGedung, amount: 1000 },
          ],
        }),
      ),
    ).toBe('duplicate_item');
    for (const items of [
      [],
      [{ invoiceId: ids.aniGedung, amount: 0 }],
      [{ invoiceId: ids.aniGedung, amount: 10.5 }],
    ]) {
      expect((await pay({ studentId: ids.ani, items })).statusCode).toBe(400);
    }
    expect(
      (
        await pay({
          studentId: ids.ani,
          method: 'kartu',
          items: [{ invoiceId: ids.aniGedung, amount: 1000 }],
        })
      ).statusCode,
    ).toBe(400);
    // Kegagalan tidak membakar nomor kwitansi (transaksi dibatalkan), jadi bendahara tetap mendapat nomor 3.
    const big = await pay({ studentId: ids.ani, items: [{ invoiceId: ids.aniGedung, amount: 500_001 }] });
    expect(code(big)).toBe('overpay');

    // Kwitansi untuk dua tagihan sekaligus oleh bendahara.
    const p4 = await pay({
      studentId: ids.budi,
      method: 'transfer',
      paidAt: '2026-08-06T05:00:00Z',
      items: [
        { invoiceId: ids.budiAug, amount: 100_000 },
        { invoiceId: ids.budiGedung, amount: 200_000 },
      ],
    });
    expect(p4.statusCode).toBe(201);
    ids.p4 = p4.json().id;
    const receipt = p4.json();
    expect(receipt).toEqual({
      id: ids.p4,
      receiptNo: receipt.receiptNo,
      paidAt: '2026-08-06T05:00:00.000Z',
      method: 'transfer',
      total: 300_000,
      note: null,
      voided: false,
      voidReason: null,
      cashierName: 'bendahara-keu',
      school: { name: `Sekolah keu-${run}`, address: null },
      student: { id: ids.budi, name: 'Budi', nis: 'N2', className: '7A' },
      items: [
        { invoiceId: ids.budiAug, title: 'SPP Agustus 2026', amount: 100_000 },
        { invoiceId: ids.budiGedung, title: 'Uang Gedung 2000-2099', amount: 200_000 },
      ],
    });
    expect(seq(p1.json().receiptNo)).toBe(1);
    expect(seq(p2.json().receiptNo)).toBe(2);
    expect(seq(receipt.receiptNo)).toBe(3);
    expect(p1.json()).toMatchObject({ note: 'Dibayar ibu', total: 50_000, method: 'cash' });
    expect(await invoiceOf(ids.budiGedung, ids.budi)).toMatchObject({
      paid: 200_000,
      outstanding: 300_000,
      status: 'partial',
    });
  });

  it('pembayaran paralel pada tagihan yang sama tidak melebihi sisa', async () => {
    // Sisa tagihan Citra 100.000; dua pembayaran 80.000 bersamaan: tepat satu yang lolos.
    const body = {
      studentId: ids.citra,
      method: 'transfer',
      paidAt: '2026-08-05T20:00:00Z',
      items: [{ invoiceId: ids.citraAug, amount: 80_000 }],
    };
    const results = await Promise.all([pay(body), pay(body), pay(body)]);
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 409, 409]);
    for (const r of results.filter((x) => x.statusCode === 409)) expect(code(r)).toBe('overpay');
    const winner = results.find((r) => r.statusCode === 201)!.json();
    ids.p3 = winner.id;
    expect(seq(winner.receiptNo)).toBe(4);
    expect(await invoiceOf(ids.citraAug, ids.citra)).toMatchObject({
      paid: 80_000,
      outstanding: 20_000,
      status: 'partial',
    });
  });

  it('nomor kwitansi tidak ganda dan tidak bolong pada pembayaran paralel di tagihan berbeda', async () => {
    // Fajar punya tagihan Agustus 100.000; sebelum dibatalkan, bayar lima kwitansi 10.000 secara paralel.
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        pay({
          studentId: ids.fajar,
          items: [{ invoiceId: ids.fajarAug, amount: 10_000 }],
          paidAt: '2026-08-07T01:00:00Z',
        }),
      ),
    );
    expect(results.every((r) => r.statusCode === 201)).toBe(true);
    const numbers = results.map((r) => seq(r.json().receiptNo)).sort((a, b) => a - b);
    expect(numbers).toEqual([5, 6, 7, 8, 9]);
    // Batalkan semuanya agar angka laporan tidak terpengaruh dan tagihan Fajar bisa dibatalkan.
    for (const r of results) {
      expect(
        (
          await call('POST', `/v1/finance/payments/${r.json().id}/void`, adminCookie, {
            reason: 'Uji paralel',
          })
        ).statusCode,
      ).toBe(200);
    }
  });

  it('daftar dan detail kwitansi', async () => {
    const list = await call(
      'GET',
      '/v1/finance/payments?status=active&from=2026-08-05&to=2026-08-06',
      operatorCookie,
    );
    expect(list.statusCode).toBe(200);
    const body = list.json();
    expect(body.total).toBe(4);
    expect(body.items.map((p: { total: number }) => p.total)).toEqual([300_000, 80_000, 100_000, 50_000]);
    expect(body.items[0]).toMatchObject({
      studentName: 'Budi',
      nis: 'N2',
      method: 'transfer',
      voided: false,
    });
    const byStudent = await call('GET', `/v1/finance/payments?studentId=${ids.ani}&limit=1`, adminCookie);
    expect(byStudent.json().total).toBe(2);
    expect(byStudent.json().items).toHaveLength(1);
    const cash = await call(
      'GET',
      '/v1/finance/payments?method=cash&status=active&from=2026-08-05&to=2026-08-05',
      adminCookie,
    );
    expect(cash.json().total).toBe(2);
    expect((await call('GET', '/v1/finance/payments?limit=101', adminCookie)).statusCode).toBe(400);
    const detail = await call('GET', `/v1/finance/payments/${ids.p1}`, principalCookie);
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      id: ids.p1,
      voided: false,
      note: 'Dibayar ibu',
      student: { name: 'Ani', className: '7A' },
    });
    expect((await call('GET', `/v1/finance/payments/${ids.year}`, adminCookie)).statusCode).toBe(404);
  });
});

describe('pembatalan', () => {
  it('batal kwitansi memulihkan sisa tagihan dan tidak dihitung', async () => {
    expect(
      (await call('POST', `/v1/finance/payments/${ids.p2}/void`, treasurerCookie, { reason: '' })).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', `/v1/finance/payments/${ids.p2}/void`, operatorCookie, { reason: 'Salah input' }))
        .statusCode,
    ).toBe(403);
    const res = await call('POST', `/v1/finance/payments/${ids.p2}/void`, treasurerCookie, {
      reason: 'Salah input',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ voided: true, voidReason: 'Salah input', total: 100_000 });
    expect(await invoiceOf(ids.aniAug, ids.ani)).toMatchObject({
      paid: 50_000,
      outstanding: 100_000,
      status: 'partial',
    });
    const again = await call('POST', `/v1/finance/payments/${ids.p2}/void`, adminCookie, { reason: 'Lagi' });
    expect(again.statusCode).toBe(409);
    expect(code(again)).toBe('payment_void');
    expect((await call('GET', `/v1/finance/payments/${ids.p2}`, adminCookie)).json().voided).toBe(true);
    // Kwitansi batal tetap muncul di daftar dengan tanda batal.
    const voided = await call('GET', '/v1/finance/payments?status=void&studentId=' + ids.ani, adminCookie);
    expect(voided.json().items.map((p: { id: string; voided: boolean }) => [p.id, p.voided])).toEqual([
      [ids.p2, true],
    ]);
  });

  it('batal tagihan: ditolak bila ada pembayaran, berhasil bila belum, lalu terkunci', async () => {
    const paid = await call('POST', `/v1/finance/invoices/${ids.aniAug}/void`, adminCookie, {
      reason: 'Salah buat',
    });
    expect(paid.statusCode).toBe(409);
    expect(code(paid)).toBe('has_payments');
    expect(
      (await call('POST', `/v1/finance/invoices/${ids.fajarAug}/void`, adminCookie, { reason: '' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await call('POST', `/v1/finance/invoices/${ids.fajarAug}/void`, operatorCookie, { reason: 'x' }))
        .statusCode,
    ).toBe(403);
    // Kwitansi Fajar sudah dibatalkan semua pada pengujian paralel, jadi tagihan boleh dibatalkan.
    const ok = await call('POST', `/v1/finance/invoices/${ids.fajarAug}/void`, adminCookie, {
      reason: 'Pindah sekolah',
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ status: 'void', outstanding: 0, paid: 0 });
    expect(
      code(await call('POST', `/v1/finance/invoices/${ids.fajarAug}/void`, adminCookie, { reason: 'Lagi' })),
    ).toBe('invoice_void');
    expect(
      code(await pay({ studentId: ids.fajar, items: [{ invoiceId: ids.fajarAug, amount: 1000 }] })),
    ).toBe('invoice_void');
    expect(
      code(
        await call('PUT', `/v1/finance/invoices/${ids.fajarAug}`, adminCookie, {
          discount: 0,
          discountReason: null,
          dueDate: DUE_AUG,
        }),
      ),
    ).toBe('invoice_void');
    expect(
      (await call('POST', `/v1/finance/invoices/${ids.year}/void`, adminCookie, { reason: 'x' })).statusCode,
    ).toBe(404);
    expect((await invoices('&status=void')).items.map((i) => i.studentName)).toEqual(['Fajar']);
  });

  it('diskon tidak boleh membuat sisa negatif', async () => {
    // Ani Gedung belum dibayar; Budi Gedung sudah dibayar 200.000 dari 500.000.
    const res = await call('PUT', `/v1/finance/invoices/${ids.budiGedung}`, adminCookie, {
      discount: 400_000,
      discountReason: null,
      dueDate: DUE_GEDUNG,
    });
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('overpay');
    const fine = await call('PUT', `/v1/finance/invoices/${ids.budiGedung}`, adminCookie, {
      discount: 300_000,
      discountReason: null,
      dueDate: DUE_GEDUNG,
    });
    expect(fine.json()).toMatchObject({ outstanding: 0, status: 'paid' });
    // Kembalikan agar angka laporan sesuai skenario.
    await call('PUT', `/v1/finance/invoices/${ids.budiGedung}`, adminCookie, {
      discount: 0,
      discountReason: null,
      dueDate: DUE_GEDUNG,
    });
  });
});

describe('daftar tagihan dan rekening siswa', () => {
  it('filter status, berpaginasi, dan rekening', async () => {
    const all = await invoices('&limit=100');
    expect(all.total).toBe(7);
    const count = (status: string) => all.items.filter((i) => i.status === status).length;
    expect([count('unpaid'), count('partial'), count('paid'), count('void')]).toEqual([2, 3, 1, 1]);
    expect((await invoices('&status=paid')).items.map((i) => i.studentName)).toEqual(['Budi']);
    expect((await invoices('&status=partial')).total).toBe(3);
    expect((await invoices(`&classId=${ids.class8A}`)).items.map((i) => i.title).sort()).toEqual([
      'SPP Agustus 2026',
      'SPP September 2026',
    ]);
    const page = await invoices('&limit=2&offset=6');
    expect(page.total).toBe(7);
    expect(page.items).toHaveLength(1);
    expect((await call('GET', `/v1/finance/invoices?limit=101`, adminCookie)).statusCode).toBe(400);
    // Tagihan Gedung belum jatuh tempo; tagihan SPP yang bersisa sudah.
    expect(
      all.items
        .filter((i) => i.overdue)
        .map((i) => i.title)
        .sort(),
    ).toEqual(['SPP Agustus 2026', 'SPP Agustus 2026', 'SPP September 2026']);

    const st = await call(
      'GET',
      `/v1/finance/students/${ids.ani}/statement?academicYearId=${ids.year}`,
      principalCookie,
    );
    expect(st.statusCode).toBe(200);
    const body = st.json();
    expect(body.student).toEqual({ id: ids.ani, name: 'Ani', nis: 'N1', className: '7A' });
    expect(body.invoices.map((i: { title: string }) => i.title).sort()).toEqual([
      'SPP Agustus 2026',
      'Uang Gedung 2000-2099',
    ]);
    expect(body.totals).toEqual({ billed: 650_000, discount: 0, paid: 50_000, outstanding: 600_000 });
    expect(
      body.payments
        .map((p: { id: string; total: number; voided: boolean; method: string }) => [
          p.id,
          p.total,
          p.voided,
          p.method,
        ])
        .sort(),
    ).toEqual(
      [
        [ids.p1, 50_000, false, 'cash'],
        [ids.p2, 100_000, true, 'cash'],
      ].sort(),
    );
    expect(body.payments[0]).toEqual(
      expect.objectContaining({ receiptNo: expect.stringMatching(/^KWT-/), paidAt: expect.any(String) }),
    );
    // Tagihan batal tidak masuk total.
    const fajar = await call(
      'GET',
      `/v1/finance/students/${ids.fajar}/statement?academicYearId=${ids.year}`,
      adminCookie,
    );
    expect(fajar.json().totals).toEqual({ billed: 0, discount: 0, paid: 0, outstanding: 0 });
    expect(fajar.json().invoices).toHaveLength(1);
    expect(
      (
        await call(
          'GET',
          `/v1/finance/students/${ids.year}/statement?academicYearId=${ids.year}`,
          adminCookie,
        )
      ).statusCode,
    ).toBe(404);
  });
});

describe('laporan', () => {
  it('tunggakan dengan angka yang diketahui', async () => {
    const res = await call(
      'GET',
      `/v1/finance/reports/arrears?academicYearId=${ids.year}&asOf=2020-09-15`,
      treasurerCookie,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      rows: [
        {
          studentId: ids.ani,
          name: 'Ani',
          nis: 'N1',
          className: '7A',
          openInvoices: 2,
          outstanding: 600_000,
          overdueOutstanding: 100_000,
          oldestDue: DUE_AUG,
        },
        {
          studentId: ids.budi,
          name: 'Budi',
          nis: 'N2',
          className: '7A',
          openInvoices: 1,
          outstanding: 300_000,
          overdueOutstanding: 0,
          oldestDue: DUE_GEDUNG,
        },
        {
          studentId: ids.citra,
          name: 'Citra',
          nis: 'N3',
          className: '8A',
          openInvoices: 2,
          outstanding: 120_000,
          overdueOutstanding: 120_000,
          oldestDue: DUE_AUG,
        },
      ],
      totals: { students: 3, openInvoices: 5, outstanding: 1_020_000, overdueOutstanding: 220_000 },
    });
    // asOf sebelum jatuh tempo SPP September: tunggakan Citra hanya Agustus.
    const early = await call(
      'GET',
      `/v1/finance/reports/arrears?academicYearId=${ids.year}&asOf=2020-09-05`,
      adminCookie,
    );
    expect(early.json().totals.overdueOutstanding).toBe(120_000);
    const klass = await call(
      'GET',
      `/v1/finance/reports/arrears?academicYearId=${ids.year}&classId=${ids.class8A}&asOf=2020-09-15`,
      adminCookie,
    );
    expect(klass.json().rows.map((r: { name: string }) => r.name)).toEqual(['Citra']);
    expect(klass.json().totals.outstanding).toBe(120_000);
    expect(
      (await call('GET', `/v1/finance/reports/arrears?academicYearId=${ids.year}`, teacherCookie)).statusCode,
    ).toBe(403);
  });

  it('penerimaan harian: hanya kwitansi tak batal, per metode, jenis biaya, dan hari Jakarta', async () => {
    const res = await call('GET', '/v1/finance/reports/daily?from=2026-08-01&to=2026-08-31', operatorCookie);
    expect(res.statusCode).toBe(200);
    // P1 50.000 tunai (5 Agu 10:00 WIB); P3 80.000 transfer (6 Agu 03:00 WIB); P4 300.000 transfer (6 Agu 12:00 WIB).
    expect(res.json()).toEqual({
      totals: { receipts: 3, amount: 430_000 },
      byMethod: [
        { method: 'cash', receipts: 1, amount: 50_000 },
        { method: 'transfer', receipts: 2, amount: 380_000 },
      ],
      byFeeType: [
        { feeTypeName: 'SPP', amount: 230_000 },
        { feeTypeName: 'Uang Gedung', amount: 200_000 },
      ],
      byDay: [
        { date: '2026-08-05', receipts: 1, amount: 50_000 },
        { date: '2026-08-06', receipts: 2, amount: 380_000 },
      ],
    });
    const one = await call('GET', '/v1/finance/reports/daily?from=2026-08-06&to=2026-08-06', adminCookie);
    expect(one.json().totals).toEqual({ receipts: 2, amount: 380_000 });
    const none = await call('GET', '/v1/finance/reports/daily?from=2026-07-01&to=2026-07-31', adminCookie);
    expect(none.json()).toEqual({
      totals: { receipts: 0, amount: 0 },
      byMethod: [],
      byFeeType: [],
      byDay: [],
    });
    const long = await call('GET', '/v1/finance/reports/daily?from=2026-01-01&to=2027-01-02', adminCookie);
    expect(long.statusCode).toBe(400);
    expect(code(long)).toBe('invalid_range');
    expect(
      (await call('GET', '/v1/finance/reports/daily?from=2026-01-01&to=2026-12-31', adminCookie)).statusCode,
    ).toBe(200);
    expect(
      code(await call('GET', '/v1/finance/reports/daily?from=2026-08-02&to=2026-08-01', adminCookie)),
    ).toBe('invalid_range');
  });
});

describe('isolasi antar-sekolah', () => {
  it('data sekolah lain tidak terlihat dan tidak bisa dirujuk', async () => {
    // Sekolah lain tidak melihat tagihan, kwitansi, ataupun tarif sekolah ini.
    const list = await call(
      'GET',
      `/v1/finance/invoices?academicYearId=${ids.year}`,
      otherCookie,
      undefined,
      otherId,
    );
    expect(list.json()).toEqual({ items: [], total: 0 });
    expect((await call('GET', '/v1/finance/payments', otherCookie, undefined, otherId)).json().total).toBe(0);
    expect(
      (await call('GET', `/v1/finance/payments/${ids.p1}`, otherCookie, undefined, otherId)).statusCode,
    ).toBe(404);
    expect(
      (
        await call(
          'GET',
          `/v1/finance/students/${ids.ani}/statement?academicYearId=${ids.year}`,
          otherCookie,
          undefined,
          otherId,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', '/v1/finance/fee-types', otherCookie, undefined, otherId))
        .json()
        .map((f: { name: string }) => f.name),
    ).toEqual(['SPP']);
    const arrears = await call(
      'GET',
      `/v1/finance/reports/arrears?academicYearId=${ids.year}`,
      otherCookie,
      undefined,
      otherId,
    );
    expect(arrears.json().rows).toEqual([]);
    // Rujukan lintas sekolah ditolak oleh API (FK tidak tunduk RLS).
    const crossPay = await pay(
      { studentId: ids.foreignStudent, items: [{ invoiceId: ids.aniGedung, amount: 1000 }] },
      otherCookie,
    );
    expect(crossPay.statusCode).toBe(403);
    const asOther = await call(
      'POST',
      '/v1/finance/payments',
      otherCookie,
      { studentId: ids.ani, method: 'cash', items: [{ invoiceId: ids.aniGedung, amount: 1000 }] },
      otherId,
    );
    expect(asOther.statusCode).toBe(400);
    expect(code(asOther)).toBe('invalid_reference');
    const crossPlan = await call(
      'PUT',
      '/v1/finance/fee-plans',
      otherCookie,
      { academicYearId: ids.foreignYear, feeTypeId: ids.spp, level: null, amount: 1 },
      otherId,
    );
    expect(code(crossPlan)).toBe('invalid_reference');
    expect(
      (await call('DELETE', `/v1/finance/fee-types/${ids.spp}`, otherCookie, undefined, otherId)).statusCode,
    ).toBe(404);
    expect(
      (await call('POST', `/v1/finance/payments/${ids.p1}/void`, otherCookie, { reason: 'x' }, otherId))
        .statusCode,
    ).toBe(404);
    // Anggota sekolah lain tidak bisa memakai sekolah ini lewat header.
    expect((await call('GET', '/v1/finance/fee-types', otherCookie)).statusCode).toBe(403);
    // Tidak ada yang berubah di sekolah ini.
    expect((await invoices('&limit=100')).total).toBe(7);
  });
});
