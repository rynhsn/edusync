import { signDevEvent } from '@edusync/billing';
import {
  assignRoles,
  entitlement,
  eq,
  foundation,
  inArray,
  member,
  outbox,
  school,
  seedSchoolRoles,
  sql,
  subscription,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { testNpsn } from './npsn-lib';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/**
 * NPSN pada pendaftaran, aktivasi, dan identitas sekolah; NUPTK opsional pada guru (buat, ubah, impor).
 * Tidak bergantung pada harga katalog: hanya memeriksa status dan data yang tersimpan.
 */
const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const json = { origin, 'content-type': 'application/json' };
const env = loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' });

let app: Awaited<ReturnType<typeof buildApp>>;
const userIds: string[] = [];
let foundationId = '';
let schoolId = '';
let otherSchoolId = '';
let adminCookie = '';
let principalCookie = '';
const ownNpsn = testNpsn();
const otherNpsn = testNpsn();
const slug = `npn-${run}`;

const ids = (xs: string[]) =>
  sql.join(
    xs.map((x) => sql`${x}`),
    sql`, `,
  );

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
  return { id: res.user.id, cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join('; ') };
}

async function join(label: string, roles: string[]) {
  const u = await makeUser(label);
  const [m] = await app.platformDb.insert(member).values({ userId: u.id, schoolId }).returning();
  await assignRoles(app.platformDb, m!.id, schoolId, roles);
  return u.cookie;
}

const unit = (key: string, over: Record<string, unknown> = {}) => ({
  name: 'SMP Uji NPSN',
  slug: `${key}-${run}`,
  npsn: testNpsn(),
  educationProfile: 'smp',
  modules: ['attendance'],
  tier: 't300',
  ...over,
});

const register = (cookie: string, units: object[]) =>
  app.inject({
    method: 'POST',
    url: '/v1/registrations',
    headers: { ...json, cookie },
    payload: { foundationName: `Yayasan NPSN ${run}`, period: 'monthly', units },
  });

const school$ = (method: 'GET' | 'POST' | 'PUT', url: string, cookie: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: { cookie, 'x-school-id': schoolId, ...(payload ? json : { origin }) },
    ...(payload ? { payload } : {}),
  });

beforeAll(async () => {
  app = await buildApp(env);
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan NPSN Uji', slug: `ynp-${run}` })
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
  // Sekolah uji tanpa NPSN (sekolah lama) dan sekolah lain yang sudah punya NPSN.
  const [s] = await db
    .insert(school)
    .values({ foundationId, slug, name: `Sekolah ${slug}` })
    .returning();
  schoolId = s!.id;
  const [o] = await db
    .insert(school)
    .values({ foundationId, slug: `${slug}-lain`, name: `Sekolah lain ${run}`, npsn: otherNpsn })
    .returning();
  otherSchoolId = o!.id;
  for (const sid of [schoolId, otherSchoolId]) {
    await seedSchoolRoles(db, sid);
    await db.insert(entitlement).values({
      schoolId: sid,
      moduleKey: 'administration',
      subscriptionId: sub!.id,
      validUntil: sub!.currentPeriodEnd,
    });
  }
  adminCookie = await join('admin-npsn', ['school_admin']);
  principalCookie = await join('kepsek-npsn', ['principal']);
});

