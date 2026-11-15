import {
  assignRoles,
  entitlement,
  eq,
  foundation,
  member,
  reportSetting,
  school,
  seedSchoolRoles,
  signerCredential,
  sql,
  subscription,
  user,
  withTenant,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { resolvePrincipal } from './principal-lib';
import { isUniqueViolation } from './routes/helpers';

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
let otherId = '';
let foundationId = '';
const userIds: string[] = [];
const cookies = { admin: '', principal: '', teacher: '', other: '' };
const mem = { a: '', b: '', other: '' };

async function join(label: string, sid: string, roles: string[]) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  const [m] = await app.platformDb.insert(member).values({ userId: res.user.id, schoolId: sid }).returning();
  await assignRoles(app.platformDb, m!.id, sid, roles);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return { cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join('; '), memberId: m!.id };
}

const call = (
  method: 'GET' | 'POST' | 'PUT',
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

const resolve = (sid = schoolId) => withTenant(app.tenantDb, [sid], (tx) => resolvePrincipal(tx, sid));
const signers = async (cookie = cookies.admin, sid = schoolId) =>
  (await call('GET', '/v1/letters/signers', cookie, undefined, sid)).json() as {
    id: string;
    name: string;
    isPrincipal: boolean;
    active: boolean;
  }[];

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Kepsek', slug: `yk-${run}` })
    .returning();
  foundationId = f!.id;
  const [sub] = await db
    .insert(subscription)
    .values({
      foundationId,
      period: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  const make = async (slug: string) => {
    const [s] = await db.insert(school).values({ foundationId, slug, name: slug }).returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of ['administration', 'grades']) {
      await db
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    return s!.id;
  };
  schoolId = await make(`kepsek-a-${run}`);
  otherId = await make(`kepsek-b-${run}`);
  const admin = await join('admin-kepsek', schoolId, ['school_admin']);
  const principal = await join('kepsek-kepsek', schoolId, ['principal']);
  const teacher = await join('guru-kepsek', schoolId, ['teacher']);
  const other = await join('admin-kepsek-lain', otherId, ['school_admin']);
  cookies.admin = admin.cookie;
  cookies.principal = principal.cookie;
  cookies.teacher = teacher.cookie;
  cookies.other = other.cookie;
  mem.a = principal.memberId;
  mem.b = teacher.memberId;
  mem.other = other.memberId;
}, 60_000);

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherId]) {
    for (const table of [
      'audit_log',
      'signer_credential',
      'report_setting',
      'member',
      'role',
      'entitlement',
    ]) {
      await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
    await db.delete(school).where(eq(school.id, sid));
  }
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
}, 60_000);

const body = (memberId: string, name: string, extra: object = {}) => ({
  memberId,
  name,
  nip: null,
  title: 'Kepala Sekolah',
  ...extra,
});

describe('resolvePrincipal', () => {
  it('tanpa penanda dan tanpa pengaturan: null; pengaturan rapor menjadi cadangan', async () => {
    expect(await resolve()).toBeNull();
    await app.platformDb
      .insert(reportSetting)
      .values({ schoolId, principalName: 'Cadangan', principalNip: '111' });
    expect(await resolve()).toEqual({ name: 'Cadangan', nip: '111', source: 'report_setting' });
  });

  it('penandatangan aktif bertanda kepala sekolah menang; nonaktif kembali ke cadangan', async () => {
    const res = await call(
      'POST',
      '/v1/letters/signers',
      cookies.admin,
      body(mem.a, 'Kepsek Utama', { isPrincipal: true, nip: '222' }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().isPrincipal).toBe(true);
    expect(await resolve()).toEqual({ name: 'Kepsek Utama', nip: '222', source: 'signer' });
    const off = await call('PUT', `/v1/letters/signers/${res.json().id}`, cookies.admin, {
      name: 'Kepsek Utama',
      nip: '222',
      title: 'Kepala Sekolah',
      active: false,
    });
    expect(off.statusCode).toBe(200);
    // isPrincipal dihilangkan = tidak berubah, tetapi yang nonaktif tidak dipakai.
    expect(off.json()).toMatchObject({ isPrincipal: true, active: false });
    expect(await resolve()).toMatchObject({ name: 'Cadangan', source: 'report_setting' });
  });
});

describe('satu kepala sekolah aktif per sekolah', () => {
  it('menandai yang lain melepas tanda sebelumnya; mengaktifkan kembali pun melepas yang lain', async () => {
    const [first] = await signers();
    const second = await call(
      'POST',
      '/v1/letters/signers',
      cookies.admin,
      body(mem.b, 'Kepsek Baru', { isPrincipal: true }),
    );
    expect(second.statusCode).toBe(201);
    let list = await signers();
    expect(list.filter((s) => s.isPrincipal && s.active).map((s) => s.name)).toEqual(['Kepsek Baru']);

    // Yang pertama sudah dilepas tandanya; menandainya lagi (dan aktif) melepas yang sekarang.
    const back = await call('PUT', `/v1/letters/signers/${first!.id}`, cookies.admin, {
      name: first!.name,
      title: 'Kepala Sekolah',
      active: true,
      isPrincipal: true,
    });
    expect(back.statusCode).toBe(200);
    list = await signers();
    expect(list.filter((s) => s.isPrincipal && s.active).map((s) => s.id)).toEqual([first!.id]);
    expect(await resolve()).toMatchObject({ name: 'Kepsek Utama', source: 'signer' });
  });

  it('indeks unik parsial menolak dua kepala sekolah aktif langsung di basis data', async () => {
    const [second] = (await signers()).filter((s) => !s.isPrincipal);
    const err = await app.platformDb
      .update(signerCredential)
      .set({ isPrincipal: true })
      .where(eq(signerCredential.id, second!.id))
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(isUniqueViolation(err)).toBe(true);
  });
});

describe('izin dan tenant', () => {
  it('hanya pengelola penandatangan; guru dan kepala sekolah (baca saja) ditolak 403', async () => {
    const [target] = await signers();
    const put = { name: target!.name, title: 'Kepala Sekolah', active: true, isPrincipal: false };
    expect((await call('PUT', `/v1/letters/signers/${target!.id}`, cookies.teacher, put)).statusCode).toBe(
      403,
    );
    expect((await call('PUT', `/v1/letters/signers/${target!.id}`, cookies.principal, put)).statusCode).toBe(
      403,
    );
    expect((await call('POST', '/v1/letters/signers', cookies.teacher, body(mem.a, 'x'))).statusCode).toBe(
      403,
    );
  });

  it('sekolah lain tidak terpengaruh dan tidak melihat tanda kepala sekolah', async () => {
    expect(await resolve(otherId)).toBeNull();
    expect(await signers(cookies.other, otherId)).toEqual([]);
    const res = await call(
      'POST',
      '/v1/letters/signers',
      cookies.other,
      body(mem.other, 'Kepsek Lain', { isPrincipal: true }),
      otherId,
    );
    expect(res.statusCode).toBe(201);
    expect(await resolve(otherId)).toMatchObject({ name: 'Kepsek Lain', source: 'signer' });
    // Menandai di sekolah lain tidak melepas tanda di sekolah ini.
    expect((await signers()).filter((s) => s.isPrincipal && s.active)).toHaveLength(1);
    expect(await resolve()).toMatchObject({ source: 'signer' });
    // Pengelola sekolah ini tidak dapat mengubah penandatangan sekolah lain.
    const foreign = await call('PUT', `/v1/letters/signers/${res.json().id}`, cookies.admin, {
      name: 'x',
      title: 'y',
      isPrincipal: false,
    });
    expect(foreign.statusCode).toBe(404);
  });
});
