import {
  academicYear,
  assignRoles,
  classRoom,
  entitlement,
  eq,
  foundation,
  member,
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
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

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

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
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

const mcq = (over: Record<string, unknown> = {}) => ({
  subjectId: mtkId,
  type: 'mcq',
  body: 'Hasil dari $2 + 3 \\times 4$ adalah ...',
  options: [
    { key: 'A', text: '20' },
    { key: 'B', text: '14' },
    { key: 'C', text: '24' },
  ],
  answer: 'B',
  points: 2,
  ...over,
});

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Ujian', slug: `yuj-${run}` })
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
  schoolId = await makeSchool(`ujian-${run}`, ['grades', 'exams']);
  noModuleId = await makeSchool(`ujian-nomod-${run}`, ['grades']);

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

  const admin = await join('admin-ujian', schoolId, ['school_admin']);
  adminCookie = admin.cookie;
  const guru = await join('guru-ujian', schoolId, ['teacher']);
  teacherCookie = guru.cookie;
  const [t] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Guru Matematika', memberId: guru.memberId })
    .returning();
  await db
    .insert(teachingAssignment)
    .values({ schoolId, classId: kelas!.id, subjectId: mtkId, teacherId: t!.id });
  noModuleCookie = (await join('admin-nomod-ujian', noModuleId, ['school_admin'])).cookie;
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, noModuleId]) {
    for (const table of [
      'audit_log',
      'question',
      'exam_type',
      'school_file',
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

describe('modul dan izin', () => {
  it('modul `exams` harus aktif; sesi wajib', async () => {
    const res = await call('GET', '/v1/exam/types', noModuleCookie, undefined, noModuleId);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('module_disabled');
    expect((await app.inject('/v1/exam/types')).statusCode).toBe(401);
  });
});

describe('jenis ujian', () => {
  it('bawaan ASTS dan ASAS, tidak ganda, bisa ditambah, diganti nama, dan dihapus', async () => {
    expect((await call('GET', '/v1/exam/types', adminCookie)).json()).toEqual([]);
    const first = await call('POST', '/v1/exam/types/defaults', adminCookie);
    expect(first.json().map((t: { shortName: string }) => t.shortName)).toEqual(['ASTS', 'ASAS']);
    const again = await call('POST', '/v1/exam/types/defaults', adminCookie);
    expect(again.json()).toHaveLength(2);

    const created = await call('POST', '/v1/exam/types', adminCookie, {
      name: 'Ujian Madrasah',
      shortName: 'UM',
    });
    expect(created.statusCode, created.body).toBe(201);
    const dup = await call('POST', '/v1/exam/types', adminCookie, {
      name: 'Ujian Madrasah',
      shortName: 'UM2',
    });
    expect(dup.statusCode).toBe(409);

    // Penamaan berganti mengikuti kebijakan: ASAS menjadi nama baru.
    const asas = again.json().find((t: { shortName: string }) => t.shortName === 'ASAS');
    const renamed = await call('PUT', `/v1/exam/types/${asas.id}`, adminCookie, {
      name: 'Sumatif Akhir Semester',
      shortName: 'SAS',
    });
    expect(renamed.json()).toMatchObject({ name: 'Sumatif Akhir Semester', shortName: 'SAS' });

    expect((await call('DELETE', `/v1/exam/types/${created.json().id}`, adminCookie)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/exam/types/${created.json().id}`, adminCookie)).statusCode).toBe(404);
  });

  it('guru boleh melihat, tidak boleh mengubah', async () => {
    expect((await call('GET', '/v1/exam/types', teacherCookie)).statusCode).toBe(200);
    const res = await call('POST', '/v1/exam/types', teacherCookie, { name: 'X', shortName: 'X' });
    expect(res.statusCode).toBe(403);
  });
});

describe('bank soal', () => {
  it('memvalidasi pilihan ganda dan esai', async () => {
    const post = (b: object) => call('POST', '/v1/exam/questions', adminCookie, b);
    expect((await post(mcq({ answer: 'Z' }))).statusCode).toBe(400);
    expect((await post(mcq({ options: [{ key: 'A', text: 'satu' }] }))).statusCode).toBe(400);
    expect(
      (
        await post(
          mcq({
            options: [
              { key: 'A', text: 'a' },
              { key: 'a', text: 'b' },
            ],
            answer: 'A',
          }),
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (await post({ subjectId: mtkId, type: 'essay', body: 'Jelaskan', options: [{ key: 'A', text: 'x' }] }))
        .statusCode,
    ).toBe(400);
    expect((await post(mcq({ subjectId: crypto.randomUUID() }))).statusCode).toBe(400);
  });

  it('CRUD oleh pengelola; cari dan saring', async () => {
    const m = await call('POST', '/v1/exam/questions', adminCookie, mcq());
    expect(m.statusCode, m.body).toBe(201);
    expect(m.json()).toMatchObject({ subjectName: 'Matematika', answer: 'B', points: 2 });
    const e = await call('POST', '/v1/exam/questions', adminCookie, {
      subjectId: bindId,
      type: 'essay',
      body: 'Jelaskan **struktur** teks eksposisi.',
      answer: 'Tesis, argumentasi, penegasan ulang.',
      points: 10,
    });
    expect(e.statusCode, e.body).toBe(201);

    const all = (await call('GET', '/v1/exam/questions', adminCookie)).json();
    expect(all.total).toBe(2);
    expect((await call('GET', `/v1/exam/questions?subjectId=${bindId}`, adminCookie)).json().total).toBe(1);
    expect((await call('GET', '/v1/exam/questions?type=mcq', adminCookie)).json().total).toBe(1);
    expect((await call('GET', '/v1/exam/questions?q=eksposisi', adminCookie)).json().total).toBe(1);
    expect((await call('GET', '/v1/exam/questions?q=%25', adminCookie)).json().total).toBe(0);

    const upd = await call(
      'PUT',
      `/v1/exam/questions/${m.json().id}`,
      adminCookie,
      mcq({ answer: 'C', points: 3 }),
    );
    expect(upd.json()).toMatchObject({ answer: 'C', points: 3 });
    expect((await call('DELETE', `/v1/exam/questions/${e.json().id}`, adminCookie)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/exam/questions/${e.json().id}`, adminCookie)).statusCode).toBe(404);
  });

  it('guru hanya mengelola dan melihat mapel yang ia ampu', async () => {
    const own = await call('POST', '/v1/exam/questions', teacherCookie, mcq({ body: 'Soal guru MTK' }));
    expect(own.statusCode, own.body).toBe(201);
    const other = await call('POST', '/v1/exam/questions', teacherCookie, {
      subjectId: bindId,
      type: 'essay',
      body: 'Bukan mapelnya',
    });
    expect(other.statusCode).toBe(403);

    const subjects = (await call('GET', '/v1/exam/subjects', teacherCookie)).json();
    expect(subjects.map((s: { code: string }) => s.code)).toEqual(['MTK']);
    const list = (await call('GET', '/v1/exam/questions', teacherCookie)).json();
    expect(list.items.every((q: { subjectCode: string }) => q.subjectCode === 'MTK')).toBe(true);
    const adminSubjects = (await call('GET', '/v1/exam/subjects', adminCookie)).json();
    expect(adminSubjects).toHaveLength(2);
  });
});

describe('gambar soal', () => {
  it('menerima PNG valid, menolak isi palsu, dan melayani gambar', async () => {
    const bad = await call('POST', '/v1/exam/images', adminCookie, {
      mime: 'image/png',
      data: Buffer.from('<svg/>').toString('base64'),
    });
    expect(bad.statusCode).toBe(400);
    const ok = await call('POST', '/v1/exam/images', adminCookie, { mime: 'image/png', data: PNG });
    expect(ok.statusCode, ok.body).toBe(201);
    const img = await app.inject({ method: 'GET', url: ok.json().url, remoteAddress: '10.9.2.1' });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
  });
});
