import {
  assignRoles,
  eq,
  foundation,
  guardian,
  member,
  portalInvite,
  school,
  seedSchoolRoles,
  sql,
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

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let foundationId = '';
let cookie = '';
let userId = '';

const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
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

async function newStudent(name: string) {
  const res = await call('POST', '/v1/students', { name: `${name} ${run}`, gender: 'L' });
  return res.json().id as string;
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await app.platformDb
    .insert(foundation)
    .values({ name: 'Yayasan Wali', slug: `wl-${run}` })
    .returning();
  foundationId = f!.id;
  const [s] = await app.platformDb
    .insert(school)
    .values({ foundationId, slug: `wl-${run}`, name: 'Wali Uji' })
    .returning();
  schoolId = s!.id;
  await seedSchoolRoles(app.platformDb, schoolId);
  const email = `admin-wali-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: 'Admin Wali', email, password } });
  userId = res.user.id;
  const [m] = await app.platformDb.insert(member).values({ userId, schoolId }).returning();
  await assignRoles(app.platformDb, m!.id, schoolId, ['school_admin']);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
});

afterAll(async () => {
  for (const table of [
    'portal_invite',
    'student_guardian',
    'guardian',
    'enrollment',
    'student',
    'audit_log',
    'member',
    'role',
  ]) {
    await app.platformDb.execute(sql.raw(`delete from ${table} where school_id = '${schoolId}'`));
  }
  await app.platformDb.delete(school).where(eq(school.id, schoolId));
  await app.platformDb.delete(foundation).where(eq(foundation.id, foundationId));
  await app.platformDb.delete(user).where(eq(user.id, userId));
  await app.close();
});

describe('lepas wali dari siswa', () => {
  it('melepas wali utama: wali berikutnya menjadi utama dan wali yatim ikut terhapus', async () => {
    const sid = await newStudent('Siswa A');
    const a = (
      await call('POST', `/v1/students/${sid}/guardians`, { name: 'Ayah A', relation: 'father' })
    ).json();
    expect(a[0].isPrimary).toBe(true);
    const both = (
      await call('POST', `/v1/students/${sid}/guardians`, { name: 'Ibu A', relation: 'mother' })
    ).json();
    expect(both).toHaveLength(2);

    const del = await call('DELETE', `/v1/students/${sid}/guardians/${a[0].guardianId}`);
    expect(del.statusCode).toBe(200);
    const left = (await call('GET', `/v1/students/${sid}/guardians`)).json();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ name: 'Ibu A', isPrimary: true });
    expect(await app.platformDb.select().from(guardian).where(eq(guardian.id, a[0].guardianId))).toHaveLength(
      0,
    );
  });

  it('melepas wali yang punya undangan portal: berhasil (bukan galat server), wali tetap tersimpan tanpa siswa', async () => {
    const sid = await newStudent('Siswa B');
    const link = (
      await call('POST', `/v1/students/${sid}/guardians`, { name: 'Wali B', relation: 'guardian' })
    ).json();
    const gid = link[0].guardianId as string;
    await app.platformDb.insert(portalInvite).values({
      schoolId,
      kind: 'guardian',
      guardianId: gid,
      tokenHash: `uji-${run}-${Math.random()}`,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdBy: userId,
    });

    const del = await call('DELETE', `/v1/students/${sid}/guardians/${gid}`);
    expect(del.statusCode).toBe(200);
    expect((await call('GET', `/v1/students/${sid}/guardians`)).json()).toHaveLength(0);
    expect(await app.platformDb.select().from(guardian).where(eq(guardian.id, gid))).toHaveLength(1);
  });
});

describe('data diri siswa', () => {
  it('menyimpan data diri opsional dengan telepon dinormalkan, dan mengubahnya lewat PUT', async () => {
    const res = await call('POST', '/v1/students', {
      name: `Siswa Profil ${run}`,
      gender: 'P',
      nik: '3201010101010001',
      birthPlace: 'Bandung',
      religion: 'islam',
      address: 'Jl. Merdeka 1',
      phone: '0812-3456-7890',
      email: 'Siswa.Profil@Example.test',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      nik: '3201010101010001',
      birthPlace: 'Bandung',
      religion: 'islam',
      address: 'Jl. Merdeka 1',
      phone: '6281234567890',
      email: 'siswa.profil@example.test',
    });

    const id = res.json().id as string;
    const put = await call('PUT', `/v1/students/${id}`, { name: `Siswa Profil ${run}`, gender: 'P' });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ nik: null, phone: null, email: null, religion: null });
  });

  it('menolak NIK bukan 16 digit, telepon tak masuk akal, dan email salah', async () => {
    const base = { name: `Siswa Salah ${run}`, gender: 'L' };
    expect((await call('POST', '/v1/students', { ...base, nik: '123' })).statusCode).toBe(400);
    expect((await call('POST', '/v1/students', { ...base, phone: 'abc' })).statusCode).toBe(400);
    expect((await call('POST', '/v1/students', { ...base, email: 'bukan-email' })).statusCode).toBe(400);
  });

  it('siswa tanpa data diri tetap sah (semua kolom baru kosong)', async () => {
    const res = await call('POST', '/v1/students', { name: `Siswa Polos ${run}`, gender: 'L' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      nik: null,
      birthPlace: null,
      phone: null,
      email: null,
      address: null,
    });
  });
});
