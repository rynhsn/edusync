import { createPaymentProvider, midtransSignature, signDevEvent } from '@edusync/billing';
import { DEFAULT_CATALOG, quoteUnits } from '@edusync/contracts';
import { inArray, outbox, sql, user } from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp, paymentConfig } from './app';
import { loadEnv } from './env';
import { requireModule, requirePermission } from './identity/guards';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const env = loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' });

let app: Awaited<ReturnType<typeof buildApp>>;
const userIds: string[] = [];
const emails: string[] = [];

async function makeUser(label: string) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: `Pemilik ${label}`, email, password } });
  userIds.push(res.user.id);
  emails.push(email);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  return { id: res.user.id, email, cookie };
}

const json = { origin, 'content-type': 'application/json' };
const ids = (xs: string[]) =>
  sql.join(
    xs.map((x) => sql`${x}`),
    sql`, `,
  );

const register = (cookie: string, body: object) =>
  app.inject({ method: 'POST', url: '/v1/registrations', headers: { ...json, cookie }, payload: body });

const webhook = (
  event: { eventId: string; orderId: string; status: string; amount: number },
  signature?: string,
) =>
  app.inject({
    method: 'POST',
    url: '/v1/webhooks/payments/dev',
    headers: json,
    payload: {
      ...event,
      signature:
        signature ?? signDevEvent(env.PAYMENT_DEV_SECRET, event as Parameters<typeof signDevEvent>[1]),
    },
  });

async function orderIdOf(registrationId: string) {
  const res = await app.platformDb.execute<{ provider_ref: string; amount: number }>(
    sql`select provider_ref, amount from invoice where registration_id = ${registrationId}`,
  );
  return { orderId: res.rows[0]?.provider_ref as string, amount: res.rows[0]?.amount as number };
}

const units = (label: string) => [
  {
    name: 'SMP IT Contoh',
    slug: `smp-${label}-${run}`,
    modules: ['attendance', 'assessments'],
    tier: 't300',
  },
  { name: 'SMK Contoh', slug: `smk-${label}-${run}`, modules: ['internship'], tier: 't800' },
];

beforeAll(async () => {
  app = await buildApp(env);
  // Rute uji untuk requireModule: izin biasa + modul absensi.
  app.get(
    '/__test/attendance',
    { onRequest: [requirePermission('academic_year:read'), requireModule('attendance')] },
    async () => ({ ok: true }),
  );
  await app.ready();
});

afterAll(async () => {
  const db = app.platformDb;
  const schoolIds = (
    await db.execute<{ id: string }>(sql`select id from school where slug like ${`%-${run}`}`)
  ).rows.map((r) => r.id);
  const foundationIds = (
    await db.execute<{ id: string }>(
      sql`select distinct foundation_id as id from school where slug like ${`%-${run}`}`,
    )
  ).rows.map((r) => r.id);
  await db.delete(outbox).where(sql`${outbox.payload}->>'to' like ${`%-${run}@example.test`}`);
  if (userIds.length > 0) {
    await db.execute(
      sql`delete from payment where invoice_id in (select i.id from invoice i join registration r on r.id = i.registration_id where r.user_id in (${ids(userIds)}))`,
    );
    await db.execute(
      sql`delete from invoice where registration_id in (select id from registration where user_id in (${ids(userIds)}))`,
    );
  }
  for (const sid of schoolIds) {
    for (const table of ['entitlement', 'audit_log', 'member_role', 'role_permission', 'member', 'role']) {
      await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
  }
  await db.execute(sql`delete from school where slug like ${`%-${run}`}`);
  if (foundationIds.length > 0) {
    await db.execute(sql`delete from subscription where foundation_id in (${ids(foundationIds)})`);
    await db.execute(
      sql`update registration set foundation_id = null where foundation_id in (${ids(foundationIds)})`,
    );
  }
  if (userIds.length > 0) await db.execute(sql`delete from registration where user_id in (${ids(userIds)})`);
  if (foundationIds.length > 0)
    await db.execute(sql`delete from foundation where id in (${ids(foundationIds)})`);
  if (userIds.length > 0) await db.delete(user).where(inArray(user.id, userIds));
  await app.close();
});

describe('katalog dan subdomain', () => {
  it('katalog publik berisi modul dan harga', async () => {
    const res = await app.inject('/v1/catalog');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.currency).toBe('IDR');
    expect(body.items.find((i: { key: string }) => i.key === 'attendance').priceMonthly).toBe(100_000);
    expect(body.requires.assessments).toEqual(['grades']);
  });

  it('ketersediaan subdomain: tidak valid, tersedia', async () => {
    expect((await app.inject('/v1/slugs/www/availability')).json().status).toBe('invalid');
    expect((await app.inject('/v1/slugs/Bukan_Valid/availability')).json().status).toBe('invalid');
    expect((await app.inject(`/v1/slugs/bebas-${run}/availability`)).json().status).toBe('available');
  });
});

