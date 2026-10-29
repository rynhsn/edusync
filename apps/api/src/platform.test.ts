import {
  createPaymentProvider,
  createRenewalInvoices,
  signDevEvent,
  sweepSubscriptions,
} from '@edusync/billing';
import { inArray, outbox, platformStaff, sql, user } from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, paymentConfig } from './app';
import { loadEnv } from './env';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const env = loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' });
const provider = createPaymentProvider(paymentConfig(env));
const json = { origin, 'content-type': 'application/json' };

let app: Awaited<ReturnType<typeof buildApp>>;
const userIds: string[] = [];

async function makeUser(label: string) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: `Uji ${label}`, email, password } });
  userIds.push(res.user.id);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: json,
    payload: { email, password },
  });
  return { id: res.user.id, email, cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join('; ') };
}

const get = (url: string, cookie: string, schoolId?: string) =>
  app.inject({ url, headers: { cookie, ...(schoolId ? { 'x-school-id': schoolId } : {}) } });
const post = (url: string, cookie: string, payload: object = {}) =>
  app.inject({ method: 'POST', url, headers: { ...json, cookie }, payload });

/** Daftarkan lalu bayar satu yayasan dengan dua unit; kembalikan id yang dibutuhkan tes. */
async function activatedFoundation(label: string) {
  const owner = await makeUser(`pemilik-${label}`);
  const units = [
    { name: 'SMP IT Contoh', slug: `smp-${label}-${run}`, modules: ['attendance'], tier: 't300' },
    { name: 'SMK Contoh', slug: `smk-${label}-${run}`, modules: ['internship'], tier: 't800' },
  ];
  const created = (
    await post('/v1/registrations', owner.cookie, {
      foundationName: `Yayasan ${label}`,
      period: 'monthly',
      units,
    })
  ).json();
  const { rows } = await app.platformDb.execute<{ provider_ref: string; amount: number }>(
    sql`select provider_ref, amount from invoice where registration_id = ${created.registrationId}`,
  );
  const invoiceRow = rows[0] as { provider_ref: string; amount: number };
  await pay(invoiceRow.provider_ref, invoiceRow.amount, `act-${label}`);
  const me = (await get('/v1/me', owner.cookie)).json();
  const smp = me.memberships.find((m: { schoolSlug: string }) => m.schoolSlug.startsWith('smp-'));
  const smk = me.memberships.find((m: { schoolSlug: string }) => m.schoolSlug.startsWith('smk-'));
  const f = (
    await app.platformDb.execute<{ foundation_id: string }>(
      sql`select foundation_id from school where id = ${smp.schoolId}`,
    )
  ).rows[0] as { foundation_id: string };
  return {
    owner,
    smp: smp.schoolId as string,
    smk: smk.schoolId as string,
    foundationId: f.foundation_id,
    registrationId: created.registrationId as string,
  };
}

async function pay(orderId: string, amount: number, eventId: string) {
  const event = { eventId: `${eventId}-${run}`, orderId, status: 'paid' as const, amount };
  const res = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/payments/dev',
    headers: json,
    payload: { ...event, signature: signDevEvent(env.PAYMENT_DEV_SECRET, event) },
  });
  return res.json().outcome as string;
}

const setPeriodEnd = (foundationId: string, when: string) =>
  app.platformDb.execute(
    sql`update subscription set current_period_end = ${sql.raw(when)} where foundation_id = ${foundationId}`,
  );

const renewalInvoice = async (foundationId: string) =>
  (
    await app.platformDb.execute<{ id: string; provider_ref: string; amount: number; status: string }>(
      sql`select id, provider_ref, amount, status from invoice where foundation_id = ${foundationId} and registration_id is null order by created_at desc limit 1`,
    )
  ).rows[0];

beforeAll(async () => {
  app = await buildApp(env);
  await app.ready();
});

