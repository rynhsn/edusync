import { midtransSignature } from '@edusync/billing';
import {
  academicYear,
  assignRoles,
  classRoom,
  enrollment,
  entitlement,
  eq,
  finGatewaySetting,
  finInvoice,
  finOnlineCharge,
  finPayment,
  foundation,
  guardian,
  member,
  portalLink,
  school,
  seedSchoolRoles,
  sql,
  student,
  studentGuardian,
  subscription,
  user,
} from '@edusync/db';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
const KEY_A = `SB-Mid-server-A${run}${'x'.repeat(10)}`;
const KEY_B = `SB-Mid-server-B${run}${'y'.repeat(10)}`;

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let otherId = '';
let foundationId = '';
let yearId = '';
let otherYearId = '';
const userIds: string[] = [];
let adminCookie = '';
let treasurerCookie = '';
let operatorCookie = '';
let parentCookie = '';
let strangerCookie = '';
let otherAdminCookie = '';
const ids = { ani: '', budi: '', foreign: '' };

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
  method: 'GET' | 'POST' | 'PUT',
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

/** Midtrans palsu: Snap membuat tautan, status API mengikuti `midtrans.status`. */
const midtrans = {
  snapCalls: [] as {
    auth: string;
    body: { transaction_details: { order_id: string; gross_amount: number } };
  }[],
  statusCode: 404,
  statusBody: null as null | Record<string, unknown>,
};
const realFetch = globalThis.fetch;

beforeAll(async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('midtrans.com/snap/')) {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      midtrans.snapCalls.push({
        auth: headers.authorization ?? '',
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({ redirect_url: `https://pay.test/${midtrans.snapCalls.length}` });
    }
    if (url.includes('midtrans.com/v2/')) {
      return Response.json(midtrans.statusBody ?? { status_code: String(midtrans.statusCode) }, {
        status: midtrans.statusBody ? 200 : midtrans.statusCode,
      });
    }
    return realFetch(input, init);
  });
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Gateway', slug: `yg-${run}` })
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
  schoolId = await make(`gw-${run}`, ['finance', 'parent_portal']);
  otherId = await make(`gw-lain-${run}`, ['finance', 'parent_portal']);
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
  yearId = await year(schoolId);
  otherYearId = await year(otherId);
  const mkStudent = async (sid: string, y: string, name: string, nis: string) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId: sid, academicYearId: y, name: `K-${nis}`, level: '7' })
      .returning();
    const [s] = await db.insert(student).values({ schoolId: sid, name, nis, gender: 'L' }).returning();
    await db
      .insert(enrollment)
      .values({ schoolId: sid, studentId: s!.id, classId: c!.id, academicYearId: y });
    return s!.id;
  };
  ids.ani = await mkStudent(schoolId, yearId, 'Ani', 'G1');
  ids.budi = await mkStudent(schoolId, yearId, 'Budi', 'G2');
  ids.foreign = await mkStudent(otherId, otherYearId, 'Siswa Lain', 'G9');

  adminCookie = (await join('admin-gw', schoolId, ['school_admin'])).cookie;
  treasurerCookie = (await join('bendahara-gw', schoolId, ['treasurer'])).cookie;
  operatorCookie = (await join('operator-gw', schoolId, ['operator'])).cookie;
  otherAdminCookie = (await join('admin-gw-lain', otherId, ['school_admin'])).cookie;

  const link = async (label: string, anakId: string) => {
    const j = await join(label, schoolId, ['guardian']);
    const [g] = await db.insert(guardian).values({ schoolId, name: label }).returning();
    await db
      .insert(studentGuardian)
      .values({ schoolId, studentId: anakId, guardianId: g!.id, relation: 'father', isPrimary: true });
    await db
      .insert(portalLink)
      .values({ schoolId, memberId: j.memberId, kind: 'guardian', guardianId: g!.id });
    return j.cookie;
  };
  parentCookie = await link('wali-ani', ids.ani);
  strangerCookie = await link('wali-budi', ids.budi);
});

afterEach(() => {
  midtrans.statusCode = 404;
  midtrans.statusBody = null;
});

