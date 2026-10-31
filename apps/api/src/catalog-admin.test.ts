import { quoteUnit, withRequirements } from '@edusync/contracts';
import {
  invalidateBillingSettings,
  loadBillingSettings,
  loadCatalog,
  platformStaff,
  sql,
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
const userIds: string[] = [];
let admin = '';
let readOnly = '';
let outsider = '';

async function makeUser(label: string, staff?: 'admin' | 'read_only') {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  if (staff) await app.platformDb.insert(platformStaff).values({ userId: res.user.id, role: staff });
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, cookie: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: { cookie, origin, ...(payload ? { 'content-type': 'application/json' } : {}) },
    ...(payload ? { payload } : {}),
  });

let originalAttendance: { name: string; price: number; sort: number } | null = null;
let originalBilling: unknown = null;

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  admin = await makeUser('staf-admin-katalog', 'admin');
  readOnly = await makeUser('staf-baca-katalog', 'read_only');
  outsider = await makeUser('bukan-staf-katalog');
  const [a] = (await loadCatalog(app.platformDb)).filter((i) => i.key === 'attendance');
  originalAttendance = a ? { name: a.name, price: a.priceMonthly, sort: a.sort } : null;
  const billing = await app.platformDb.execute<{ value: unknown }>(
    sql`select value from platform_setting where key = 'billing'`,
  );
  originalBilling = billing.rows[0]?.value ?? null;
});

afterAll(async () => {
  const db = app.platformDb;
  if (originalAttendance) {
    await db.execute(
      sql`update catalog_item set name = ${originalAttendance.name}, price_monthly = ${originalAttendance.price}, sort = ${originalAttendance.sort}, active = true where kind = 'module' and key = 'attendance'`,
    );
  }
  await db.execute(sql`delete from catalog_item where key like ${`uji_%_${run}`}`);
  await db.execute(sql`delete from platform_setting where key = 'billing'`);
  if (originalBilling) {
    await db.execute(
      sql`insert into platform_setting (key, value) values ('billing', ${JSON.stringify(originalBilling)}::jsonb)`,
    );
  }
  invalidateBillingSettings();
  await db.execute(sql`delete from plan_preset where key like ${`uji_%_${run}`}`);
  await db.execute(
    sql`delete from audit_log where actor_id in (${sql.join(
      userIds.map((u) => sql`${u}`),
      sql`, `,
    )})`,
  );
  await db.delete(platformStaff).where(
    sql`${platformStaff.userId} in (${sql.join(
      userIds.map((u) => sql`${u}`),
      sql`, `,
    )})`,
  );
  for (const id of userIds) await db.delete(user).where(sql`${user.id} = ${id}`);
  await app.close();
});