afterAll(async () => {
  const db = app.platformDb;
  const list = (xs: string[]) =>
    sql.join(
      xs.map((x) => sql`${x}`),
      sql`, `,
    );
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
      sql`delete from payment where invoice_id in (select i.id from invoice i where i.registration_id in (select id from registration where user_id in (${list(userIds)})))`,
    );
    await db.execute(
      sql`delete from payment where invoice_id in (select id from invoice where foundation_id in (select distinct foundation_id from school where slug like ${`%-${run}`}))`,
    );
  }
  if (foundationIds.length > 0) {
    await db.execute(sql`delete from invoice where foundation_id in (${list(foundationIds)})`);
  }
  if (userIds.length > 0) {
    await db.execute(
      sql`delete from invoice where registration_id in (select id from registration where user_id in (${list(userIds)}))`,
    );
  }
  for (const sid of schoolIds) {
    for (const table of ['entitlement', 'audit_log', 'member_role', 'role_permission', 'member', 'role']) {
      await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
  }
  if (foundationIds.length > 0) {
    // Catatan audit tingkat yayasan (tanpa school_id) dari siklus penagihan.
    await db.execute(
      sql`delete from audit_log where school_id is null and (entity_id in (${list(foundationIds)}) or details->>'foundationId' in (${list(foundationIds)}))`,
    );
  }
  await db.execute(
    sql`delete from audit_log where details::text like ${`%-${run}%`} or actor_id in (${userIds.length ? list(userIds) : sql`''`})`,
  );
  await db.execute(sql`delete from school where slug like ${`%-${run}`}`);
  if (foundationIds.length > 0) {
    await db.execute(sql`delete from subscription where foundation_id in (${list(foundationIds)})`);
    await db.execute(
      sql`update registration set foundation_id = null where foundation_id in (${list(foundationIds)})`,
    );
  }
  if (userIds.length > 0) {
    await db.execute(sql`delete from registration where user_id in (${list(userIds)})`);
    await db.delete(platformStaff).where(inArray(platformStaff.userId, userIds));
  }
  if (foundationIds.length > 0)
    await db.execute(sql`delete from foundation_owner where foundation_id in (${list(foundationIds)})`);
  if (foundationIds.length > 0)
    await db.execute(sql`delete from foundation where id in (${list(foundationIds)})`);
  if (userIds.length > 0) await db.delete(user).where(inArray(user.id, userIds));
  await app.close();
});