afterAll(async () => {
  vi.restoreAllMocks();
  const db = app.platformDb;
  for (const sid of [schoolId, otherId]) {
    for (const table of [
      'audit_log',
      'message_outbox',
      'fin_online_charge',
      'fin_gateway_setting',
      'fin_payment_item',
      'fin_payment',
      'fin_payment_method',
      'fin_invoice',
      'fin_fee_type',
      'fin_counter',
      'portal_link',
      'student_guardian',
      'guardian',
      'enrollment',
      'class_room',
      'student',
      'academic_year',
      'member',
      'role',
      'entitlement',
    ]) {
      await db
        .execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`)
        .catch(() => undefined);
    }
    await db.delete(school).where(eq(school.id, sid));
  }
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

let invoiceSeq = 0;
async function makeInvoice(studentId: string, amount: number, discount = 0, sid = schoolId, y = yearId) {
  invoiceSeq += 1;
  // SQL mentah agar tes tidak bergantung pada kolom opsional jenis biaya yang lain (mis. `scope`).
  const fee = await app.platformDb.execute<{ id: string }>(
    sql`insert into fin_fee_type (school_id, name, kind) values (${sid}, ${`Biaya ${invoiceSeq}-${run}`}, 'one_time') returning id`,
  );
  const [inv] = await app.platformDb
    .insert(finInvoice)
    .values({
      schoolId: sid,
      studentId,
      academicYearId: y,
      feeTypeId: fee.rows[0]!.id,
      title: `Tagihan ${invoiceSeq}`,
      amount,
      discount,
      dueDate: '2099-01-01',
      createdBy: 'test',
    })
    .returning();
  return inv!.id;
}

const notification = (
  orderId: string,
  grossAmount: string,
  key: string,
  status = 'settlement',
  statusCode = '200',
) => {
  const n = {
    order_id: orderId,
    status_code: statusCode,
    gross_amount: grossAmount,
    transaction_status: status,
    transaction_id: `trx-${orderId}`,
  };
  return { ...n, signature_key: midtransSignature(n, key) };
};
const webhook = (body: object) =>
  app.inject({
    method: 'POST',
    url: '/v1/webhooks/school-payments/midtrans',
    headers: { 'content-type': 'application/json' },
    payload: body,
  });
const paymentCount = async (studentId: string) =>
  (await app.platformDb.select().from(finPayment).where(eq(finPayment.studentId, studentId))).length;
const outstandingOf = async (invoiceId: string, studentId: string) => {
  const res = await call(
    'GET',
    `/v1/finance/invoices?academicYearId=${yearId}&studentId=${studentId}`,
    adminCookie,
  );
  return (res.json().items as { id: string; outstanding: number; paid: number }[]).find(
    (i) => i.id === invoiceId,
  )!;
};
async function payOnline(invoiceIds: string[], studentId = ids.ani, cookie = treasurerCookie) {
  return call('POST', '/v1/finance/invoices/pay-online', cookie, { studentId, invoiceIds });
}

describe('pengaturan Midtrans sekolah', () => {
  it('kunci server tidak pernah bocor dan awalan harus cocok dengan mode', async () => {
    const empty = await call('GET', '/v1/finance/gateway', adminCookie);
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toMatchObject({
      enabled: false,
      hasServerKey: false,
      ready: false,
      mode: 'sandbox',
    });

    // Aktif tanpa kunci ditolak; awalan produksi di mode sandbox ditolak.
    const noKey = await call('PUT', '/v1/finance/gateway', adminCookie, { enabled: true, mode: 'sandbox' });
    expect(noKey.statusCode).toBe(400);
    expect(code(noKey)).toBe('key_required');
    const wrongPrefix = await call('PUT', '/v1/finance/gateway', adminCookie, {
      enabled: true,
      mode: 'sandbox',
      serverKey: 'Mid-server-salah',
    });
    expect(code(wrongPrefix)).toBe('invalid_key');

    // Operator tidak punya finance:manage.
    expect((await call('GET', '/v1/finance/gateway', operatorCookie)).statusCode).toBe(403);
    expect(
      (await call('PUT', '/v1/finance/gateway', operatorCookie, { enabled: false, mode: 'sandbox' }))
        .statusCode,
    ).toBe(403);

    const saved = await call('PUT', '/v1/finance/gateway', adminCookie, {
      enabled: false,
      mode: 'sandbox',
      merchantId: 'G123',
      clientKey: 'SB-Mid-client-abc',
      serverKey: KEY_A,
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      hasServerKey: true,
      clientKey: 'SB-Mid-client-abc',
      merchantId: 'G123',
    });
    expect(saved.body).not.toContain(KEY_A);
    // Dikosongkan = kunci lama dipertahankan.
    const kept = await call('PUT', '/v1/finance/gateway', adminCookie, {
      enabled: false,
      mode: 'sandbox',
      serverKey: '',
    });
    expect(kept.json().hasServerKey).toBe(true);
    const read = await call('GET', '/v1/finance/gateway', adminCookie);
    expect(read.body).not.toContain(KEY_A);
    expect(read.body.toLowerCase()).not.toContain('serverkeyenc');
    // Di database tersimpan terenkripsi, bukan teks asli.
    const [row] = await app.platformDb
      .select()
      .from(finGatewaySetting)
      .where(eq(finGatewaySetting.schoolId, schoolId));
    expect(row!.serverKeyEnc).toBeTruthy();
    expect(row!.serverKeyEnc).not.toContain(KEY_A);
    // Mengganti ke production tanpa kunci baru ditolak karena kunci tersimpan berawalan sandbox.
    const mismatch = await call('PUT', '/v1/finance/gateway', adminCookie, {
      enabled: false,
      mode: 'production',
    });
    expect(code(mismatch)).toBe('invalid_key');
  });

  it('uji kunci: 404 berarti kunci sah, 401 berarti ditolak', async () => {
    midtrans.statusCode = 404;
    expect((await call('POST', '/v1/finance/gateway/test', adminCookie)).json()).toEqual({
      ok: true,
      reason: null,
    });
    midtrans.statusCode = 401;
    const bad = await call('POST', '/v1/finance/gateway/test', adminCookie);
    expect(bad.json().ok).toBe(false);
    expect(bad.json().reason).toContain('menolak');
  });
});

describe('pembayaran online', () => {
  it('ditolak 409 gateway_disabled selama belum diaktifkan', async () => {
    const inv = await makeInvoice(ids.ani, 100_000);
    const res = await payOnline([inv]);
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('gateway_disabled');
  });

  it('membuat transaksi dengan nominal dari server, dan webhook idempoten', async () => {
    await call('PUT', '/v1/finance/gateway', adminCookie, { enabled: true, mode: 'sandbox' });
    const a = await makeInvoice(ids.ani, 100_000, 10_000);
    const b = await makeInvoice(ids.ani, 50_000);
    midtrans.snapCalls.length = 0;
    const res = await payOnline([a, b]);
    expect(res.statusCode).toBe(201);
    const { orderId, total, paymentUrl } = res.json();
    expect(total).toBe(140_000);
    expect(paymentUrl).toMatch(/^https:\/\/pay\.test\//);
    expect(orderId).toMatch(/^FEE-[0-9a-f]{8}-\d+$/);
    expect(midtrans.snapCalls[0]!.body.transaction_details).toEqual({
      order_id: orderId,
      gross_amount: 140_000,
    });
    expect(midtrans.snapCalls[0]!.auth).toBe(`Basic ${Buffer.from(`${KEY_A}:`).toString('base64')}`);

    // Tanda tangan salah, kunci sekolah lain, dan nominal tak cocok: ditolak/diabaikan.
    const forged = { ...notification(orderId, '140000.00', KEY_A), signature_key: 'x'.repeat(128) };
    expect((await webhook(forged)).statusCode).toBe(401);
    const wrongSchool = await webhook(notification(orderId, '140000.00', KEY_B));
    expect(wrongSchool.statusCode).toBe(401);
    expect(code(wrongSchool)).toBe('invalid_signature');
    expect(await paymentCount(ids.ani)).toBe(0);
    const mismatch = await webhook(notification(orderId, '1000.00', KEY_A));
    expect(mismatch.json().outcome).toBe('amount_mismatch');
    expect(await paymentCount(ids.ani)).toBe(0);
    // Pesanan tak dikenal tidak membocorkan apa pun.
    expect((await webhook(notification('FEE-tidak-ada-1', '1.00', KEY_A))).json().outcome).toBe(
      'unknown_order',
    );

    // Dua kali pengiriman = satu kwitansi.
    const ok1 = await webhook(notification(orderId, '140000.00', KEY_A));
    expect(ok1.statusCode).toBe(200);
    expect(ok1.json().outcome).toBe('paid');
    const ok2 = await webhook(notification(orderId, '140000.00', KEY_A));
    expect(ok2.json().outcome).toBe('duplicate');
    expect(await paymentCount(ids.ani)).toBe(1);
    expect((await outstandingOf(a, ids.ani)).outstanding).toBe(0);
    expect((await outstandingOf(b, ids.ani)).outstanding).toBe(0);

    const [pay] = await app.platformDb.select().from(finPayment).where(eq(finPayment.studentId, ids.ani));
    expect(pay).toMatchObject({ method: 'midtrans', recordedBy: 'midtrans', total: 140_000 });
    expect(pay!.note).toContain(orderId);
    const [charge] = await app.platformDb
      .select()
      .from(finOnlineCharge)
      .where(eq(finOnlineCharge.orderId, orderId));
    expect(charge).toMatchObject({ status: 'paid', paymentId: pay!.id });

    // Tagihan yang sudah lunas tidak bisa dibayar online lagi.
    const again = await payOnline([a]);
    expect(again.statusCode).toBe(409);
    expect(code(again)).toBe('already_paid');

    const list = await call('GET', '/v1/finance/online-charges', treasurerCookie);
    expect(list.statusCode).toBe(200);
    expect(list.json().items[0]).toMatchObject({
      orderId,
      status: 'paid',
      studentName: 'Ani',
      receiptNo: pay!.receiptNo,
    });
  });

  it('penjaga kelebihan bayar: kasir melunasi dulu, webhook tidak menambah kwitansi melebihi sisa', async () => {
    const inv = await makeInvoice(ids.budi, 80_000);
    const res = await payOnline([inv], ids.budi);
    const { orderId } = res.json();
    // Kasir mencatat sebagian (30.000) sambil menunggu.
    const cash = await call('POST', '/v1/finance/payments', treasurerCookie, {
      studentId: ids.budi,
      method: 'cash',
      items: [{ invoiceId: inv, amount: 30_000 }],
    });
    expect(cash.statusCode).toBe(201);
    const first = await webhook(notification(orderId, '80000.00', KEY_A));
    expect(first.json().outcome).toBe('paid');
    const row = await outstandingOf(inv, ids.budi);
    expect(row.paid).toBe(80_000);
    expect(row.outstanding).toBe(0);
    const [online] = (
      await app.platformDb.select().from(finPayment).where(eq(finPayment.studentId, ids.budi))
    ).filter((p) => p.method === 'midtrans');
    expect(online!.total).toBe(50_000);

    // Bila semuanya sudah lunas lebih dulu, tidak ada kwitansi baru dan perlu ditinjau.
    const inv2 = await makeInvoice(ids.budi, 20_000);
    const { orderId: order2 } = (await payOnline([inv2], ids.budi)).json();
    await call('POST', '/v1/finance/payments', treasurerCookie, {
      studentId: ids.budi,
      method: 'cash',
      items: [{ invoiceId: inv2, amount: 20_000 }],
    });
    const before = await paymentCount(ids.budi);
    expect((await webhook(notification(order2, '20000.00', KEY_A))).json().outcome).toBe('needs_review');
    expect(await paymentCount(ids.budi)).toBe(before);
    expect((await outstandingOf(inv2, ids.budi)).paid).toBe(20_000);
  });

  it('transaksi gagal/kedaluwarsa menjadi failed dan tidak mencatat kwitansi', async () => {
    const inv = await makeInvoice(ids.ani, 30_000);
    const { orderId } = (await payOnline([inv])).json();
    const before = await paymentCount(ids.ani);
    expect((await webhook(notification(orderId, '30000.00', KEY_A, 'expire', '407'))).json().outcome).toBe(
      'failed',
    );
    expect(await paymentCount(ids.ani)).toBe(before);
    // Setelah gagal, kabar berikutnya diabaikan (idempoten) dan tagihan bisa dibayar ulang.
    expect((await webhook(notification(orderId, '30000.00', KEY_A))).json().outcome).toBe('duplicate');
    expect((await payOnline([inv])).statusCode).toBe(201);
  });

  it('rekonsiliasi: status API dipakai bila webhook tidak sampai', async () => {
    const inv = await makeInvoice(ids.ani, 45_000);
    const { orderId } = (await payOnline([inv])).json();
    midtrans.statusBody = notification(orderId, '45000.00', KEY_A);
    const res = await call('GET', `/v1/finance/online-charges/${orderId}`, treasurerCookie);
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('paid');
    expect((await outstandingOf(inv, ids.ani)).outstanding).toBe(0);
    // Sekolah lain tidak bisa melihat transaksi ini.
    expect(
      (await call('GET', `/v1/finance/online-charges/${orderId}`, otherAdminCookie, undefined, otherId))
        .statusCode,
    ).toBe(404);
  });

  it('portal: wali hanya bisa membayar tagihan anaknya', async () => {
    const mine = await makeInvoice(ids.ani, 60_000);
    const theirs = await makeInvoice(ids.budi, 60_000);
    const ok = await call('POST', `/v1/portal/children/${ids.ani}/pay-online`, parentCookie, {
      invoiceIds: [mine],
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().total).toBe(60_000);
    const status = await call('GET', `/v1/portal/online-charges/${ok.json().orderId}`, parentCookie);
    expect(status.statusCode).toBe(200);
    expect(status.json().status).toBe('pending');
    // Wali lain: anak bukan miliknya dan transaksi bukan miliknya.
    const foreignChild = await call('POST', `/v1/portal/children/${ids.ani}/pay-online`, strangerCookie, {
      invoiceIds: [mine],
    });
    expect(foreignChild.statusCode).toBe(404);
    expect(
      (await call('GET', `/v1/portal/online-charges/${ok.json().orderId}`, strangerCookie)).statusCode,
    ).toBe(404);
    // Tagihan anak lain lewat anak sendiri: ditolak.
    const crossed = await call('POST', `/v1/portal/children/${ids.ani}/pay-online`, parentCookie, {
      invoiceIds: [theirs],
    });
    expect(crossed.statusCode).toBe(400);
    // Siswa dari sekolah lain tidak dikenali.
    const alien = await payOnline([mine], ids.foreign);
    expect(alien.statusCode).toBe(400);
  });
});
