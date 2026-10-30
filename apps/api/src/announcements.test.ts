import {
  academicYear,
  admissionPeriod,
  announcement,
  assignRoles,
  entitlement,
  eq,
  foundation,
  member,
  school,
  schoolProfile,
  seedSchoolRoles,
  sql,
  subscription,
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
let foundationId = '';
let schoolId = '';
let noModuleId = '';
let siteOnlyId = '';
const slugs = { main: `info-${run}`, noModule: `info-nomod-${run}`, siteOnly: `info-site-${run}` };
const userIds: string[] = [];
let adminCookie = '';
let teacherCookie = '';
let noModuleCookie = '';

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
async function join(label: string, sid: string, roles: string[]) {
  const u = await makeUser(label);
  const [m] = await app.platformDb.insert(member).values({ userId: u.id, schoolId: sid }).returning();
  await assignRoles(app.platformDb, m!.id, sid, roles);
  return login(u.email);
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

let ipCounter = 0;
const pub = (url: string) => {
  ipCounter += 1;
  return app.inject({
    method: 'GET',
    url,
    remoteAddress: `10.7.${Math.floor(ipCounter / 256) % 256}.${ipCounter % 256}`,
    headers: { origin },
  });
};

const code = (res: { json: () => { error: { code: string } } }) => res.json().error.code;

const PAST = '2000-01-01T00:00:00.000Z';
const FUTURE = '2099-01-01T00:00:00.000Z';

const make = (over: Record<string, unknown> = {}) => ({
  title: 'Libur semester',
  body: 'Siswa libur mulai pekan depan.',
  category: 'news',
  audience: 'all',
  ...over,
});
async function create(over: Record<string, unknown> = {}, cookie = adminCookie) {
  const res = await call('POST', '/v1/announcements', cookie, make(over));
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string; status: string; publishedAt: string | null };
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Info', slug: `yi-${run}` })
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
  const makeSchool = async (slug: string, modules: string[]) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug, name: `Sekolah ${slug}` })
      .returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of modules) {
      await db
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    return s!.id;
  };
  schoolId = await makeSchool(slugs.main, ['announcements', 'website', 'admissions']);
  noModuleId = await makeSchool(slugs.noModule, []);
  siteOnlyId = await makeSchool(slugs.siteOnly, ['website']);

  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2000-2099', startsOn: '2000-01-01', endsOn: '2099-12-31', isActive: true })
    .returning();
  await db.insert(admissionPeriod).values([
    {
      schoolId,
      academicYearId: y!.id,
      name: 'Buka',
      level: '7',
      opensOn: '2000-01-01',
      closesOn: '2099-12-31',
    },
    {
      schoolId,
      academicYearId: y!.id,
      name: 'Tutup',
      level: '10',
      opensOn: '2000-01-01',
      closesOn: '2000-12-31',
    },
  ]);
  // Profil sekolah situs-saja sudah terbit, tetapi modul pengumumannya tidak aktif.
  await db.insert(schoolProfile).values({ schoolId: siteOnlyId, tagline: 'Situs saja', published: true });

  adminCookie = await join('admin-info', schoolId, ['school_admin']);
  teacherCookie = await join('guru-info', schoolId, ['teacher']);
  noModuleCookie = await join('admin-tanpa-modul-info', noModuleId, ['school_admin']);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, noModuleId, siteOnlyId]) {
    for (const table of [
      'audit_log',
      'announcement',
      'school_profile',
      'admission_period',
      'academic_year',
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
});

describe('modul dan izin', () => {
  it('modul harus aktif, sesi wajib, izin diperiksa', async () => {
    const blocked = await call('GET', '/v1/announcements', noModuleCookie, undefined, noModuleId);
    expect(blocked.statusCode).toBe(403);
    expect(code(blocked)).toBe('module_disabled');
    expect((await call('GET', '/v1/site/profile', noModuleCookie, undefined, noModuleId)).statusCode).toBe(
      403,
    );
    expect((await app.inject('/v1/announcements')).statusCode).toBe(401);
    // Guru boleh membaca (umpan) tetapi tidak mengelola.
    expect((await call('GET', '/v1/announcements/feed', teacherCookie)).statusCode).toBe(200);
    expect((await call('POST', '/v1/announcements', teacherCookie, make())).statusCode).toBe(403);
    expect((await call('GET', '/v1/site/profile', teacherCookie)).statusCode).toBe(403);
    expect((await call('PUT', '/v1/site/profile', teacherCookie, { published: true })).statusCode).toBe(403);
  });
});

describe('CRUD pengumuman', () => {
  it('draf, terbit otomatis, tarik, ubah, hapus', async () => {
    const draft = await create();
    expect(draft.status).toBe('draft');
    expect(draft.publishedAt).toBeNull();

    const pubd = await call('POST', `/v1/announcements/${draft.id}/publish`, adminCookie);
    expect(pubd.statusCode).toBe(200);
    expect(pubd.json().status).toBe('published');
    const firstAt = pubd.json().publishedAt as string;
    expect(firstAt).toBeTruthy();

    // Terbit ulang dan ubah isi tidak menggeser publishedAt.
    expect(
      (await call('POST', `/v1/announcements/${draft.id}/publish`, adminCookie)).json().publishedAt,
    ).toBe(firstAt);
    const edited = await call(
      'PUT',
      `/v1/announcements/${draft.id}`,
      adminCookie,
      make({ title: 'Libur diubah', status: 'published', pinned: true }),
    );
    expect(edited.statusCode).toBe(200);
    expect(edited.json().title).toBe('Libur diubah');
    expect(edited.json().pinned).toBe(true);
    expect(edited.json().publishedAt).toBe(firstAt);

    const back = await call('POST', `/v1/announcements/${draft.id}/unpublish`, adminCookie);
    expect(back.json().status).toBe('draft');
    expect(back.json().publishedAt).toBeNull();

    const detail = await call('GET', `/v1/announcements/${draft.id}`, adminCookie);
    expect(detail.statusCode).toBe(200);

    const del = await call('DELETE', `/v1/announcements/${draft.id}`, adminCookie);
    expect(del.statusCode).toBe(200);
    const gone = await call('GET', `/v1/announcements/${draft.id}`, adminCookie);
    expect(gone.statusCode).toBe(404);
    expect(code(gone)).toBe('not_found');
  });

  it('validasi: agenda wajib tanggal, HTML ditolak, batas panjang', async () => {
    const noDate = await call('POST', '/v1/announcements', adminCookie, make({ category: 'agenda' }));
    expect(noDate.statusCode).toBe(400);
    const ok = await call(
      'POST',
      '/v1/announcements',
      adminCookie,
      make({ category: 'agenda', eventDate: '2099-06-01' }),
    );
    expect(ok.statusCode).toBe(201);
    expect(ok.json().eventDate).toBe('2099-06-01');
    const html = await call(
      'POST',
      '/v1/announcements',
      adminCookie,
      make({ body: 'Halo <script>x()</script>' }),
    );
    expect(html.statusCode).toBe(400);
    expect(
      (await call('POST', '/v1/announcements', adminCookie, make({ title: '<b>Tebal</b>' }))).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', '/v1/announcements', adminCookie, make({ body: 'x'.repeat(5001) }))).statusCode,
    ).toBe(400);
    // Tanda lebih-kecil biasa pada teks tetap boleh.
    expect(
      (await call('POST', '/v1/announcements', adminCookie, make({ body: 'Nilai 5 < 7 dan 9 > 8' })))
        .statusCode,
    ).toBe(201);
  });

  it('daftar: saringan status/kategori dan paginasi', async () => {
    const marker = `Daftar ${run}`;
    await create({ title: `${marker} A`, status: 'published', category: 'notice' });
    await create({ title: `${marker} B`, status: 'draft', category: 'notice' });
    await create({ title: `${marker} C`, status: 'published', category: 'news' });
    const all = await call('GET', '/v1/announcements?limit=200', adminCookie);
    const mine = (all.json().items as { title: string }[]).filter((i) => i.title.startsWith(marker));
    expect(mine).toHaveLength(3);
    const published = await call(
      'GET',
      '/v1/announcements?status=published&category=notice&limit=200',
      adminCookie,
    );
    const titles = (published.json().items as { title: string }[]).map((i) => i.title);
    expect(titles).toContain(`${marker} A`);
    expect(titles).not.toContain(`${marker} B`);
    expect(titles).not.toContain(`${marker} C`);
    const page = await call('GET', '/v1/announcements?limit=2&offset=0', adminCookie);
    expect(page.json().items).toHaveLength(2);
    expect(page.json().total).toBeGreaterThanOrEqual(3);
  });

  it('pengumuman dari sekolah lain tak terlihat', async () => {
    const a = await create({ title: `Rahasia ${run}` });
    const other = await call('GET', `/v1/announcements/${a.id}`, noModuleCookie, undefined, noModuleId);
    expect(other.statusCode).toBe(403); // modul nonaktif di sekolah itu
  });
});

describe('umpan dasbor staf', () => {
  it('hanya terbit, belum kadaluarsa, audiens staff/all', async () => {
    const tag = `Feed ${run}`;
    await create({ title: `${tag} staff`, audience: 'staff', status: 'published' });
    await create({ title: `${tag} all`, audience: 'all', status: 'published' });
    await create({ title: `${tag} portal`, audience: 'portal', status: 'published' });
    await create({ title: `${tag} public`, audience: 'public', status: 'published' });
    await create({ title: `${tag} draf`, audience: 'staff', status: 'draft' });
    await create({ title: `${tag} lewat`, audience: 'staff', status: 'published', expiresAt: PAST });
    await create({ title: `${tag} nanti`, audience: 'staff', status: 'published', expiresAt: FUTURE });
    const res = await call('GET', '/v1/announcements/feed?limit=50', teacherCookie);
    expect(res.statusCode).toBe(200);
    const titles = (res.json().items as { title: string }[])
      .map((i) => i.title)
      .filter((t) => t.startsWith(tag));
    expect(titles.sort()).toEqual([`${tag} all`, `${tag} nanti`, `${tag} staff`].sort());
  });
});

describe('profil situs', () => {
  it('kosong dulu, simpan, validasi warna dan tautan peta', async () => {
    const empty = await call('GET', '/v1/site/profile', adminCookie);
    expect(empty.statusCode).toBe(200);
    expect(empty.json().published).toBe(false);
    expect(empty.json().tagline).toBeNull();

    expect((await call('PUT', '/v1/site/profile', adminCookie, { accentColor: 'merah' })).statusCode).toBe(
      400,
    );
    expect((await call('PUT', '/v1/site/profile', adminCookie, { accentColor: '#12345' })).statusCode).toBe(
      400,
    );
    expect(
      (await call('PUT', '/v1/site/profile', adminCookie, { mapUrl: 'javascript:alert(1)' })).statusCode,
    ).toBe(400);
    expect((await call('PUT', '/v1/site/profile', adminCookie, { about: '<img src=x>' })).statusCode).toBe(
      400,
    );

    const saved = await call('PUT', '/v1/site/profile', adminCookie, {
      tagline: 'Unggul dan berakhlak',
      about: 'Sekolah kami berdiri sejak 2000.',
      address: 'Jl. Mawar 1',
      email: 'Info@Sekolah.Test',
      mapUrl: 'https://maps.example.test/x',
      accentColor: '#0F766E',
      published: false,
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().accentColor).toBe('#0f766e');
    expect(saved.json().email).toBe('info@sekolah.test');
    const again = await call('GET', '/v1/site/profile', adminCookie);
    expect(again.json().tagline).toBe('Unggul dan berakhlak');
    // Simpan kedua menimpa baris yang sama.
    const second = await call('PUT', '/v1/site/profile', adminCookie, { tagline: 'Baru', published: false });
    expect(second.json().tagline).toBe('Baru');
    expect(second.json().about).toBeNull();
  });
});

describe('situs publik', () => {
  it('404 seragam: sekolah tak ada, profil belum terbit, modul website nonaktif', async () => {
    // Profil sekolah utama belum terbit saat ini (tes sebelumnya menyimpan published: false).
    for (const slug of [`tidak-ada-${run}`, slugs.main, slugs.noModule]) {
      const res = await pub(`/v1/public/site/${slug}`);
      expect(res.statusCode, slug).toBe(404);
      expect(code(res)).toBe('not_found');
    }
    expect((await pub(`/v1/public/site/${slugs.main}/announcements`)).statusCode).toBe(404);
  });

  it('menampilkan profil, jenjang SPMB, dan hanya pengumuman publik yang layak', async () => {
    const tag = `Publik ${run}`;
    const ids = {
      pub: (await create({ title: `${tag} public`, audience: 'public', status: 'published' })).id,
      all: (await create({ title: `${tag} all`, audience: 'all', status: 'published', pinned: true })).id,
      portal: (await create({ title: `${tag} portal`, audience: 'portal', status: 'published' })).id,
      staff: (await create({ title: `${tag} staff`, audience: 'staff', status: 'published' })).id,
      draft: (await create({ title: `${tag} draf`, audience: 'public', status: 'draft' })).id,
      expired: (
        await create({ title: `${tag} lewat`, audience: 'public', status: 'published', expiresAt: PAST })
      ).id,
      agendaNext: (
        await create({
          title: `${tag} agenda depan`,
          audience: 'public',
          status: 'published',
          category: 'agenda',
          eventDate: '2099-03-01',
        })
      ).id,
      agendaPast: (
        await create({
          title: `${tag} agenda lalu`,
          audience: 'public',
          status: 'published',
          category: 'agenda',
          eventDate: '2000-03-01',
        })
      ).id,
    };
    const body = 'Isi pengumuman. '.repeat(40);
    await create({ title: `${tag} panjang`, body, audience: 'public', status: 'published' });

    const saved = await call('PUT', '/v1/site/profile', adminCookie, {
      tagline: 'Unggul',
      accentColor: '#112233',
      published: true,
    });
    expect(saved.statusCode).toBe(200);

    const home = await pub(`/v1/public/site/${slugs.main}`);
    expect(home.statusCode, home.body).toBe(200);
    const json = home.json();
    expect(json.school.name).toBe(`Sekolah ${slugs.main}`);
    expect(json.profile.tagline).toBe('Unggul');
    expect(json.profile.accentColor).toBe('#112233');
    expect(json.admission).toEqual({ enabled: true, openLevels: ['7'] });
    expect(json.announcements.length).toBeLessThanOrEqual(6);
    const homeTitles = (json.announcements as { title: string }[]).map((a) => a.title);
    expect(
      homeTitles.every((t) => !t.includes('portal') && !t.includes('staff') && !t.includes('draf')),
    ).toBe(true);
    expect(json.announcements[0].title).toBe(`${tag} all`); // disematkan di atas
    const agenda = (json.agenda as { title: string }[]).map((a) => a.title);
    expect(agenda).toContain(`${tag} agenda depan`);
    expect(agenda).not.toContain(`${tag} agenda lalu`);

    const list = await pub(`/v1/public/site/${slugs.main}/announcements?limit=50`);
    expect(list.statusCode).toBe(200);
    const titles = (list.json().items as { title: string }[])
      .map((i) => i.title)
      .filter((t) => t.startsWith(tag));
    expect(titles).toContain(`${tag} public`);
    expect(titles).toContain(`${tag} all`);
    for (const hidden of ['portal', 'staff', 'draf', 'lewat']) {
      expect(titles).not.toContain(`${tag} ${hidden}`);
    }
    const long = (list.json().items as { title: string; excerpt: string }[]).find((i) =>
      i.title.endsWith('panjang'),
    )!;
    expect(long.excerpt.length).toBeLessThanOrEqual(201);
    expect(list.json().items[0]).not.toHaveProperty('body');

    const filtered = await pub(`/v1/public/site/${slugs.main}/announcements?category=agenda&limit=50`);
    const kinds = new Set((filtered.json().items as { category: string }[]).map((i) => i.category));
    expect([...kinds]).toEqual(['agenda']);
    const paged = await pub(`/v1/public/site/${slugs.main}/announcements?limit=1&offset=0`);
    expect(paged.json().items).toHaveLength(1);
    expect(paged.json().total).toBeGreaterThan(1);

    // Detail: yang layak tampil dengan body penuh; sisanya 404 generik.
    const detail = await pub(`/v1/public/site/${slugs.main}/announcements/${ids.pub}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().body).toBe('Siswa libur mulai pekan depan.');
    for (const hidden of [ids.portal, ids.staff, ids.draft, ids.expired]) {
      const res = await pub(`/v1/public/site/${slugs.main}/announcements/${hidden}`);
      expect(res.statusCode).toBe(404);
      expect(code(res)).toBe('not_found');
    }
    // Tidak bisa dibaca lewat slug sekolah lain.
    expect((await pub(`/v1/public/site/${slugs.siteOnly}/announcements/${ids.pub}`)).statusCode).toBe(404);
  });

  it('menarik kembali profil menyembunyikan situs; draf yang diterbitkan muncul', async () => {
    const a = await create({ title: `Terbit nanti ${run}`, audience: 'public' });
    const before = await pub(`/v1/public/site/${slugs.main}/announcements/${a.id}`);
    expect(before.statusCode).toBe(404);
    await call('POST', `/v1/announcements/${a.id}/publish`, adminCookie);
    expect((await pub(`/v1/public/site/${slugs.main}/announcements/${a.id}`)).statusCode).toBe(200);
    await call('POST', `/v1/announcements/${a.id}/unpublish`, adminCookie);
    expect((await pub(`/v1/public/site/${slugs.main}/announcements/${a.id}`)).statusCode).toBe(404);

    await call('PUT', '/v1/site/profile', adminCookie, { published: false });
    expect((await pub(`/v1/public/site/${slugs.main}`)).statusCode).toBe(404);
  });

  it('modul pengumuman nonaktif: situs tampil tanpa pengumuman', async () => {
    const home = await pub(`/v1/public/site/${slugs.siteOnly}`);
    expect(home.statusCode, home.body).toBe(200);
    expect(home.json().announcements).toEqual([]);
    expect(home.json().agenda).toEqual([]);
    expect(home.json().admission).toEqual({ enabled: false, openLevels: [] });
    const list = await pub(`/v1/public/site/${slugs.siteOnly}/announcements`);
    expect(list.json()).toEqual({ items: [], total: 0 });
  });

  it('data di database tidak bocor lewat baris lain (sanity)', async () => {
    const rows = await app.platformDb
      .select()
      .from(announcement)
      .where(eq(announcement.schoolId, siteOnlyId));
    expect(rows).toHaveLength(0);
  });
});