describe('konsol staf platform', () => {
  it('pengguna biasa dan anggota sekolah ditolak', async () => {
    const f = await activatedFoundation('biasa');
    expect((await get('/v1/platform/foundations', '')).statusCode).toBe(401);
    expect((await get('/v1/platform/foundations', f.owner.cookie)).statusCode).toBe(403);
    expect((await get('/v1/platform/audit', f.owner.cookie)).statusCode).toBe(403);
  });

  it('staf read_only boleh melihat tetapi tidak boleh mengubah', async () => {
    const f = await activatedFoundation('baca');
    const staff = await makeUser('staf-baca');
    await app.platformDb.insert(platformStaff).values({ userId: staff.id, role: 'read_only' });

    expect((await get('/v1/platform/me', staff.cookie)).json()).toEqual({ role: 'read_only' });
    const list = (
      await get(`/v1/platform/foundations?q=${encodeURIComponent('Yayasan baca')}`, staff.cookie)
    ).json();
    expect(list).toHaveLength(1);
    expect(list[0].schools).toHaveLength(2);
    expect(list[0].subscription.status).toBe('active');

    const detail = (await get(`/v1/platform/foundations/${f.foundationId}`, staff.cookie)).json();
    expect(detail.invoices[0].kind).toBe('registration');
    expect(detail.payments[0].provider).toBe('dev');
    expect(detail.modules.map((m: { moduleKey: string }) => m.moduleKey).sort()).toEqual([
      'administration',
      'attendance',
      'internship',
    ]);

    const blocked = await post(`/v1/platform/schools/${f.smp}/suspend`, staff.cookie, { reason: 'uji coba' });
    expect(blocked.statusCode).toBe(403);
  });

  it('admin menangguhkan dan mengaktifkan kembali unit, dan sekolah langsung terpengaruh', async () => {
    const f = await activatedFoundation('tangguh');
    const staff = await makeUser('staf-admin');
    await app.platformDb.insert(platformStaff).values({ userId: staff.id, role: 'admin' });

    expect((await get('/v1/academic-years', f.owner.cookie, f.smp)).statusCode).toBe(200);
    expect(
      (await post(`/v1/platform/schools/${f.smp}/suspend`, staff.cookie, { reason: 'pelanggaran ketentuan' }))
        .statusCode,
    ).toBe(200);
    const blocked = await get('/v1/academic-years', f.owner.cookie, f.smp);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('school_suspended');
    // Unit lain di yayasan yang sama tidak ikut terdampak.
    expect((await get('/v1/academic-years', f.owner.cookie, f.smk)).statusCode).toBe(200);

    expect(
      (await post(`/v1/platform/schools/${f.smp}/reactivate`, staff.cookie, { reason: 'sudah dibereskan' }))
        .statusCode,
    ).toBe(200);
    expect((await get('/v1/academic-years', f.owner.cookie, f.smp)).statusCode).toBe(200);

    const audit = (await get('/v1/platform/audit?limit=200', staff.cookie)).json();
    const actions = audit
      .filter((a: { schoolId: string | null }) => a.schoolId === f.smp)
      .map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['school.suspended', 'school.reactivated']));
  });

  it('alasan wajib diisi', async () => {
    const staff = await makeUser('staf-alasan');
    await app.platformDb.insert(platformStaff).values({ userId: staff.id, role: 'admin' });
    const res = await post(`/v1/platform/schools/${crypto.randomUUID()}/suspend`, staff.cookie, {
      reason: '',
    });
    expect(res.statusCode).toBe(400);
  });

  it('aktivasi komplimen untuk sekolah pilot, dicatat di riwayat dan tidak bisa diulang', async () => {
    const owner = await makeUser('pilot');
    const staff = await makeUser('staf-pilot');
    await app.platformDb.insert(platformStaff).values({ userId: staff.id, role: 'admin' });
    const created = (
      await post('/v1/registrations', owner.cookie, {
        foundationName: 'Yayasan pilot',
        period: 'monthly',
        units: [{ name: 'SMP IT Pilot', slug: `smp-pilot-${run}`, modules: ['attendance'], tier: 't300' }],
      })
    ).json();

    const pending = (await get('/v1/platform/registrations/pending', staff.cookie)).json();
    expect(pending.some((r: { id: string }) => r.id === created.registrationId)).toBe(true);

    const res = await post(
      `/v1/platform/registrations/${created.registrationId}/complimentary`,
      staff.cookie,
      { reason: 'pilot Miftahul Huda' },
    );
    expect(res.statusCode).toBe(200);
    const reg = (await get(`/v1/registrations/${created.registrationId}`, owner.cookie)).json();
    expect(reg.status).toBe('paid');
    expect(reg.schools).toHaveLength(1);

    const pay0 = await app.platformDb.execute<{ provider: string; amount: number }>(
      sql`select provider, amount from payment where invoice_id = ${created.invoiceId}`,
    );
    expect(pay0.rows[0]).toEqual({ provider: 'complimentary', amount: 0 });
    expect(
      (
        await post(`/v1/platform/registrations/${created.registrationId}/complimentary`, staff.cookie, {
          reason: 'ulang',
        })
      ).statusCode,
    ).toBe(409);
  });
});

