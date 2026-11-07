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

let app: Awaited<ReturnType<typeof buildApp>>;
const userIds: string[] = [];
const emails: string[] = [];
let seq = 0;

const post = (url: string, payload: object) =>
  app.inject({
    method: 'POST',
    url,
    headers: { origin, 'content-type': 'application/json' },
    payload,
  });

/** Akun baru per tes: setiap tes memakai isian sendiri sehingga batas laju per isian tidak saling mengganggu. */
async function newAccount() {
  const email = `lupa${++seq}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: 'Lupa', email, password: oldPassword } });
  userIds.push(res.user.id);
  emails.push(email);
  return { id: res.user.id, email };
}

const login = (email: string, password: string) => post('/api/auth/sign-in/email', { email, password });
const send = (identifier: string) => post('/v1/auth/recovery/send', { identifier, channel: 'email' });
const reset = (identifier: string, code: string, password: string) =>
  post('/v1/auth/recovery/reset', { identifier, channel: 'email', code, password });

/** Email yang dikirim ke alamat itu, dibaca dari outbox (email dikirim worker). */
async function mails(to: string) {
  return app.platformDb
    .select({ payload: outbox.payload })
    .from(outbox)
    .where(sql`${outbox.payload}->>'to' = ${to}`)
    .orderBy(sql`${outbox.createdAt} desc`);
}

async function sentCode(to: string, known = 0) {
  for (let i = 0; i < 20; i++) {
    const rows = await mails(to);
    if (rows.length > known) return /: (\d{6})/.exec(String(rows[0]?.payload.text))?.[1] ?? null;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

beforeAll(async () => {
  app = await buildApp(loadEnv({ ...process.env, NODE_ENV: 'test' }));
  await app.ready();
});

afterAll(async () => {
  for (const to of emails) await app.platformDb.delete(outbox).where(sql`${outbox.payload}->>'to' = ${to}`);
  for (const id of userIds) await app.platformDb.delete(user).where(eq(user.id, id));
  await app.close();
});

describe('lupa kata sandi dengan kode lewat email', () => {
  it('email tidak terdaftar: jawaban netral, tidak ada email terkirim, kode apa pun ditolak', async () => {
    const ghost = `hantu-${run}@example.test`;
    const lookup = await post('/v1/auth/recovery/lookup', { identifier: ghost });
    expect(lookup.statusCode).toBe(200);
    expect(lookup.json().channels).toEqual([]);
    const res = await send(ghost);
    expect(res.statusCode).toBe(200);
    expect(await sentCode(ghost)).toBeNull();
    expect((await reset(ghost, '123456', newPassword)).statusCode).toBe(400);
  });

  it('kode salah ditolak dan kata sandi tidak berubah', async () => {
    const a = await newAccount();
    expect((await send(a.email)).statusCode).toBe(200);
    expect((await reset(a.email, '000000', newPassword)).statusCode).toBe(400);
    expect((await login(a.email, oldPassword)).statusCode).toBe(200);
  });

  it('kode benar mengganti kata sandi, sesi lama keluar, dan kode tak bisa dipakai lagi', async () => {
    const a = await newAccount();
    const oldSession = (await login(a.email, oldPassword)).cookies
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
    expect((await send(a.email)).statusCode).toBe(200);
    const code = await sentCode(a.email);
    expect(code).toMatch(/^\d{6}$/);

    const ok = await reset(a.email, code as string, newPassword);
    expect(ok.statusCode).toBe(200);
    expect((await login(a.email, oldPassword)).statusCode).not.toBe(200);
    expect((await login(a.email, newPassword)).statusCode).toBe(200);

    const stale = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: oldSession, origin },
    });
    expect(stale.json()).toBeNull();

    expect((await reset(a.email, code as string, oldPassword)).statusCode).toBe(400);
  });

  it('kata sandi baru yang terlalu pendek ditolak tanpa menghabiskan kode', async () => {
    const a = await newAccount();
    expect((await send(a.email)).statusCode).toBe(200);
    const code = (await sentCode(a.email)) as string;
    expect((await reset(a.email, code, 'pendek')).statusCode).toBe(400);
    expect((await reset(a.email, code, newPassword)).statusCode).toBe(200);
  });

  it('memeriksa kode lebih dulu: salah ditolak, benar lolos tanpa menghabiskannya, lalu reset tetap bisa', async () => {
    const a = await newAccount();
    expect((await send(a.email)).statusCode).toBe(200);
    const code = (await sentCode(a.email)) as string;
    const check = (c: string) =>
      post('/v1/auth/recovery/verify', { identifier: a.email, channel: 'email', code: c });
    expect((await check('000000')).statusCode).toBe(400);
    expect((await check(code)).statusCode).toBe(200);
    expect((await check(code)).statusCode).toBe(200);

    expect((await reset(a.email, code, oldPassword)).statusCode).toBe(200);
    expect((await login(a.email, oldPassword)).statusCode).toBe(200);
    expect((await check(code)).statusCode).toBe(400);
  });

  it('jalur OTP bawaan Better Auth untuk lupa kata sandi sudah ditutup', async () => {
    const a = await newAccount();
    const paths: [string, object][] = [
      ['/api/auth/email-otp/send-verification-otp', { email: a.email, type: 'forget-password' }],
      [
        '/api/auth/email-otp/check-verification-otp',
        { email: a.email, type: 'forget-password', otp: '123456' },
      ],
      ['/api/auth/email-otp/reset-password', { email: a.email, otp: '123456', password: newPassword }],
      ['/api/auth/email-otp/request-password-reset', { email: a.email }],
      ['/api/auth/forget-password/email-otp', { email: a.email }],
    ];
    for (const [url, payload] of paths) expect((await post(url, payload)).statusCode, url).toBe(404);
    expect(await sentCode(a.email)).toBeNull();
  });
});
