import {
  academicYear,
  assignRoles,
  classRoom,
  count,
  entitlement,
  eq,
  foundation,
  member,
  question,
  school,
  seedSchoolRoles,
  sql,
  subject,
  subscription,
  teacher,
  teachingAssignment,
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
let mtkId = '';
let bindId = '';
let adminCookie = '';
let teacherCookie = '';
let noModuleCookie = '';
const userIds: string[] = [];

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

const post = (cookie: string, payload: object, sid = schoolId) =>
  app.inject({
    method: 'POST',
    url: '/v1/exam/questions/import',
    headers: { cookie, 'x-school-id': sid, origin, 'content-type': 'application/json' },
    payload,
  });

const bankCount = async () =>
  (await app.platformDb.select({ n: count() }).from(question).where(eq(question.schoolId, schoolId)))[0]!.n;

const mcq = (body: string, answer = 'B', over: Record<string, unknown> = {}) => ({
  type: 'mcq',
  body,
  options: [
    { key: 'A', text: 'satu' },
    { key: 'B', text: 'dua' },
    { key: 'C', text: 'tiga' },
  ],
  answer,
  points: 2,
  ...over,
});
const essay = (body: string) => ({ type: 'essay', body, answer: 'Pedoman', points: 5 });

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Impor', slug: `yimp-${run}` })
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
  schoolId = await makeSchool(`impor-${run}`, ['grades', 'exams']);
  noModuleId = await makeSchool(`impor-nomod-${run}`, ['grades']);

  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30', isActive: true })
    .returning();
  const [kelas] = await db
    .insert(classRoom)
    .values({ schoolId, academicYearId: y!.id, name: '7 A', level: '7' })
    .returning();
  const [mtk, bind] = await db
    .insert(subject)
    .values([
      { schoolId, code: 'MTK', name: 'Matematika' },
      { schoolId, code: 'BIN', name: 'Bahasa Indonesia' },
    ])
    .returning();
  mtkId = mtk!.id;
  bindId = bind!.id;

  adminCookie = (await join('admin-impor', schoolId, ['school_admin'])).cookie;
  const guru = await join('guru-impor', schoolId, ['teacher']);
  teacherCookie = guru.cookie;
  const [t] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Guru MTK', memberId: guru.memberId })
    .returning();
  await db
    .insert(teachingAssignment)
    .values({ schoolId, classId: kelas!.id, subjectId: mtkId, teacherId: t!.id });
  noModuleCookie = (await join('admin-nomod-impor', noModuleId, ['school_admin'])).cookie;
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, noModuleId]) {
    for (const table of [
      'audit_log',
      'question',
      'teaching_assignment',
      'teacher',
      'subject',
      'class_room',
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

describe('impor soal massal', () => {
  it('dryRun memeriksa saja: melaporkan baris salah per nomor dan tidak menulis apa pun', async () => {
    const res = await post(adminCookie, {
      subjectId: mtkId,
      rows: [
        mcq('Soal benar'),
        mcq('Kunci salah', 'Z'),
        { type: 'mcq', body: 'Satu opsi', options: [{ key: 'A', text: 'x' }], answer: 'A' },
        essay('Esai benar'),
        { type: 'essay', body: 'Esai beropsi', options: [{ key: 'A', text: 'x' }] },
        { type: 'mcq', body: '   ', options: [] },
      ],
    });
    expect(res.statusCode, res.body).toBe(200);
    const r = res.json();
    expect(r).toMatchObject({ total: 6, valid: 2, invalid: 4, duplicates: 0, created: 0 });
    expect(r.errors.map((e: { row: number }) => e.row)).toEqual([2, 3, 5, 6]);
    expect(r.errors[0].message).toMatch(/kunci jawaban/i);
    expect(await bankCount()).toBe(0);
  });

  it('semua-atau-tidak-sama-sekali: ada baris tidak valid -> 400 import_invalid, tidak ada yang tertulis', async () => {
    const res = await post(adminCookie, {
      subjectId: mtkId,
      dryRun: false,
      rows: [mcq('Soal benar'), mcq('Kunci salah', 'Z')],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('import_invalid');
    expect(res.json().errors).toEqual([{ row: 2, message: 'Kunci jawaban harus salah satu opsi.' }]);
    expect(await bankCount()).toBe(0);
  });

  it('menulis semua soal valid, memakai level dari permintaan, dan melewati duplikat', async () => {
    const first = await post(adminCookie, {
      subjectId: mtkId,
      level: '7',
      dryRun: false,
      rows: [mcq('Soal Pertama'), essay('Esai pertama'), mcq('  soal   pertama  ')],
    });
    expect(first.statusCode, first.body).toBe(200);
    // Baris ke-3 sama dengan baris ke-1 (huruf besar/kecil dan spasi diabaikan).
    expect(first.json()).toMatchObject({ total: 3, valid: 3, duplicates: 1, created: 2 });
    expect(await bankCount()).toBe(2);
    const rows = await app.platformDb.select().from(question).where(eq(question.schoolId, schoolId));
    expect(rows.every((r) => r.level === '7' && r.subjectId === mtkId)).toBe(true);

    // Mengimpor ulang berkas yang sama: semuanya duplikat dari bank.
    const again = await post(adminCookie, {
      subjectId: mtkId,
      dryRun: false,
      rows: [mcq('Soal pertama'), essay('ESAI PERTAMA'), mcq('Soal baru')],
    });
    expect(again.json()).toMatchObject({ valid: 3, duplicates: 2, created: 1 });
    expect(await bankCount()).toBe(3);

    // dryRun melaporkan duplikat tanpa menulis.
    const dry = await post(adminCookie, { subjectId: mtkId, rows: [mcq('Soal baru'), mcq('Soal lain')] });
    expect(dry.json()).toMatchObject({ valid: 2, duplicates: 1, created: 0 });
    expect(await bankCount()).toBe(3);
  });

  it('teks yang sama di mapel lain bukan duplikat', async () => {
    const res = await post(adminCookie, { subjectId: bindId, dryRun: false, rows: [mcq('Soal pertama')] });
    expect(res.json()).toMatchObject({ duplicates: 0, created: 1 });
  });

  it('guru hanya untuk mapel yang diampu; modul dan sesi wajib; rujukan diperiksa', async () => {
    expect((await post(teacherCookie, { subjectId: bindId, rows: [mcq('X')] })).statusCode).toBe(403);
    expect((await post(teacherCookie, { subjectId: mtkId, rows: [mcq('Soal guru')] })).statusCode).toBe(200);
    const blocked = await post(noModuleCookie, { subjectId: mtkId, rows: [mcq('X')] }, noModuleId);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('module_disabled');
    expect((await app.inject({ method: 'POST', url: '/v1/exam/questions/import' })).statusCode).toBe(401);
    expect((await post(adminCookie, { subjectId: crypto.randomUUID(), rows: [mcq('X')] })).statusCode).toBe(
      400,
    );
    expect((await post(adminCookie, { subjectId: mtkId, rows: [] })).statusCode).toBe(400);
  });
});
