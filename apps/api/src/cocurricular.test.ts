import {
  assignRoles,
  auditLog,
  cocurricularRubricLevel,
  entitlement,
  eq,
  foundation,
  member,
  school,
  schoolProfileItem,
  seedSchoolRoles,
  sql,
  subscription,
  user,
  withTenant,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/**
 * Tahap 4.1: kerangka profil (acuan global + adopsi sekolah) dan rubrik kokurikuler. Menguji (1) sekolah yang tidak memakai fitur ini
 * tidak mendapat baris apa pun, (2) acuan disaring menurut jenjang (Panca Cinta hanya madrasah, sumber sekunder), (3) adopsi idempoten,
 * (4) simpan butir/rubrik (ubah, tambah, hapus, kode kembar, id sekolah lain), (5) izin dan modul, (6) isolasi antar sekolah.
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let smpId = '';
let mtsId = '';
let noModuleId = '';
const cookies: Record<string, string> = {};
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

const call = (method: 'GET' | 'POST' | 'PUT', url: string, cookie: string, sid: string, payload?: object) =>
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

const items = (sid: string, cookie = cookies.smpAdmin!) =>
  call('GET', '/v1/cocurricular/profile-items', cookie, sid);
const adopt = (sid: string, frameworkKey: string, cookie = cookies.smpAdmin!) =>
  call('POST', '/v1/cocurricular/profile-items/adopt', cookie, sid, { frameworkKey });
const countRows = (sid: string, table: 'school_profile_item' | 'cocurricular_rubric_level') =>
  app.platformDb
    .execute<{ n: number }>(
      sql`select count(*)::int as n from ${sql.identifier(table)} where school_id = ${sid}`,
    )
    .then((r) => r.rows[0]!.n);

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Kokurikuler', slug: `yk-${run}` })
    .returning();
  foundationId = f!.id;
  const [sb] = await db
    .insert(subscription)
    .values({
      foundationId,
      period: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  const mkSchool = async (slug: string, educationProfile: string, modules: string[]) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug: `${slug}-${run}`, name: `Sekolah ${slug}`, educationProfile })
      .returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of modules) {
      await db
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sb!.id, validUntil: sb!.currentPeriodEnd });
    }
    return s!.id;
  };
  smpId = await mkSchool('kok-smp', 'smp', ['grades']);
  mtsId = await mkSchool('kok-mts', 'mts', ['grades']);
  noModuleId = await mkSchool('kok-nom', 'smp', ['attendance']);

  const mkMember = async (label: string, sid: string, role: string) => {
    const u = await makeUser(label);
    const [m] = await db.insert(member).values({ userId: u.id, schoolId: sid }).returning();
    await assignRoles(db, m!.id, sid, [role]);
    cookies[label] = await login(u.email);
  };
  await mkMember('smpAdmin', smpId, 'school_admin');
  await mkMember('smpTeacher', smpId, 'teacher');
  await mkMember('smpGuardian', smpId, 'guardian');
  await mkMember('mtsAdmin', mtsId, 'school_admin');
  await mkMember('noModAdmin', noModuleId, 'school_admin');
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [smpId, mtsId, noModuleId]) {
    for (const table of [
      'audit_log',
      'school_profile_item',
      'cocurricular_rubric_level',
      'entitlement',
      'member',
      'role',
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

describe('sekolah yang belum memakai kerangka', () => {
  it('butir dan rubrik kosong, tidak ada baris yang dibuat otomatis', async () => {
    expect((await items(smpId)).json()).toEqual({ items: [] });
    const lv = await call('GET', '/v1/cocurricular/rubric-levels', cookies.smpAdmin!, smpId);
    expect(lv.json()).toEqual({ levels: [] });
    expect(await countRows(smpId, 'school_profile_item')).toBe(0);
    expect(await countRows(smpId, 'cocurricular_rubric_level')).toBe(0);
  });
});

describe('acuan kerangka profil', () => {
  it('SMP: hanya delapan dimensi resmi; Panca Cinta tidak ditawarkan', async () => {
    const res = await call('GET', '/v1/reference/profile-frameworks', cookies.smpAdmin!, smpId);
    expect(res.statusCode, res.body).toBe(200);
    const fws = res.json().frameworks as { key: string; verification: string; items: { code: string }[] }[];
    expect(fws.map((f) => f.key)).toEqual(['profil_lulusan_2025']);
    expect(fws[0]!.verification).toBe('official');
    expect(fws[0]!.items.map((i) => i.code)).toEqual([
      'faith',
      'citizenship',
      'critical_reasoning',
      'creativity',
      'collaboration',
      'independence',
      'health',
      'communication',
    ]);
  });

  it('MTs: dimensi ditambah Panca Cinta bertanda sumber sekunder (lima topik)', async () => {
    const res = await call('GET', '/v1/reference/profile-frameworks', cookies.mtsAdmin!, mtsId);
    const fws = res.json().frameworks as { key: string; verification: string; items: unknown[] }[];
    expect(fws.map((f) => [f.key, f.verification])).toEqual([
      ['profil_lulusan_2025', 'official'],
      ['panca_cinta_2025', 'secondary'],
    ]);
    expect(fws[1]!.items).toHaveLength(5);
  });
});

describe('adopsi kerangka', () => {
  it('menyalin delapan dimensi, idempoten pada panggilan kedua', async () => {
    const first = await adopt(smpId, 'profil_lulusan_2025');
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().added).toBe(8);
    expect(first.json().items[0]).toMatchObject({
      frameworkKey: 'profil_lulusan_2025',
      refCode: 'faith',
      code: 'faith',
      label: 'Keimanan dan ketakwaan kepada Tuhan YME',
      active: true,
    });
    const again = await adopt(smpId, 'profil_lulusan_2025');
    expect(again.json().added).toBe(0);
    expect(again.json().items).toHaveLength(8);
    expect(await countRows(smpId, 'school_profile_item')).toBe(8);
  });

  it('adopsi tidak menimpa label yang sudah diganti sekolah', async () => {
    const list = (await items(smpId)).json().items as { id: string; code: string; label: string }[];
    const body = list.map((i) => ({
      id: i.id,
      frameworkKey: 'profil_lulusan_2025',
      code: i.code,
      label: i.code === 'faith' ? 'Iman dan takwa' : i.label,
    }));
    expect(
      (await call('PUT', '/v1/cocurricular/profile-items', cookies.smpAdmin!, smpId, { items: body }))
        .statusCode,
    ).toBe(200);
    expect((await adopt(smpId, 'profil_lulusan_2025')).json().added).toBe(0);
    const after = (await items(smpId)).json().items as { code: string; label: string }[];
    expect(after.find((i) => i.code === 'faith')?.label).toBe('Iman dan takwa');
  });

  it('Panca Cinta ditolak untuk jenjang non-madrasah; kerangka tak dikenal 400', async () => {
    const res = await adopt(smpId, 'panca_cinta_2025');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('framework_not_for_profile');
    expect((await adopt(smpId, 'tidak_ada')).json().error.code).toBe('invalid_reference');
    expect(await countRows(smpId, 'school_profile_item')).toBe(8);
  });

  it('MTs mengadopsi Panca Cinta dengan kode acuan terjaga', async () => {
    const res = await adopt(mtsId, 'panca_cinta_2025', cookies.mtsAdmin!);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().added).toBe(5);
    expect(res.json().items.map((i: { code: string }) => i.code)).toEqual([
      'love_god',
      'love_knowledge',
      'love_environment',
      'love_self_others',
      'love_country',
    ]);
  });

  it('dicatat di jejak audit', async () => {
    const rows = await withTenant(app.tenantDb, [smpId], (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.action, 'cocurricular.profile_items.adopt')),
    );
    expect(rows).toHaveLength(3);
  });
});

describe('simpan butir', () => {
  const putItems = (body: object, sid = smpId, cookie = cookies.smpAdmin!) =>
    call('PUT', '/v1/cocurricular/profile-items', cookie, sid, body);

  it('mengubah, menonaktifkan, menambah butir sendiri, dan menghapus yang tidak disertakan', async () => {
    const list = (await items(smpId)).json().items as { id: string; code: string }[];
    const keep = list.slice(0, 6);
    const body = {
      items: [
        ...keep.map((i, n) => ({
          id: i.id,
          frameworkKey: 'profil_lulusan_2025',
          code: i.code,
          label: `Dimensi ${n + 1}`,
          description: '  catatan  ',
          sort: (n + 1) * 10,
          active: n !== 2,
        })),
        { frameworkKey: 'profil_lulusan_2025', code: 'sekolah_1', label: 'Butir sekolah', sort: 100 },
      ],
    };
    const res = await putItems(body);
    expect(res.statusCode, res.body).toBe(200);
    const out = res.json().items as {
      code: string;
      label: string;
      active: boolean;
      refCode: string | null;
      description: string | null;
    }[];
    expect(out).toHaveLength(7);
    expect(out.find((i) => i.code === keep[2]!.code)?.active).toBe(false);
    expect(out.find((i) => i.code === 'sekolah_1')).toMatchObject({
      refCode: null,
      label: 'Butir sekolah',
      description: null,
    });
    expect(out[0]).toMatchObject({ label: 'Dimensi 1', description: 'catatan' });
    expect(await countRows(smpId, 'school_profile_item')).toBe(7);
  });

  it('kode kembar dalam satu kerangka 409', async () => {
    const list = (await items(smpId)).json().items as { id: string; code: string }[];
    const dup = [
      ...list.map((i) => ({ id: i.id, frameworkKey: 'profil_lulusan_2025', code: i.code, label: 'x' })),
      { frameworkKey: 'profil_lulusan_2025', code: list[0]!.code, label: 'kembar' },
    ];
    expect((await putItems({ items: dup })).statusCode).toBe(409);
    expect(await countRows(smpId, 'school_profile_item')).toBe(7);
  });

  it('id sekolah lain atau kerangka berbeda 400 invalid_reference; Panca Cinta baru di SMP ditolak', async () => {
    const other = (await items(mtsId, cookies.mtsAdmin!)).json().items as { id: string }[];
    const foreign = await putItems({
      items: [{ id: other[0]!.id, frameworkKey: 'panca_cinta_2025', code: 'x', label: 'x' }],
    });
    expect(foreign.statusCode).toBe(400);
    expect(foreign.json().error.code).toBe('invalid_reference');
    const mine = (await items(smpId)).json().items as { id: string; code: string }[];
    const wrongFw = await putItems({
      items: [{ id: mine[0]!.id, frameworkKey: 'panca_cinta_2025', code: mine[0]!.code, label: 'x' }],
    });
    expect(wrongFw.json().error.code).toBe('invalid_reference');
    const newPanca = await putItems({ items: [{ frameworkKey: 'panca_cinta_2025', code: 'z', label: 'z' }] });
    expect(newPanca.json().error.code).toBe('framework_not_for_profile');
    // Sekolah lain tidak tersentuh oleh semua percobaan di atas.
    expect(await countRows(mtsId, 'school_profile_item')).toBe(5);
  });

  it('label kosong atau terlalu panjang 400 validation', async () => {
    const bad = await putItems({ items: [{ frameworkKey: 'profil_lulusan_2025', code: 'a', label: ' ' }] });
    expect(bad.statusCode).toBe(400);
    const long = await putItems({
      items: [{ frameworkKey: 'profil_lulusan_2025', code: 'a', label: 'x'.repeat(121) }],
    });
    expect(long.statusCode).toBe(400);
  });
});

describe('rubrik', () => {
  const putLevels = (body: object, sid = smpId, cookie = cookies.smpAdmin!) =>
    call('PUT', '/v1/cocurricular/rubric-levels', cookie, sid, body);
  const sample = [
    { code: 'SB', label: 'Sangat Baik', sort: 1 },
    { code: 'B', label: 'Baik', sort: 2 },
    { code: 'C', label: 'Cukup', sort: 3 },
    { code: 'K', label: 'Kurang', sort: 4 },
  ];

  it('membuat, mengurutkan, mengubah, dan menghapus tingkat', async () => {
    const created = await putLevels({ levels: sample });
    expect(created.statusCode, created.body).toBe(200);
    const got = created.json().levels as { id: string; code: string; label: string }[];
    expect(got.map((l) => l.code)).toEqual(['SB', 'B', 'C', 'K']);

    const next = await putLevels({
      levels: [
        { id: got[1]!.id, code: 'B', label: 'Baik sekali', sort: 1, description: 'uraian', active: false },
        { id: got[0]!.id, code: 'SB', label: 'Sangat Baik', sort: 2 },
        { code: 'M', label: 'Mulai Berkembang', sort: 3 },
      ],
    });
    const out = next.json().levels as {
      code: string;
      label: string;
      active: boolean;
      description: string | null;
    }[];
    expect(out.map((l) => l.code)).toEqual(['B', 'SB', 'M']);
    expect(out[0]).toMatchObject({ label: 'Baik sekali', active: false, description: 'uraian' });
    expect(await countRows(smpId, 'cocurricular_rubric_level')).toBe(3);
  });

  it('kode kembar 409, id asing 400, kode/label melebihi batas 400, lebih dari 12 tingkat 400', async () => {
    expect((await putLevels({ levels: [sample[0], { ...sample[1], code: 'SB' }] })).statusCode).toBe(409);
    const foreignId = (
      await withTenant(app.tenantDb, [smpId], (tx) => tx.select().from(cocurricularRubricLevel))
    )[0]!.id;
    const res = await putLevels(
      { levels: [{ id: foreignId, code: 'Q', label: 'q', sort: 1 }] },
      mtsId,
      cookies.mtsAdmin!,
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_reference');
    expect((await putLevels({ levels: [{ code: 'x'.repeat(11), label: 'a', sort: 1 }] })).statusCode).toBe(
      400,
    );
    const many = Array.from({ length: 13 }, (_, n) => ({ code: `L${n}`, label: `L${n}`, sort: n }));
    expect((await putLevels({ levels: many })).statusCode).toBe(400);
    expect(await countRows(smpId, 'cocurricular_rubric_level')).toBe(3);
    expect(await countRows(mtsId, 'cocurricular_rubric_level')).toBe(0);
  });
});

describe('izin dan modul', () => {
  it('guru boleh membaca tetapi tidak menulis; wali tidak boleh apa pun', async () => {
    const t = cookies.smpTeacher!;
    expect((await items(smpId, t)).statusCode).toBe(200);
    expect((await call('GET', '/v1/reference/profile-frameworks', t, smpId)).statusCode).toBe(200);
    expect((await call('GET', '/v1/cocurricular/rubric-levels', t, smpId)).statusCode).toBe(200);
    expect((await adopt(smpId, 'profil_lulusan_2025', t)).statusCode).toBe(403);
    expect((await call('PUT', '/v1/cocurricular/profile-items', t, smpId, { items: [] })).statusCode).toBe(
      403,
    );
    expect((await call('PUT', '/v1/cocurricular/rubric-levels', t, smpId, { levels: [] })).statusCode).toBe(
      403,
    );
    const g = cookies.smpGuardian!;
    expect((await items(smpId, g)).statusCode).toBe(403);
    expect((await call('GET', '/v1/cocurricular/rubric-levels', g, smpId)).statusCode).toBe(403);
    expect(await countRows(smpId, 'school_profile_item')).toBe(7);
  });

  it('sekolah tanpa modul grades ditolak 403 module_disabled', async () => {
    for (const url of [
      '/v1/cocurricular/profile-items',
      '/v1/cocurricular/rubric-levels',
      '/v1/reference/profile-frameworks',
    ]) {
      const res = await call('GET', url, cookies.noModAdmin!, noModuleId);
      expect(res.statusCode, url).toBe(403);
      expect(res.json().error.code).toBe('module_disabled');
    }
    expect((await adopt(noModuleId, 'profil_lulusan_2025', cookies.noModAdmin!)).statusCode).toBe(403);
    expect(await countRows(noModuleId, 'school_profile_item')).toBe(0);
  });
});

describe('isolasi antar sekolah', () => {
  it('daftar dan RLS hanya menampilkan butir sekolah sendiri', async () => {
    const mine = (await items(smpId)).json().items as { frameworkKey: string }[];
    const theirs = (await items(mtsId, cookies.mtsAdmin!)).json().items as { frameworkKey: string }[];
    expect(mine.every((i) => i.frameworkKey === 'profil_lulusan_2025')).toBe(true);
    expect(theirs.every((i) => i.frameworkKey === 'panca_cinta_2025')).toBe(true);
    const seen = await withTenant(app.tenantDb, [mtsId], (tx) => tx.select().from(schoolProfileItem));
    expect(seen.every((r) => r.schoolId === mtsId)).toBe(true);
    // Admin SMP tidak boleh memakai sekolah MTs lewat header.
    expect((await items(mtsId, cookies.smpAdmin!)).statusCode).toBe(403);
  });
});
