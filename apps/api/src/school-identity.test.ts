import {
  assignRoles,
  entitlement,
  eq,
  foundation,
  member,
  school,
  schoolProfile,
  seedSchoolRoles,
  sql,
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
// PNG 1x1 valid.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let schoolId = '';
let adminCookie = '';
let teacherCookie = '';
const slug = `ident-${run}`;
const userIds: string[] = [];

async function join(label: string, roles: string[]) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  const [m] = await app.platformDb.insert(member).values({ userId: res.user.id, schoolId }).returning();
  await assignRoles(app.platformDb, m!.id, schoolId, roles);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, cookie: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: {
      cookie,
      'x-school-id': schoolId,
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
    .values({ name: 'Yayasan Identitas', slug: `yid-${run}` })
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
  const [s] = await db
    .insert(school)
    .values({ foundationId, slug, name: `Sekolah ${slug}` })
    .returning();
  schoolId = s!.id;
  await seedSchoolRoles(db, schoolId);
  await db
    .insert(entitlement)
    .values({ schoolId, moduleKey: 'website', subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
  await db.insert(schoolProfile).values({ schoolId, tagline: 'Situs', published: true });
  adminCookie = await join('admin-ident', ['school_admin']);
  teacherCookie = await join('guru-ident', ['teacher']);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const table of [
    'audit_log',
    'school_identity',
    'school_file',
    'school_profile',
    'member',
    'role',
    'entitlement',
  ]) {
    await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${schoolId}`);
  }
  await db.delete(school).where(eq(school.id, schoolId));
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('identitas sekolah', () => {
  it('kosong dulu, guru boleh baca tetapi tidak boleh mengubah', async () => {
    const res = await call('GET', '/v1/school/identity', teacherCookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: `Sekolah ${slug}`, logoUrl: null, street: null, fax: null });
    expect((await call('PUT', '/v1/school/identity', teacherCookie, {})).statusCode).toBe(403);
    expect(
      (await call('POST', '/v1/school/identity/logo', teacherCookie, { mime: 'image/png', data: PNG }))
        .statusCode,
    ).toBe(403);
  });

  it('menyimpan teks, memvalidasi email dan situs web', async () => {
    const bad = await call('PUT', '/v1/school/identity', adminCookie, { email: 'bukan-email' });
    expect(bad.statusCode).toBe(400);
    const res = await call('PUT', '/v1/school/identity', adminCookie, {
      officialName: 'SMK Contoh Mandiri',
      street: 'Jl. Merdeka No. 1',
      city: 'Bandung',
      province: 'Jawa Barat',
      postalCode: '40615',
      phone: '022-123456',
      fax: '022-654321',
      email: 'Info@Contoh.sch.id',
      website: 'https://contoh.sch.id',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ email: 'info@contoh.sch.id', fax: '022-654321', village: null });
  });

  it('logo: tolak isi yang bukan gambar, terima PNG, ganti, hapus, dan layani publik', async () => {
    const fake = await call('POST', '/v1/school/identity/logo', adminCookie, {
      mime: 'image/png',
      data: Buffer.from('<svg onload=alert(1)>').toString('base64'),
    });
    expect(fake.statusCode).toBe(400);

    const up = await call('POST', '/v1/school/identity/logo', adminCookie, { mime: 'image/png', data: PNG });
    expect(up.statusCode, up.body).toBe(200);
    const logoUrl = up.json().logoUrl as string;
    expect(logoUrl).toMatch(/^\/v1\/public\/school-files\//);
    // Teks identitas tidak ikut hilang saat logo diunggah.
    expect(up.json().street).toBe('Jl. Merdeka No. 1');

    const img = await app.inject({ method: 'GET', url: logoUrl, remoteAddress: '10.9.0.1' });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');

    // Logo baru menggantikan yang lama; berkas lama hilang.
    const again = await call('POST', '/v1/school/identity/logo', adminCookie, {
      mime: 'image/png',
      data: PNG,
    });
    expect(again.json().logoUrl).not.toBe(logoUrl);
    expect((await app.inject({ method: 'GET', url: logoUrl, remoteAddress: '10.9.0.2' })).statusCode).toBe(
      404,
    );

    expect((await call('DELETE', '/v1/school/identity/logo', adminCookie)).statusCode).toBe(200);
    expect((await call('GET', '/v1/school/identity', adminCookie)).json().logoUrl).toBeNull();
  });
});

describe('situs publik mengikuti sumber kontak', () => {
  it('identitas sekolah dipakai bila sumbernya `school`, isian sendiri bila `custom`', async () => {
    const site = () =>
      app.inject({ method: 'GET', url: `/v1/public/site/${slug}`, remoteAddress: '10.9.1.1' });

    const fromSchool = (await site()).json().profile;
    expect(fromSchool.address).toBe('Jl. Merdeka No. 1, Bandung, Jawa Barat 40615');
    expect(fromSchool.fax).toBe('022-654321');
    expect(fromSchool.website).toBe('https://contoh.sch.id');

    const put = await call('PUT', '/v1/site/profile', adminCookie, {
      published: true,
      identitySource: 'custom',
      address: 'Alamat khusus situs',
      phone: '0812',
    });
    expect(put.statusCode, put.body).toBe(200);
    expect(put.json().identitySource).toBe('custom');
    const custom = (await site()).json().profile;
    expect(custom).toMatchObject({ address: 'Alamat khusus situs', phone: '0812', fax: null, website: null });
  });
});