describe('katalog dan paket (staf platform)', () => {
  it('izin: bukan staf ditolak, read_only boleh melihat tetapi tidak mengubah', async () => {
    expect((await call('GET', '/v1/platform/catalog', outsider)).statusCode).toBe(403);
    expect((await app.inject('/v1/platform/catalog')).statusCode).toBe(401);
    const view = await call('GET', '/v1/platform/catalog', readOnly);
    expect(view.statusCode).toBe(200);
    expect(view.json().items.some((i: { key: string }) => i.key === 'attendance')).toBe(true);
    expect(view.json().plans.map((p: { key: string }) => p.key)).toEqual(
      expect.arrayContaining(['starter', 'standard', 'pro']),
    );
    const put = await call('PUT', '/v1/platform/catalog/items/module/attendance', readOnly, {
      name: 'X',
      priceMonthly: 1,
      sort: 1,
      active: true,
    });
    expect(put.statusCode).toBe(403);
  });

  it('mengubah harga berlaku di katalog publik; menonaktifkan menyembunyikan dari pendaftaran baru tetapi tidak dari perpanjangan', async () => {
    const upd = await call('PUT', '/v1/platform/catalog/items/module/attendance', admin, {
      name: 'Absensi Plus',
      priceMonthly: 123_000,
      sort: 10,
      active: true,
    });
    expect(upd.statusCode).toBe(200);
    const pub = (await app.inject('/v1/catalog')).json();
    expect(pub.items.find((i: { key: string }) => i.key === 'attendance')).toMatchObject({
      name: 'Absensi Plus',
      priceMonthly: 123_000,
    });

    await call('PUT', '/v1/platform/catalog/items/module/attendance', admin, {
      name: 'Absensi Plus',
      priceMonthly: 123_000,
      sort: 10,
      active: false,
    });
    expect(
      ((await app.inject('/v1/catalog')).json().items as { key: string }[]).some(
        (i) => i.key === 'attendance',
      ),
    ).toBe(false);
    // Perpanjangan tetap bisa menghitung harga modul yang disembunyikan.
    expect(
      (await loadCatalog(app.platformDb, { includeInactive: true })).some((i) => i.key === 'attendance'),
    ).toBe(true);
    expect((await loadCatalog(app.platformDb)).some((i) => i.key === 'attendance')).toBe(false);

    // Modul inti tidak boleh dinonaktifkan; harga negatif dan item yang tidak ada ditolak.
    expect(
      (
        await call('PUT', '/v1/platform/catalog/items/base/core', admin, {
          name: 'Inti',
          priceMonthly: 150_000,
          sort: 0,
          active: false,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call('PUT', '/v1/platform/catalog/items/module/attendance', admin, {
          name: 'A',
          priceMonthly: -1,
          sort: 1,
          active: true,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call('PUT', '/v1/platform/catalog/items/module/tidak_ada', admin, {
          name: 'A',
          priceMonthly: 1,
          sort: 1,
          active: true,
        })
      ).statusCode,
    ).toBe(404);
  });

  it('menambah modul/tingkat baru dan membuat paket yang hanya berisi item katalog', async () => {
    const key = `uji_modul_${run}`;
    const created = await call('POST', '/v1/platform/catalog/items', admin, {
      kind: 'module',
      key,
      name: 'Modul Uji',
      priceMonthly: 10_000,
      sort: 99,
    });
    expect(created.statusCode).toBe(201);
    expect(
      (
        await call('POST', '/v1/platform/catalog/items', admin, {
          kind: 'module',
          key,
          name: 'Lagi',
          priceMonthly: 1,
          sort: 1,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call('POST', '/v1/platform/catalog/items', admin, {
          kind: 'base',
          key: 'uji_base',
          name: 'x',
          priceMonthly: 1,
          sort: 1,
        })
      ).statusCode,
    ).toBe(400);

    const planKey = `uji_paket_${run}`;
    const plan = await call('POST', '/v1/platform/catalog/plans', admin, {
      key: planKey,
      name: 'Paket Uji',
      description: 'Untuk uji',
      modules: [key, 'grades'],
      tier: 't300',
      sort: 50,
    });
    expect(plan.statusCode).toBe(201);
    expect(
      (await app.inject('/v1/catalog')).json().plans.some((p: { key: string }) => p.key === planKey),
    ).toBe(true);

    // Modul atau tingkat yang tidak ada ditolak.
    const bad = await call('POST', '/v1/platform/catalog/plans', admin, {
      key: `uji_buruk_${run}`,
      name: 'Buruk',
      modules: ['hantu'],
      tier: 't300',
      sort: 1,
    });
    expect(bad.statusCode).toBe(400);
    expect(
      (
        await call('POST', '/v1/platform/catalog/plans', admin, {
          key: `uji_tier_${run}`,
          name: 'T',
          modules: [],
          tier: 'tx',
          sort: 1,
        })
      ).statusCode,
    ).toBe(400);

    const off = await call('PUT', `/v1/platform/catalog/plans/${planKey}`, admin, {
      name: 'Paket Uji',
      description: '',
      modules: ['grades'],
      tier: 't300',
      sort: 50,
      active: false,
    });
    expect(off.json().active).toBe(false);
    expect(
      (await app.inject('/v1/catalog')).json().plans.some((p: { key: string }) => p.key === planKey),
    ).toBe(false);
    expect((await call('DELETE', `/v1/platform/catalog/plans/${planKey}`, admin)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/platform/catalog/plans/${planKey}`, admin)).statusCode).toBe(404);

    const audit = await app.platformDb.execute<{ action: string }>(
      sql`select action from audit_log where entity_id = ${planKey} order by created_at`,
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      'catalog.plan.create',
      'catalog.plan.update',
      'catalog.plan.delete',
    ]);
  });
});

describe('ketergantungan modul dan batas tingkat dari katalog', () => {
  const mod = (key: string, extra: object = {}) =>
    call('POST', '/v1/platform/catalog/items', admin, {
      kind: 'module',
      key,
      name: key,
      priceMonthly: 1000,
      sort: 90,
      ...extra,
    });

  it('syarat modul disimpan, tampil di katalog publik, dan dipakai perhitungan harga', async () => {
    const base = `uji_dasar_${run}`;
    const top = `uji_atas_${run}`;
    expect((await mod(base)).json()).toMatchObject({ requires: [], maxStudents: null });
    const created = await mod(top, { requires: [base] });
    expect(created.statusCode).toBe(201);
    expect(created.json().requires).toEqual([base]);

    const pub = (await app.inject('/v1/catalog')).json();
    expect(pub.requires[top]).toEqual([base]);
    expect(pub.items.find((i: { key: string }) => i.key === top)).toMatchObject({ requires: [base] });
    // Syarat bawaan yang sudah ada di katalog tetap berlaku.
    expect(pub.requires.assessments).toEqual(['grades']);

    const catalog = await loadCatalog(app.platformDb);
    expect(withRequirements([top], catalog).sort()).toEqual([base, top].sort());
    const quote = quoteUnit(catalog, { modules: [top], tier: 't300' }, 'monthly');
    expect(quote.lines.map((l) => l.key)).toEqual(expect.arrayContaining([base, top]));
    expect(quote.total).toBe(150_000 + 2000);

    // Mengosongkan syarat benar-benar melepas ketergantungan (katalog menang atas bawaan).
    const cleared = await call('PUT', `/v1/platform/catalog/items/module/${top}`, admin, {
      name: top,
      priceMonthly: 1000,
      sort: 90,
      active: true,
      requires: [],
    });
    expect(cleared.json().requires).toEqual([]);
    expect(withRequirements([top], await loadCatalog(app.platformDb))).toEqual([top]);
    // Tanpa bidang requires, nilai tersimpan tidak berubah.
    await call('PUT', `/v1/platform/catalog/items/module/${top}`, admin, {
      name: top,
      priceMonthly: 1000,
      sort: 90,
      active: true,
      requires: [base],
    });
    const kept = await call('PUT', `/v1/platform/catalog/items/module/${top}`, admin, {
      name: top,
      priceMonthly: 2000,
      sort: 90,
      active: true,
    });
    expect(kept.json()).toMatchObject({ priceMonthly: 2000, requires: [base] });
  });

  it('menolak syarat tak valid: diri sendiri, tak dikenal, lingkaran, dan bukan modul', async () => {
    const a = `uji_sa_${run}`;
    const b = `uji_sb_${run}`;
    await mod(a);
    await mod(b, { requires: [a] });
    const put = (key: string, requires: string[]) =>
      call('PUT', `/v1/platform/catalog/items/module/${key}`, admin, {
        name: key,
        priceMonthly: 1,
        sort: 1,
        active: true,
        requires,
      });
    expect((await put(a, [a])).statusCode).toBe(400);
    expect((await put(a, ['hantu'])).statusCode).toBe(400);
    const loop = await put(a, [b]);
    expect(loop.statusCode).toBe(400);
    expect(loop.json().error.message).toContain('lingkaran');
    expect((await mod(`uji_sc_${run}`, { requires: ['tidak_ada'] })).statusCode).toBe(400);
    // Tingkat tidak boleh punya syarat modul.
    const tierWithReq = await call('POST', '/v1/platform/catalog/items', admin, {
      kind: 'tier',
      key: `uji_tr_${run}`,
      name: 'T',
      priceMonthly: 0,
      sort: 1,
      requires: [a],
    });
    expect(tierWithReq.statusCode).toBe(400);
  });

  it('batas siswa hanya untuk tingkat, tampil di katalog publik, dan bisa dikosongkan', async () => {
    const key = `uji_tier_${run}`;
    const made = await call('POST', '/v1/platform/catalog/items', admin, {
      kind: 'tier',
      key,
      name: 'Tingkat Uji',
      priceMonthly: 5000,
      sort: 95,
      maxStudents: 2500,
    });
    expect(made.statusCode).toBe(201);
    expect(made.json().maxStudents).toBe(2500);
    const seeded = (await app.inject('/v1/catalog')).json().items as {
      key: string;
      maxStudents: number | null;
    }[];
    expect(seeded.find((i) => i.key === key)?.maxStudents).toBe(2500);
    expect(seeded.find((i) => i.key === 't300')?.maxStudents).toBe(300);

    const upd = (maxStudents: number | null) =>
      call('PUT', `/v1/platform/catalog/items/tier/${key}`, admin, {
        name: 'Tingkat Uji',
        priceMonthly: 5000,
        sort: 95,
        active: true,
        maxStudents,
      });
    expect((await upd(null)).json().maxStudents).toBeNull();
    expect((await upd(0)).statusCode).toBe(400);
    const onModule = await mod(`uji_mb_${run}`, { maxStudents: 10 });
    expect(onModule.statusCode).toBe(400);
  });
});

describe('parameter penagihan (staf platform)', () => {
  const body = { graceDays: 10, renewalLeadDays: 5, reservationHours: 48, yearlyMonths: 11 };

  it('izin, validasi rentang, nilai berlaku, dan audit', async () => {
    expect((await call('GET', '/v1/platform/billing-settings', outsider)).statusCode).toBe(403);
    expect((await app.inject('/v1/platform/billing-settings')).statusCode).toBe(401);
    expect((await call('PUT', '/v1/platform/billing-settings', readOnly, body)).statusCode).toBe(403);

    await app.platformDb.execute(sql`delete from platform_setting where key = 'billing'`);
    invalidateBillingSettings();
    const def = await call('GET', '/v1/platform/billing-settings', readOnly);
    expect(def.json()).toMatchObject({
      graceDays: 7,
      renewalLeadDays: 7,
      reservationHours: 24,
      yearlyMonths: 10,
      defaults: { graceDays: 7, yearlyMonths: 10 },
    });

    for (const bad of [
      { ...body, graceDays: -1 },
      { ...body, graceDays: 91 },
      { ...body, renewalLeadDays: 0 },
      { ...body, reservationHours: 0 },
      { ...body, yearlyMonths: 13 },
      { ...body, yearlyMonths: 10.5 },
    ]) {
      expect((await call('PUT', '/v1/platform/billing-settings', admin, bad)).statusCode).toBe(400);
    }
    expect((await call('PUT', '/v1/platform/billing-settings', admin, { graceDays: 3 })).statusCode).toBe(
      400,
    );

    const saved = await call('PUT', '/v1/platform/billing-settings', admin, body);
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject(body);
    expect(await loadBillingSettings(app.platformDb)).toEqual(body);
    // Pengali tahunan langsung terbaca di katalog publik.
    expect((await app.inject('/v1/catalog')).json().yearlyMonths).toBe(11);

    const audit = await app.platformDb.execute<{ details: { before: object; after: object } }>(
      sql`select details from audit_log where action = 'billing.platform_settings' and actor_id in (${sql.join(
        userIds.map((u) => sql`${u}`),
        sql`, `,
      )})`,
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.details.after).toEqual(body);

    // Nilai tersimpan yang rusak jatuh ke bawaan, tidak merusak penagihan.
    await app.platformDb.execute(
      sql`update platform_setting set value = '{"graceDays": -5, "yearlyMonths": "x"}'::jsonb where key = 'billing'`,
    );
    invalidateBillingSettings();
    expect(await loadBillingSettings(app.platformDb)).toEqual({
      graceDays: 7,
      renewalLeadDays: 7,
      reservationHours: 24,
      yearlyMonths: 10,
    });
  });
});

describe('pengaturan pembayaran (staf platform)', () => {
  const body = (o: object) => ({ provider: 'midtrans', mode: 'sandbox', ...o });

  it('izin, kunci tersimpan terenkripsi dan tidak pernah dikembalikan, dan pengaturan berlaku tanpa restart', async () => {
    expect((await call('GET', '/v1/platform/payment-settings', outsider)).statusCode).toBe(403);
    expect(
      (
        await call(
          'PUT',
          '/v1/platform/payment-settings',
          readOnly,
          body({ serverKey: 'SB-Mid-server-abcd' }),
        )
      ).statusCode,
    ).toBe(403);

    const before = await call('GET', '/v1/platform/payment-settings', readOnly);
    expect(before.statusCode).toBe(200);
    const original = before.json();

    // Midtrans tanpa kunci ditolak bila belum ada kunci tersimpan.
    await app.platformDb.execute(sql`delete from platform_setting where key = 'payment'`);
    app.payments.invalidate();
    expect((await call('PUT', '/v1/platform/payment-settings', admin, body({}))).json().error.code).toBe(
      'server_key_required',
    );

    const saved = await call(
      'PUT',
      '/v1/platform/payment-settings',
      admin,
      body({ serverKey: 'SB-Mid-server-WXYZ' }),
    );
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      provider: 'midtrans',
      mode: 'sandbox',
      hasServerKey: true,
      serverKeyHint: 'WXYZ',
      source: 'database',
    });
    expect(JSON.stringify(saved.json())).not.toContain('SB-Mid-server');
    expect(saved.json().webhookUrl).toContain('/v1/webhooks/payments/midtrans');

    // Di database kunci terenkripsi, bukan teks biasa.
    const raw = await app.platformDb.execute<{ value: { serverKeyEnc: string } }>(
      sql`select value from platform_setting where key = 'payment'`,
    );
    expect(raw.rows[0]?.value.serverKeyEnc.startsWith('v1.')).toBe(true);
    expect(JSON.stringify(raw.rows[0])).not.toContain('SB-Mid-server');

    // Penyedia yang berlaku langsung berubah, dan mode produksi memakai alamat Snap produksi.
    expect((await app.payments.get()).name).toBe('midtrans');
    // Menyimpan tanpa kunci baru mempertahankan kunci lama.
    const keep = await call('PUT', '/v1/platform/payment-settings', admin, body({ mode: 'production' }));
    expect(keep.json()).toMatchObject({ mode: 'production', serverKeyHint: 'WXYZ' });

    // Dikembalikan: simulasi, lalu pulihkan keadaan semula.
    const dev = await call('PUT', '/v1/platform/payment-settings', admin, {
      provider: 'dev',
      mode: 'sandbox',
    });
    expect(dev.json().provider).toBe('dev');
    expect((await app.payments.get()).name).toBe('dev');
    await app.platformDb.execute(sql`delete from platform_setting where key = 'payment'`);
    app.payments.invalidate();
    expect((await call('GET', '/v1/platform/payment-settings', readOnly)).json().source).toBe(
      original.source,
    );

    const audit = await app.platformDb.execute<{ details: Record<string, unknown> }>(
      sql`select details from audit_log where action = 'payment.settings.update' and actor_id in (${sql.join(
        userIds.map((u) => sql`${u}`),
        sql`, `,
      )})`,
    );
    expect(audit.rows.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(audit.rows)).not.toContain('SB-Mid-server');
  });
});
