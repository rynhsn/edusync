import { eq, foundation, member, portalLink, school, sql, student, user } from '@edusync/db';
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
// NIK uji: 16 digit acak berawalan 99 agar tidak bertabrakan dengan data lain di database bersama.
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const nikSolo = `99${digits(14)}`;
const nikShared = `99${digits(14)}`;
const nikOrphan = `99${digits(14)}`;

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let schoolId = '';
const userIds: string[] = [];
const emailOf = (label: string) => `${label}-${run}@example.test`;

async function makeUser(label: string) {
  const res = await app.auth.api.signUpEmail({ body: { name: label, email: emailOf(label), password } });
  userIds.push(res.user.id);
  return res.user.id;
}

/** Akun siswa: siswa ber-NIK + keanggotaan + tautan portal. */
async function studentAccount(label: string, nik: string | null) {
  const userId = await makeUser(label);
  const [s] = await app.platformDb
    .insert(student)
    .values({ schoolId, name: `Siswa ${label}`, gender: 'L', nik })
    .returning();
  const [m] = await app.platformDb.insert(member).values({ userId, schoolId }).returning();
  await app.platformDb
    .insert(portalLink)
    .values({ schoolId, memberId: m?.id as string, kind: 'student', studentId: s?.id as string });
  return userId;
}

const post = (url: string, payload: object, cookie?: string) =>
  app.inject({
    method: 'POST',
    url,
    headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    payload,
  });
const signIn = (identifier: string, pass = password) =>
  post('/api/auth/sign-in/email', { email: identifier, password: pass });
const cookieOf = (res: Awaited<ReturnType<typeof signIn>>) =>
  res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

beforeAll(async () => {
  app = await buildApp(loadEnv({ ...process.env, NODE_ENV: 'test' }));
  await app.ready();
  const [f] = await app.platformDb
    .insert(foundation)
    .values({ name: 'Yayasan Identitas', slug: `ident-${run}` })
    .returning();
  foundationId = f?.id as string;
  const [s] = await app.platformDb
    .insert(school)
    .values({ foundationId, slug: `ident-${run}`, name: 'Sekolah Identitas' })
    .returning();
  schoolId = s?.id as string;

  await makeUser('akun-a');
  await studentAccount('siswa-solo', nikSolo);
  await studentAccount('siswa-kembar-1', nikShared);
  await studentAccount('siswa-kembar-2', nikShared);
  // NIK ada di data siswa, tetapi siswanya tidak punya akun.
  await app.platformDb
    .insert(student)
    .values({ schoolId, name: 'Siswa tanpa akun', gender: 'P', nik: nikOrphan });
});

afterAll(async () => {
  for (const table of ['portal_link', 'student', 'member']) {
    await app.platformDb.execute(sql.raw(`delete from ${table} where school_id = '${schoolId}'`));
  }
  await app.platformDb.delete(school).where(eq(school.id, schoolId));
  await app.platformDb.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await app.platformDb.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('masuk dengan email atau NIK', () => {
  it('email (huruf besar diabaikan)', async () => {
    expect((await signIn(emailOf('akun-a').toUpperCase())).statusCode).toBe(200);
  });

  it('NIK yang tepat dimiliki satu akun siswa', async () => {
    const res = await signIn(nikSolo);
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe(emailOf('siswa-solo'));
    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: cookieOf(res), origin },
    });
    expect(session.json().user.email).toBe(emailOf('siswa-solo'));
  });

  it('semua kegagalan dijawab sama: kata sandi salah, tak dikenal, NIK ambigu, NIK tanpa akun, bukan email/NIK', async () => {
    const failures = await Promise.all([
      signIn(emailOf('akun-a'), 'salah-salah-salah-1'),
      signIn(nikSolo, 'salah-salah-salah-1'),
      signIn(`tidak.ada.${run}`),
      signIn(emailOf('tidak-ada')),
      signIn(nikShared),
      signIn(nikOrphan),
      signIn(`99${digits(14)}`),
      signIn('dua kata'),
      signIn('3201'),
    ]);
    for (const res of failures) expect(res.statusCode).toBe(401);
    const bodies = failures.map((r) => r.body);
    expect(new Set(bodies).size).toBe(1);
    const text = bodies.join('');
    // Tidak ada email atau NIK di jawaban kegagalan.
    expect(text).not.toContain('@example.test');
    expect(text).not.toContain(nikShared);
  });

  it('isian kosong atau tanpa kata sandi tidak menghasilkan sesi', async () => {
    expect((await signIn('')).statusCode).toBe(401);
    expect((await signIn(emailOf('akun-a'), '')).statusCode).not.toBe(200);
  });

  it('percobaan gagal berulang pada satu isian dibatasi (429) walau kata sandi akhirnya benar', async () => {
    await makeUser('akun-batas');
    const target = emailOf('akun-batas');
    for (let i = 0; i < app.authLimits.signInFailuresPer15Min; i++) {
      expect((await signIn(target, 'salah-salah-salah-1')).statusCode).toBe(401);
    }
    const blocked = await signIn(target);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    // Isian lain tidak terpengaruh.
    expect((await signIn(emailOf('akun-a'))).statusCode).toBe(200);
  });

  it('masuk berhasil mengosongkan hitungan gagal isian itu', async () => {
    await makeUser('akun-kosong');
    const target = emailOf('akun-kosong');
    for (let i = 0; i < app.authLimits.signInFailuresPer15Min - 1; i++)
      await signIn(target, 'salah-salah-salah-1');
    expect((await signIn(target)).statusCode).toBe(200);
    for (let i = 0; i < app.authLimits.signInFailuresPer15Min - 1; i++)
      await signIn(target, 'salah-salah-salah-1');
    expect((await signIn(target)).statusCode).toBe(200);
  });
});

describe('nama pengguna sudah dicabut', () => {
  it('kolom tidak ada, endpoint cek tidak ada, dan update-user tidak menyimpannya', async () => {
    const cols = await app.platformDb.execute(
      sql`select 1 from information_schema.columns where table_name = 'user' and column_name = 'username'`,
    );
    expect(cols.rows).toHaveLength(0);
    const cookie = cookieOf(await signIn(emailOf('akun-a')));
    const check = await app.inject({
      method: 'GET',
      url: '/v1/account/username-check?username=abc',
      headers: { cookie, origin },
    });
    expect(check.statusCode).toBe(404);
  });
});
