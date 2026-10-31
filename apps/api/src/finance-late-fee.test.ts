import { addDays } from '@edusync/contracts';
import {
  academicYear,
  assignRoles,
  classRoom,
  enrollment,
  entitlement,
  eq,
  foundation,
  member,
  school,
  seedSchoolRoles,
  sql,
  student,
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
let teacherCookie = '';
let otherCookie = '';

const ids = {
  year: '',
  foreignYear: '',
  class7A: '',
  foreignClass: '',
  ani: '',
  budi: '',
  citra: '',
  dedi: '',
  foreignStudent: '',
  spp: '',
  denda: '',
  foreignFee: '',
};

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

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Denda', slug: `yld-${run}` })
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
    await db.insert(entitlement).values({
      schoolId: s!.id,
      moduleKey: 'finance',
      subscriptionId: sub!.id,
      validUntil: sub!.currentPeriodEnd,
    });
    return s!.id;
  };
  schoolId = await make(`ld-${run}`);
  otherId = await make(`ld-lain-${run}`);

  const year = async (sid: string) => {
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
    return y!.id;
  };
  ids.year = await year(schoolId);
  ids.foreignYear = await year(otherId);

  const mkClass = async (sid: string, yearId: string, name: string) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId: sid, academicYearId: yearId, name, level: '7' })
      .returning();
    return c!.id;
  };
  ids.class7A = await mkClass(schoolId, ids.year, '7A');
  ids.foreignClass = await mkClass(otherId, ids.foreignYear, '7A');

  const mkStudent = async (sid: string, yearId: string, classId: string, name: string, nis: string) => {
    const [s] = await db
      .insert(student)
      .values({ schoolId: sid, name, nis, gender: 'L', status: 'active' })
      .returning();
    await db.insert(enrollment).values({ schoolId: sid, studentId: s!.id, classId, academicYearId: yearId });
    return s!.id;
  };
  ids.ani = await mkStudent(schoolId, ids.year, ids.class7A, 'Ani', 'D1');
  ids.budi = await mkStudent(schoolId, ids.year, ids.class7A, 'Budi', 'D2');
  ids.citra = await mkStudent(schoolId, ids.year, ids.class7A, 'Citra', 'D3');
  ids.dedi = await mkStudent(schoolId, ids.year, ids.class7A, 'Dedi', 'D4');
  ids.foreignStudent = await mkStudent(otherId, ids.foreignYear, ids.foreignClass, 'Siswa Lain', 'X1');

  adminCookie = await join('admin-ld', schoolId, ['school_admin']);
  teacherCookie = await join('guru-ld', schoolId, ['teacher']);
  otherCookie = await join('admin-ld-lain', otherId, ['school_admin']);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherId]) {
    for (const table of [
      'audit_log',
      'fin_payment_item',
      'fin_payment',
      'fin_payment_method',
      'fin_invoice',
      'fin_late_fee_setting',
      'fin_fee_plan',
      'fin_fee_type',
      'fin_counter',
      'enrollment',
      'class_room',
      'student',
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

const code = (res: { json: () => { error: { code: string } } }) => res.json().error.code;

interface PreviewItem {
  invoiceId: string;
  studentName: string;
  title: string;
  dueDate: string;
  outstanding: number;
  daysLate: number;
  lateFee: number;
  fined: boolean;
  fineInvoiceId: string | null;
}
interface Preview {
  today: string;
  enabled: boolean;
  items: PreviewItem[];
  pendingCount: number;
  pendingTotal: number;
}
const preview = async (cookie = adminCookie, sid = schoolId): Promise<Preview> => {
  const res = await call('GET', '/v1/finance/late-fees/preview', cookie, undefined, sid);
  expect(res.statusCode).toBe(200);
  return res.json();
};
const apply = (body: object = {}, cookie = adminCookie) =>
  call('POST', '/v1/finance/late-fees/apply', cookie, body);
const putSetting = (body: object, cookie = adminCookie) =>
  call('PUT', '/v1/finance/late-fee-settings', cookie, body);

interface Inv {
  id: string;
  studentName: string;
  title: string;
  period: string | null;
  amount: number;
  dueDate: string;
  feeTypeId: string;
  status: string;
}
async function invoicesOf(feeTypeId: string): Promise<Inv[]> {
  const res = await call(
    'GET',
    `/v1/finance/invoices?academicYearId=${ids.year}&feeTypeId=${feeTypeId}&limit=100`,
    adminCookie,
  );
  expect(res.statusCode).toBe(200);
  return res.json().items as Inv[];
}

describe('pengaturan denda', () => {
  it('bawaan tanpa denda, izin, validasi, dan rujukan', async () => {
    const def = await call('GET', '/v1/finance/late-fee-settings', adminCookie);
    expect(def.statusCode).toBe(200);
    expect(def.json()).toEqual({
      mode: 'none',
      value: 0,
      graceDays: 0,
      dueDays: 7,
      capAmount: null,
      feeTypeId: null,
      feeTypeName: null,
    });

    const mk = async (name: string, kind: string, cookie = adminCookie, sid = schoolId) => {
      const res = await call('POST', '/v1/finance/fee-types', cookie, { name, kind }, sid);
      expect(res.statusCode).toBe(201);
      return res.json().id as string;
    };
    ids.spp = await mk('SPP', 'monthly');
    ids.denda = await mk('Denda SPP', 'one_time');
    ids.foreignFee = await mk('Denda Lain', 'one_time', otherCookie, otherId);

    // Izin: guru tidak boleh baca maupun ubah.
    expect((await call('GET', '/v1/finance/late-fee-settings', teacherCookie)).statusCode).toBe(403);
    const base = { mode: 'flat', value: 10_000, graceDays: 0, capAmount: null, feeTypeId: ids.denda };
    expect((await putSetting(base, teacherCookie)).statusCode).toBe(403);
    expect((await call('GET', '/v1/finance/late-fees/preview', teacherCookie)).statusCode).toBe(403);
    expect((await apply({}, teacherCookie)).statusCode).toBe(403);

    // Validasi.
    expect((await putSetting({ ...base, mode: 'percent', value: 0 })).statusCode).toBe(400);
    expect((await putSetting({ ...base, mode: 'percent', value: 101 })).statusCode).toBe(400);
    expect((await putSetting({ ...base, value: 0 })).statusCode).toBe(400);
    expect((await putSetting({ ...base, graceDays: -1 })).statusCode).toBe(400);
    expect((await putSetting({ ...base, graceDays: 366 })).statusCode).toBe(400);
    expect((await putSetting({ ...base, dueDays: 0 })).statusCode).toBe(400);
    expect((await putSetting({ ...base, dueDays: 366 })).statusCode).toBe(400);
    expect((await putSetting({ ...base, capAmount: 0 })).statusCode).toBe(400);
    expect((await putSetting({ ...base, feeTypeId: null })).statusCode).toBe(400);
    const foreign = await putSetting({ ...base, feeTypeId: ids.foreignFee });
    expect(foreign.statusCode).toBe(400);
    expect(code(foreign)).toBe('invalid_reference');

    // Tersimpan, lalu diganti (upsert).
    const saved = await putSetting({ ...base, graceDays: 2, dueDays: 14, capAmount: 50_000 });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      mode: 'flat',
      value: 10_000,
      graceDays: 2,
      dueDays: 14,
      capAmount: 50_000,
      feeTypeId: ids.denda,
      feeTypeName: 'Denda SPP',
    });
    const off = await putSetting({ mode: 'none', value: 0, graceDays: 0, capAmount: null, feeTypeId: null });
    expect(off.statusCode).toBe(200);
    expect((await call('GET', '/v1/finance/late-fee-settings', adminCookie)).json().mode).toBe('none');

    // Sekolah lain tidak melihat pengaturan ini.
    const theirs = await call('GET', '/v1/finance/late-fee-settings', otherCookie, undefined, otherId);
    expect(theirs.json().mode).toBe('none');
  });
});

describe('denda keterlambatan', () => {
  const sppPlan = 200_000;
  const ids2: { ani: string; budi: string; citra: string; dedi: string; future: string } = {
    ani: '',
    budi: '',
    citra: '',
    dedi: '',
    future: '',
  };

  it('menyiapkan tagihan lewat jatuh tempo, sebagian dibayar, batal, lunas, dan belum jatuh tempo', async () => {
    const plan = await call('PUT', '/v1/finance/fee-plans', adminCookie, {
      academicYearId: ids.year,
      feeTypeId: ids.spp,
      level: null,
      amount: sppPlan,
    });
    expect(plan.statusCode).toBe(200);
    const gen = (period: string, dueDate: string) =>
      call('POST', '/v1/finance/invoices/generate', adminCookie, {
        academicYearId: ids.year,
        feeTypeId: ids.spp,
        period,
        classId: null,
        dueDate,
      });
    expect((await gen('2001-01', '2001-01-10')).statusCode).toBe(200);
    expect((await gen('2099-01', '2099-01-10')).statusCode).toBe(200);

    const all = await invoicesOf(ids.spp);
    const of = (name: string, period: string) =>
      all.find((i) => i.studentName === name && i.period === period)!;
    ids2.ani = of('Ani', '2001-01').id;
    ids2.budi = of('Budi', '2001-01').id;
    ids2.citra = of('Citra', '2001-01').id;
    ids2.dedi = of('Dedi', '2001-01').id;
    ids2.future = of('Ani', '2099-01').id;

    const pay = (studentId: string, invoiceId: string, amount: number) =>
      call('POST', '/v1/finance/payments', adminCookie, {
        studentId,
        method: 'cash',
        items: [{ invoiceId, amount }],
      });
    expect((await pay(ids.budi, ids2.budi, 150_000)).statusCode).toBe(201);
    expect((await pay(ids.dedi, ids2.dedi, sppPlan)).statusCode).toBe(201);
    const voided = await call('POST', `/v1/finance/invoices/${ids2.citra}/void`, adminCookie, {
      reason: 'Pindah',
    });
    expect(voided.statusCode).toBe(200);
  });

  it('dimatikan: pratinjau kosong dan penerbitan ditolak', async () => {
    const p = await preview();
    expect(p).toMatchObject({ enabled: false, items: [], pendingCount: 0, pendingTotal: 0 });
    const res = await apply();
    expect(res.statusCode).toBe(400);
    expect(code(res)).toBe('late_fee_disabled');
  });

  it('pratinjau menghitung persen dari sisa, dibatasi cap, dan hanya yang lewat jatuh tempo', async () => {
    const saved = await putSetting({
      mode: 'percent',
      value: 10,
      graceDays: 0,
      dueDays: 10,
      capAmount: 15_000,
      feeTypeId: ids.denda,
    });
    expect(saved.statusCode).toBe(200);

    const p = await preview();
    expect(p.enabled).toBe(true);
    // Ani: 10% x 200.000 = 20.000 -> cap 15.000. Budi: sisa 50.000 -> 5.000. Citra (batal), Dedi (lunas), 2099 (belum) tidak ada.
    expect(p.items.map((i) => [i.studentName, i.outstanding, i.lateFee, i.fined])).toEqual([
      ['Ani', 200_000, 15_000, false],
      ['Budi', 50_000, 5_000, false],
    ]);
    expect(p.items[0]).toMatchObject({
      dueDate: '2001-01-10',
      title: 'SPP Januari 2001',
      fineInvoiceId: null,
    });
    expect(p.items[0]!.daysLate).toBeGreaterThan(9_000);
    expect(p.pendingCount).toBe(2);
    expect(p.pendingTotal).toBe(20_000);

    // Sekolah lain tidak melihat tagihan sekolah ini.
    expect((await preview(otherCookie, otherId)).items).toEqual([]);
  });

  it('penerbitan sebagian (invoiceIds) lalu sisanya, idempoten per tagihan induk', async () => {
    const before = await preview();
    const budi = before.items.find((i) => i.studentName === 'Budi')!;
    const ani = before.items.find((i) => i.studentName === 'Ani')!;

    const first = await apply({ invoiceIds: [budi.invoiceId] });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ created: 1, skipped: 0, total: 5_000 });

    const mid = await preview();
    expect(mid.items.find((i) => i.studentName === 'Budi')).toMatchObject({ fined: true });
    expect(mid.items.find((i) => i.studentName === 'Ani')).toMatchObject({ fined: false });
    expect(mid.pendingCount).toBe(1);
    expect(mid.pendingTotal).toBe(15_000);

    const second = await apply();
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ created: 1, skipped: 1, total: 15_000 });

    const third = await apply();
    expect(third.json()).toMatchObject({ created: 0, skipped: 2, total: 0, invoiceIds: [] });

    // Tagihan denda: jenis biaya, judul, nominal, periode, jatuh tempo hari ini + dueDays (10).
    const fines = await invoicesOf(ids.denda);
    expect(fines).toHaveLength(2);
    const aniFine = fines.find((f) => f.studentName === 'Ani')!;
    expect(aniFine).toMatchObject({
      title: 'Denda SPP Januari 2001',
      amount: 15_000,
      period: `denda-${ani.invoiceId}`,
      feeTypeId: ids.denda,
      status: 'unpaid',
      dueDate: addDays(mid.today, 10),
    });
    expect(fines.find((f) => f.studentName === 'Budi')).toMatchObject({
      amount: 5_000,
      period: `denda-${budi.invoiceId}`,
    });

    // Pratinjau menunjuk tagihan denda yang dibuat.
    const after = await preview();
    expect(after.pendingCount).toBe(0);
    expect(after.items.find((i) => i.studentName === 'Ani')).toMatchObject({
      fined: true,
      fineInvoiceId: aniFine.id,
    });
  });

  it('tagihan denda yang lewat jatuh tempo tidak dikenai denda lagi; perubahan pengaturan tak menggandakan', async () => {
    const fines = await invoicesOf(ids.denda);
    for (const f of fines) {
      const moved = await call('PUT', `/v1/finance/invoices/${f.id}`, adminCookie, {
        discount: 0,
        discountReason: null,
        dueDate: '2001-02-01',
      });
      expect(moved.statusCode).toBe(200);
    }
    // Denda sudah lewat jatuh tempo tetapi bukan tagihan induk: tak masuk pratinjau.
    const p = await preview();
    expect(p.items.map((i) => i.studentName).sort()).toEqual(['Ani', 'Budi']);
    expect(p.items.every((i) => i.title.startsWith('SPP'))).toBe(true);

    // Ganti ke flat: nominal pratinjau mengikuti pengaturan, tetapi tagihan induk tetap sekali kena denda.
    expect(
      (await putSetting({ mode: 'flat', value: 30_000, graceDays: 0, capAmount: null, feeTypeId: ids.denda }))
        .statusCode,
    ).toBe(200);
    const flat = await preview();
    expect(flat.items.map((i) => i.lateFee)).toEqual([30_000, 30_000]);
    expect(flat.pendingCount).toBe(0);
    expect((await apply()).json()).toMatchObject({ created: 0, skipped: 2 });
    expect(await invoicesOf(ids.denda)).toHaveLength(2);
  });

  it('toleransi menunda denda dan menulis audit', async () => {
    expect(
      (
        await putSetting({
          mode: 'flat',
          value: 30_000,
          graceDays: 365,
          capAmount: null,
          feeTypeId: ids.denda,
        })
      ).statusCode,
    ).toBe(200);
    // Jatuh tempo 2001 tetap jauh lewat toleransi 365 hari.
    expect((await preview()).items).toHaveLength(2);

    const audits = await app.platformDb.execute<{ action: string }>(
      sql`select action from audit_log where school_id = ${schoolId} and action like 'finance.late_fee_%'`,
    );
    const actions = audits.rows.map((r) => r.action);
    expect(actions).toContain('finance.late_fee_settings_update');
    expect(actions.filter((a) => a === 'finance.late_fee_apply').length).toBeGreaterThanOrEqual(3);
  });
});
