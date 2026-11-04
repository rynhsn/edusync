import {
  academicYear,
  assignRoles,
  classRoom,
  entitlement,
  eq,
  foundation,
  member,
  school,
  schoolIdentity,
  seedSchoolRoles,
  semester,
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
let semesterId = '';
let classId = '';
let otherSchoolClassId = '';
let mtkId = '';
let bindId = '';
let adminCookie = '';
let teacherCookie = '';
const userIds: string[] = [];
const schoolIds: string[] = [];

async function join(label: string, roles: string[]) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  const [m] = await app.platformDb.insert(member).values({ userId: res.user.id, schoolId }).returning();
  await assignRoles(app.platformDb, m!.id, schoolId, roles);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return { cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join('; '), memberId: m!.id };
}

const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, cookie: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: {
      cookie,
      'x-school-id': schoolId,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

const examPayload = (over: Record<string, unknown> = {}) => ({
  title: 'ASAS Matematika 7',
  semesterId,
  subjectId: mtkId,
  classIds: [classId],
  mode: 'both',
  examDate: '2026-12-08',
  startTime: '07:30',
  durationMinutes: 90,
  ...over,
});

const bankMcq = (subjectId: string, body: string, points = 2) => ({
  subjectId,
  type: 'mcq',
  body,
  options: [
    { key: 'A', text: 'satu' },
    { key: 'B', text: 'dua' },
  ],
  answer: 'A',
  points,
});

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Ujian 2', slug: `yuj2-${run}` })
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
  const makeSchool = async (slug: string) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug, name: `Sekolah ${slug}` })
      .returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of ['grades', 'exams']) {
      await db
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    schoolIds.push(s!.id);
    return s!.id;
  };
  schoolId = await makeSchool(`ujian2-${run}`);
  const otherSchoolId = await makeSchool(`ujian2b-${run}`);

  const makeYear = async (sid: string) => {
    const [y] = await db
      .insert(academicYear)
      .values({
        schoolId: sid,
        name: '2026/2027',
        startsOn: '2026-07-13',
        endsOn: '2027-06-30',
        isActive: true,
      })
      .returning();
    const [s] = await db
      .insert(semester)
      .values({
        schoolId: sid,
        academicYearId: y!.id,
        name: 'Ganjil',
        startsOn: '2026-07-13',
        endsOn: '2026-12-19',
        isActive: true,
      })
      .returning();
    const [k] = await db
      .insert(classRoom)
      .values({ schoolId: sid, academicYearId: y!.id, name: '7 A', level: '7' })
      .returning();
    return { sem: s!.id, cls: k!.id };
  };
  const main = await makeYear(schoolId);
  semesterId = main.sem;
  classId = main.cls;
  otherSchoolClassId = (await makeYear(otherSchoolId)).cls;

  const [mtk, bind] = await db
    .insert(subject)
    .values([
      { schoolId, code: 'MTK', name: 'Matematika' },
      { schoolId, code: 'BIN', name: 'Bahasa Indonesia' },
    ])
    .returning();
  mtkId = mtk!.id;
  bindId = bind!.id;
  await db.insert(schoolIdentity).values({ schoolId, officialName: 'SMP Contoh Mandiri', city: 'Bandung' });

  adminCookie = (await join('admin-ujian2', ['school_admin'])).cookie;
  const guru = await join('guru-ujian2', ['teacher']);
  teacherCookie = guru.cookie;
  const [t] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Bu Rina, S.Pd.', memberId: guru.memberId })
    .returning();
  await db.insert(teachingAssignment).values({ schoolId, classId, subjectId: mtkId, teacherId: t!.id });
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of schoolIds) {
    for (const table of [
      'audit_log',
      'exam_question',
      'exam',
      'exam_paper_setting',
      'question',
      'exam_type',
      'school_identity',
      'school_file',
      'teaching_assignment',
      'teacher',
      'subject',
      'class_room',
      'semester',
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

describe('pengaturan lembar', () => {
  it('bawaan dulu, simpan, validasi rentang, lalu kembalikan ke bawaan', async () => {
    const first = (await call('GET', '/v1/exam/paper-settings', teacherCookie)).json();
    expect(first.custom).toBe(false);
    expect(first.config.kop.source).toBe('identity');

    const mine = {
      ...first.config,
      paperSize: 'F4',
      instructions: { ...first.config.instructions, items: ['Berdoalah.'] },
    };
    expect((await call('PUT', '/v1/exam/paper-settings', teacherCookie, mine)).statusCode).toBe(403);
    const saved = await call('PUT', '/v1/exam/paper-settings', adminCookie, mine);
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({ custom: true, config: { paperSize: 'F4' } });
    expect(
      (await call('PUT', '/v1/exam/paper-settings', adminCookie, { ...mine, marginMm: 999 })).statusCode,
    ).toBe(400);

    const reset = (await call('DELETE', '/v1/exam/paper-settings', adminCookie)).json();
    expect(reset).toMatchObject({ custom: false, config: { paperSize: 'A4' } });
  });
});

describe('ujian', () => {
  it('guru membuat ujian mapelnya, tidak mapel lain; rujukan diperiksa', async () => {
    const own = await call('POST', '/v1/exams', teacherCookie, examPayload());
    expect(own.statusCode, own.body).toBe(201);
    expect(own.json()).toMatchObject({
      subjectName: 'Matematika',
      classNames: ['7 A'],
      semesterName: 'Ganjil',
      typeShort: 'Ujian',
      questionCount: 0,
    });
    expect(
      (await call('POST', '/v1/exams', teacherCookie, examPayload({ subjectId: bindId }))).statusCode,
    ).toBe(403);
    expect(
      (await call('POST', '/v1/exams', adminCookie, examPayload({ classIds: [otherSchoolClassId] })))
        .statusCode,
    ).toBe(400);
    expect((await call('POST', '/v1/exams', adminCookie, examPayload({ classIds: [] }))).statusCode).toBe(
      400,
    );
    expect(
      (await call('POST', '/v1/exams', adminCookie, examPayload({ startTime: '25:00' }))).statusCode,
    ).toBe(400);
  });

  it('nama jenis ujian disalin dan tidak ikut berubah saat jenisnya diganti nama', async () => {
    const t = (
      await call('POST', '/v1/exam/types', adminCookie, {
        name: 'Asesmen Sekolah Akhir Semester',
        shortName: 'ASAS',
      })
    ).json();
    const ex = (await call('POST', '/v1/exams', adminCookie, examPayload({ examTypeId: t.id }))).json();
    expect(ex).toMatchObject({ typeName: 'Asesmen Sekolah Akhir Semester', typeShort: 'ASAS' });
    await call('PUT', `/v1/exam/types/${t.id}`, adminCookie, {
      name: 'Sumatif Akhir Semester',
      shortName: 'SAS',
    });
    const again = (await call('GET', `/v1/exams/${ex.id}`, adminCookie)).json();
    expect(again).toMatchObject({ typeName: 'Asesmen Sekolah Akhir Semester', typeShort: 'ASAS' });
  });

  it('menyusun soal dari bank: salin, tanpa duplikat, urut, poin, keluarkan', async () => {
    const ex = (await call('POST', '/v1/exams', adminCookie, examPayload({ title: 'Susun' }))).json();
    const q1 = (await call('POST', '/v1/exam/questions', adminCookie, bankMcq(mtkId, 'Soal satu'))).json();
    const q2 = (await call('POST', '/v1/exam/questions', adminCookie, bankMcq(mtkId, 'Soal dua', 3))).json();
    const other = (
      await call('POST', '/v1/exam/questions', adminCookie, bankMcq(bindId, 'Soal lain'))
    ).json();

    // Soal mapel lain ditolak.
    expect(
      (await call('POST', `/v1/exams/${ex.id}/questions`, adminCookie, { questionIds: [other.id] }))
        .statusCode,
    ).toBe(400);

    const added = await call('POST', `/v1/exams/${ex.id}/questions`, adminCookie, {
      questionIds: [q1.id, q2.id],
    });
    expect(added.statusCode, added.body).toBe(200);
    expect(added.json()).toMatchObject({ questionCount: 2, totalPoints: 5 });
    // Menambah lagi tidak menggandakan.
    const dup = await call('POST', `/v1/exams/${ex.id}/questions`, adminCookie, { questionIds: [q1.id] });
    expect(dup.json().questionCount).toBe(2);

    // Ubah di bank tidak mengubah salinan di ujian.
    await call('PUT', `/v1/exam/questions/${q1.id}`, adminCookie, bankMcq(mtkId, 'Soal satu DIUBAH'));
    const [first, second] = (await call('GET', `/v1/exams/${ex.id}`, adminCookie)).json().questions;
    expect(first.body).toBe('Soal satu');

    const reordered = await call('PUT', `/v1/exams/${ex.id}/questions/order`, adminCookie, {
      ids: [second.id, first.id],
    });
    expect(reordered.json().questions.map((q: { body: string }) => q.body)).toEqual([
      'Soal dua',
      'Soal satu',
    ]);
    expect(
      (await call('PUT', `/v1/exams/${ex.id}/questions/order`, adminCookie, { ids: [first.id] })).statusCode,
    ).toBe(400);

    const pts = await call('PUT', `/v1/exams/${ex.id}/questions/${first.id}`, adminCookie, { points: 10 });
    expect(pts.json().totalPoints).toBe(13);
    const removed = await call('DELETE', `/v1/exams/${ex.id}/questions/${first.id}`, adminCookie);
    expect(removed.json().questionCount).toBe(1);
    expect((await call('DELETE', `/v1/exams/${ex.id}/questions/${first.id}`, adminCookie)).statusCode).toBe(
      404,
    );
  });

  it('guru hanya melihat ujian mapelnya; ganti mapel membuang soal lama', async () => {
    const bahasa = (
      await call('POST', '/v1/exams', adminCookie, examPayload({ title: 'Bahasa', subjectId: bindId }))
    ).json();
    const list = (await call('GET', '/v1/exams', teacherCookie)).json();
    expect(list.every((e: { subjectName: string }) => e.subjectName === 'Matematika')).toBe(true);
    expect((await call('GET', `/v1/exams/${bahasa.id}`, teacherCookie)).statusCode).toBe(404);
    expect((await call('DELETE', `/v1/exams/${bahasa.id}`, teacherCookie)).statusCode).toBe(403);
    expect((await call('GET', '/v1/exams', adminCookie)).json().length).toBeGreaterThan(list.length);

    const ex = (await call('POST', '/v1/exams', adminCookie, examPayload({ title: 'Ganti' }))).json();
    const q = (await call('POST', '/v1/exam/questions', adminCookie, bankMcq(mtkId, 'Akan terbuang'))).json();
    await call('POST', `/v1/exams/${ex.id}/questions`, adminCookie, { questionIds: [q.id] });
    const moved = await call(
      'PUT',
      `/v1/exams/${ex.id}`,
      adminCookie,
      examPayload({ title: 'Ganti', subjectId: bindId }),
    );
    expect(moved.json()).toMatchObject({ subjectName: 'Bahasa Indonesia', questionCount: 0 });
  });
});

describe('cetak', () => {
  it('data cetak memuat kop, tahun ajaran, guru, zona waktu, dan lembar khusus ujian menimpa sekolah', async () => {
    const ex = (await call('POST', '/v1/exams', adminCookie, examPayload({ title: 'Cetak' }))).json();
    const printed = (await call('GET', `/v1/exams/${ex.id}/print`, teacherCookie)).json();
    expect(printed).toMatchObject({
      academicYear: '2026/2027',
      teacherNames: ['Bu Rina, S.Pd.'],
      zoneLabel: 'WIB',
      school: { officialName: 'SMP Contoh Mandiri', city: 'Bandung' },
      config: { paperSize: 'A4' },
    });

    // Pengaturan sekolah dipakai bila ujian tidak punya lembar khusus.
    const base = printed.config;
    await call('PUT', '/v1/exam/paper-settings', adminCookie, { ...base, paperSize: 'Letter' });
    expect((await call('GET', `/v1/exams/${ex.id}/print`, adminCookie)).json().config.paperSize).toBe(
      'Letter',
    );

    const custom = await call('PUT', `/v1/exams/${ex.id}/paper`, teacherCookie, {
      config: { ...base, paperSize: 'F4' },
    });
    expect(custom.json()).toMatchObject({ custom: true, config: { paperSize: 'F4' } });
    expect((await call('GET', `/v1/exams/${ex.id}/print`, adminCookie)).json().config.paperSize).toBe('F4');

    await call('PUT', `/v1/exams/${ex.id}/paper`, teacherCookie, { config: null });
    expect((await call('GET', `/v1/exams/${ex.id}/print`, adminCookie)).json().config.paperSize).toBe(
      'Letter',
    );
    expect((await call('DELETE', `/v1/exams/${ex.id}`, adminCookie)).statusCode).toBe(200);
    expect((await call('GET', `/v1/exams/${ex.id}/print`, adminCookie)).statusCode).toBe(404);
  });
});
