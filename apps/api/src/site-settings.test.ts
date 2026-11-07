import {
  DEFAULT_SITE_CONTENT,
  SITE_ASSET_SLOTS,
  SITE_CONTENT_KEY,
  type SiteContent,
} from '@edusync/contracts';
import { eq, platformSetting, platformStaff, siteAsset, sql, user } from '@edusync/db';
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
let outsiderCookie = '';
let previousContent: Record<string, unknown> | undefined;
let previousAssets: (typeof siteAsset.$inferSelect)[] = [];

// PNG 1x1 yang sah (tanda tangan + isi secukupnya).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function makeUser(label: string, role?: 'admin' | 'read_only') {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  if (role) await app.platformDb.insert(platformStaff).values({ userId: res.user.id, role });
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: json,
    payload: { email, password },
  });
  return login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

const call = (method: 'GET' | 'PUT' | 'DELETE', url: string, cookie: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: { cookie, origin, ...(payload ? { 'content-type': 'application/json' } : {}) },
    ...(payload ? { payload } : {}),
  });

const upload = (key: string, cookie: string, mime: string, bytes: Buffer | string) =>
  call('PUT', `/v1/platform/site/assets/${key}`, cookie, {
    mime,
    data: Buffer.from(bytes).toString('base64'),
  });

beforeAll(async () => {
  app = await buildApp(loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev' }));
  await app.ready();
  const [row] = await app.platformDb
    .select()
    .from(platformSetting)
    .where(eq(platformSetting.key, SITE_CONTENT_KEY));
  previousContent = row?.value as Record<string, unknown> | undefined;
  previousAssets = await app.platformDb.select().from(siteAsset);
  // Mulai dari keadaan bersih supaya uji bawaan tidak bergantung pada data lokal.
  await app.platformDb.delete(platformSetting).where(eq(platformSetting.key, SITE_CONTENT_KEY));
  await app.platformDb.delete(siteAsset);
  adminCookie = await makeUser('site-admin', 'admin');
  viewerCookie = await makeUser('site-baca', 'read_only');
  outsiderCookie = await makeUser('site-luar');
});

afterAll(async () => {
  const db = app.platformDb;
  await db.delete(platformSetting).where(eq(platformSetting.key, SITE_CONTENT_KEY));
  if (previousContent)
    await db.insert(platformSetting).values({ key: SITE_CONTENT_KEY, value: previousContent });
  await db.delete(siteAsset);
  if (previousAssets.length > 0) await db.insert(siteAsset).values(previousAssets);
  const ids = sql.join(
    userIds.map((u) => sql`${u}`),
    sql`, `,
  );
  await db.execute(sql`delete from audit_log where actor_id in (${ids})`);
  await db.execute(sql`delete from platform_staff where user_id in (${ids})`);
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('situs Edusync: isi', () => {
  it('belum diatur: isi bawaan sama dengan teks halaman utama, publik dan staf', async () => {
    const staff = await call('GET', '/v1/platform/site', viewerCookie);
    expect(staff.statusCode).toBe(200);
    expect(staff.json()).toMatchObject({ customized: false, assets: [] });
    expect(staff.json().content).toEqual(DEFAULT_SITE_CONTENT);
    expect(staff.json().slots).toHaveLength(6);

    const pub = await app.inject({ method: 'GET', url: '/v1/public/site' });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().content).toEqual(DEFAULT_SITE_CONTENT);
    expect(pub.json().assets).toEqual({});
  });

  it('hanya staf: orang luar 403, staf baca tidak boleh mengubah, tanpa login 401', async () => {
    expect((await call('GET', '/v1/platform/site', outsiderCookie)).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/v1/platform/site' })).statusCode).toBe(401);
    expect((await call('PUT', '/v1/platform/site', viewerCookie, DEFAULT_SITE_CONTENT)).statusCode).toBe(403);
    expect((await call('DELETE', '/v1/platform/site', viewerCookie)).statusCode).toBe(403);
    expect((await upload('logo', viewerCookie, 'image/png', PNG)).statusCode).toBe(403);
    expect((await upload('logo', outsiderCookie, 'image/png', PNG)).statusCode).toBe(403);
    expect((await call('DELETE', '/v1/platform/site/assets/logo', viewerCookie)).statusCode).toBe(403);
  });

  it('menyimpan isi, terbaca publik dengan nilai baru, tercatat di audit', async () => {
    const next = structuredClone(DEFAULT_SITE_CONTENT) as SiteContent;
    next.brandName = 'Contoh Sync';
    next.locales.id.heroTitle = 'Judul baru';
    next.sections.about = true;
    next.contact.email = 'halo@example.test';
    next.features = next.features.slice(0, 2);
    const res = await call('PUT', '/v1/platform/site', adminCookie, next);
    expect(res.statusCode).toBe(200);
    expect(res.json().customized).toBe(true);
    expect(res.json().content.features).toHaveLength(2);

    const pub = await app.inject({ method: 'GET', url: '/v1/public/site' });
    expect(pub.json().content.brandName).toBe('Contoh Sync');
    expect(pub.json().content.locales.id.heroTitle).toBe('Judul baru');
    expect(pub.json().content.locales.en.heroTitle).toBe(DEFAULT_SITE_CONTENT.locales.en.heroTitle);

    const audit = await app.platformDb.execute<{ action: string }>(
      sql`select action from audit_log where action = 'site.content_update' and actor_id in (${userIds[0]})`,
    );
    expect(audit.rows.length).toBe(1);
  });

  it('data tidak valid ditolak: ikon di luar daftar, judul kosong, tautan berbahaya, fitur terlalu banyak', async () => {
    const base = structuredClone(DEFAULT_SITE_CONTENT);
    const bad = async (mutate: (c: Record<string, any>) => void) => {
      const c = structuredClone(base) as Record<string, any>;
      mutate(c);
      const res = await call('PUT', '/v1/platform/site', adminCookie, c);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: 'validation' } });
    };
    await bad((c) => {
      c.features[0].icon = 'Bomb';
    });
    await bad((c) => {
      c.locales.en.heroTitle = '   ';
    });
    await bad((c) => {
      c.social.instagram = 'javascript:alert(1)';
    });
    await bad((c) => {
      c.contact.email = 'bukan-email';
    });
    await bad((c) => {
      c.features = Array(13).fill(c.features[0]);
    });
    await bad((c) => {
      c.brandName = '';
    });
  });

  it('mengembalikan ke bawaan', async () => {
    const res = await call('DELETE', '/v1/platform/site', adminCookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ customized: false });
    expect(res.json().content).toEqual(DEFAULT_SITE_CONTENT);
  });
});

