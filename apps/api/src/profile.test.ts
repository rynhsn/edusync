import { eq, sql, user } from '@edusync/db';
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
  await app.platformDb.execute(
    sql`delete from outbox where payload->>'to' like ${`profil-%${run}@example.test`}`,
  );
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

describe('profil: email, telepon, foto', () => {
  const newEmail = `profil-baru-${run}@example.test`;
  const tinyJpeg =
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

  async function outboxCode(to: string) {
    for (let i = 0; i < 20; i++) {
      const res = await app.platformDb.execute<{ payload: { text: string } }>(
        sql`select payload from outbox where payload->>'to' = ${to} order by created_at desc limit 1`,
      );
      const code = /: (\d{6})/.exec(res.rows[0]?.payload.text ?? '')?.[1];
      if (code) return code;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }

  it('mengubah telepon (dinormalkan), menolak telepon tak masuk akal, dan boleh dikosongkan', async () => {
    const s = await login(newPassword);
    const ok = await call('POST', '/api/auth/update-user', s.cookie, { phone: '0812-3456-7890' });
    expect(ok.statusCode).toBe(200);
    expect((await call('GET', '/api/auth/get-session', s.cookie)).json().user.phone).toBe('6281234567890');
    expect((await call('POST', '/api/auth/update-user', s.cookie, { phone: 'abc' })).statusCode).toBe(400);
    expect((await call('POST', '/api/auth/update-user', s.cookie, { phone: '' })).statusCode).toBe(200);
    expect((await call('GET', '/api/auth/get-session', s.cookie)).json().user.phone).toBeNull();
  });

  it('nama terlalu pendek ditolak', async () => {
    const s = await login(newPassword);
    expect((await call('POST', '/api/auth/update-user', s.cookie, { name: 'A' })).statusCode).toBe(400);
  });

  it('foto: gambar kecil diterima, berkas bukan gambar ditolak, dan bisa dihapus', async () => {
    const s = await login(newPassword);
    expect((await call('POST', '/api/auth/update-user', s.cookie, { image: tinyJpeg })).statusCode).toBe(200);
    expect((await call('GET', '/api/auth/get-session', s.cookie)).json().user.image).toBe(tinyJpeg);
    expect(
      (await call('POST', '/api/auth/update-user', s.cookie, { image: 'https://contoh.test/x.png' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await call('POST', '/api/auth/update-user', s.cookie, { image: 'data:text/html;base64,PGI+' }))
        .statusCode,
    ).toBe(400);
    const big = `data:image/png;base64,${'A'.repeat(130_000)}`;
    expect((await call('POST', '/api/auth/update-user', s.cookie, { image: big })).statusCode).toBe(400);
    expect((await call('POST', '/api/auth/update-user', s.cookie, { image: '' })).statusCode).toBe(200);
    expect((await call('GET', '/api/auth/get-session', s.cookie)).json().user.image).toBeNull();
  });

  it('ganti email: kode dikirim ke alamat baru, salah kode ditolak, kode benar mengganti dan masuk dengan email baru', async () => {
    const s = await login(newPassword);
    const req = await call('POST', '/api/auth/email-otp/request-email-change', s.cookie, { newEmail });
    expect(req.statusCode).toBe(200);
    const code = await outboxCode(newEmail);
    expect(code).toMatch(/^\d{6}$/);

    const bad = await call('POST', '/api/auth/email-otp/change-email', s.cookie, { newEmail, otp: '000000' });
    expect(bad.statusCode).toBe(400);

    const ok = await call('POST', '/api/auth/email-otp/change-email', s.cookie, { newEmail, otp: code });
    expect(ok.statusCode).toBe(200);
    expect((await call('GET', '/api/auth/get-session', s.cookie)).json().user.email).toBe(newEmail);
    const again = await call('POST', '/api/auth/sign-in/email', undefined, {
      email: newEmail,
      password: newPassword,
    });
    expect(again.statusCode).toBe(200);
  });
});