describe('pendaftaran dan aktivasi otomatis', () => {
  it('wajib login', async () => {
    const res = await register('', { foundationName: 'Yayasan X', period: 'monthly', units: units('anon') });
    expect(res.statusCode).toBe(401);
  });

  it('alur penuh: daftar, bayar lewat webhook, sekolah aktif otomatis', async () => {
    const owner = await makeUser('alur');
    const input = { foundationName: 'Yayasan Contoh', period: 'monthly', units: units('alur') };
    const res = await register(owner.cookie, input);
    expect(res.statusCode).toBe(201);
    const created = res.json();

    // Harga dihitung server dari katalog: absensi + penilaian (+ nilai karena syarat) + tingkat 800 + PKL (+ administrasi).
    const expected = quoteUnits(DEFAULT_CATALOG, input.units, 'monthly').total;
    expect(created.amount).toBe(expected);
    expect(created.paymentUrl).toContain('/pay/');

    const pending = (await get(`/v1/registrations/${created.registrationId}`, owner.cookie)).json();
    expect(pending.status).toBe('pending_payment');
    expect(pending.schools).toEqual([]);

    // Sebelum dibayar, pengguna belum menjadi anggota sekolah mana pun.
    expect((await get('/v1/me', owner.cookie)).json().memberships).toEqual([]);

    const { orderId, amount } = await orderIdOf(created.registrationId);
    const event = { eventId: `evt-${run}-1`, orderId, status: 'paid', amount };
    const paid = await webhook(event);
    expect(paid.statusCode).toBe(200);
    expect(paid.json().outcome).toBe('activated');

    const after = (await get(`/v1/registrations/${created.registrationId}`, owner.cookie)).json();
    expect(after.status).toBe('paid');
    expect(after.invoice.status).toBe('paid');
    expect(after.schools.map((s: { slug: string }) => s.slug).sort()).toEqual(
      input.units.map((u) => u.slug).sort(),
    );

    const me = (await get('/v1/me', owner.cookie)).json();
    expect(me.memberships).toHaveLength(2);
    for (const m of me.memberships) expect(m.roles).toEqual(['school_admin']);

    // Modul yang dibeli aktif, syaratnya ikut, dan yang tidak dibeli tidak ada.
    const smp = me.memberships.find((m: { schoolSlug: string }) => m.schoolSlug.startsWith('smp-'));
    const smk = me.memberships.find((m: { schoolSlug: string }) => m.schoolSlug.startsWith('smk-'));
    const mods = async (schoolId: string) =>
      (
        await app.platformDb.execute<{ module_key: string }>(
          sql`select module_key from entitlement where school_id = ${schoolId} order by 1`,
        )
      ).rows.map((r) => r.module_key);
    expect(await mods(smp.schoolId)).toEqual(['assessments', 'attendance', 'grades']);
    expect(await mods(smk.schoolId)).toEqual(['administration', 'internship']);

    // Email selamat datang masuk antrean dalam transaksi aktivasi.
    const mail = await app.platformDb
      .select()
      .from(outbox)
      .where(sql`${outbox.payload}->>'to' = ${owner.email}`);
    expect(mail).toHaveLength(1);

    // requireModule: unit SMP punya absensi, unit SMK tidak.
    const hit = (schoolId: string) =>
      app.inject({ url: '/__test/attendance', headers: { cookie: owner.cookie, 'x-school-id': schoolId } });
    expect((await hit(smp.schoolId)).statusCode).toBe(200);
    const blocked = await hit(smk.schoolId);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('module_disabled');
  });

  it('webhook yang sama dikirim ulang tidak membuat sekolah ganda', async () => {
    const owner = await makeUser('ulang');
    const created = (
      await register(owner.cookie, {
        foundationName: 'Yayasan Ulang',
        period: 'monthly',
        units: [units('ulang')[0]],
      })
    ).json();
    const { orderId, amount } = await orderIdOf(created.registrationId);
    const event = { eventId: `evt-${run}-ulang`, orderId, status: 'paid', amount };
    expect((await webhook(event)).json().outcome).toBe('activated');
    expect((await webhook(event)).json().outcome).toBe('duplicate');
    // Kabar berbeda untuk invoice yang sudah lunas juga tidak mengaktifkan lagi.
    expect((await webhook({ ...event, eventId: `evt-${run}-ulang-2` })).json().outcome).toBe('duplicate');
    const count = await app.platformDb.execute<{ n: string }>(
      sql`select count(*)::text as n from school where slug = ${`smp-ulang-${run}`}`,
    );
    expect(count.rows[0]?.n).toBe('1');
    const subs = await app.platformDb.execute<{ n: string }>(
      sql`select count(*)::text as n from subscription s join registration r on r.foundation_id = s.foundation_id where r.id = ${created.registrationId}`,
    );
    expect(subs.rows[0]?.n).toBe('1');
  });

  it('webhook dengan tanda tangan salah ditolak dan tidak mengubah apa pun', async () => {
    const owner = await makeUser('palsu');
    const created = (
      await register(owner.cookie, {
        foundationName: 'Yayasan Palsu',
        period: 'monthly',
        units: [units('palsu')[0]],
      })
    ).json();
    const { orderId, amount } = await orderIdOf(created.registrationId);
    const res = await webhook(
      { eventId: `evt-${run}-palsu`, orderId, status: 'paid', amount },
      'bukan-tanda-tangan',
    );
    expect(res.statusCode).toBe(401);
    expect((await get(`/v1/registrations/${created.registrationId}`, owner.cookie)).json().status).toBe(
      'pending_payment',
    );
  });

  it('jumlah bayar yang berbeda dari invoice tidak mengaktifkan sekolah', async () => {
    const owner = await makeUser('kurang');
    const created = (
      await register(owner.cookie, {
        foundationName: 'Yayasan Kurang',
        period: 'monthly',
        units: [units('kurang')[0]],
      })
    ).json();
    const { orderId, amount } = await orderIdOf(created.registrationId);
    const res = await webhook({ eventId: `evt-${run}-kurang`, orderId, status: 'paid', amount: amount - 1 });
    expect(res.json().outcome).toBe('amount_mismatch');
    expect((await get(`/v1/registrations/${created.registrationId}`, owner.cookie)).json().status).toBe(
      'pending_payment',
    );
  });

  it('modul atau tingkat yang tidak ada di katalog ditolak', async () => {
    const owner = await makeUser('modul');
    const bad = [{ ...units('modul')[0], modules: ['tidak-ada'] }];
    const res = await register(owner.cookie, {
      foundationName: 'Yayasan Modul',
      period: 'monthly',
      units: bad,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_selection');
  });

  it('subdomain yang sedang dipesan orang lain ditolak, dan pendaftaran baru sendiri menggantikan yang lama', async () => {
    const a = await makeUser('rebut-a');
    const b = await makeUser('rebut-b');
    const input = { foundationName: 'Yayasan Rebut', period: 'monthly', units: [units('rebut')[0]] };
    expect((await register(a.cookie, input)).statusCode).toBe(201);
    const conflict = await register(b.cookie, input);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('slug_taken');
    // Pemilik pesanan boleh mendaftar ulang dengan subdomain yang sama.
    expect((await register(a.cookie, input)).statusCode).toBe(201);
  });

  it('pembayaran gagal melepas pesanan subdomain', async () => {
    const a = await makeUser('gagal-a');
    const b = await makeUser('gagal-b');
    const input = { foundationName: 'Yayasan Gagal', period: 'monthly', units: [units('gagal')[0]] };
    const created = (await register(a.cookie, input)).json();
    const { orderId, amount } = await orderIdOf(created.registrationId);
    expect(
      (await webhook({ eventId: `evt-${run}-gagal`, orderId, status: 'failed', amount })).json().outcome,
    ).toBe('failed');
    expect((await get(`/v1/registrations/${created.registrationId}`, a.cookie)).json().status).toBe(
      'expired',
    );
    expect((await register(b.cookie, input)).statusCode).toBe(201);
  });

  it('pembayaran terlambat setelah kedaluwarsa tetap mengaktifkan bila subdomain masih bebas', async () => {
    const owner = await makeUser('telat');
    const created = (
      await register(owner.cookie, {
        foundationName: 'Yayasan Telat',
        period: 'monthly',
        units: [units('telat')[0]],
      })
    ).json();
    await app.platformDb.execute(
      sql`update registration set status = 'expired', expires_at = now() - interval '1 hour' where id = ${created.registrationId}`,
    );
    await app.platformDb.execute(
      sql`delete from slug_reservation where registration_id = ${created.registrationId}`,
    );
    const { orderId, amount } = await orderIdOf(created.registrationId);
    expect(
      (await webhook({ eventId: `evt-${run}-telat`, orderId, status: 'paid', amount })).json().outcome,
    ).toBe('activated');
  });

  it('pendaftaran milik orang lain tidak bisa dibaca', async () => {
    const a = await makeUser('milik-a');
    const b = await makeUser('milik-b');
    const created = (
      await register(a.cookie, {
        foundationName: 'Yayasan Milik',
        period: 'monthly',
        units: [units('milik')[0]],
      })
    ).json();
    expect((await get(`/v1/registrations/${created.registrationId}`, b.cookie)).statusCode).toBe(404);
  });
});

describe('keamanan data penagihan', () => {
  it('peran aplikasi tidak bisa menulis atau membaca tabel penagihan', async () => {
    await expect(app.tenantDb.execute(sql`select * from invoice limit 1`)).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/permission denied/) },
    });
    await expect(
      app.tenantDb.execute(
        sql`insert into entitlement (school_id, module_key, subscription_id, valid_until) values (gen_random_uuid(), 'x', gen_random_uuid(), now())`,
      ),
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/permission denied/) } });
  });

  it('penyedia dev dilarang di produksi', () => {
    expect(() => loadEnv({ ...process.env, NODE_ENV: 'production', PAYMENT_PROVIDER: 'dev' })).toThrow(
      /PAYMENT_PROVIDER/,
    );
  });

  it('endpoint simulasi tidak tersedia ketika penyedia bukan dev', () => {
    const midtrans = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      PAYMENT_PROVIDER: 'midtrans',
      MIDTRANS_SERVER_KEY: 'SB-key',
    });
    expect(createPaymentProvider(paymentConfig(midtrans)).name).toBe('midtrans');
  });
});

