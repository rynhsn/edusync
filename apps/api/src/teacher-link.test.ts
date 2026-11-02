import {
  assignRoles,
  eq,
  foundation,
  member,
  school,
  seedSchoolRoles,
  sql,
  teacher,
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
let adminCookie = '';
const userIds: string[] = [];

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
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

async function join(userId: string, roles: string[]) {
  const [m] = await app.platformDb.insert(member).values({ userId, schoolId }).returning();
  await assignRoles(app.platformDb, m!.id, schoolId, roles);
  return m!.id;
}

const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, cookie: string, payload?: object) =>
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

async function newTeacher(name: string) {
  const res = await call('POST', '/v1/teachers', adminCookie, { name: `${name} ${run}` });
  return res.json().id as string;
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await app.platformDb
    .insert(foundation)
    .values({ name: 'Yayasan Tautan Guru', slug: `tg-${run}` })
    .returning();
  foundationId = f!.id;
  const [s] = await app.platformDb
    .insert(school)
    .values({ foundationId, slug: `tg-${run}`, name: 'Tautan Guru' })
    .returning();
  schoolId = s!.id;
  await seedSchoolRoles(app.platformDb, schoolId);
  const admin = await makeUser('admin-tautan');
  await join(admin.id, ['school_admin']);
  adminCookie = await login(admin.email);
});

afterAll(async () => {
  for (const table of ['invitation', 'outbox', 'audit_log', 'teacher', 'member', 'role']) {
    await app.platformDb.execute(sql.raw(`delete from ${table} where school_id = '${schoolId}'`));
  }
  await app.platformDb.delete(school).where(eq(school.id, schoolId));
  await app.platformDb.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await app.platformDb.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('tautan akun guru', () => {
  it('menautkan anggota ke guru, menolak anggota yang sama untuk guru lain, lalu melepasnya', async () => {
    const guruAkun = await makeUser('guru-tautan');
    const memberId = await join(guruAkun.id, ['teacher']);
    const a = await newTeacher('Guru A');
    const b = await newTeacher('Guru B');

    const linked = await call('PUT', `/v1/teachers/${a}/account`, adminCookie, { memberId });
    expect(linked.statusCode).toBe(200);
    expect(linked.json().memberId).toBe(memberId);

    // Sistem kini tahu guru mana yang login: izin pada data lain bergantung pada tautan ini.
    const dup = await call('PUT', `/v1/teachers/${b}/account`, adminCookie, { memberId });
    expect(dup.statusCode).toBe(409);

    const unlinked = await call('PUT', `/v1/teachers/${a}/account`, adminCookie, { memberId: null });
    expect(unlinked.json().memberId).toBeNull();
    expect((await call('PUT', `/v1/teachers/${b}/account`, adminCookie, { memberId })).statusCode).toBe(200);
  });

  it('menolak anggota nonaktif, anggota yang tidak ada, dan pemanggil tanpa izin kelola anggota', async () => {
    const nonaktif = await makeUser('nonaktif-tautan');
    const memberId = await join(nonaktif.id, ['teacher']);
    await app.platformDb.update(member).set({ status: 'disabled' }).where(eq(member.id, memberId));
    const t = await newTeacher('Guru C');
    expect((await call('PUT', `/v1/teachers/${t}/account`, adminCookie, { memberId })).statusCode).toBe(400);
    expect(
      (await call('PUT', `/v1/teachers/${t}/account`, adminCookie, { memberId: crypto.randomUUID() }))
        .statusCode,
    ).toBe(400);

    const biasa = await makeUser('biasa-tautan');
    await join(biasa.id, ['teacher']);
    const cookie = await login(biasa.email);
    expect((await call('PUT', `/v1/teachers/${t}/account`, cookie, { memberId: null })).statusCode).toBe(403);
  });

  it('undangan membawa guru: akun tertaut otomatis saat undangan diterima', async () => {
    const t = await newTeacher('Guru D');
    const email = `undangan-guru-${run}@example.test`;
    const res = await call('POST', '/v1/invitations', adminCookie, {
      email,
      roles: ['teacher'],
      teacherId: t,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().teacherId).toBe(t);

    const out = await app.platformDb.execute<{ payload: { text: string } }>(
      sql`select payload from outbox where payload->>'to' = ${email} order by created_at desc limit 1`,
    );
    const token = /\/invite\/([A-Za-z0-9_-]+)/.exec(out.rows[0]?.payload.text ?? '')?.[1] as string;
    const signUp = await app.auth.api.signUpEmail({ body: { name: 'Guru D', email, password } });
    userIds.push(signUp.user.id);
    const cookie = await login(email);
    const accepted = await app.inject({
      method: 'POST',
      url: `/v1/invitations/by-token/${token}/accept`,
      headers: { cookie, origin, 'content-type': 'application/json' },
      payload: {},
    });
    expect(accepted.statusCode).toBe(200);

    const [row] = await app.platformDb.select().from(teacher).where(eq(teacher.id, t));
    const [m] = await app.platformDb.select().from(member).where(eq(member.userId, signUp.user.id));
    expect(row?.memberId).toBe(m?.id);

    // Guru yang sudah punya akun tidak bisa diundang lagi.
    const again = await call('POST', '/v1/invitations', adminCookie, {
      email: `lain-${run}@example.test`,
      roles: ['teacher'],
      teacherId: t,
    });
    expect(again.statusCode).toBe(409);
  });

  it('undangan dengan guru yang tidak ada ditolak', async () => {
    const res = await call('POST', '/v1/invitations', adminCookie, {
      email: `hantu-guru-${run}@example.test`,
      roles: ['teacher'],
      teacherId: crypto.randomUUID(),
    });
    expect(res.statusCode).toBe(400);
  });
});
