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

const ids = {
  year: '',
  class7A: '',
  class8A: '',
  foreignClass: '',
  ani: '',
  budi: '',
  citra: '',
  dedi: '',
  foreignStudent: '',
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
    .values({ name: 'Yayasan Cakupan', slug: `ysc-${run}` })
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
  schoolId = await make(`sc-${run}`);
  otherId = await make(`sc-lain-${run}`);

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
  const foreignYear = await year(otherId);

  const mkClass = async (sid: string, yearId: string, name: string) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId: sid, academicYearId: yearId, name, level: '7' })
      .returning();
    return c!.id;
  };
  ids.class7A = await mkClass(schoolId, ids.year, '7A');
  ids.class8A = await mkClass(schoolId, ids.year, '8A');
  ids.foreignClass = await mkClass(otherId, foreignYear, '7A');

  const mkStudent = async (sid: string, yearId: string, classId: string, name: string, nis: string) => {
    const [s] = await db.insert(student).values({ schoolId: sid, name, nis, gender: 'L' }).returning();
    await db.insert(enrollment).values({ schoolId: sid, studentId: s!.id, classId, academicYearId: yearId });
    return s!.id;
  };
  ids.ani = await mkStudent(schoolId, ids.year, ids.class7A, 'Ani', 'S1');
  ids.budi = await mkStudent(schoolId, ids.year, ids.class7A, 'Budi', 'S2');
  ids.citra = await mkStudent(schoolId, ids.year, ids.class8A, 'Citra', 'S3');
  ids.dedi = await mkStudent(schoolId, ids.year, ids.class8A, 'Dedi', 'S4');
  ids.foreignStudent = await mkStudent(otherId, foreignYear, ids.foreignClass, 'Siswa Lain', 'X1');

  adminCookie = await join('admin-sc', schoolId, ['school_admin']);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherId]) {
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

async function feeType(body: object) {
  const res = await call('POST', '/v1/finance/fee-types', { kind: 'one_time', ...body });
  return res;
}
async function withPlan(body: object) {
  const res = await feeType(body);
  expect(res.statusCode).toBe(201);
  const id = res.json().id as string;
  const plan = await call('PUT', '/v1/finance/fee-plans', {
    academicYearId: ids.year,
    feeTypeId: id,
    level: null,
    amount: 100_000,
  });
  expect(plan.statusCode).toBe(200);
  return id;
}
const generate = (feeTypeId: string, extra: object = {}) =>
  call('POST', '/v1/finance/invoices/generate', {
    academicYearId: ids.year,
    feeTypeId,
    period: null,
    classId: null,
    dueDate: '2030-01-31',
    ...extra,
  });
async function invoiceStudents(feeTypeId: string) {
  const res = await call(
    'GET',
    `/v1/finance/invoices?academicYearId=${ids.year}&feeTypeId=${feeTypeId}&limit=100`,
  );
  expect(res.statusCode).toBe(200);
  return (res.json().items as { studentName: string }[]).map((i) => i.studentName).sort();
}

describe('cakupan jenis biaya', () => {
  it('bawaan cakupan semua siswa', async () => {
    const id = await withPlan({ name: `Semua ${run}` });
    const list = await call('GET', '/v1/finance/fee-types');
    const row = list.json().find((f: { id: string }) => f.id === id);
    expect(row).toMatchObject({ scope: 'all', targetCount: 0, classIds: [], studentIds: [] });
    const res = await generate(id);
    expect(res.json()).toMatchObject({ created: 4, outOfScope: 0 });
  });

  it('cakupan kelas hanya menagih siswa kelas sasaran', async () => {
    const id = await withPlan({ name: `Renang ${run}`, scope: 'class', classIds: [ids.class7A] });
    const list = await call('GET', '/v1/finance/fee-types');
    const row = list.json().find((f: { id: string }) => f.id === id);
    expect(row).toMatchObject({
      scope: 'class',
      targetCount: 1,
      targetNames: ['7A'],
      classIds: [ids.class7A],
    });
    const res = await generate(id);
    expect(res.json()).toMatchObject({ created: 2, outOfScope: 2 });
    expect(await invoiceStudents(id)).toEqual(['Ani', 'Budi']);
  });

  it('classId pada generate beririsan dengan sasaran', async () => {
    const id = await withPlan({ name: `Irisan ${run}`, scope: 'class', classIds: [ids.class7A] });
    const res = await generate(id, { classId: ids.class8A });
    expect(res.json()).toMatchObject({ created: 0 });
    expect(await invoiceStudents(id)).toEqual([]);
  });

  it('cakupan siswa hanya menagih siswa terpilih', async () => {
    const id = await withPlan({
      name: `Praktikum ${run}`,
      scope: 'student',
      studentIds: [ids.citra, ids.ani],
    });
    const res = await generate(id);
    expect(res.json()).toMatchObject({ created: 2, outOfScope: 2 });
    expect(await invoiceStudents(id)).toEqual(['Ani', 'Citra']);
  });

  it('sasaran diganti saat ubah, dan kembali ke semua menghapus sasaran', async () => {
    const id = await withPlan({ name: `Ganti ${run}`, scope: 'class', classIds: [ids.class7A] });
    const put = await call('PUT', `/v1/finance/fee-types/${id}`, {
      name: `Ganti ${run}`,
      kind: 'one_time',
      scope: 'class',
      classIds: [ids.class8A],
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ classIds: [ids.class8A], targetNames: ['8A'] });
    expect(await generate(id).then((r) => r.json().created)).toBe(2);
    expect(await invoiceStudents(id)).toEqual(['Citra', 'Dedi']);

    const toAll = await call('PUT', `/v1/finance/fee-types/${id}`, {
      name: `Ganti ${run}`,
      kind: 'one_time',
      scope: 'all',
      classIds: [ids.class8A],
    });
    expect(toAll.json()).toMatchObject({ scope: 'all', targetCount: 0, classIds: [] });
  });

  it('menolak sasaran kosong dan id tidak valid', async () => {
    const empty = await feeType({ name: `Kosong ${run}`, scope: 'class', classIds: [] });
    expect(empty.statusCode).toBe(400);
    expect(code(empty)).toBe('targets_required');
    const emptyStudents = await feeType({ name: `Kosong2 ${run}`, scope: 'student' });
    expect(code(emptyStudents)).toBe('targets_required');

    const ghost = await feeType({
      name: `Hantu ${run}`,
      scope: 'student',
      studentIds: ['00000000-0000-4000-8000-000000000001'],
    });
    expect(ghost.statusCode).toBe(400);
    expect(code(ghost)).toBe('invalid_reference');
  });

  it('menolak kelas dan siswa sekolah lain', async () => {
    const cls = await feeType({ name: `AsingK ${run}`, scope: 'class', classIds: [ids.foreignClass] });
    expect(cls.statusCode).toBe(400);
    expect(code(cls)).toBe('invalid_reference');
    const stu = await feeType({ name: `AsingS ${run}`, scope: 'student', studentIds: [ids.foreignStudent] });
    expect(stu.statusCode).toBe(400);
    expect(code(stu)).toBe('invalid_reference');
  });

  it('GET siswa/fees menampilkan jenis biaya yang berlaku', async () => {
    const klass = await withPlan({ name: `FK ${run}`, scope: 'class', classIds: [ids.class7A] });
    const stud = await withPlan({ name: `FS ${run}`, scope: 'student', studentIds: [ids.dedi] });
    const names = async (sid: string) =>
      ((await call('GET', `/v1/finance/students/${sid}/fees`)).json() as { id: string }[]).map((f) => f.id);
    const ani = await names(ids.ani);
    expect(ani).toContain(klass);
    expect(ani).not.toContain(stud);
    const dedi = await names(ids.dedi);
    expect(dedi).toContain(stud);
    expect(dedi).not.toContain(klass);
    const missing = await call('GET', '/v1/finance/students/00000000-0000-4000-8000-000000000001/fees');
    expect(missing.statusCode).toBe(404);
  });
});