afterAll(async () => {
  const db = app.platformDb;
  const regSchools = (
    await db.execute<{ id: string; foundation_id: string }>(
      sql`select id, foundation_id from school where slug like ${`%-${run}`}`,
    )
  ).rows;
  const regSchoolIds = regSchools.map((r) => r.id);
  const regFoundationIds = [...new Set(regSchools.map((r) => r.foundation_id))];
  if (userIds.length > 0) {
    await db.execute(
      sql`delete from payment where invoice_id in (select i.id from invoice i join registration r on r.id = i.registration_id where r.user_id in (${ids(userIds)}))`,
    );
    await db.execute(
      sql`delete from invoice where registration_id in (select id from registration where user_id in (${ids(userIds)}))`,
    );
    await db.delete(outbox).where(sql`${outbox.payload}->>'to' like ${`%-${run}@example.test`}`);
  }
  for (const sid of [...regSchoolIds, schoolId, otherSchoolId]) {
    for (const table of [
      'entitlement',
      'audit_log',
      'teacher',
      'member_role',
      'role_permission',
      'member',
      'role',
      'school_identity',
    ]) {
      await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
  }
  await db.execute(
    sql`delete from school where slug like ${`%-${run}`} or id in (${ids([schoolId, otherSchoolId])})`,
  );
  const allFoundations = [...regFoundationIds, foundationId];
  await db.execute(sql`delete from subscription where foundation_id in (${ids(allFoundations)})`);
  await db.execute(
    sql`update registration set foundation_id = null where foundation_id in (${ids(allFoundations)})`,
  );
  if (userIds.length > 0) await db.execute(sql`delete from registration where user_id in (${ids(userIds)})`);
  await db.execute(sql`delete from foundation_owner where foundation_id in (${ids(allFoundations)})`);
  await db.execute(sql`delete from foundation where id in (${ids(allFoundations)})`);
  if (userIds.length > 0) await db.delete(user).where(inArray(user.id, userIds));
  await app.close();
});

describe('NPSN pada pendaftaran', () => {
  it('NPSN wajib ada', async () => {
    const owner = await makeUser('reg-wajib');
    const { npsn: _omit, ...noNpsn } = unit('wajib');
    const res = await register(owner.cookie, [noNpsn]);
    expect(res.statusCode).toBe(400);
  });

  it('menolak format salah dengan kode invalid_npsn', async () => {
    const owner = await makeUser('reg-format');
    for (const bad of ['1234567', '123456789', 'abcdefgh', '1234567a', '']) {
      const res = await register(owner.cookie, [unit('format', { npsn: bad })]);
      expect(res.statusCode, bad).toBe(400);
      expect(res.json().error.code, bad).toBe('invalid_npsn');
    }
  });

  it('menolak NPSN yang sama dua kali dalam satu pendaftaran', async () => {
    const owner = await makeUser('reg-ganda');
    const npsn = testNpsn();
    const res = await register(owner.cookie, [
      unit('ganda-a', { npsn }),
      unit('ganda-b', { npsn: ` ${npsn.slice(0, 4)} ${npsn.slice(4)} ` }),
    ]);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('npsn_duplicate');
  });

  it('menolak NPSN yang sudah dipakai sekolah lain', async () => {
    const owner = await makeUser('reg-sekolah');
    const res = await register(owner.cookie, [unit('sekolah', { npsn: otherNpsn })]);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('npsn_taken');
    expect(res.json().error.message).toBe(
      'NPSN ini sudah terdaftar di Edusync. Hubungi dukungan bila ini sekolah Anda.',
    );
  });

  it('menolak NPSN yang ditahan pendaftaran lain yang menunggu bayar; kedaluwarsa dilepas; milik sendiri menggantikan', async () => {
    const a = await makeUser('reg-tahan-a');
    const b = await makeUser('reg-tahan-b');
    const npsn = testNpsn();
    const first = await register(a.cookie, [unit('tahan-a', { npsn })]);
    expect(first.statusCode).toBe(201);

    const blocked = await register(b.cookie, [unit('tahan-b', { npsn })]);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('npsn_taken');

    // Pemilik pesanan boleh mendaftar ulang dengan NPSN yang sama (pesanan lama digantikan).
    const again = await register(a.cookie, [unit('tahan-a', { npsn })]);
    expect(again.statusCode).toBe(201);

    // Pesanan yang sudah kedaluwarsa tidak menahan NPSN lagi.
    await app.platformDb.execute(
      sql`update registration set expires_at = now() - interval '1 hour' where id = ${again.json().registrationId}`,
    );
    const free = await register(b.cookie, [unit('tahan-b', { npsn })]);
    expect(free.statusCode).toBe(201);
  });

  it('NPSN dirapikan, tampil di status pendaftaran, lalu disalin ke sekolah saat aktivasi', async () => {
    const owner = await makeUser('reg-aktif');
    const npsn = testNpsn();
    const spaced = `${npsn.slice(0, 4)} ${npsn.slice(4)}`;
    const res = await register(owner.cookie, [unit('aktif', { npsn: spaced })]);
    expect(res.statusCode).toBe(201);
    const created = res.json();

    const pending = (
      await app.inject({
        url: `/v1/registrations/${created.registrationId}`,
        headers: { cookie: owner.cookie },
      })
    ).json();
    expect(pending.units).toEqual([{ name: 'SMP Uji NPSN', slug: `aktif-${run}`, npsn }]);
    expect(pending.schools).toEqual([]);

    const inv = (
      await app.platformDb.execute<{ provider_ref: string; amount: number }>(
        sql`select provider_ref, amount from invoice where registration_id = ${created.registrationId}`,
      )
    ).rows[0]!;
    const event = {
      eventId: `evt-npsn-${run}`,
      orderId: inv.provider_ref,
      status: 'paid',
      amount: inv.amount,
    };
    const paid = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/payments/dev',
      headers: json,
      payload: {
        ...event,
        signature: signDevEvent(env.PAYMENT_DEV_SECRET, event as Parameters<typeof signDevEvent>[1]),
      },
    });
    expect(paid.json().outcome).toBe('activated');

    const [created$] = (
      await app.platformDb.execute<{ npsn: string | null }>(
        sql`select npsn from school where slug = ${`aktif-${run}`}`,
      )
    ).rows;
    expect(created$?.npsn).toBe(npsn);
    const after = (
      await app.inject({
        url: `/v1/registrations/${created.registrationId}`,
        headers: { cookie: owner.cookie },
      })
    ).json();
    expect(after.schools[0].npsn).toBe(npsn);

    // Setelah aktif, NPSN itu terpakai sekolah dan pendaftaran baru ditolak.
    const other = await makeUser('reg-aktif-lain');
    const taken = await register(other.cookie, [unit('aktif-lain', { npsn })]);
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error.code).toBe('npsn_taken');
  });
});

