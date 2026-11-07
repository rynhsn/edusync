import {
  academicYear,
  assignRoles,
  classRoom,
  enrollment,
  entitlement,
  eq,
  foundation,
  guardian,
  member,
  portalLink,
  school,
  seedSchoolRoles,
  sql,
  student,
  studentGuardian,
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
let schoolId = '';
let otherId = '';
let foundationId = '';
const userIds: string[] = [];
let adminCookie = '';
let operatorCookie = '';
let treasurerCookie = '';
let otherAdminCookie = '';
let parentCookie = '';
let otherParentCookie = '';
const ids = { ani: '', foreign: '' };

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
  return { cookie: await login(u.email), memberId: m!.id };
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
const code = (res: { json: () => { error: { code: string } } }) => res.json().error.code;

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Rekening', slug: `yr-${run}` })
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
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug, name: `Sekolah ${slug}` })
      .returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of ['finance', 'parent_portal']) {
      await db
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    return s!.id;
  };
  schoolId = await make(`rk-${run}`);
  otherId = await make(`rk-lain-${run}`);

  const mkStudent = async (sid: string, name: string, nis: string) => {
    const [y] = await db
      .insert(academicYear)
      .values({
        schoolId: sid,
        name: '2000-2099',
        startsOn: '2000-01-01',
        endsOn: '2099-12-31',
        isActive: true,
      })
      .returning();
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId: sid, academicYearId: y!.id, name: `K-${nis}`, level: '7' })
      .returning();
    const [s] = await db.insert(student).values({ schoolId: sid, name, nis, gender: 'L' }).returning();
    await db
      .insert(enrollment)
      .values({ schoolId: sid, studentId: s!.id, classId: c!.id, academicYearId: y!.id });
    return s!.id;
  };
  ids.ani = await mkStudent(schoolId, 'Ani', 'R1');
  ids.foreign = await mkStudent(otherId, 'Siswa Lain', 'R9');

  adminCookie = (await join('admin-rk', schoolId, ['school_admin'])).cookie;
  operatorCookie = (await join('operator-rk', schoolId, ['operator'])).cookie;
  treasurerCookie = (await join('bendahara-rk', schoolId, ['treasurer'])).cookie;
  otherAdminCookie = (await join('admin-rk-lain', otherId, ['school_admin'])).cookie;

  const link = async (label: string, sid: string, anakId: string) => {
    const j = await join(label, sid, ['guardian']);
    const [g] = await db.insert(guardian).values({ schoolId: sid, name: label }).returning();
    await db
      .insert(studentGuardian)
      .values({ schoolId: sid, studentId: anakId, guardianId: g!.id, relation: 'father', isPrimary: true });
    await db
      .insert(portalLink)
      .values({ schoolId: sid, memberId: j.memberId, kind: 'guardian', guardianId: g!.id });
    return j.cookie;
  };
  parentCookie = await link('wali-rk', schoolId, ids.ani);
  otherParentCookie = await link('wali-rk-lain', otherId, ids.foreign);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherId]) {
    for (const table of [
      'audit_log',
      'fin_bank_account',
      'portal_link',
      'student_guardian',
      'guardian',
      'enrollment',
      'class_room',
      'student',
      'academic_year',
      'member',
      'role',
      'entitlement',
    ]) {
      await db
        .execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`)
        .catch(() => undefined);
    }
    await db.delete(school).where(eq(school.id, sid));
  }
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

const valid = (extra: object = {}) => ({
  bankName: 'Bank Mandiri',
  accountNumber: '123-00-4567890-1',
  accountHolder: 'Yayasan Pendidikan Contoh',
  ...extra,
});
type Account = {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  note: string | null;
  active: boolean;
  sort: number;
};
const list = async (cookie = adminCookie, sid = schoolId) => {
  const res = await call('GET', '/v1/finance/bank-accounts', cookie, undefined, sid);
  expect(res.statusCode).toBe(200);
  return res.json().items as Account[];
};

describe('rekening bank sekolah', () => {
  it('daftar awal kosong', async () => {
    expect(await list()).toEqual([]);
  });

  it('tambah, ubah, urutkan, dan hapus', async () => {
    const a = await call('POST', '/v1/finance/bank-accounts', adminCookie, valid({ note: 'Cabang Bandung' }));
    expect(a.statusCode).toBe(201);
    expect(a.json()).toMatchObject({
      bankName: 'Bank Mandiri',
      accountNumber: '123-00-4567890-1',
      note: 'Cabang Bandung',
      active: true,
      sort: 0,
    });
    const b = await call(
      'POST',
      '/v1/finance/bank-accounts',
      adminCookie,
      valid({ bankName: 'BCA', accountNumber: '8800 1234 56', active: false }),
    );
    expect(b.statusCode).toBe(201);
    expect(b.json()).toMatchObject({ note: null, active: false, sort: 1 });
    const aId = a.json().id as string;
    const bId = b.json().id as string;

    const patch = await call('PATCH', `/v1/finance/bank-accounts/${bId}`, adminCookie, {
      accountHolder: 'SMP Contoh',
      note: 'Berita: NIS',
      active: true,
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toMatchObject({ accountHolder: 'SMP Contoh', note: 'Berita: NIS', active: true });
    const clear = await call('PATCH', `/v1/finance/bank-accounts/${bId}`, adminCookie, { note: '' });
    expect(clear.json().note).toBeNull();
    expect((await call('PATCH', `/v1/finance/bank-accounts/${bId}`, adminCookie, {})).statusCode).toBe(400);

    const reorder = await call('PUT', '/v1/finance/bank-accounts/order', adminCookie, { ids: [bId, aId] });
    expect(reorder.statusCode).toBe(200);
    expect((await list()).map((r) => r.id)).toEqual([bId, aId]);
    const partial = await call('PUT', '/v1/finance/bank-accounts/order', adminCookie, { ids: [aId] });
    expect(partial.statusCode).toBe(400);
    expect(code(partial)).toBe('invalid_reference');

    const del = await call('DELETE', `/v1/finance/bank-accounts/${aId}`, adminCookie);
    expect(del.statusCode).toBe(200);
    expect((await list()).map((r) => r.id)).toEqual([bId]);
    expect((await call('DELETE', `/v1/finance/bank-accounts/${aId}`, adminCookie)).statusCode).toBe(404);
    expect(
      (await call('PATCH', `/v1/finance/bank-accounts/${aId}`, adminCookie, { bankName: 'BNI' })).statusCode,
    ).toBe(404);
    await call('DELETE', `/v1/finance/bank-accounts/${bId}`, adminCookie);
    expect(await list()).toEqual([]);
  });

  it('izin: baca finance:read, tulis finance:manage', async () => {
    const created = await call('POST', '/v1/finance/bank-accounts', treasurerCookie, valid());
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;

    // Operator hanya finance:read.
    expect((await call('GET', '/v1/finance/bank-accounts', operatorCookie)).statusCode).toBe(200);
    expect((await call('POST', '/v1/finance/bank-accounts', operatorCookie, valid())).statusCode).toBe(403);
    expect(
      (await call('PATCH', `/v1/finance/bank-accounts/${id}`, operatorCookie, { active: false })).statusCode,
    ).toBe(403);
    expect((await call('DELETE', `/v1/finance/bank-accounts/${id}`, operatorCookie)).statusCode).toBe(403);
    expect(
      (await call('PUT', '/v1/finance/bank-accounts/order', operatorCookie, { ids: [id] })).statusCode,
    ).toBe(403);

    // Wali tidak punya izin keuangan sekolah.
    expect((await call('GET', '/v1/finance/bank-accounts', parentCookie)).statusCode).toBe(403);
    expect((await call('POST', '/v1/finance/bank-accounts', parentCookie, valid())).statusCode).toBe(403);
    // Tanpa login.
    expect((await call('GET', '/v1/finance/bank-accounts', '')).statusCode).toBe(401);
    expect((await list()).map((r) => r.id)).toContain(id);
    await call('DELETE', `/v1/finance/bank-accounts/${id}`, adminCookie);
  });

  it('validasi nama bank, nomor rekening, pemilik, dan catatan', async () => {
    const post = (body: object) => call('POST', '/v1/finance/bank-accounts', adminCookie, body);
    for (const accountNumber of [
      '1234',
      'abcde12345',
      '12345!',
      '123456789012345678901234567890123',
      '- - - - -',
    ]) {
      expect((await post(valid({ accountNumber }))).statusCode).toBe(400);
    }
    expect((await post(valid({ accountNumber: '12345' }))).statusCode).toBe(201);
    expect((await post(valid({ bankName: 'B' }))).statusCode).toBe(400);
    expect((await post(valid({ bankName: 'x'.repeat(61) }))).statusCode).toBe(400);
    expect((await post(valid({ accountHolder: '' }))).statusCode).toBe(400);
    expect((await post(valid({ accountHolder: 'x'.repeat(101) }))).statusCode).toBe(400);
    expect((await post(valid({ note: 'x'.repeat(201) }))).statusCode).toBe(400);
    expect((await post({ bankName: 'BRI' })).statusCode).toBe(400);
    for (const r of await list()) await call('DELETE', `/v1/finance/bank-accounts/${r.id}`, adminCookie);
  });

  it('maksimal 10 rekening per sekolah', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await call(
        'POST',
        '/v1/finance/bank-accounts',
        adminCookie,
        valid({ accountNumber: `10000${i}` }),
      );
      expect(res.statusCode).toBe(201);
    }
    const over = await call('POST', '/v1/finance/bank-accounts', adminCookie, valid());
    expect(over.statusCode).toBe(409);
    expect(code(over)).toBe('limit_reached');
    // Sekolah lain tidak terpengaruh batasnya.
    const other = await call('POST', '/v1/finance/bank-accounts', otherAdminCookie, valid(), otherId);
    expect(other.statusCode).toBe(201);
    for (const r of await list()) await call('DELETE', `/v1/finance/bank-accounts/${r.id}`, adminCookie);
    for (const r of await list(otherAdminCookie, otherId)) {
      await call('DELETE', `/v1/finance/bank-accounts/${r.id}`, otherAdminCookie, undefined, otherId);
    }
  });

  it('isolasi antar sekolah (RLS)', async () => {
    const mine = await call(
      'POST',
      '/v1/finance/bank-accounts',
      adminCookie,
      valid({ bankName: 'Bank Milik A' }),
    );
    const theirs = await call(
      'POST',
      '/v1/finance/bank-accounts',
      otherAdminCookie,
      valid({ bankName: 'Bank Milik B' }),
      otherId,
    );
    expect(mine.statusCode).toBe(201);
    expect(theirs.statusCode).toBe(201);
    expect((await list()).map((r) => r.bankName)).toEqual(['Bank Milik A']);
    expect((await list(otherAdminCookie, otherId)).map((r) => r.bankName)).toEqual(['Bank Milik B']);

    const theirId = theirs.json().id as string;
    // Admin sekolah A tidak bisa menyentuh rekening sekolah B walau id-nya diketahui.
    expect(
      (await call('PATCH', `/v1/finance/bank-accounts/${theirId}`, adminCookie, { bankName: 'Dibajak' }))
        .statusCode,
    ).toBe(404);
    expect((await call('DELETE', `/v1/finance/bank-accounts/${theirId}`, adminCookie)).statusCode).toBe(404);
    // Admin sekolah B tidak boleh mengakses sekolah A.
    expect(
      (await call('GET', '/v1/finance/bank-accounts', otherAdminCookie, undefined, schoolId)).statusCode,
    ).not.toBe(200);
    expect((await list(otherAdminCookie, otherId)).map((r) => r.bankName)).toEqual(['Bank Milik B']);

    const rows = await app.platformDb.execute<{ n: number }>(
      sql`select count(*)::int as n from fin_bank_account where school_id = ${schoolId}`,
    );
    expect(rows.rows[0]!.n).toBe(1);
  });

  it('portal menampilkan hanya rekening aktif milik sekolah anak, urut tampilan', async () => {
    for (const r of await list()) await call('DELETE', `/v1/finance/bank-accounts/${r.id}`, adminCookie);
    const a = await call(
      'POST',
      '/v1/finance/bank-accounts',
      adminCookie,
      valid({ bankName: 'Bank Aktif 1' }),
    );
    const hidden = await call(
      'POST',
      '/v1/finance/bank-accounts',
      adminCookie,
      valid({ bankName: 'Bank Nonaktif', active: false }),
    );
    const c = await call(
      'POST',
      '/v1/finance/bank-accounts',
      adminCookie,
      valid({ bankName: 'Bank Aktif 2', note: 'Cabang Utama' }),
    );
    expect(hidden.statusCode).toBe(201);
    for (const r of await list(otherAdminCookie, otherId)) {
      await call('DELETE', `/v1/finance/bank-accounts/${r.id}`, otherAdminCookie, undefined, otherId);
    }
    await call(
      'POST',
      '/v1/finance/bank-accounts',
      otherAdminCookie,
      valid({ bankName: 'Bank Sekolah Lain' }),
      otherId,
    );

    const res = await call('GET', `/v1/portal/children/${ids.ani}/invoices`, parentCookie);
    expect(res.statusCode).toBe(200);
    const accounts = res.json().bankAccounts as Record<string, unknown>[];
    expect(accounts.map((r) => r.bankName)).toEqual(['Bank Aktif 1', 'Bank Aktif 2']);
    expect(accounts[1]).toEqual({
      id: c.json().id,
      bankName: 'Bank Aktif 2',
      accountNumber: '123-00-4567890-1',
      accountHolder: 'Yayasan Pendidikan Contoh',
      note: 'Cabang Utama',
    });

    // Urutan mengikuti pengaturan, dan menonaktifkan menyembunyikan dari portal.
    await call('PUT', '/v1/finance/bank-accounts/order', adminCookie, {
      ids: [c.json().id, hidden.json().id, a.json().id],
    });
    await call('PATCH', `/v1/finance/bank-accounts/${a.json().id}`, adminCookie, { active: false });
    const after = await call('GET', `/v1/portal/children/${ids.ani}/invoices`, parentCookie);
    expect((after.json().bankAccounts as { bankName: string }[]).map((r) => r.bankName)).toEqual([
      'Bank Aktif 2',
    ]);

    // Wali sekolah lain hanya melihat rekening sekolahnya, dan tidak bisa membuka anak sekolah A.
    const theirs = await call(
      'GET',
      `/v1/portal/children/${ids.foreign}/invoices`,
      otherParentCookie,
      undefined,
      otherId,
    );
    expect((theirs.json().bankAccounts as { bankName: string }[]).map((r) => r.bankName)).toEqual([
      'Bank Sekolah Lain',
    ]);
    const crossed = await call(
      'GET',
      `/v1/portal/children/${ids.ani}/invoices`,
      otherParentCookie,
      undefined,
      otherId,
    );
    expect(crossed.statusCode).toBe(404);
  });
});
