import {
  createPaymentProvider,
  createRenewalInvoices,
  signDevEvent,
  sweepSubscriptions,
} from '@edusync/billing';
import {
  inArray,
  invalidateBillingSettings,
  loadBillingSettings,
  outbox,
  platformStaff,
  sql,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, paymentConfig } from './app';
import { loadEnv } from './env';
import { testNpsn } from './npsn-lib';

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

const SUBJECT = {
  pastDue: 'Langganan Edusync jatuh tempo',
  suspended: 'Sekolah ditangguhkan: langganan Edusync belum diperpanjang',
  reactivated: 'Langganan Edusync aktif kembali',
};

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

/** Satu yayasan dengan satu unit (modul absensi), sudah dibayar dan aktif. */
async function activatedFoundation(label: string) {
  const owner = await makeUser(`pemilik-${label}`);
  const created = (
    await post('/v1/registrations', owner.cookie, {
      foundationName: `Yayasan ${label}`,
      period: 'monthly',
      units: [
        {
          name: 'SMP IT Contoh',
          slug: `smp-${label}-${run}`,
          npsn: testNpsn(),
          educationProfile: 'smp',
          modules: ['attendance'],
          tier: 't300',
        },
      ],
    })
  ).json();
  const { rows } = await app.platformDb.execute<{ provider_ref: string; amount: number }>(
    sql`select provider_ref, amount from invoice where registration_id = ${created.registrationId}`,
  );
  const inv = rows[0] as { provider_ref: string; amount: number };
  await pay(inv.provider_ref, inv.amount, `act-${label}`);
  const me = (await get('/v1/me', owner.cookie)).json();
  const smp = me.memberships[0] as { schoolId: string };
  const f = (
    await app.platformDb.execute<{ foundation_id: string }>(
      sql`select foundation_id from school where id = ${smp.schoolId}`,
    )
  ).rows[0] as { foundation_id: string };
  return { owner, schoolId: smp.schoolId, foundationId: f.foundation_id };
}

const setPeriodEnd = (foundationId: string, when: string) =>
  app.platformDb.execute(
    sql`update subscription set current_period_end = ${sql.raw(when)} where foundation_id = ${foundationId}`,
  );

const membership = async (cookie: string) =>
  (await get('/v1/me', cookie)).json().memberships[0] as {
    schoolStatus: string;
    suspendedReason: string | null;
    suspendedNote: string | null;
    suspendedAt: string | null;
  };

const mailCount = async (to: string, subject: string) =>
  (
    await app.platformDb
      .select()
      .from(outbox)
      .where(sql`${outbox.payload}->>'subject' = ${subject} and ${outbox.payload}->>'to' = ${to}`)
  ).length;

const renewalInvoice = async (foundationId: string) =>
  (
    await app.platformDb.execute<{ provider_ref: string; amount: number }>(
      sql`select provider_ref, amount from invoice where foundation_id = ${foundationId} and registration_id is null and status = 'open' order by created_at desc limit 1`,
    )
  ).rows[0];

beforeAll(async () => {
  app = await buildApp(env);
  await app.ready();
  invalidateBillingSettings();
});

