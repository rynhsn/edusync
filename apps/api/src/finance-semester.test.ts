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
let foundationId = '';
const userIds: string[] = [];
let adminCookie = '';

const ids = { year: '', class7A: '', class8A: '', ani: '', budi: '', citra: '' };

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

const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: {
      cookie: adminCookie,
      'x-school-id': schoolId,
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
    .values({ name: 'Yayasan Semester', slug: `yss-${run}` })
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
  const [s] = await db
    .insert(school)
    .values({ foundationId, slug: `ss-${run}`, name: `Sekolah ss-${run}` })
    .returning();
  schoolId = s!.id;
  await seedSchoolRoles(db, schoolId);
  await db.insert(entitlement).values({
    schoolId,
    moduleKey: 'finance',
    subscriptionId: sub!.id,
    validUntil: sub!.currentPeriodEnd,
  });
  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-01', endsOn: '2027-06-30', isActive: true })
    .returning();
  ids.year = y!.id;
  const mkClass = async (name: string) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId, academicYearId: ids.year, name, level: '7' })
      .returning();
    return c!.id;
  };
  ids.class7A = await mkClass('7A');
  ids.class8A = await mkClass('8A');
  const mkStudent = async (classId: string, name: string, nis: string) => {
    const [st] = await db.insert(student).values({ schoolId, name, nis, gender: 'L' }).returning();
    await db.insert(enrollment).values({ schoolId, studentId: st!.id, classId, academicYearId: ids.year });
    return st!.id;
  };
  ids.ani = await mkStudent(ids.class7A, 'Ani', 'SM1');
  ids.budi = await mkStudent(ids.class7A, 'Budi', 'SM2');
  ids.citra = await mkStudent(ids.class8A, 'Citra', 'SM3');

  const u = await makeUser('admin-sem');
  const [m] = await db.insert(member).values({ userId: u.id, schoolId }).returning();
  await assignRoles(db, m!.id, schoolId, ['school_admin']);
  adminCookie = await login(u.email);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const table of [
    'audit_log',
    'fin_invoice',
    'fin_fee_target',
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
    await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${schoolId}`);
  }
  await db.delete(school).where(eq(school.id, schoolId));
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

const code = (res: { json: () => { error: { code: string } } }) => res.json().error.code;

async function semesterFee(name: string, extra: object = {}, amount = 1_500_000) {
  const res = await call('POST', '/v1/finance/fee-types', {
    name: `${name} ${run}`,
    kind: 'semester',
    ...extra,
  });
  expect(res.statusCode).toBe(201);
  expect(res.json().kind).toBe('semester');
  const id = res.json().id as string;
  const plan = await call('PUT', '/v1/finance/fee-plans', {
    academicYearId: ids.year,
    feeTypeId: id,
    level: null,
    amount,
  });
  expect(plan.statusCode).toBe(200);
  return id;
}
const generate = (feeTypeId: string, period: string | null, extra: object = {}) =>
  call('POST', '/v1/finance/invoices/generate', {
    academicYearId: ids.year,
    feeTypeId,
    period,
    classId: null,
    dueDate: '2026-08-10',
    ...extra,
  });
type Row = { studentName: string; period: string | null; title: string; amount: number; dueDate: string };
async function invoices(feeTypeId: string, query = ''): Promise<Row[]> {
  const res = await call(
    'GET',
    `/v1/finance/invoices?academicYearId=${ids.year}&feeTypeId=${feeTypeId}&limit=100${query}`,
  );
  expect(res.statusCode).toBe(200);
  return res.json().items as Row[];
}

describe('biaya per semester', () => {
  it('membuat tagihan per semester dengan periode S1/S2, judul, nominal, dan jatuh tempo', async () => {
    const id = await semesterFee('SPP Semester');
    const s1 = await generate(id, 'S1', { dueDate: '2026-08-10' });
    expect(s1.statusCode).toBe(200);
    expect(s1.json()).toMatchObject({ created: 3, skipped: 0, free: 0, outOfScope: 0 });
    const rows = await invoices(id);
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r).toMatchObject({
        period: 'S1',
        title: `SPP Semester ${run} Semester Ganjil 2026/2027`,
        amount: 1_500_000,
        dueDate: '2026-08-10',
      });
    }

    const s2 = await generate(id, 'S2', { dueDate: '2027-01-10' });
    expect(s2.json()).toMatchObject({ created: 3, skipped: 0 });
    const genap = await invoices(id, '&period=S2');
    expect(genap).toHaveLength(3);
    expect(genap[0]).toMatchObject({
      period: 'S2',
      title: `SPP Semester ${run} Semester Genap 2026/2027`,
      dueDate: '2027-01-10',
    });
    expect(await invoices(id, '&period=S1')).toHaveLength(3);
    expect(await invoices(id)).toHaveLength(6);
  });

  it('idempoten per siswa, tahun, jenis biaya, dan semester', async () => {
    const id = await semesterFee('SPP Idempoten');
    expect((await generate(id, 'S1')).json()).toMatchObject({ created: 3, skipped: 0 });
    expect((await generate(id, 'S1')).json()).toMatchObject({ created: 0, skipped: 3 });
    expect((await generate(id, 'S2')).json()).toMatchObject({ created: 3, skipped: 0 });
    expect(await invoices(id)).toHaveLength(6);
  });

  it('memvalidasi periode: wajib, hanya S1/S2, dan null untuk jenis lain', async () => {
    const id = await semesterFee('SPP Validasi');
    const none = await generate(id, null);
    expect(none.statusCode).toBe(400);
    expect(code(none)).toBe('period_required');
    for (const bad of ['S3', 's1', '2026-08', 'ganjil', 'S1C01']) {
      const res = await generate(id, bad);
      expect(res.statusCode).toBe(400);
      expect(code(res)).toBe('period_invalid');
    }

    const one = await call('POST', '/v1/finance/fee-types', { name: `Sekali ${run}`, kind: 'one_time' });
    const oneId = one.json().id as string;
    await call('PUT', '/v1/finance/fee-plans', {
      academicYearId: ids.year,
      feeTypeId: oneId,
      level: null,
      amount: 10_000,
    });
    const withPeriod = await generate(oneId, 'S1');
    expect(withPeriod.statusCode).toBe(400);
    expect(code(withPeriod)).toBe('period_required');

    const monthly = await call('POST', '/v1/finance/fee-types', { name: `Bulanan ${run}`, kind: 'monthly' });
    const mid = monthly.json().id as string;
    const m = await generate(mid, 'S1');
    expect(m.statusCode).toBe(400);
    expect(code(m)).toBe('period_required');

    const filter = await call('GET', `/v1/finance/invoices?period=S3`);
    expect(filter.statusCode).toBe(400);
  });

  it('cakupan kelas dan siswa berlaku untuk biaya semester', async () => {
    const byClass = await semesterFee('Ujian Semester Kelas', { scope: 'class', classIds: [ids.class7A] });
    expect((await generate(byClass, 'S1')).json()).toMatchObject({ created: 2, outOfScope: 1 });
    expect((await invoices(byClass)).map((r) => r.studentName).sort()).toEqual(['Ani', 'Budi']);

    const byStudent = await semesterFee('Ujian Semester Siswa', {
      scope: 'student',
      studentIds: [ids.citra],
    });
    expect((await generate(byStudent, 'S2')).json()).toMatchObject({ created: 1, outOfScope: 2 });
    expect((await invoices(byStudent)).map((r) => r.studentName)).toEqual(['Citra']);

    const both = await semesterFee('Ujian Semester Irisan', { scope: 'class', classIds: [ids.class7A] });
    expect((await generate(both, 'S1', { classId: ids.class8A })).json()).toMatchObject({ created: 0 });
  });

  it('tarif 0 gratis dan tanpa tarif dilaporkan', async () => {
    const free = await semesterFee('Semester Gratis', {}, 0);
    expect((await generate(free, 'S1')).json()).toMatchObject({ created: 0, free: 3 });
    const res = await call('POST', '/v1/finance/fee-types', { name: `Tanpa Tarif ${run}`, kind: 'semester' });
    const noPlan = await generate(res.json().id, 'S1');
    expect(noPlan.json().created).toBe(0);
    expect(noPlan.json().missingPlan).toHaveLength(3);
  });

  it('cicilan per semester berperiode S1C01.. dan tidak bentrok antarsemester', async () => {
    const id = await semesterFee('SPP Cicilan', {}, 3_000_001);
    const s1 = await generate(id, 'S1', { installments: 3, dueDate: '2026-08-31' });
    expect(s1.statusCode).toBe(200);
    expect(s1.json()).toMatchObject({ created: 9, skipped: 0 });
    const rows = (await invoices(id)).filter((r) => r.studentName === 'Ani');
    expect(rows.map((r) => r.period).sort()).toEqual(['S1C01', 'S1C02', 'S1C03']);
    expect(rows.reduce((a, r) => a + r.amount, 0)).toBe(3_000_001);
    const first = rows.find((r) => r.period === 'S1C01')!;
    expect(first.title).toBe(`SPP Cicilan ${run} Semester Ganjil (cicilan 1/3) 2026/2027`);
    expect(first.dueDate).toBe('2026-08-31');
    expect(rows.find((r) => r.period === 'S1C02')?.dueDate).toBe('2026-09-30');

    // Semester yang sama dilewati (utuh maupun cicilan); semester lain tetap bisa dibuat.
    expect((await generate(id, 'S1', { installments: 3 })).json()).toMatchObject({ created: 0, skipped: 3 });
    expect((await generate(id, 'S1')).json()).toMatchObject({ created: 0, skipped: 3 });
    const s2 = await generate(id, 'S2', { installments: 2, dueDate: '2027-01-15' });
    expect(s2.json()).toMatchObject({ created: 6, skipped: 0 });
    const s2First = (await invoices(id)).filter((r) => r.period === 'S2C01');
    expect(s2First.map((r) => r.studentName).sort()).toEqual(['Ani', 'Budi', 'Citra']);

    const bad = await generate(id, 'S1', { installments: 1 });
    expect(code(bad)).toBe('installments_invalid');
  });

  it('memecah tagihan semester menjadi cicilan berperiode S1C01..', async () => {
    const id = await semesterFee('SPP Pecah');
    await generate(id, 'S1');
    const ani = (await call('GET', `/v1/finance/invoices?feeTypeId=${id}&studentId=${ids.ani}`)).json()
      .items[0] as { id: string };
    const split = await call('POST', `/v1/finance/invoices/${ani.id}/split`, {
      installments: 2,
      firstDueDate: '2026-09-01',
    });
    expect(split.statusCode).toBe(200);
    expect((split.json().invoices as { period: string }[]).map((i) => i.period)).toEqual(['S1C01', 'S1C02']);
    // Semester genap tidak terpengaruh.
    expect((await generate(id, 'S2')).json()).toMatchObject({ created: 3 });
  });

  it('jenis biaya semester tidak bisa diubah jenisnya setelah dipakai tagihan', async () => {
    const id = await semesterFee('SPP Terkunci');
    await generate(id, 'S1');
    const res = await call('PUT', `/v1/finance/fee-types/${id}`, {
      name: `SPP Terkunci ${run}`,
      kind: 'monthly',
    });
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('in_use');
  });
});