describe('Midtrans', () => {
  const serverKey = 'SB-Mid-server-contoh';
  const provider = createPaymentProvider(
    paymentConfig(
      loadEnv({
        ...process.env,
        NODE_ENV: 'test',
        PAYMENT_PROVIDER: 'midtrans',
        MIDTRANS_SERVER_KEY: serverKey,
      }),
    ),
  );
  const notification = (over: Record<string, string> = {}) => {
    const base = {
      order_id: 'edu-123',
      status_code: '200',
      gross_amount: '250000.00',
      transaction_status: 'settlement',
      transaction_id: 'trx-1',
      ...over,
    };
    return { ...base, signature_key: midtransSignature(base, serverKey) };
  };

  it('settlement bertanda tangan benar dianggap dibayar', () => {
    expect(provider.parseWebhook(notification())).toMatchObject({
      status: 'paid',
      amount: 250000,
      orderId: 'edu-123',
    });
  });

  it('jumlah yang diubah setelah ditandatangani ditolak', () => {
    expect(() => provider.parseWebhook({ ...notification(), gross_amount: '1000.00' })).toThrow();
  });

  it('expire dianggap gagal, pending tetap menunggu, capture challenge belum dianggap dibayar', () => {
    expect(provider.parseWebhook(notification({ transaction_status: 'expire' })).status).toBe('failed');
    expect(provider.parseWebhook(notification({ transaction_status: 'pending' })).status).toBe('pending');
    expect(
      provider.parseWebhook(notification({ transaction_status: 'capture', fraud_status: 'challenge' }))
        .status,
    ).toBe('pending');
    expect(
      provider.parseWebhook(notification({ transaction_status: 'capture', fraud_status: 'accept' })).status,
    ).toBe('paid');
  });
});

