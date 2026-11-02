import {
  assignRoles,
  entitlement,
  eq,
  foundation,
  member,
  school,
  seedSchoolRoles,
  sql,
  subscription,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import type { DomainDns } from './domain-dns';
import { loadEnv } from './env';
import { createDynamicOriginChecker, createHostResolver } from './origins';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const host = (n: string) => `${n}-${run}.example.test`;

/** DNS palsu: isi diatur per tes, tanpa jaringan. */
const zone = {
  txt: new Map<string, string[][]>(),
  cname: new Map<string, string[]>(),
  a: new Map<string, string[]>(),
};
const miss = () => Promise.reject(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
const fakeDns: DomainDns = {
  resolveTxt: (n) => (zone.txt.has(n) ? Promise.resolve(zone.txt.get(n) as string[][]) : miss()),
  resolveCname: (n) => (zone.cname.has(n) ? Promise.resolve(zone.cname.get(n) as string[]) : miss()),
  resolve4: (n) => (zone.a.has(n) ? Promise.resolve(zone.a.get(n) as string[]) : miss()),
};

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let otherId = '';
let noModuleId = '';
let foundationId = '';
let slug = '';
const userIds: string[] = [];
let adminCookie = '';
let teacherCookie = '';
let otherCookie = '';
let noModuleCookie = '';

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
  return login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

const call = (
  method: 'GET' | 'POST' | 'DELETE',
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

const code = (res: { json: () => { error: { code: string } } }) => res.json().error.code;
const add = async (hostname: string, cookie = adminCookie, sid = schoolId) =>
  call('POST', '/v1/school/domains', cookie, { hostname }, sid);

beforeAll(async () => {
  app = await buildApp(loadEnv({ ...process.env, NODE_ENV: 'test' }), { dns: fakeDns });
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Domain', slug: `yd-${run}` })
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
  const make = async (s: string, withWebsite: boolean) => {
    const [r] = await db
      .insert(school)
      .values({ foundationId, slug: s, name: `Sekolah ${s}` })
      .returning();
    await seedSchoolRoles(db, r!.id);
    if (withWebsite) {
      await db.insert(entitlement).values({
        schoolId: r!.id,
        moduleKey: 'website',
        subscriptionId: sub!.id,
        validUntil: sub!.currentPeriodEnd,
      });
    }
    return r!.id;
  };
  slug = `dm-${run}`;
  schoolId = await make(slug, true);
  otherId = await make(`dm-lain-${run}`, true);
  noModuleId = await make(`dm-nomod-${run}`, false);
  adminCookie = await join('adm', schoolId, ['school_admin']);
  teacherCookie = await join('guru', schoolId, ['teacher']);
  otherCookie = await join('lain', otherId, ['school_admin']);
  noModuleCookie = await join('nomod', noModuleId, ['school_admin']);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherId, noModuleId]) {
    for (const table of ['audit_log', 'school_domain', 'entitlement', 'member', 'role']) {
      await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
    await db.delete(school).where(eq(school.id, sid));
  }
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('domain sendiri: tambah dan validasi', () => {
  it('menolak hostname tidak sah, IP, localhost, dan milik APP_DOMAIN', async () => {
    for (const bad of ['sekolah', '10.1.2.3', 'x.localhost', 'localhost:3000', 'a.com/path']) {
      const res = await add(bad);
      expect(res.statusCode, bad).toBe(400);
      expect(code(res)).toBe('invalid_hostname');
    }
    const base = loadEnv({ ...process.env, NODE_ENV: 'test' }).APP_DOMAIN.replace(/:\d+$/, '');
    expect(code(await add(`smp.${base}`))).toBe('invalid_hostname');
  });

  it('menambah domain: huruf kecil, status pending, catatan DNS lengkap', async () => {
    const res = await add(host('Satu').toUpperCase());
    expect(res.statusCode).toBe(201);
    const d = res.json();
    expect(d.hostname).toBe(host('satu'));
    expect(d.status).toBe('pending');
    expect(d.records.map((r: { type: string }) => r.type)).toEqual(['CNAME', 'TXT']);
    expect(d.records[1].name).toBe(`_edusync-verify.${host('satu')}`);
    expect(d.records[1].value).toMatch(/^edusync-[0-9a-f]{32}$/);
  });

  it('hostname dobel di sekolah yang sama ditolak 409; sekolah lain boleh mendaftarkannya (pending)', async () => {
    expect((await add(host('satu'))).statusCode).toBe(409);
    // Sekolah lain tidak melihat domain milik sekolah ini.
    const before = await call('GET', '/v1/school/domains', otherCookie, undefined, otherId);
    expect(before.json()).toEqual([]);
    // Mendaftarkan hostname yang sama tidak mengunci domain: baru yang lolos verifikasi yang memilikinya.
    const other = await add(host('satu'), otherCookie, otherId);
    expect(other.statusCode).toBe(201);
    expect(other.json().status).toBe('pending');
  });

  it('maksimal 3 domain per sekolah', async () => {
    expect((await add(host('dua'))).statusCode).toBe(201);
    expect((await add(host('tiga'))).statusCode).toBe(201);
    const res = await add(host('empat'));
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('domain_limit');
  });

  it('izin dan modul: guru ditolak, sekolah tanpa modul website ditolak', async () => {
    expect((await call('GET', '/v1/school/domains', teacherCookie)).statusCode).toBe(403);
    expect((await add(host('guru'), teacherCookie)).statusCode).toBe(403);
    const res = await call('GET', '/v1/school/domains', noModuleCookie, undefined, noModuleId);
    expect(res.statusCode).toBe(403);
    expect(code(res)).toBe('module_disabled');
  });
});

describe('domain sendiri: verifikasi DNS dan resolusi host', () => {
  const resolveHost = (h: string) => app.inject({ method: 'GET', url: `/v1/public/resolve-host?host=${h}` });

  it('belum diverifikasi: host tidak dikenal', async () => {
    expect((await resolveHost(host('satu'))).statusCode).toBe(404);
  });

  it('DNS kosong → failed dengan petunjuk diharapkan vs ditemukan', async () => {
    const [d] = (await call('GET', '/v1/school/domains', adminCookie)).json();
    const res = await call('POST', `/v1/school/domains/${d.id}/verify`, adminCookie);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.domain.status).toBe('failed');
    expect(body.domain.lastError).toContain(d.hostname);
    expect(body.checks).toEqual([
      {
        kind: 'txt',
        name: `_edusync-verify.${d.hostname}`,
        ok: false,
        expected: d.records[1].value,
        found: [],
      },
      { kind: 'cname', name: d.hostname, ok: false, expected: d.records[0].value, found: [] },
    ]);
    expect((await resolveHost(d.hostname)).statusCode).toBe(404);
  });

  it('hanya TXT benar tanpa CNAME tetap failed; TXT + CNAME → verified dan dikenali', async () => {
    const [d] = (await call('GET', '/v1/school/domains', adminCookie)).json();
    zone.txt.set(`_edusync-verify.${d.hostname}`, [
      [d.records[1].value.slice(0, 10), d.records[1].value.slice(10)],
    ]);
    const half = await call('POST', `/v1/school/domains/${d.id}/verify`, adminCookie);
    expect(half.json().domain.status).toBe('failed');
    expect(half.json().checks.map((c: { ok: boolean }) => c.ok)).toEqual([true, false]);

    zone.cname.set(d.hostname, [`${d.records[0].value.toUpperCase()}.`]);
    const done = await call('POST', `/v1/school/domains/${d.id}/verify`, adminCookie);
    expect(done.json().domain.status).toBe('verified');
    expect(done.json().domain.verifiedAt).not.toBeNull();

    const res = await resolveHost(d.hostname.toUpperCase());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ schoolSlug: slug });
  });

  it('hostname yang sudah terverifikasi sekolah lain: verifikasi sekolah kedua ditolak 409', async () => {
    const list = (await call('GET', '/v1/school/domains', otherCookie, undefined, otherId)).json();
    const d = list.find((x: { hostname: string }) => x.hostname === host('satu'));
    const name = `_edusync-verify.${d.hostname}`;
    // Pemilik DNS menaruh kedua token: DNS lolos, tetapi domain sudah dimiliki sekolah pertama.
    zone.txt.set(name, [...(zone.txt.get(name) ?? []), [d.records[1].value]]);
    const res = await call('POST', `/v1/school/domains/${d.id}/verify`, otherCookie, undefined, otherId);
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('conflict');
    const after = (await call('GET', '/v1/school/domains', otherCookie, undefined, otherId)).json();
    expect(after[0].status).toBe('pending');
    expect((await resolveHost(d.hostname)).json()).toEqual({ schoolSlug: slug });
  });

  it('apex: A yang sama dengan target diterima', async () => {
    const list = (await call('GET', '/v1/school/domains', adminCookie)).json();
    const d = list.find((x: { hostname: string }) => x.hostname === host('dua'));
    zone.txt.set(`_edusync-verify.${d.hostname}`, [[d.records[1].value]]);
    zone.a.set(d.hostname, ['203.0.113.7']);
    zone.a.set(d.records[0].value, ['203.0.113.7']);
    const res = await call('POST', `/v1/school/domains/${d.id}/verify`, adminCookie);
    expect(res.json().domain.status).toBe('verified');
  });

  it('sekolah lain tidak bisa memeriksa atau menghapus domain ini (404)', async () => {
    const [d] = (await call('GET', '/v1/school/domains', adminCookie)).json();
    expect(
      (await call('POST', `/v1/school/domains/${d.id}/verify`, otherCookie, undefined, otherId)).statusCode,
    ).toBe(404);
    expect(
      (await call('DELETE', `/v1/school/domains/${d.id}`, otherCookie, undefined, otherId)).statusCode,
    ).toBe(404);
  });

  it('origin dinamis: hanya hostname terverifikasi dengan skema sama dan tanpa port', async () => {
    const list = (await call('GET', '/v1/school/domains', adminCookie)).json();
    const verified = list.find((x: { status: string }) => x.status === 'verified').hostname;
    const pending = list.find((x: { status: string }) => x.status !== 'verified').hostname;
    const prod = createDynamicOriginChecker(() => false, app.hosts, 'https:');
    expect(await prod(`https://${verified}`)).toBe(true);
    expect(await prod(`http://${verified}`)).toBe(false);
    expect(await prod(`https://${verified}:8443`)).toBe(false);
    expect(await prod(`https://${verified}/x`)).toBe(false);
    expect(await prod(`https://evil.${verified}`)).toBe(false);
    expect(await prod(`https://${pending}`)).toBe(false);
  });

  it('CORS memakai domain terverifikasi, bukan yang pending', async () => {
    const list = (await call('GET', '/v1/school/domains', adminCookie)).json();
    const verified = list.find((x: { status: string }) => x.status === 'verified').hostname;
    const pending = list.find((x: { status: string }) => x.status !== 'verified').hostname;
    const probe = (o: string) =>
      app.inject({ method: 'GET', url: '/v1/public/resolve-host?host=x.test', headers: { origin: o } });
    // Skema tes adalah http (AUTH_URL lokal), jadi origin http tanpa port diterima bila terverifikasi.
    expect((await probe(`http://${verified}`)).headers['access-control-allow-origin']).toBe(
      `http://${verified}`,
    );
    expect((await probe(`http://${pending}`)).headers['access-control-allow-origin']).toBeUndefined();
  });

  it('hapus: domain berhenti dikenali', async () => {
    const list = (await call('GET', '/v1/school/domains', adminCookie)).json();
    const d = list.find((x: { status: string }) => x.status === 'verified');
    expect((await call('DELETE', `/v1/school/domains/${d.id}`, adminCookie)).statusCode).toBe(200);
    expect((await resolveHost(d.hostname)).statusCode).toBe(404);
  });

  it('sekolah ditangguhkan: host tidak lagi dipetakan', async () => {
    const list = (await call('GET', '/v1/school/domains', adminCookie)).json();
    const d = list.find((x: { status: string }) => x.status === 'verified');
    expect((await resolveHost(d.hostname)).statusCode).toBe(200);
    await app.platformDb.update(school).set({ status: 'suspended' }).where(eq(school.id, schoolId));
    app.hosts.invalidate();
    expect((await resolveHost(d.hostname)).statusCode).toBe(404);
    await app.platformDb.update(school).set({ status: 'active' }).where(eq(school.id, schoolId));
  });
});

describe('cache host', () => {
  it('menyimpan hasil 60 detik lalu mencari ulang', async () => {
    let calls = 0;
    let t = 0;
    const r = createHostResolver(
      async () => {
        calls++;
        return 'x';
      },
      () => t,
    );
    await r.resolve('A.test');
    await r.resolve('a.test');
    expect(calls).toBe(1);
    t = 61_000;
    await r.resolve('a.test');
    expect(calls).toBe(2);
    r.invalidate();
    await r.resolve('a.test');
    expect(calls).toBe(3);
  });
});
