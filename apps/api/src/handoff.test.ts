import { inArray, sql, user } from '@edusync/db';
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
const main = 'http://localhost:3000';
const school = 'http://smpit-contoh.localhost:3000';
const env = loadEnv({
  ...process.env,
  NODE_ENV: 'test',
  PAYMENT_PROVIDER: 'dev',
  MIDTRANS_SERVER_KEY: '',
  APP_DOMAIN: 'localhost:3000',
  AUTH_URL: 'http://localhost:4000',
});

let app: Awaited<ReturnType<typeof buildApp>>;
const userIds: string[] = [];
let counter = 0;

const cookieOf = (res: { cookies: { name: string; value: string }[] }) =>
  res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

async function loginOnMain() {
  const email = `handoff-${counter++}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: 'Uji Handoff', email, password } });
  userIds.push(res.user.id);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: main, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return { email, cookie: cookieOf(login) };
}

const generate = (cookie: string) =>
  app.inject({ url: '/api/auth/one-time-token/generate', headers: { cookie, origin: main } });

const verify = (token: string, origin: string) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/one-time-token/verify',
    headers: { origin, 'content-type': 'application/json' },
    payload: { token },
  });

beforeAll(async () => {
  app = await buildApp(env);
  await app.ready();
});

afterAll(async () => {
  if (userIds.length > 0) {
    await app.platformDb.delete(user).where(inArray(user.id, userIds));
  }
  await app.close();
});

describe('pindah alamat dengan token sekali pakai', () => {
  it('login di alamat utama bisa dipindahkan menjadi sesi di subdomain sekolah', async () => {
    const { email, cookie } = await loginOnMain();
    const token = (await generate(cookie)).json().token as string;
    expect(token).toBeTruthy();

    const exchanged = await verify(token, school);
    expect(exchanged.statusCode).toBe(200);
    const schoolCookie = cookieOf(exchanged);
    expect(schoolCookie).toContain('session_token');

    // Sesi baru berlaku sebagai pengguna yang sama.
    const me = await app.inject({ url: '/v1/me', headers: { cookie: schoolCookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe(email);
  });

  it('cookie sesi tidak membawa Domain, jadi hanya berlaku di alamat tempat ia dibuat', async () => {
    const { cookie } = await loginOnMain();
    const token = (await generate(cookie)).json().token as string;
    const res = await verify(token, school);
    const header = String(res.headers['set-cookie']);
    expect(header).not.toMatch(/domain=/i);
    expect(header).toMatch(/httponly/i);
  });

  it('token hanya bisa dipakai satu kali', async () => {
    const { cookie } = await loginOnMain();
    const token = (await generate(cookie)).json().token as string;
    expect((await verify(token, school)).statusCode).toBe(200);
    const again = await verify(token, school);
    expect(again.statusCode).not.toBe(200);
    expect(cookieOf(again)).not.toContain('session_token');
  });

  it('token kedaluwarsa ditolak', async () => {
    const { cookie } = await loginOnMain();
    const token = (await generate(cookie)).json().token as string;
    await app.platformDb.execute(
      sql`update verification set expires_at = now() - interval '1 minute' where identifier like 'one-time-token:%'`,
    );
    const res = await verify(token, school);
    expect(res.statusCode).not.toBe(200);
    expect(cookieOf(res)).not.toContain('session_token');
  });

  it('token acak atau kosong ditolak', async () => {
    expect((await verify('bukan-token-yang-benar', school)).statusCode).not.toBe(200);
    expect((await verify('', school)).statusCode).not.toBe(200);
  });

  it('tanpa login tidak bisa membuat token', async () => {
    const res = await app.inject({ url: '/api/auth/one-time-token/generate', headers: { origin: main } });
    expect(res.statusCode).toBe(401);
  });

  it('asal yang tidak dipercaya ditolak walau tokennya benar', async () => {
    const { cookie } = await loginOnMain();
    const token = (await generate(cookie)).json().token as string;
    const res = await verify(token, 'https://evil.example');
    expect(res.statusCode).toBe(403);
    expect(cookieOf(res)).not.toContain('session_token');
  });

  it('CORS hanya untuk asal yang dipercaya', async () => {
    const ok = await app.inject({
      method: 'OPTIONS',
      url: '/v1/me',
      headers: { origin: school, 'access-control-request-method': 'GET' },
    });
    expect(ok.headers['access-control-allow-origin']).toBe(school);
    const bad = await app.inject({
      method: 'OPTIONS',
      url: '/v1/me',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
    });
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});
