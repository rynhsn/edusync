import { eq, outbox, sql, user } from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const oldPassword = 'kata-sandi-lama-12345';
const newPassword = 'kata-sandi-baru-67890';
const origin = 'http://localhost:3000';
const email = `lupa-${run}@example.test`;

let app: Awaited<ReturnType<typeof buildApp>>;
let userId = '';

const post = (url: string, payload: object) =>
  app.inject({
    method: 'POST',
    url,
    headers: { origin, 'content-type': 'application/json' },
    payload,
  });

const login = (password: string) => post('/api/auth/sign-in/email', { email, password });

const requestOtp = (to: string) =>
  post('/api/auth/email-otp/send-verification-otp', { email: to, type: 'forget-password' });

/** Kode terakhir yang dikirim ke alamat itu, dibaca dari outbox (email dikirim worker). */
async function emails(to: string) {
  return app.platformDb
    .select({ payload: outbox.payload })
    .from(outbox)
    .where(sql`${outbox.payload}->>'to' = ${to}`)
    .orderBy(sql`${outbox.createdAt} desc`);
}

/** Kode dari email baru setelah `known` email lama; pengiriman ke outbox tidak ditunggu oleh API. */
async function sentOtp(to: string, known = 0) {
  for (let i = 0; i < 20; i++) {
    const rows = await emails(to);
    if (rows.length > known) return /: (\d{6})/.exec(String(rows[0]?.payload.text))?.[1] ?? null;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

beforeAll(async () => {
  app = await buildApp(loadEnv());
  const res = await app.auth.api.signUpEmail({ body: { name: 'Lupa', email, password: oldPassword } });
  userId = res.user.id;
});

afterAll(async () => {
  await app.platformDb.delete(outbox).where(sql`${outbox.payload}->>'to' = ${email}`);
  await app.platformDb.delete(user).where(eq(user.id, userId));
  await app.close();
});

describe('lupa kata sandi dengan OTP email', () => {
  it('email tidak terdaftar: tetap sukses, tetapi tidak ada email terkirim', async () => {
    const ghost = `hantu-${run}@example.test`;
    expect((await requestOtp(ghost)).statusCode).toBe(200);
    expect(await sentOtp(ghost)).toBeNull();
  });

  it('kode salah ditolak dan kata sandi tidak berubah', async () => {
    expect((await requestOtp(email)).statusCode).toBe(200);
    const res = await post('/api/auth/email-otp/reset-password', {
      email,
      otp: '000000',
      password: newPassword,
    });
    expect(res.statusCode).toBe(400);
    expect((await login(oldPassword)).statusCode).toBe(200);
  });

  it('kode benar mengganti kata sandi, sesi lama keluar, dan kode tak bisa dipakai lagi', async () => {
    const oldSession = (await login(oldPassword)).cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const known = (await emails(email)).length;
    expect((await requestOtp(email)).statusCode).toBe(200);
    const otp = await sentOtp(email, known);
    expect(otp).toMatch(/^\d{6}$/);

    const ok = await post('/api/auth/email-otp/reset-password', { email, otp, password: newPassword });
    expect(ok.statusCode).toBe(200);
    expect((await login(oldPassword)).statusCode).not.toBe(200);
    expect((await login(newPassword)).statusCode).toBe(200);

    const stale = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: oldSession, origin },
    });
    expect(stale.json()).toBeNull();

    const again = await post('/api/auth/email-otp/reset-password', { email, otp, password: oldPassword });
    expect(again.statusCode).toBe(400);
  });

  it('kata sandi baru yang terlalu pendek ditolak', async () => {
    const known = (await emails(email)).length;
    expect((await requestOtp(email)).statusCode).toBe(200);
    const otp = await sentOtp(email, known);
    const res = await post('/api/auth/email-otp/reset-password', { email, otp, password: 'pendek' });
    expect(res.statusCode).toBe(400);
  });

  it('memeriksa kode lebih dulu: kode salah ditolak, kode benar lolos tanpa menghabiskannya, lalu reset tetap bisa', async () => {
    const known = (await emails(email)).length;
    expect((await requestOtp(email)).statusCode).toBe(200);
    const otp = await sentOtp(email, known);

    const check = (code: string) =>
      post('/api/auth/email-otp/check-verification-otp', { email, type: 'forget-password', otp: code });
    expect((await check('000000')).statusCode).toBe(400);
    expect((await check(otp as string)).statusCode).toBe(200);
    // Memeriksa dua kali tidak menghabiskan kode.
    expect((await check(otp as string)).statusCode).toBe(200);

    const reset = await post('/api/auth/email-otp/reset-password', { email, otp, password: oldPassword });
    expect(reset.statusCode).toBe(200);
    expect((await login(oldPassword)).statusCode).toBe(200);
    expect((await check(otp as string)).statusCode).toBe(400);
  });
});