describe('situs Edusync: gambar', () => {
  it('slot kosong: publik 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/public/site-assets/logo' });
    expect(res.statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/v1/public/site-assets/bukan-slot' })).statusCode).toBe(
      404,
    );
  });

  it('mengunggah PNG, menyajikannya dengan ETag, dan 304 bila tidak berubah', async () => {
    const res = await upload('logo', adminCookie, 'image/png', PNG);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ key: 'logo', mime: 'image/png', size: PNG.length });
    expect(res.json().url).toMatch(/^\/v1\/public\/site-assets\/logo\?v=\d+$/);

    const first = await app.inject({ method: 'GET', url: '/v1/public/site-assets/logo' });
    expect(first.statusCode).toBe(200);
    expect(first.headers['content-type']).toBe('image/png');
    expect(first.headers['cache-control']).toContain('public');
    expect(first.rawPayload.equals(PNG)).toBe(true);
    const etag = first.headers.etag as string;
    expect(etag).toBeTruthy();

    const cached = await app.inject({
      method: 'GET',
      url: '/v1/public/site-assets/logo',
      headers: { 'if-none-match': etag },
    });
    expect(cached.statusCode).toBe(304);

    const pub = await app.inject({ method: 'GET', url: '/v1/public/site' });
    expect(pub.json().assets.logo).toMatchObject({ mime: 'image/png' });
    const staff = await call('GET', '/v1/platform/site', viewerCookie);
    expect(staff.json().assets.map((a: { key: string }) => a.key)).toEqual(['logo']);

    // Unggah ulang mengganti isi dan ETag berubah.
    await new Promise((r) => setTimeout(r, 5));
    await upload('logo', adminCookie, 'image/png', Buffer.concat([PNG, Buffer.from([0])]));
    const second = await app.inject({ method: 'GET', url: '/v1/public/site-assets/logo' });
    expect(second.headers.etag).not.toBe(etag);
  });

  it('SVG dengan skrip, onload, atau foreignObject ditolak; SVG aman diterima', async () => {
    for (const evil of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>',
    ]) {
      const res = await upload('hero', adminCookie, 'image/svg+xml', evil);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: 'svg_unsafe' } });
    }
    const ok = await upload(
      'hero',
      adminCookie,
      'image/svg+xml',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>',
    );
    expect(ok.statusCode).toBe(200);
    const served = await app.inject({ method: 'GET', url: '/v1/public/site-assets/hero' });
    expect(served.headers['content-type']).toContain('image/svg+xml');
    expect(served.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('jenis tidak cocok, isi bukan gambar, slot tidak dikenal, dan jenis yang tak diizinkan slot ditolak', async () => {
    expect((await upload('logo', adminCookie, 'image/jpeg', PNG)).statusCode).toBe(400);
    expect((await upload('logo', adminCookie, 'image/png', 'bukan gambar')).statusCode).toBe(400);
    expect(
      (await upload('favicon', adminCookie, 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).statusCode,
    ).toBe(400);
    expect((await upload('og_image', adminCookie, 'image/svg+xml', '<svg xmlns="x"/>')).statusCode).toBe(400);
    expect((await upload('tidak-ada', adminCookie, 'image/png', PNG)).statusCode).toBe(400);
  });

  it('batas ukuran: favicon 256 KB, gambar lain 2 MB', async () => {
    const pad = (n: number) => Buffer.concat([PNG, Buffer.alloc(n - PNG.length)]);
    const okFav = await upload('favicon', adminCookie, 'image/png', pad(SITE_ASSET_SLOTS.favicon.maxBytes));
    expect(okFav.statusCode).toBe(200);
    const bigFav = await upload(
      'favicon',
      adminCookie,
      'image/png',
      pad(SITE_ASSET_SLOTS.favicon.maxBytes + 1),
    );
    expect(bigFav.statusCode).toBe(400);
    expect(bigFav.json()).toMatchObject({ error: { code: 'validation' } });
    const okHero = await upload(
      'og_image',
      adminCookie,
      'image/png',
      pad(SITE_ASSET_SLOTS.og_image.maxBytes),
    );
    expect(okHero.statusCode).toBe(200);
    const bigHero = await upload(
      'og_image',
      adminCookie,
      'image/png',
      pad(SITE_ASSET_SLOTS.og_image.maxBytes + 1),
    );
    expect(bigHero.statusCode).toBe(400);
  });

  it('menghapus gambar mengembalikan 404 publik; hapus ulang tidak error', async () => {
    expect((await call('DELETE', '/v1/platform/site/assets/logo', adminCookie)).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/v1/public/site-assets/logo' })).statusCode).toBe(404);
    expect((await call('DELETE', '/v1/platform/site/assets/logo', adminCookie)).statusCode).toBe(200);
  });
});
