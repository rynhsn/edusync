import { signDevEvent } from '@edusync/billing';
import { inArray, outbox, sql, user } from '@edusync/db';
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
const env = loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' });
const json = { origin, 'content-type': 'application/json' };

let app: Awaited<ReturnType<typeof buildApp>>;
const userIds: string[] = [];
let owner: { id: string; cookie: string };
let stranger: { cookie: string };
let foundationId: string;
let schoolId: string;

const ids = (xs: string[]) =>
  sql.join(
    xs.map((x) => sql`${x}`),
    sql`, `,
  );

async function makeUser(label: string) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: `Pemilik ${label}`, email, password } });
  userIds.push(res.user.id);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return { id: res.user.id, cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join('; ') };
}

const post = (cookie: string, url: string, payload?: object) =>
  app.inject({ method: 'POST', url, headers: { ...json, cookie }, payload: payload ?? {} });

/** Bayar invoice lewat jalur webhook yang sama dengan produksi. */
async function pay(invoiceId: string, eventId = `evt-${Math.random().toString(36).slice(2)}`) {
  const res = await app.platformDb.execute<{ provider_ref: string; amount: number }>(
    sql`select provider_ref, amount from invoice where id = ${invoiceId}`,
  );
  const row = res.rows[0] as { provider_ref: string; amount: number };
  const event = { eventId, orderId: row.provider_ref, status: 'paid' as const, amount: row.amount };
  const r = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/payments/dev',
    headers: json,
    payload: { ...event, signature: signDevEvent(env.PAYMENT_DEV_SECRET, event) },
  });
  return { ...r.json(), eventId };
}

const modulesOf = async (sid: string) =>
  (
    await app.platformDb.execute<{ module_key: string; valid_until: Date }>(
      sql`select module_key, valid_until from entitlement where school_id = ${sid} order by module_key`,
    )
  ).rows;
const tierOf = async (sid: string) =>
  (
    await app.platformDb.execute<{ student_tier: string }>(
      sql`select student_tier from school where id = ${sid}`,
    )
  ).rows[0]?.student_tier;

beforeAll(async () => {
  app = await buildApp(env);
  await app.ready();
  owner = await makeUser('own');
  stranger = await makeUser('oth');

  const reg = await post(owner.cookie, '/v1/registrations', {
    foundationName: `Yayasan Uji ${run}`,
    period: 'monthly',
    units: [{ name: 'SMP Uji Satu', slug: `unit-a-${run}`, modules: ['attendance', 'grades'], tier: 't300' }],
  });
  expect(reg.statusCode).toBe(201);
  expect((await pay(reg.json().invoiceId)).outcome).toBe('activated');
  const account = await app.inject({ method: 'GET', url: '/v1/account', headers: { cookie: owner.cookie } });
  const f = account.json().foundations[0];
  foundationId = f.id;
  schoolId = f.schools[0].id;
});

