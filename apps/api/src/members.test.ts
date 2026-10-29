import { assignRoles, eq, foundation, member, school, seedSchoolRoles, sql, user } from '@edusync/db';
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
let otherSchoolId = '';
let foundationId = '';
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

async function join(userId: string, sid: string, roles: string[]) {
  const [m] = await app.platformDb.insert(member).values({ userId, schoolId: sid }).returning();
  await assignRoles(app.platformDb, m!.id, sid, roles);
  return m!.id;
}

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
  sid = schoolId,
) =>
  app.inject({
    method,
    url,
    headers: {
      cookie,
      'x-school-id': sid,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await app.platformDb
    .insert(foundation)
    .values({ name: 'Yayasan Anggota', slug: `ya-${run}` })
    .returning();
  foundationId = f!.id;
  for (const [slug, assign] of [
    [`ang-${run}`, (id: string) => (schoolId = id)],
    [`lain-${run}`, (id: string) => (otherSchoolId = id)],
  ] as const) {
    const [s] = await app.platformDb.insert(school).values({ foundationId, slug, name: slug }).returning();
    await seedSchoolRoles(app.platformDb, s!.id);
    assign(s!.id);
  }
});

afterAll(async () => {
  for (const sid of [schoolId, otherSchoolId]) {
    await app.platformDb.execute(sql`delete from invitation where school_id = ${sid}`);
    await app.platformDb.execute(sql`delete from outbox where school_id = ${sid}`);
    await app.platformDb.execute(sql`delete from audit_log where school_id = ${sid}`);
    await app.platformDb.execute(sql`delete from member where school_id = ${sid}`);
    await app.platformDb.execute(sql`delete from role where school_id = ${sid}`);
    await app.platformDb.delete(school).where(eq(school.id, sid));
  }
  await app.platformDb.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await app.platformDb.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('kelola anggota dan peran', () => {
  it('daftar peran dan anggota hanya untuk yang berizin member:read', async () => {
    const guru = await makeUser('guru-daftar');
    await join(guru.id, schoolId, ['teacher']);
    const guruCookie = await login(guru.email);
    expect((await call('GET', '/v1/members', guruCookie)).statusCode).toBe(403);
    expect((await call('GET', '/v1/roles', guruCookie)).statusCode).toBe(403);

    const kepsek = await makeUser('kepsek-daftar');
    await join(kepsek.id, schoolId, ['principal']);
    const cookie = await login(kepsek.email);
    const members = await call('GET', '/v1/members', cookie);
    expect(members.statusCode).toBe(200);
    expect(members.json().map((m: { email: string }) => m.email)).toContain(guru.email);
    const roles = (await call('GET', '/v1/roles', cookie)).json();
    expect(roles.find((r: { key: string }) => r.key === 'teacher').permissions).toEqual([
      'academic_year:read',
    ]);
    // Kepala sekolah hanya membaca.
    expect(
      (await call('POST', '/v1/members', cookie, { email: guru.email, roles: ['teacher'] })).statusCode,
    ).toBe(403);
  });

  it('admin menambah akun yang sudah terdaftar, mengganti peran, dan menonaktifkannya', async () => {
    const admin = await makeUser('admin-kelola');
    await join(admin.id, schoolId, ['school_admin']);
    const cookie = await login(admin.email);
    const baru = await makeUser('baru-kelola');

    const added = await call('POST', '/v1/members', cookie, {
      email: baru.email.toUpperCase(),
      roles: ['teacher'],
    });
    expect(added.statusCode).toBe(201);
    const id = added.json().id;
    expect(added.json().roles).toEqual(['teacher']);

    expect(
      (await call('POST', '/v1/members', cookie, { email: baru.email, roles: ['teacher'] })).statusCode,
    ).toBe(409);
    const missing = await call('POST', '/v1/members', cookie, {
      email: `tidak-ada-${run}@example.test`,
      roles: ['teacher'],
    });
    expect(missing.statusCode).toBe(404);
    expect(
      (await call('POST', '/v1/members', cookie, { email: baru.email, roles: ['tidak-ada'] })).statusCode,
    ).toBe(400);

    const rolesRes = await call('PUT', `/v1/members/${id}/roles`, cookie, { roles: ['teacher', 'operator'] });
    expect(rolesRes.statusCode).toBe(200);
    expect(rolesRes.json().roles).toEqual(['operator', 'teacher']);

    // Anggota baru langsung memakai izin gabungan.
    const baruCookie = await login(baru.email);
    expect((await call('GET', '/v1/members', baruCookie)).statusCode).toBe(200);

    const off = await call('PATCH', `/v1/members/${id}`, cookie, { status: 'disabled' });
    expect(off.statusCode).toBe(200);
    expect((await call('GET', '/v1/members', baruCookie)).statusCode).toBe(403);
    expect((await call('PATCH', `/v1/members/${id}`, cookie, { status: 'active' })).statusCode).toBe(200);
    expect((await call('GET', '/v1/members', baruCookie)).statusCode).toBe(200);

    const logs = await app.platformDb.execute<{ action: string }>(
      sql`select action from audit_log where school_id = ${schoolId} and entity_id = ${id} order by created_at`,
    );
    expect(logs.rows.map((r) => r.action)).toEqual([
      'member.add',
      'member.roles',
      'member.disable',
      'member.enable',
    ]);
  });

  it('sekolah tidak boleh kehilangan admin terakhir, dan tidak bisa menonaktifkan diri sendiri', async () => {
    const sid = otherSchoolId;
    const solo = await makeUser('admin-tunggal');
    const soloMember = await join(solo.id, sid, ['school_admin']);
    const cookie = await login(solo.email);

    const demote = await call('PUT', `/v1/members/${soloMember}/roles`, cookie, { roles: ['teacher'] }, sid);
    expect(demote.statusCode).toBe(409);
    expect(demote.json().error.code).toBe('last_admin');
    const self = await call('PATCH', `/v1/members/${soloMember}`, cookie, { status: 'disabled' }, sid);
    expect(self.statusCode).toBe(409);

    // Dengan admin kedua, admin pertama boleh melepas perannya.
    const kedua = await makeUser('admin-kedua');
    await join(kedua.id, sid, ['school_admin']);
    const ok = await call('PUT', `/v1/members/${soloMember}/roles`, cookie, { roles: ['teacher'] }, sid);
    expect(ok.statusCode).toBe(200);
  });

  it('tidak bisa menaikkan izin: pemegang member:manage tanpa izin lain tidak boleh memberi peran yang lebih tinggi', async () => {
    const sid = schoolId;
    // Peran khusus: hanya member:read + member:manage.
    await app.platformDb.execute(sql`insert into role (school_id, key, name) values (${sid}, 'hr', 'SDM')`);
    await app.platformDb.execute(
      sql`insert into role_permission (role_id, school_id, permission)
          select id, school_id, p from role, unnest(array['member:read','member:manage']) p
          where school_id = ${sid} and key = 'hr'`,
    );
    const hr = await makeUser('hr-user');
    await join(hr.id, sid, ['hr']);
    const cookie = await login(hr.email);
    const target = await makeUser('target-naik');
    const targetMember = await join(target.id, sid, ['teacher']);

    const grantAdmin = await call('PUT', `/v1/members/${targetMember}/roles`, cookie, {
      roles: ['teacher', 'school_admin'],
    });
    expect(grantAdmin.statusCode).toBe(403);
    const addAdmin = await call('POST', '/v1/members', cookie, {
      email: (await makeUser('calon-admin')).email,
      roles: ['school_admin'],
    });
    expect(addAdmin.statusCode).toBe(403);
    // Peran yang izinnya tidak melebihi miliknya boleh.
    const ok = await call('PUT', `/v1/members/${targetMember}/roles`, cookie, { roles: ['teacher'] });
    expect(ok.statusCode).toBe(200);
  });

  it('anggota sekolah lain tidak terlihat atau terjangkau', async () => {
    const adminA = await makeUser('admin-a-iso');
    await join(adminA.id, schoolId, ['school_admin']);
    const cookie = await login(adminA.email);
    const [other] = await app.platformDb
      .execute<{ id: string }>(sql`select id from member where school_id = ${otherSchoolId} limit 1`)
      .then((r) => r.rows);
    const list = (await call('GET', '/v1/members', cookie)).json();
    expect(list.find((m: { id: string }) => m.id === other?.id)).toBeUndefined();
    if (other) {
      expect(
        (await call('PATCH', `/v1/members/${other.id}`, cookie, { status: 'disabled' })).statusCode,
      ).toBe(404);
    }
  });
});

describe('undangan lewat email', () => {
  const invite = (cookie: string, payload: object) => call('POST', '/v1/invitations', cookie, payload);

  async function tokenFor(email: string) {
    const res = await app.platformDb.execute<{ payload: { text: string } }>(
      sql`select payload from outbox where payload->>'to' = ${email} order by created_at desc limit 1`,
    );
    const match = /\/invite\/([A-Za-z0-9_-]+)/.exec(res.rows[0]?.payload.text ?? '');
    return match?.[1] as string;
  }
  const preview = (token: string) => app.inject(`/v1/invitations/by-token/${token}`);
  const accept = (token: string, cookie: string) =>
    app.inject({
      method: 'POST',
      url: `/v1/invitations/by-token/${token}/accept`,
      headers: { cookie, origin, 'content-type': 'application/json' },
      payload: {},
    });

  it('mengundang email baru: email terkirim, orang itu mendaftar lalu menerima dan langsung punya izin', async () => {
    const admin = await makeUser('admin-undang');
    await join(admin.id, schoolId, ['school_admin']);
    const cookie = await login(admin.email);
    const email = `calon-${run}@example.test`;

    const created = await invite(cookie, { email: email.toUpperCase(), roles: ['teacher', 'operator'] });
    expect(created.statusCode).toBe(201);
    const pending = (await call('GET', '/v1/invitations', cookie)).json();
    expect(pending.find((i: { email: string }) => i.email === email).roles).toEqual(['teacher', 'operator']);

    const token = await tokenFor(email);
    expect(token).toBeTruthy();
    const view = (await preview(token)).json();
    expect(view).toMatchObject({ email, accountExists: false, schoolSlug: `ang-${run}` });

    // Daftar dengan email yang diundang, lalu terima.
    const signUp = await app.auth.api.signUpEmail({ body: { name: 'Calon Guru', email, password } });
    userIds.push(signUp.user.id);
    const invitee = await login(email);
    const ok = await accept(token, invitee);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().schoolSlug).toBe(`ang-${run}`);
    expect((await call('GET', '/v1/members', await login(email))).statusCode).toBe(200);

    // Token sekali pakai.
    expect((await accept(token, invitee)).statusCode).toBe(410);
    expect((await preview(token)).statusCode).toBe(410);
    expect(
      (await call('GET', '/v1/invitations', cookie)).json().find((i: { email: string }) => i.email === email),
    ).toBeUndefined();
  });

  it('akun lain tidak bisa memakai tautan; email yang diundang ulang mencabut undangan lama', async () => {
    const admin = await makeUser('admin-undang2');
    await join(admin.id, schoolId, ['school_admin']);
    const cookie = await login(admin.email);
    const target = await makeUser('target-undang');
    const stranger = await makeUser('orang-asing');

    expect((await invite(cookie, { email: target.email, roles: ['teacher'] })).statusCode).toBe(201);
    const first = await tokenFor(target.email);
    expect((await preview(first)).json().accountExists).toBe(true);
    expect((await accept(first, await login(stranger.email))).statusCode).toBe(403);
    expect(
      (await app.inject({ method: 'POST', url: `/v1/invitations/by-token/${first}/accept` })).statusCode,
    ).toBe(401);

    // Undang ulang: tautan lama mati, yang baru hidup.
    expect((await invite(cookie, { email: target.email, roles: ['teacher'] })).statusCode).toBe(201);
    expect((await preview(first)).statusCode).toBe(410);
    const second = await tokenFor(target.email);
    expect(second).not.toBe(first);
    expect((await accept(second, await login(target.email))).statusCode).toBe(200);
  });

  it('pencabutan, undangan kedaluwarsa, anggota yang sudah ada, dan kenaikan izin ditolak', async () => {
    const admin = await makeUser('admin-undang3');
    await join(admin.id, schoolId, ['school_admin']);
    const cookie = await login(admin.email);
    const email = `cabut-${run}@example.test`;

    const created = (await invite(cookie, { email, roles: ['teacher'] })).json();
    const token = await tokenFor(email);
    expect((await call('DELETE', `/v1/invitations/${created.id}`, cookie)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/invitations/${created.id}`, cookie)).statusCode).toBe(404);
    expect((await preview(token)).statusCode).toBe(410);

    const later = (await invite(cookie, { email: `lama-${run}@example.test`, roles: ['teacher'] })).json();
    await app.platformDb.execute(
      sql`update invitation set expires_at = now() - interval '1 minute' where id = ${later.id}`,
    );
    expect((await preview(await tokenFor(`lama-${run}@example.test`))).statusCode).toBe(410);

    const existing = await makeUser('sudah-anggota');
    await join(existing.id, schoolId, ['teacher']);
    expect((await invite(cookie, { email: existing.email, roles: ['teacher'] })).statusCode).toBe(409);

    // Pemegang member:manage tanpa izin lain tidak boleh mengundang sebagai admin; guru tidak boleh mengundang sama sekali.
    const guru = await makeUser('guru-undang');
    await join(guru.id, schoolId, ['teacher']);
    expect(
      (await invite(await login(guru.email), { email: `x-${run}@example.test`, roles: ['teacher'] }))
        .statusCode,
    ).toBe(403);
  });
});
