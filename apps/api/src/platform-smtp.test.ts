import { eq, platformSetting, platformStaff, sql, user } from '@edusync/db';
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
const json = { origin, 'content-type': 'application/json' };

let app: Awaited<ReturnType<typeof buildApp>>;
const userIds: string[] = [];
let adminCookie = '';
let viewerCookie = '';
let previous: Record<string, unknown> | undefined;

async function makeStaff(label: string, role: 'admin' | 'read_only') {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  await app.platformDb.insert(platformStaff).values({ userId: res.user.id, role });
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: json,
    payload: { email, password },
  });
  return login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

const call = (
  method: 'GET' | 'PUT' | 'POST',
  cookie: string,
  payload?: object,
  url = '/v1/platform/smtp-settings',
) =>
  app.inject({
    method,
    url,
    headers: { cookie, origin, ...(payload ? { 'content-type': 'application/json' } : {}) },
    ...(payload ? { payload } : {}),
  });

beforeAll(async () => {
  app = await buildApp(loadEnv({ ...process.env, NODE_ENV: 'test' }));
  await app.ready();
  const [row] = await app.platformDb.select().from(platformSetting).where(eq(platformSetting.key, 'smtp'));
  previous = row?.value as Record<string, unknown> | undefined;
  adminCookie = await makeStaff('smtp-admin', 'admin');
  viewerCookie = await makeStaff('smtp-baca', 'read_only');
});

afterAll(async () => {
  const db = app.platformDb;
  await db.delete(platformSetting).where(eq(platformSetting.key, 'smtp'));
  if (previous) await db.insert(platformSetting).values({ key: 'smtp', value: previous });
  const ids = sql.join(
    userIds.map((u) => sql`${u}`),
    sql`, `,
  );
  await db.execute(sql`delete from audit_log where actor_id in (${ids})`);
  await db.execute(sql`delete from platform_staff where user_id in (${ids})`);
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('pengaturan SMTP di konsol platform', () => {
  it('staf baca boleh melihat tetapi tidak mengubah atau menguji', async () => {
    expect((await call('GET', viewerCookie)).statusCode).toBe(200);
    const body = { host: 'smtp.example.test', port: 587, secure: false, from: 'Edusync <a@example.test>' };
    expect((await call('PUT', viewerCookie, body)).statusCode).toBe(403);
    expect(
      (await call('POST', viewerCookie, { to: 'a@example.test' }, '/v1/platform/smtp-settings/test'))
        .statusCode,
    ).toBe(403);
  });

  it('menyimpan pengaturan; kata sandi terenkripsi dan tidak pernah dikembalikan', async () => {
    const res = await call('PUT', adminCookie, {
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      user: 'kirim',
      password: 'rahasia-smtp-123',
      from: 'Edusync <noreply@example.test>',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      host: 'smtp.example.test',
      user: 'kirim',
      hasPassword: true,
      source: 'database',
    });
    expect(res.body).not.toContain('rahasia-smtp-123');
    const [row] = await app.platformDb.select().from(platformSetting).where(eq(platformSetting.key, 'smtp'));
    expect(JSON.stringify(row?.value)).not.toContain('rahasia-smtp-123');
  });

  it('mengosongkan kata sandi mempertahankan yang lama; nama pengguna tanpa kata sandi ditolak', async () => {
    const keep = await call('PUT', adminCookie, {
      host: 'smtp.example.test',
      port: 465,
      secure: true,
      user: 'kirim',
      from: 'Edusync <noreply@example.test>',
    });
    expect(keep.json()).toMatchObject({ port: 465, secure: true, hasPassword: true });

    const cleared = await call('PUT', adminCookie, {
      host: 'localhost',
      port: 1025,
      secure: false,
      clearAuth: true,
      from: 'Edusync <noreply@example.test>',
    });
    expect(cleared.json()).toMatchObject({ user: '', hasPassword: false });

    const bad = await call('PUT', adminCookie, {
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      user: 'baru',
      from: 'Edusync <noreply@example.test>',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ error: { code: 'smtp_password_required' } });
  });

  it('email uji ke server yang tidak ada gagal dengan pesan jelas', async () => {
    await call('PUT', adminCookie, {
      host: '127.0.0.1',
      port: 1,
      secure: false,
      clearAuth: true,
      from: 'Edusync <noreply@example.test>',
    });
    const res = await call(
      'POST',
      adminCookie,
      { to: 'tujuan@example.test' },
      '/v1/platform/smtp-settings/test',
    );
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'smtp_test_failed' } });
  });
});
