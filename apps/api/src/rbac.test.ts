import { assignRoles, eq, foundation, member, school, seedSchoolRoles, sql, user } from '@edusync/db';
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

let app: Awaited<ReturnType<typeof buildApp>>;
let smpId = '';
let smkId = '';
let otherId = '';
const userIds: string[] = [];
const foundationIds: string[] = [];

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
  expect(res.statusCode).toBe(200);
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

async function join(userId: string, schoolId: string, roles: string[]) {
  const [m] = await app.platformDb.insert(member).values({ userId, schoolId }).returning();
  await assignRoles(app.platformDb, m!.id, schoolId, roles);
  return m!.id;
}

async function makeSchool(foundationId: string, slug: string) {
  const [s] = await app.platformDb
    .insert(school)
    .values({ foundationId, slug: `${slug}-${run}`, name: slug })
    .returning();
  await seedSchoolRoles(app.platformDb, s!.id);
  return s!.id;
}

const get = (url: string, cookie: string, schoolId?: string) =>
  app.inject({ url, headers: { cookie, ...(schoolId ? { 'x-school-id': schoolId } : {}) } });

const post = (url: string, cookie: string, schoolId: string, payload: object) =>
  app.inject({
    method: 'POST',
    url,
    headers: { cookie, 'x-school-id': schoolId, origin, 'content-type': 'application/json' },
    payload,
  });

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [fa] = await app.platformDb
    .insert(foundation)
    .values({ name: 'Yayasan Uji', slug: `yu-${run}` })
    .returning();
  const [fb] = await app.platformDb
    .insert(foundation)
    .values({ name: 'Yayasan Lain', slug: `yl-${run}` })
    .returning();
  foundationIds.push(fa!.id, fb!.id);
  smpId = await makeSchool(fa!.id, 'smp-it');
  smkId = await makeSchool(fa!.id, 'smk');
  otherId = await makeSchool(fb!.id, 'sma-lain');
});

