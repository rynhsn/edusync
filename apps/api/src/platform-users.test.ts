import { auditLog, eq, inArray, platformStaff, session, sql, user } from '@edusync/db';
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
let target = { id: '', email: '', cookie: '' };

async function makeUser(label: string) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: json,
    payload: { email, password },
  });
  return {
    id: res.user.id,
    email,
    cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
  };
}

const call = (method: 'GET' | 'POST', url: string, cookie: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: { cookie, origin, ...(payload ? { 'content-type': 'application/json' } : {}) },
    ...(payload ? { payload } : {}),
  });
const me = (cookie: string) =>
  app.inject({ method: 'GET', url: '/api/auth/get-session', headers: { cookie } });

beforeAll(async () => {
  app = await buildApp(loadEnv({ ...process.env, NODE_ENV: 'test' }));
  await app.ready();
  const admin = await makeUser('pu-admin');
  const viewer = await makeUser('pu-baca');
  target = await makeUser(`pu-target`);
  adminCookie = admin.cookie;
  viewerCookie = viewer.cookie;
  await app.platformDb.insert(platformStaff).values([
    { userId: admin.id, role: 'admin' },
    { userId: viewer.id, role: 'read_only' },
  ]);
});

afterAll(async () => {
  const db = app.platformDb;
  await db.execute(
    sql`delete from audit_log where actor_id in (${sql.join(
      userIds.map((u) => sql`${u}`),
      sql`, `,
    )})`,
  );
  await db.delete(platformStaff).where(inArray(platformStaff.userId, userIds));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('pengguna di konsol platform', () => {
  it('staf baca bisa mencari; hasil tanpa token; q pendek ditolak; bukan staf ditolak', async () => {
    const res = await call('GET', `/v1/platform/users?q=pu-target-${run}`, viewerCookie);
    expect(res.statusCode).toBe(200);
    const rows = res.json();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: target.id,
      email: target.email,
      activeSessions: 2,
      schools: 0,
      isStaff: false,
    });
    expect(res.body).not.toContain('token');
    const adminRow = (await call('GET', `/v1/platform/users?q=pu-admin-${run}`, viewerCookie)).json();
    expect(adminRow[0].isStaff).toBe(true);
    expect((await call('GET', '/v1/platform/users?q=a', viewerCookie)).statusCode).toBe(400);
    expect((await call('GET', `/v1/platform/users?q=pu-target-${run}`, target.cookie)).statusCode).toBe(403);
  });

  it('staf baca tidak bisa mengeluarkan (403)', async () => {
    const res = await call('POST', `/v1/platform/users/${target.id}/revoke-sessions`, viewerCookie, {
      reason: 'uji',
    });
    expect(res.statusCode).toBe(403);
  });

  it('alasan wajib; pengguna tidak ada 404', async () => {
    const url = `/v1/platform/users/${target.id}/revoke-sessions`;
    expect((await call('POST', url, adminCookie, {})).statusCode).toBe(400);
    expect((await call('POST', url, adminCookie, { reason: 'ab' })).statusCode).toBe(400);
    const none = await call('POST', '/v1/platform/users/tidak-ada/revoke-sessions', adminCookie, {
      reason: 'uji coba',
    });
    expect(none.statusCode).toBe(404);
  });

  it('staf admin mengeluarkan semua perangkat: sesi habis dan ada jejak audit', async () => {
    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: json,
      payload: { email: target.email, password },
    });
    const secondCookie = second.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    expect((await me(target.cookie)).json()).not.toBeNull();
    expect((await me(secondCookie)).json()).not.toBeNull();

    const res = await call('POST', `/v1/platform/users/${target.id}/revoke-sessions`, adminCookie, {
      reason: 'Perangkat hilang',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, revoked: 3 });
    expect((await me(target.cookie)).json()).toBeNull();
    expect((await me(secondCookie)).json()).toBeNull();
    const left = await app.platformDb.select().from(session).where(eq(session.userId, target.id));
    expect(left).toHaveLength(0);

    const logs = await app.platformDb.select().from(auditLog).where(eq(auditLog.entityId, target.id));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'user.sessions_revoked', schoolId: null });
    expect(logs[0]?.details).toMatchObject({ reason: 'Perangkat hilang', revoked: 3 });
  });
});
