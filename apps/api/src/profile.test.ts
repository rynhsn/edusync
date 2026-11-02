import { eq, user } from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const email = `profil-${run}@example.test`;
const oldPassword = 'kata-sandi-lama-12345';
const newPassword = 'kata-sandi-baru-67890';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let userId = '';

const call = (method: 'GET' | 'POST', url: string, cookie?: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: {
      origin,
      ...(cookie ? { cookie } : {}),
      ...(payload ? { 'content-type': 'application/json' } : {}),
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36',
    },
    ...(payload ? { payload } : {}),
  });

async function login(password: string) {
  const res = await call('POST', '/api/auth/sign-in/email', undefined, { email, password });
  return { status: res.statusCode, cookie: res.cookies.map((c) => `${c.name}=${c.value}`).join('; ') };
}

beforeAll(async () => {
  app = await buildApp(loadEnv());
  const res = await app.auth.api.signUpEmail({ body: { name: 'Profil Uji', email, password: oldPassword } });
  userId = res.user.id;
});

afterAll(async () => {
  await app.platformDb.delete(user).where(eq(user.id, userId));
  await app.close();
});

describe('profil: perangkat yang sedang masuk', () => {
  it('daftar perangkat memuat setiap sesi, dan satu perangkat bisa dikeluarkan', async () => {
    const a = await login(oldPassword);
    const b = await login(oldPassword);
    const list = (await call('GET', '/api/auth/list-sessions', a.cookie)).json() as { token: string }[];
    expect(list.length).toBeGreaterThanOrEqual(2);

    const mine = (await call('GET', '/api/auth/get-session', a.cookie)).json().session.token as string;
    const other = (await call('GET', '/api/auth/get-session', b.cookie)).json().session.token as string;
    const revoke = await call('POST', '/api/auth/revoke-session', a.cookie, { token: other });
    expect(revoke.statusCode).toBe(200);

    expect((await call('GET', '/api/auth/get-session', b.cookie)).json()).toBeNull();
    expect((await call('GET', '/api/auth/get-session', a.cookie)).json().session.token).toBe(mine);
  });

  it('mengeluarkan semua perangkat lain menyisakan perangkat ini', async () => {
    const a = await login(oldPassword);
    const b = await login(oldPassword);
    const out = await call('POST', '/api/auth/revoke-other-sessions', a.cookie, {});
    expect(out.statusCode).toBe(200);
    expect((await call('GET', '/api/auth/get-session', b.cookie)).json()).toBeNull();
    const list = (await call('GET', '/api/auth/list-sessions', a.cookie)).json() as unknown[];
    expect(list).toHaveLength(1);
  });
});

describe('profil: nama dan kata sandi', () => {
  it('mengubah nama', async () => {
    const s = await login(oldPassword);
    const res = await call('POST', '/api/auth/update-user', s.cookie, { name: 'Nama Baru' });
    expect(res.statusCode).toBe(200);
    expect((await call('GET', '/api/auth/get-session', s.cookie)).json().user.name).toBe('Nama Baru');
  });

  it('ganti kata sandi menolak kata sandi lama yang salah, dan sesudahnya perangkat lain keluar', async () => {
    const a = await login(oldPassword);
    const b = await login(oldPassword);

    const wrong = await call('POST', '/api/auth/change-password', a.cookie, {
      currentPassword: 'bukan-kata-sandi-saya',
      newPassword,
      revokeOtherSessions: true,
    });
    expect(wrong.statusCode).toBe(400);
    expect((await login(newPassword)).status).not.toBe(200);

    const ok = await call('POST', '/api/auth/change-password', a.cookie, {
      currentPassword: oldPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    expect(ok.statusCode).toBe(200);
    expect((await call('GET', '/api/auth/get-session', b.cookie)).json()).toBeNull();
    expect((await login(oldPassword)).status).not.toBe(200);
    expect((await login(newPassword)).status).toBe(200);
  });

  it('kata sandi baru yang terlalu pendek ditolak', async () => {
    const s = await login(newPassword);
    const res = await call('POST', '/api/auth/change-password', s.cookie, {
      currentPassword: newPassword,
      newPassword: 'pendek',
    });
    expect(res.statusCode).toBe(400);
  });
});