describe('siklus langganan', () => {
  it('invoice perpanjangan dibuat sekali menjelang jatuh tempo, sesuai modul dan tingkat yang aktif', async () => {
    const f = await activatedFoundation('renew');
    await setPeriodEnd(f.foundationId, `now() + interval '3 days'`);

    expect(await createRenewalInvoices(app.platformDb, provider)).toBeGreaterThanOrEqual(1);
    const inv = await renewalInvoice(f.foundationId);
    // SMP: inti + absensi. SMK: inti + tingkat 800 + PKL + administrasi (syarat PKL).
    expect(inv?.amount).toBe(150_000 + 100_000 + (150_000 + 100_000 + 50_000 + 50_000));
    expect(inv?.status).toBe('open');

    const before = (
      await app.platformDb.execute<{ n: string }>(
        sql`select count(*)::text as n from invoice where foundation_id = ${f.foundationId} and registration_id is null`,
      )
    ).rows[0]?.n;
    await createRenewalInvoices(app.platformDb, provider);
    const after = (
      await app.platformDb.execute<{ n: string }>(
        sql`select count(*)::text as n from invoice where foundation_id = ${f.foundationId} and registration_id is null`,
      )
    ).rows[0]?.n;
    expect(after).toBe(before);

    const mail = await app.platformDb
      .select()
      .from(outbox)
      .where(
        sql`${outbox.payload}->>'subject' = 'Tagihan perpanjangan Edusync' and ${outbox.payload}->>'to' = ${f.owner.email}`,
      );
    expect(mail).toHaveLength(1);
  });

  it('langganan yang masih lama belum ditagih', async () => {
    const f = await activatedFoundation('jauh');
    await createRenewalInvoices(app.platformDb, provider);
    expect(await renewalInvoice(f.foundationId)).toBeUndefined();
  });

  it('membayar perpanjangan menyambung dari akhir periode, bukan dari hari bayar', async () => {
    const f = await activatedFoundation('sambung');
    await setPeriodEnd(f.foundationId, `now() + interval '3 days'`);
    await createRenewalInvoices(app.platformDb, provider);
    const inv = await renewalInvoice(f.foundationId);
    const before = (
      await app.platformDb.execute<{ t: Date }>(
        sql`select current_period_end as t from subscription where foundation_id = ${f.foundationId}`,
      )
    ).rows[0]?.t as Date;

    expect(await pay(inv?.provider_ref as string, inv?.amount as number, 'ren-sambung')).toBe('renewed');
    const sub = (
      await app.platformDb.execute<{ t: Date; status: string }>(
        sql`select current_period_end as t, status from subscription where foundation_id = ${f.foundationId}`,
      )
    ).rows[0];
    const expected = new Date(before);
    expected.setUTCMonth(expected.getUTCMonth() + 1);
    expect(new Date(sub?.t as Date).getTime()).toBe(expected.getTime());
    expect(sub?.status).toBe('active');
    expect((await renewalInvoice(f.foundationId))?.status).toBe('paid');
  });

  it('lewat jatuh tempo masuk masa tenggang, lewat tenggang ditangguhkan, bayar membuka kembali', async () => {
    const f = await activatedFoundation('telat');
    const status = async () =>
      (
        await app.platformDb.execute<{ status: string }>(
          sql`select status from subscription where foundation_id = ${f.foundationId}`,
        )
      ).rows[0]?.status;

    await setPeriodEnd(f.foundationId, `now() - interval '2 days'`);
    await sweepSubscriptions(app.platformDb);
    expect(await status()).toBe('past_due');
    // Masa tenggang: sekolah masih bisa dipakai.
    expect((await get('/v1/academic-years', f.owner.cookie, f.smp)).statusCode).toBe(200);

    await setPeriodEnd(f.foundationId, `now() - interval '9 days'`);
    await sweepSubscriptions(app.platformDb);
    expect(await status()).toBe('suspended');
    const blocked = await get('/v1/academic-years', f.owner.cookie, f.smp);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('school_suspended');

    await createRenewalInvoices(app.platformDb, provider);
    const inv = await renewalInvoice(f.foundationId);
    expect(await pay(inv?.provider_ref as string, inv?.amount as number, 'ren-telat')).toBe('renewed');
    expect(await status()).toBe('active');
    expect((await get('/v1/academic-years', f.owner.cookie, f.smp)).statusCode).toBe(200);
    expect((await get('/v1/academic-years', f.owner.cookie, f.smk)).statusCode).toBe(200);
  });

  it('penangguhan oleh staf tidak dilepas oleh pembayaran perpanjangan', async () => {
    const f = await activatedFoundation('staf');
    const staff = await makeUser('staf-kunci');
    await app.platformDb.insert(platformStaff).values({ userId: staff.id, role: 'admin' });
    await post(`/v1/platform/schools/${f.smk}/suspend`, staff.cookie, { reason: 'investigasi' });

    await setPeriodEnd(f.foundationId, `now() - interval '9 days'`);
    await sweepSubscriptions(app.platformDb);
    await createRenewalInvoices(app.platformDb, provider);
    const inv = await renewalInvoice(f.foundationId);
    await pay(inv?.provider_ref as string, inv?.amount as number, 'ren-staf');

    expect((await get('/v1/academic-years', f.owner.cookie, f.smp)).statusCode).toBe(200);
    const stillBlocked = await get('/v1/academic-years', f.owner.cookie, f.smk);
    expect(stillBlocked.statusCode).toBe(403);
  });

  it('webhook perpanjangan yang dikirim ulang tidak memperpanjang dua kali', async () => {
    const f = await activatedFoundation('ganda');
    await setPeriodEnd(f.foundationId, `now() + interval '2 days'`);
    await createRenewalInvoices(app.platformDb, provider);
    const inv = await renewalInvoice(f.foundationId);
    expect(await pay(inv?.provider_ref as string, inv?.amount as number, 'ren-ganda')).toBe('renewed');
    expect(await pay(inv?.provider_ref as string, inv?.amount as number, 'ren-ganda')).toBe('duplicate');
    expect(await pay(inv?.provider_ref as string, inv?.amount as number, 'ren-ganda-2')).toBe('duplicate');
  });
});