afterAll(async () => {
  const db = app.platformDb;
  const list = (xs: string[]) =>
    sql.join(
      xs.map((x) => sql`${x}`),
      sql`, `,
    );
  const foundationIds = (
    await db.execute<{ id: string }>(
      sql`select distinct foundation_id as id from school where slug like ${`%-${run}`}`,
    )
  ).rows.map((r) => r.id);
  const schoolIds = (
    await db.execute<{ id: string }>(sql`select id from school where slug like ${`%-${run}`}`)
  ).rows.map((r) => r.id);
  await db.delete(outbox).where(sql`${outbox.payload}->>'to' like ${`%-${run}@example.test`}`);
  if (foundationIds.length > 0) {
    await db.execute(
      sql`delete from payment where invoice_id in (select id from invoice where foundation_id in (${list(foundationIds)}))`,
    );
    await db.execute(sql`delete from invoice where foundation_id in (${list(foundationIds)})`);
  }
  if (userIds.length > 0) {
    await db.execute(
      sql`delete from payment where invoice_id in (select i.id from invoice i where i.registration_id in (select id from registration where user_id in (${list(userIds)})))`,
    );
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
  if (foundationIds.length > 0) {
    await db.execute(sql`delete from foundation_owner where foundation_id in (${list(foundationIds)})`);
    await db.execute(sql`delete from foundation where id in (${list(foundationIds)})`);
  }
  if (userIds.length > 0) await db.delete(user).where(inArray(user.id, userIds));
  await app.close();
});

describe('penangguhan sekolah karena langganan', () => {
  it('status sekolah tampil di /v1/me, panggilan data ditolak, dan tiap peralihan hanya mengirim satu email', async () => {
    const f = await activatedFoundation('tahap');
    const email = f.owner.email;
    const { graceDays } = await loadBillingSettings(app.platformDb);

    expect(await membership(f.owner.cookie)).toMatchObject({ schoolStatus: 'active', suspendedReason: null });

    // Masa tenggang: email "jatuh tempo" satu kali, sekolah tetap aktif.
    await setPeriodEnd(f.foundationId, `now() - interval '1 day'`);
    await sweepSubscriptions(app.platformDb);
    await sweepSubscriptions(app.platformDb);
    expect(await mailCount(email, SUBJECT.pastDue)).toBe(1);
    expect(await mailCount(email, SUBJECT.suspended)).toBe(0);
    expect(await membership(f.owner.cookie)).toMatchObject({ schoolStatus: 'active' });
    const pastDueMail = (
      await app.platformDb
        .select()
        .from(outbox)
        .where(
          sql`${outbox.payload}->>'subject' = ${SUBJECT.pastDue} and ${outbox.payload}->>'to' = ${email}`,
        )
    )[0]?.payload as { text: string };
    expect(pastDueMail.text).toContain('Masa tenggang sampai');
    expect(pastDueMail.text).toContain(`${env.WEB_URL}/account/billing`.replace(/\/$/, ''));

    // Lewat masa tenggang: ditangguhkan, email satu kali, status terlihat tanpa panggilan tenant.
    await setPeriodEnd(f.foundationId, `now() - interval '${graceDays + 2} days'`);
    await sweepSubscriptions(app.platformDb);
    await sweepSubscriptions(app.platformDb);
    expect(await mailCount(email, SUBJECT.suspended)).toBe(1);
    expect(await mailCount(email, SUBJECT.pastDue)).toBe(1);
    expect(await membership(f.owner.cookie)).toMatchObject({
      schoolStatus: 'suspended',
      suspendedReason: 'billing',
      suspendedNote: null,
    });
    expect((await membership(f.owner.cookie)).suspendedAt).toBeTruthy();
    const blocked = await get('/v1/academic-years', f.owner.cookie, f.schoolId);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('school_suspended');

    // Bayar: dibuka kembali dan email "aktif kembali" satu kali; webhook ganda tidak menambah email.
    await createRenewalInvoices(app.platformDb, provider);
    const inv = await renewalInvoice(f.foundationId);
    expect(await pay(inv?.provider_ref as string, inv?.amount as number, 'ren-tahap')).toBe('renewed');
    await pay(inv?.provider_ref as string, inv?.amount as number, 'ren-tahap');
    expect(await mailCount(email, SUBJECT.reactivated)).toBe(1);
    expect(await membership(f.owner.cookie)).toMatchObject({
      schoolStatus: 'active',
      suspendedReason: null,
      suspendedNote: null,
      suspendedAt: null,
    });
    expect((await get('/v1/academic-years', f.owner.cookie, f.schoolId)).statusCode).toBe(200);
  });

  it('perpanjangan biasa sebelum jatuh tempo tidak mengirim email "aktif kembali"', async () => {
    const f = await activatedFoundation('awal');
    await setPeriodEnd(f.foundationId, `now() + interval '2 days'`);
    await createRenewalInvoices(app.platformDb, provider);
    const inv = await renewalInvoice(f.foundationId);
    expect(await pay(inv?.provider_ref as string, inv?.amount as number, 'ren-awal')).toBe('renewed');
    expect(await mailCount(f.owner.email, SUBJECT.reactivated)).toBe(0);
  });

  it('penangguhan oleh staf muncul sebagai alasan staff', async () => {
    const f = await activatedFoundation('staf');
    const staff = await makeUser('staf-tahan');
    await app.platformDb.insert(platformStaff).values({ userId: staff.id, role: 'admin' });
    // Alasan ditampilkan ke pengguna sekolah, jadi dibatasi 300 karakter.
    const tooLong = await post(`/v1/platform/schools/${f.schoolId}/suspend`, staff.cookie, {
      reason: 'x'.repeat(301),
    });
    expect(tooLong.statusCode).toBe(400);

    await post(`/v1/platform/schools/${f.schoolId}/suspend`, staff.cookie, { reason: 'investigasi' });
    const m = await membership(f.owner.cookie);
    expect(m).toMatchObject({
      schoolStatus: 'suspended',
      suspendedReason: 'staff',
      suspendedNote: 'investigasi',
    });
    expect(m.suspendedAt).toBeTruthy();
    // Nama staf tidak bocor ke panel sekolah.
    expect(JSON.stringify((await get('/v1/me', f.owner.cookie)).json())).not.toContain('Uji staf-tahan');

    // Portal pemilik melihat catatan dan waktu yang sama.
    const acc = (await get('/v1/account', f.owner.cookie)).json();
    const unit = acc.foundations[0].schools[0];
    expect(unit).toMatchObject({ suspendedReason: 'staff', suspendedNote: 'investigasi' });
    expect(unit.suspendedAt).toBeTruthy();

    // Konsol platform melihat catatan, waktu, dan pelaku.
    const list = (
      await get(`/v1/platform/foundations?q=${encodeURIComponent('Yayasan staf')}`, staff.cookie)
    ).json() as {
      id: string;
      schools: { id: string; suspendedNote: string | null; suspendedBy: string | null }[];
    }[];
    const row = list.flatMap((x) => x.schools).find((s) => s.id === f.schoolId);
    expect(row).toMatchObject({ suspendedNote: 'investigasi', suspendedBy: 'Uji staf-tahan' });

    // Pembayaran tidak melepas penangguhan staf; aktivasi staf mengosongkan catatan dan waktu.
    await post(`/v1/platform/schools/${f.schoolId}/reactivate`, staff.cookie, { reason: 'selesai' });
    expect(await membership(f.owner.cookie)).toMatchObject({
      schoolStatus: 'active',
      suspendedReason: null,
      suspendedNote: null,
      suspendedAt: null,
    });
  });
});