describe('NPSN pada identitas sekolah', () => {
  it('sekolah lama tanpa NPSN tetap valid (null)', async () => {
    const res = await school$('GET', '/v1/school/identity', adminCookie);
    expect(res.statusCode).toBe(200);
    expect(res.json().npsn).toBeNull();
    // Menyimpan identitas tanpa npsn tidak menyentuh dan tidak mewajibkannya.
    const save = await school$('PUT', '/v1/school/identity', adminCookie, { city: 'Bandung' });
    expect(save.statusCode).toBe(200);
    expect(save.json().npsn).toBeNull();
  });

  it('hanya pemegang school:manage yang boleh mengisi', async () => {
    const res = await school$('PUT', '/v1/school/identity', principalCookie, { npsn: ownNpsn });
    expect(res.statusCode).toBe(403);
  });

  it('admin mengisi NPSN, format salah dan NPSN sekolah lain ditolak', async () => {
    const bad = await school$('PUT', '/v1/school/identity', adminCookie, { npsn: '12ab' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('invalid_npsn');

    const taken = await school$('PUT', '/v1/school/identity', adminCookie, { npsn: otherNpsn });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error.code).toBe('npsn_taken');

    const ok = await school$('PUT', '/v1/school/identity', adminCookie, {
      npsn: `${ownNpsn.slice(0, 4)}-${ownNpsn.slice(4)}`,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().npsn).toBe(ownNpsn);
    expect((await school$('GET', '/v1/school/identity', principalCookie)).json().npsn).toBe(ownNpsn);

    const audit = await app.platformDb.execute<{ details: { npsnFrom: string | null; npsnTo: string } }>(
      sql`select details from audit_log where school_id = ${schoolId} and action = 'school.npsn_update'`,
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.details).toMatchObject({ npsnFrom: null, npsnTo: ownNpsn });
  });

  it('menyimpan ulang NPSN sendiri tidak bentrok; tanpa npsn tidak mengubahnya; mengganti dicatat', async () => {
    const same = await school$('PUT', '/v1/school/identity', adminCookie, { npsn: ownNpsn });
    expect(same.statusCode).toBe(200);
    const keep = await school$('PUT', '/v1/school/identity', adminCookie, { city: 'Cimahi' });
    expect(keep.json().npsn).toBe(ownNpsn);

    const next = testNpsn();
    const changed = await school$('PUT', '/v1/school/identity', adminCookie, { npsn: next });
    expect(changed.json().npsn).toBe(next);
    const audit = await app.platformDb.execute<{ details: { npsnFrom: string | null; npsnTo: string } }>(
      sql`select details from audit_log where school_id = ${schoolId} and action = 'school.npsn_update' order by created_at`,
    );
    expect(audit.rows.map((r) => r.details)).toMatchObject([
      { npsnFrom: null, npsnTo: ownNpsn },
      { npsnFrom: ownNpsn, npsnTo: next },
    ]);
  });

  it('indeks unik di database menjaga NPSN tidak ganda walau lewat jalur lain', async () => {
    await expect(
      app.platformDb.update(school).set({ npsn: otherNpsn }).where(eq(school.id, schoolId)),
    ).rejects.toThrow();
    await expect(
      app.platformDb.update(school).set({ npsn: '123' }).where(eq(school.id, schoolId)),
    ).rejects.toThrow();
  });
});

describe('NUPTK guru (opsional)', () => {
  const nuptkA = `7777${run.replace(/\D/g, '').padEnd(1, '1')}`.padEnd(16, '1').slice(0, 16);
  const nuptkB = `8888${Date.now()}`.padEnd(16, '2').slice(0, 16);
  const create = (body: object) => school$('POST', '/v1/teachers', adminCookie, body);

  it('guru tanpa NUPTK tersimpan; dua guru tanpa NUPTK tidak bentrok', async () => {
    const a = await create({ name: 'Guru Honorer A' });
    const b = await create({ name: 'Guru Honorer B', nuptk: '' });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(a.json().nuptk).toBeNull();
    expect(a.json().nuptkMasked).toBeNull();
    expect(b.json().nuptk).toBeNull();
  });

  it('NUPTK dirapikan, dimasking untuk non-pengelola, dan unik per sekolah', async () => {
    const spaced = `${nuptkA.slice(0, 4)} ${nuptkA.slice(4, 8)}.${nuptkA.slice(8, 12)}-${nuptkA.slice(12)}`;
    const ok = await create({ name: 'Guru Ber-NUPTK', nuptk: spaced });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().nuptk).toBe(nuptkA);
    expect(ok.json().nuptkMasked).toBe(`${'*'.repeat(12)}${nuptkA.slice(-4)}`);

    const dup = await create({ name: 'Guru Kembar', nuptk: nuptkA });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('nuptk_taken');

    const list = (await school$('GET', '/v1/teachers', adminCookie)).json() as { nuptk: string | null }[];
    expect(list.some((t) => t.nuptk === nuptkA)).toBe(true);
    const asPrincipal = (await school$('GET', '/v1/teachers', principalCookie)).json() as {
      nuptk: string | null;
      nuptkMasked: string | null;
    }[];
    expect(asPrincipal.every((t) => t.nuptk === null)).toBe(true);
    expect(asPrincipal.some((t) => t.nuptkMasked?.endsWith(nuptkA.slice(-4)))).toBe(true);
  });

  it('menolak NUPTK yang bukan 16 angka, tanpa menghalangi guru lain', async () => {
    for (const bad of ['123', '12345678901234567', 'abcdefghijklmnop']) {
      const res = await create({ name: 'Guru Salah', nuptk: bad });
      expect(res.statusCode, bad).toBe(400);
    }
  });

  it('ubah guru: isi, ganti, dan kosongkan NUPTK', async () => {
    const created = (await create({ name: 'Guru Ubah' })).json();
    const put = (nuptk: string | null) =>
      school$('PUT', `/v1/teachers/${created.id}`, adminCookie, { name: 'Guru Ubah', nuptk });
    expect((await put(nuptkB)).json().nuptk).toBe(nuptkB);
    expect((await put(nuptkA)).json().error.code).toBe('nuptk_taken');
    expect((await put(null)).json().nuptk).toBeNull();
  });

  it('impor: kolom opsional, ganda dalam file dan yang sudah dipakai ditolak', async () => {
    const fresh = `9999${String(Date.now()).slice(-12)}`;
    const base = { dryRun: true };
    const ok = await school$('POST', '/v1/teachers/import', adminCookie, {
      ...base,
      rows: [
        { row: 2, name: 'Impor Tanpa NUPTK' },
        { row: 3, name: 'Impor Dengan NUPTK', nuptk: `${fresh.slice(0, 8)} ${fresh.slice(8)}` },
      ],
    });
    expect(ok.json()).toMatchObject({ total: 2, valid: 2, errors: [] });

    const bad = await school$('POST', '/v1/teachers/import', adminCookie, {
      ...base,
      rows: [
        { row: 2, name: 'A', nuptk: fresh },
        { row: 3, name: 'B', nuptk: fresh },
        { row: 4, name: 'C', nuptk: nuptkA },
        { row: 5, name: 'D', nuptk: '12' },
      ],
    });
    const fields = (bad.json().errors as { row: number; field: string }[]).map((e) => `${e.row}:${e.field}`);
    expect(fields).toEqual(['3:nuptk', '4:nuptk', '5:nuptk']);

    const save = await school$('POST', '/v1/teachers/import', adminCookie, {
      dryRun: false,
      rows: [{ row: 2, name: 'Impor Simpan', nuptk: fresh }],
    });
    expect(save.json().imported).toBe(1);
    const list = (await school$('GET', '/v1/teachers', adminCookie)).json() as { nuptk: string | null }[];
    expect(list.some((t) => t.nuptk === fresh)).toBe(true);
  });
});