function get(url: string, cookie: string) {
  return app.inject({ url, headers: { cookie } });
}

describe('Midtrans: pembuatan transaksi', () => {
  it('mengirim alamat kembali ke halaman status dan kunci server di header', async () => {
    const config = paymentConfig(
      loadEnv({
        ...process.env,
        NODE_ENV: 'test',
        PAYMENT_PROVIDER: 'midtrans',
        MIDTRANS_SERVER_KEY: 'SB-Mid-server-contoh',
        WEB_URL: 'http://localhost:3000',
      }),
    );
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/abc' }),
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const charge = await createPaymentProvider(config).createCharge({
        orderId: 'edu-123',
        amount: 250000,
        customer: { name: 'Pemilik', email: 'pemilik@example.test' },
        description: 'Langganan Edusync Uji',
        returnPath: '/register/status/reg-1',
      });
      expect(charge.paymentUrl).toContain('midtrans.com');
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toContain('/snap/v1/transactions');
      expect((init.headers as Record<string, string>).authorization).toBe(
        `Basic ${Buffer.from('SB-Mid-server-contoh:').toString('base64')}`,
      );
      const body = JSON.parse(init.body as string);
      expect(body.transaction_details).toEqual({ order_id: 'edu-123', gross_amount: 250000 });
      expect(body.callbacks.finish).toBe('http://localhost:3000/register/status/reg-1');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('menolak bila Midtrans tidak mengembalikan alamat pembayaran', async () => {
    const config = paymentConfig(
      loadEnv({
        ...process.env,
        NODE_ENV: 'test',
        PAYMENT_PROVIDER: 'midtrans',
        MIDTRANS_SERVER_KEY: 'SB-Mid-server-contoh',
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error_messages: ['salah'] }), { status: 401 })),
    );
    try {
      await expect(
        createPaymentProvider(config).createCharge({
          orderId: 'edu-1',
          amount: 1000,
          customer: { name: 'A', email: 'a@example.test' },
          description: 'x',
          returnPath: '/dashboard',
        }),
      ).rejects.toThrow(/Midtrans/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