afterAll(async () => {
  // Hapus data uji lewat pool platform (melewati RLS).
  for (const sid of [smpId, smkId, otherId]) {
    await app.platformDb.execute(sql`delete from audit_log where school_id = ${sid}`);
    await app.platformDb.execute(sql`delete from academic_year where school_id = ${sid}`);
    await app.platformDb.execute(sql`delete from member where school_id = ${sid}`);
    await app.platformDb.execute(sql`delete from role where school_id = ${sid}`);
    await app.platformDb.delete(school).where(eq(school.id, sid));
  }
  for (const fid of foundationIds) await app.platformDb.delete(foundation).where(eq(foundation.id, fid));
  for (const uid of userIds) await app.platformDb.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('akses dan peran', () => {
  it('tanpa login: 401', async () => {
    const res = await get('/v1/academic-years', '', smpId);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthorized');
  });

  it('sudah login tetapi header sekolah hilang: 400', async () => {
    const u = await makeUser('tanpa-header');
    await join(u.id, smpId, ['teacher']);
    const res = await get('/v1/academic-years', await login(u.email));
    expect(res.statusCode).toBe(400);
  });

  it('guru boleh membaca tetapi tidak boleh membuat tahun ajaran', async () => {
    const u = await makeUser('guru');
    await join(u.id, smpId, ['teacher']);
    const cookie = await login(u.email);
    expect((await get('/v1/academic-years', cookie, smpId)).statusCode).toBe(200);
    const res = await post('/v1/academic-years', cookie, smpId, {
      name: '2026/2027',
      startsOn: '2026-07-13',
      endsOn: '2027-06-30',
    });
    expect(res.statusCode).toBe(403);
  });

  it('peran rangkap: guru yang juga operator boleh membuat, dan audit mencatat peran', async () => {
    const u = await makeUser('guru-operator');
    await join(u.id, smpId, ['teacher', 'operator']);
    const cookie = await login(u.email);
    const res = await post('/v1/academic-years', cookie, smpId, {
      name: '2026/2027',
      startsOn: '2026-07-13',
      endsOn: '2027-06-30',
    });
    expect(res.statusCode).toBe(201);
    const list = await get('/v1/academic-years', cookie, smpId);
    expect(list.json()).toHaveLength(1);
    const logs = await app.platformDb.execute<{ details: { viaRoles: string[] } }>(
      sql`select details from audit_log where school_id = ${smpId} and action = 'academic_year.create'`,
    );
    expect(logs.rows[0]?.details.viaRoles.sort()).toEqual(['operator', 'teacher']);
  });

  it('nama tahun ajaran yang sama di sekolah yang sama: 409', async () => {
    const u = await makeUser('admin-smp');
    await join(u.id, smpId, ['school_admin']);
    const res = await post('/v1/academic-years', await login(u.email), smpId, {
      name: '2026/2027',
      startsOn: '2026-07-13',
      endsOn: '2027-06-30',
    });
    expect(res.statusCode).toBe(409);
  });

  it('data tidak valid: 400', async () => {
    const u = await makeUser('admin-valid');
    await join(u.id, smpId, ['school_admin']);
    const res = await post('/v1/academic-years', await login(u.email), smpId, {
      name: 'x',
      startsOn: '2027-01-01',
      endsOn: '2026-01-01',
    });
    expect(res.statusCode).toBe(400);
  });

  it('satu akun, peran berbeda di dua unit: izin tidak bocor antar-unit', async () => {
    const u = await makeUser('guru-lintas-unit');
    await join(u.id, smpId, ['teacher']);
    await join(u.id, smkId, ['school_admin']);
    const cookie = await login(u.email);
    const body = { name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30' };
    expect((await post('/v1/academic-years', cookie, smpId, { ...body, name: 'x-smp' })).statusCode).toBe(
      403,
    );
    expect((await post('/v1/academic-years', cookie, smkId, body)).statusCode).toBe(201);
    const me = (await get('/v1/me', cookie)).json();
    const byName = Object.fromEntries(
      me.memberships.map((m: { schoolSlug: string; roles: string[] }) => [m.schoolSlug, m.roles]),
    );
    expect(byName[`smp-it-${run}`]).toEqual(['teacher']);
    expect(byName[`smk-${run}`]).toEqual(['school_admin']);
  });

  it('bukan anggota sekolah itu: 403, dan data sekolah itu tidak terlihat', async () => {
    const u = await makeUser('orang-luar');
    await join(u.id, otherId, ['school_admin']);
    const cookie = await login(u.email);
    expect((await get('/v1/academic-years', cookie, smpId)).statusCode).toBe(403);
    // Sekolah yang tidak ada dijawab sama dengan sekolah orang lain.
    expect((await get('/v1/academic-years', cookie, '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa')).statusCode).toBe(
      403,
    );
    expect((await get('/v1/academic-years', cookie, otherId)).json()).toEqual([]);
  });

  it('anggota yang dinonaktifkan kehilangan semua akses', async () => {
    const u = await makeUser('nonaktif');
    const memberId = await join(u.id, smpId, ['school_admin']);
    const cookie = await login(u.email);
    expect((await get('/v1/academic-years', cookie, smpId)).statusCode).toBe(200);
    await app.platformDb.update(member).set({ status: 'disabled' }).where(eq(member.id, memberId));
    expect((await get('/v1/academic-years', cookie, smpId)).statusCode).toBe(403);
  });

  it('sekolah yang ditangguhkan menolak semua anggotanya', async () => {
    const u = await makeUser('sekolah-tangguh');
    await join(u.id, otherId, ['school_admin']);
    const cookie = await login(u.email);
    await app.platformDb.update(school).set({ status: 'suspended' }).where(eq(school.id, otherId));
    const res = await get('/v1/academic-years', cookie, otherId);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('school_suspended');
    await app.platformDb.update(school).set({ status: 'active' }).where(eq(school.id, otherId));
  });

  it('endpoint sekolah muncul di OpenAPI dengan header dan izin', async () => {
    const spec = (await app.inject('/openapi.json')).json();
    expect(spec.paths['/v1/academic-years'].get.summary).toBeTruthy();
    expect(spec.paths['/v1/academic-years'].post.description).toContain('academic_year:manage');
  });
});