afterAll(async () => {
  const db = app.platformDb;
  const F = foundationId ? [foundationId] : [];
  if (F.length > 0) {
    const regIds = sql`(select id from registration where user_id in (${ids(userIds)}))`;
    const invIds = sql`(select id from invoice where foundation_id = ${foundationId} or registration_id in ${regIds})`;
    await db.execute(sql`delete from payment where invoice_id in ${invIds}`);
    await db.execute(sql`delete from change_order where foundation_id = ${foundationId}`);
    await db.execute(sql`delete from invoice where id in ${invIds}`);
    await db.execute(sql`delete from slug_reservation where registration_id in ${regIds}`);
  }
  const schoolIds = (
    await db.execute<{ id: string }>(sql`select id from school where slug like ${`%-${run}`}`)
  ).rows.map((r) => r.id);
  await db.delete(outbox).where(sql`${outbox.payload}->>'to' like ${`%-${run}@example.test`}`);
  for (const sid of schoolIds) {
    for (const table of ['entitlement', 'audit_log', 'member_role', 'role_permission', 'member', 'role']) {
      await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
  }
  await db.execute(sql`delete from school where slug like ${`%-${run}`}`);
  if (F.length > 0) {
    await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
    await db.execute(sql`update registration set foundation_id = null where foundation_id = ${foundationId}`);
  }
  if (userIds.length > 0) await db.execute(sql`delete from registration where user_id in (${ids(userIds)})`);
  if (F.length > 0) {
    await db.execute(sql`delete from foundation_owner where foundation_id = ${foundationId}`);
    await db.execute(sql`delete from foundation where id = ${foundationId}`);
  }
  if (userIds.length > 0) await db.delete(user).where(inArray(user.id, userIds));
  await app.close();
});

describe('tingkatkan paket / tambah modul', () => {
  it('menghitung prorata dengan harga katalog server, modul syarat ikut, tanpa menyimpan', async () => {
    const res = await post(owner.cookie, `/v1/account/units/${schoolId}/change-quote`, {
      modules: ['attendance', 'grades', 'parent_portal', 'internship'],
      tier: 't300',
    });
    expect(res.statusCode).toBe(200);
    const q = res.json();
    expect(q.addModules).toEqual(['administration', 'internship', 'parent_portal']);
    expect(q.fraction).toBeGreaterThan(0.99);
    const portal = q.lines.find((l: { key: string }) => l.key === 'parent_portal');
    expect(portal.amount).toBe(Math.round(50_000 * q.fraction));
    expect(q.total).toBe(q.lines.reduce((s: number, l: { amount: number }) => s + l.amount, 0));
    expect((await modulesOf(schoolId)).map((m) => m.module_key)).toEqual(['attendance', 'grades']);
  });

  it('modul syarat otomatis ditambahkan dan modul tak dikenal ditolak', async () => {
    const need = await post(owner.cookie, `/v1/account/units/${schoolId}/change-quote`, {
      modules: ['attendance', 'grades', 'internship'],
      tier: 't300',
    });
    expect(need.json().addModules).toEqual(['administration', 'internship']);
    const bad = await post(owner.cookie, `/v1/account/units/${schoolId}/change-quote`, {
      modules: ['attendance', 'grades', 'tidak-ada'],
      tier: 't300',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('invalid_selection');
    const same = await post(owner.cookie, `/v1/account/units/${schoolId}/change-quote`, {
      modules: ['attendance', 'grades'],
      tier: 't300',
    });
    expect(same.json().error.code).toBe('no_change');
  });

  it('bukan pemilik tidak bisa melihat atau mengubah unit', async () => {
    const res = await post(stranger.cookie, `/v1/account/units/${schoolId}/change`, {
      modules: ['attendance', 'grades', 'schedule'],
      tier: 't300',
    });
    expect(res.statusCode).toBe(404);
    const anon = await app.inject({
      method: 'POST',
      url: `/v1/account/units/${schoolId}/change`,
      headers: json,
      payload: { modules: [], tier: 't300' },
    });
    expect(anon.statusCode).toBe(401);
  });

  it('naik berlaku setelah bayar, idempoten saat webhook diulang', async () => {
    const res = await post(owner.cookie, `/v1/account/units/${schoolId}/change`, {
      modules: ['attendance', 'grades', 'schedule'],
      tier: 't800',
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.invoiceId).toBeTruthy();
    expect(body.paymentUrl).toContain('/pay/upg-');
    // Belum bayar: belum ada perubahan.
    expect((await modulesOf(schoolId)).map((m) => m.module_key)).toEqual(['attendance', 'grades']);
    expect(await tierOf(schoolId)).toBe('t300');

    const paid = await pay(body.invoiceId);
    expect(paid.outcome).toBe('upgraded');
    expect((await modulesOf(schoolId)).map((m) => m.module_key)).toEqual([
      'attendance',
      'grades',
      'schedule',
    ]);
    expect(await tierOf(schoolId)).toBe('t800');

    expect((await pay(body.invoiceId, paid.eventId)).outcome).toBe('duplicate');
    expect((await pay(body.invoiceId)).outcome).toBe('duplicate');
    expect((await modulesOf(schoolId)).length).toBe(3);

    const account = await app.inject({
      method: 'GET',
      url: '/v1/account',
      headers: { cookie: owner.cookie },
    });
    const inv = account.json().foundations[0].invoices.find((i: { id: string }) => i.id === body.invoiceId);
    expect(inv.kind).toBe('upgrade');
    expect(inv.status).toBe('paid');
  });

  it('penurunan dijadwalkan ke periode berikutnya lalu diterapkan saat perpanjangan', async () => {
    const before = await modulesOf(schoolId);
    const oldEnd = new Date(before.find((m) => m.module_key === 'schedule')?.valid_until as Date);

    const res = await post(owner.cookie, `/v1/account/units/${schoolId}/change`, {
      modules: ['attendance', 'grades'],
      tier: 't300',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ invoiceId: null, amount: 0, scheduled: true });
    // Belum berubah sampai periode berikutnya.
    expect((await modulesOf(schoolId)).length).toBe(3);
    expect(await tierOf(schoolId)).toBe('t800');
    const account = await app.inject({
      method: 'GET',
      url: '/v1/account',
      headers: { cookie: owner.cookie },
    });
    expect(account.json().foundations[0].schools[0].scheduled).toEqual({
      removeModules: ['schedule'],
      tier: 't300',
    });

    // Tagihan perpanjangan memuat paket periode berikutnya.
    const renew = await post(owner.cookie, `/v1/account/foundations/${foundationId}/renewal`);
    expect(renew.statusCode).toBe(200);
    const lines = (
      await app.platformDb.execute<{ lines: { key: string }[] }>(
        sql`select lines from invoice where id = ${renew.json().invoiceId}`,
      )
    ).rows[0]?.lines as { key: string }[];
    expect(lines.map((l) => l.key).sort()).toEqual(['attendance', 'core', 'grades']);
    // Diminta lagi: tagihan yang sama.
    expect(
      (await post(owner.cookie, `/v1/account/foundations/${foundationId}/renewal`)).json().invoiceId,
    ).toBe(renew.json().invoiceId);

    expect((await pay(renew.json().invoiceId)).outcome).toBe('renewed');
    const after = await modulesOf(schoolId);
    const schedule = after.find((m) => m.module_key === 'schedule');
    const attendance = after.find((m) => m.module_key === 'attendance');
    expect(new Date(schedule?.valid_until as Date).getTime()).toBe(oldEnd.getTime());
    expect(new Date(attendance?.valid_until as Date).getTime()).toBeGreaterThan(oldEnd.getTime());
    expect(await tierOf(schoolId)).toBe('t300');
  });
});

describe('tambah unit sekolah', () => {
  const newUnit = (slug: string) => ({
    name: 'SMK Uji Dua',
    slug,
    modules: ['attendance', 'parent_portal'],
    tier: 't300',
  });

  it('menghitung biaya prorata dan menolak subdomain terpakai', async () => {
    const q = await post(
      owner.cookie,
      `/v1/account/foundations/${foundationId}/units/quote`,
      newUnit(`unit-b-${run}`),
    );
    expect(q.statusCode).toBe(200);
    expect(q.json().total).toBeGreaterThan(0);
    expect(q.json().modules.sort()).toEqual(['attendance', 'parent_portal']);

    const taken = await post(
      owner.cookie,
      `/v1/account/foundations/${foundationId}/units`,
      newUnit(`unit-a-${run}`),
    );
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error.code).toBe('slug_taken');

    const other = await post(
      stranger.cookie,
      `/v1/account/foundations/${foundationId}/units`,
      newUnit(`unit-b-${run}`),
    );
    expect(other.statusCode).toBe(404);
  });

  it('setelah lunas unit dibuat lengkap dan tersambung ke langganan yayasan', async () => {
    const slug = `unit-b-${run}`;
    const res = await post(owner.cookie, `/v1/account/foundations/${foundationId}/units`, newUnit(slug));
    expect(res.statusCode).toBe(201);
    const { registrationId, invoiceId } = res.json();

    // Subdomain tertahan oleh pesanan ini.
    const avail = await app.inject(`/v1/slugs/${slug}/availability`);
    expect(avail.json().status).toBe('taken');
    const none = await app.platformDb.execute(sql`select 1 from school where slug = ${slug}`);
    expect(none.rows.length).toBe(0);

    expect((await pay(invoiceId)).outcome).toBe('activated');
    expect((await pay(invoiceId)).outcome).toBe('duplicate');

    const [s] = (
      await app.platformDb.execute<{ id: string; foundation_id: string; student_tier: string }>(
        sql`select id, foundation_id, student_tier from school where slug = ${slug}`,
      )
    ).rows;
    expect(s?.foundation_id).toBe(foundationId);
    const sub = (
      await app.platformDb.execute<{ id: string; current_period_end: Date }>(
        sql`select id, current_period_end from subscription where foundation_id = ${foundationId}`,
      )
    ).rows[0];
    const ents = await modulesOf(s?.id as string);
    expect(ents.map((e) => e.module_key)).toEqual(['attendance', 'parent_portal']);
    expect(new Date(ents[0]?.valid_until as Date).getTime()).toBe(
      new Date(sub?.current_period_end as Date).getTime(),
    );
    const admins = await app.platformDb.execute(
      sql`select 1 from member m join member_role mr on mr.member_id = m.id join role r on r.id = mr.role_id
          where m.school_id = ${s?.id} and m.user_id = ${owner.id} and r.key = 'school_admin'`,
    );
    expect(admins.rows.length).toBe(1);

    const status = await app.inject({
      method: 'GET',
      url: `/v1/registrations/${registrationId}`,
      headers: { cookie: owner.cookie },
    });
    expect(status.json().status).toBe('paid');
    const account = await app.inject({
      method: 'GET',
      url: '/v1/account',
      headers: { cookie: owner.cookie },
    });
    const f = account.json().foundations[0];
    expect(f.schools.length).toBe(2);
    expect(f.invoices.find((i: { id: string }) => i.id === invoiceId).kind).toBe('new_unit');
  });
});

describe('pemilik yayasan', () => {
  it('daftar pemilik hanya untuk sesama pemilik', async () => {
    const ok = await app.inject({
      method: 'GET',
      url: `/v1/account/foundations/${foundationId}/owners`,
      headers: { cookie: owner.cookie },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().owners.map((o: { userId: string }) => o.userId)).toEqual([owner.id]);
    const no = await app.inject({
      method: 'GET',
      url: `/v1/account/foundations/${foundationId}/owners`,
      headers: { cookie: stranger.cookie },
    });
    expect(no.statusCode).toBe(404);
  });
});
