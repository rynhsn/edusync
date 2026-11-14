import {
  academicYear,
  assignRoles,
  classRoom,
  classSubjectParticipation,
  enrollment,
  eq,
  foundation,
  member,
  promotionDecision,
  school,
  schoolLevel,
  seedSchoolRoles,
  semester,
  sql,
  student,
  studentSubjectEnrollment,
  subject,
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

/**
 * Tahap 3B.4: pilihan mapel ikut rollover (penanda partisipasi rombel) dan penerapan kenaikan (pilihan setahun murid).
 * Sekolah tanpa mapel pilihan tidak melihat field baru (dijaga juga promotion.test.ts yang tidak diubah).
 */
const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let foundationId = '';
const userIds: string[] = [];
let adminCookie = '';
const y = {} as Record<'src' | 'a' | 'b' | 'c', string>;
const id = {} as Record<string, string>;

async function makeUser(label: string) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  return { id: res.user.id, email };
}

const db = () => app.platformDb;
const call = (method: 'GET' | 'POST', url: string, payload?: object) =>
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
const rollover = (target: string, body: object = {}) =>
  call('POST', `/v1/academic-years/${y.src}/rollover`, { targetYearId: target, ...body });
const apply = (target: string, body: object = {}) =>
  call('POST', `/v1/academic-years/${y.src}/promotions/apply`, { targetYearId: target, ...body });

const marksOf = async (classId: string) =>
  (await db().select().from(classSubjectParticipation).where(eq(classSubjectParticipation.classId, classId)))
    .map((r) => r.subjectId)
    .sort();
const classOf = async (yearId: string, name: string) =>
  (await db().select().from(classRoom).where(eq(classRoom.academicYearId, yearId))).find(
    (c) => c.name === name,
  );
const choicesIn = async (yearId: string) =>
  db().select().from(studentSubjectEnrollment).where(eq(studentSubjectEnrollment.academicYearId, yearId));

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Pilihan Naik', slug: `ypn-${run}` })
    .returning();
  foundationId = f!.id;
  const [s] = await db()
    .insert(school)
    .values({ foundationId, slug: `pn-${run}`, name: `pn-${run}` })
    .returning();
  schoolId = s!.id;
  await seedSchoolRoles(db(), schoolId);
  await db()
    .insert(schoolLevel)
    .values(['10', '11', '12'].map((code, i) => ({ schoolId, code, label: `Kelas ${code}`, sort: i + 1 })));
  const mkYear = async (key: keyof typeof y, name: string, startsOn: string, endsOn: string) => {
    const [row] = await db()
      .insert(academicYear)
      .values({ schoolId, name, startsOn, endsOn, isActive: key === 'src' })
      .returning();
    y[key] = row!.id;
  };
  await mkYear('src', '2026/2027', '2026-07-13', '2027-06-30');
  await mkYear('a', '2027/2028', '2027-07-12', '2028-06-30');
  await mkYear('b', '2028/2029', '2028-07-17', '2029-06-30');
  await mkYear('c', '2029/2030', '2029-07-16', '2030-06-30');
  const [sem] = await db()
    .insert(semester)
    .values({ schoolId, academicYearId: y.src, name: 'Ganjil', startsOn: '2026-07-13', endsOn: '2026-12-31' })
    .returning();
  id.sem = sem!.id;

  const u = await makeUser('admin-pilihan-naik');
  const [m] = await db().insert(member).values({ userId: u.id, schoolId }).returning();
  await assignRoles(db(), m!.id, schoolId, ['school_admin']);
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email: u.email, password },
  });
  adminCookie = res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  const mkSubject = async (key: string, name: string) => {
    const [row] = await db()
      .insert(subject)
      .values({ schoolId, code: `${key}-${run}`, name })
      .returning();
    id[key] = row!.id;
  };
  await mkSubject('fis', 'Fisika');
  await mkSubject('kim', 'Kimia');
  await mkSubject('mat', 'Matematika');
  const mkClass = async (key: string, name: string, level: string) => {
    const [row] = await db()
      .insert(classRoom)
      .values({ schoolId, academicYearId: y.src, name, level })
      .returning();
    id[key] = row!.id;
  };
  await mkClass('xiA', '11A', '11'); // berpenanda Fisika dan Kimia
  await mkClass('xiB', '11B', '11'); // tanpa penanda
  const mark = (classKey: string, subjectKey: string) =>
    db().insert(classSubjectParticipation).values({
      schoolId,
      classId: id[classKey]!,
      subjectId: id[subjectKey]!,
      mode: 'selected',
      updatedBy: 'test',
    });
  await mark('xiA', 'fis');
  await mark('xiA', 'kim');

  const mkStudent = async (key: string, name: string, classKey: string) => {
    const [row] = await db()
      .insert(student)
      .values({ schoolId, name, gender: 'L', status: 'active', nis: `${key}-${run}` })
      .returning();
    id[key] = row!.id;
    await db()
      .insert(enrollment)
      .values({ schoolId, studentId: row!.id, classId: id[classKey]!, academicYearId: y.src });
    await db().insert(promotionDecision).values({
      schoolId,
      academicYearId: y.src,
      studentId: row!.id,
      fromClassId: id[classKey]!,
      decision: 'promote',
    });
  };
  await mkStudent('ani', 'Ani', 'xiA');
  await mkStudent('budi', 'Budi', 'xiA');
  await mkStudent('cici', 'Cici', 'xiA');
  await mkStudent('dodi', 'Dodi', 'xiB');
  await mkStudent('eka', 'Eka', 'xiA');
  const choose = (studentKey: string, subjectKey: string, semesterId: string | null = null) =>
    db().insert(studentSubjectEnrollment).values({
      schoolId,
      studentId: id[studentKey]!,
      subjectId: id[subjectKey]!,
      academicYearId: y.src,
      semesterId,
      source: 'choice',
      createdBy: 'test',
    });
  await choose('ani', 'fis');
  await choose('ani', 'kim');
  await choose('budi', 'fis');
  await choose('cici', 'kim', id.sem!); // hanya baris semester: tidak ikut
  await choose('dodi', 'fis'); // kelas 11B tidak berpenanda, 12B juga tidak: terbuang
  await choose('eka', 'fis');
});

afterAll(async () => {
  for (const table of [
    'audit_log',
    'promotion_decision',
    'student_subject_enrollment',
    'class_subject_participation',
    'enrollment',
    'student',
    'subject',
    'class_room',
    'semester',
    'academic_year',
    'school_level',
    'member',
    'role',
  ]) {
    await db().execute(sql`delete from ${sql.identifier(table)} where school_id = ${schoolId}`);
  }
  await db().delete(school).where(eq(school.id, schoolId));
  await db().delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db().delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('rollover menyalin penanda mapel pilihan', () => {
  it('dryRun menghitung tanpa menulis', async () => {
    const res = await rollover(y.a, { dryRun: true });
    expect(res.statusCode).toBe(200);
    expect(res.json().participationCopied).toBe(2);
    expect(await classOf(y.a, '12A')).toBeUndefined();
  });

  it('menyalin ke kelas hasil salinan; kelas tanpa penanda tidak mendapat apa pun; ulangan idempoten', async () => {
    const res = await rollover(y.a);
    expect(res.statusCode).toBe(200);
    expect(res.json().participationCopied).toBe(2);
    expect(await marksOf((await classOf(y.a, '12A'))!.id)).toEqual([id.fis, id.kim].sort());
    expect(await marksOf((await classOf(y.a, '12B'))!.id)).toEqual([]);
    // Ulangan: kelas sudah ada dan sudah berpenanda, tidak ada yang disalin dan field tidak muncul.
    const again = await rollover(y.a);
    expect(again.json()).not.toHaveProperty('participationCopied');
    expect(await marksOf((await classOf(y.a, '12A'))!.id)).toHaveLength(2);
  });

  it('kelas tujuan yang sudah berpenanda sendiri tidak ditimpa', async () => {
    const [own] = await db()
      .insert(classRoom)
      .values({ schoolId, academicYearId: y.c, name: '12A', level: '12' })
      .returning();
    await db()
      .insert(classSubjectParticipation)
      .values({ schoolId, classId: own!.id, subjectId: id.mat!, mode: 'selected', updatedBy: 'test' });
    const res = await rollover(y.c);
    expect(res.statusCode).toBe(200);
    expect(await marksOf(own!.id)).toEqual([id.mat]);
  });

  it('copySubjectChoices false tidak menyalin penanda', async () => {
    const res = await rollover(y.b, { copySubjectChoices: false });
    expect(res.statusCode).toBe(200);
    expect(res.json()).not.toHaveProperty('participationCopied');
    expect(await marksOf((await classOf(y.b, '12A'))!.id)).toEqual([]);
  });
});

describe('penerapan kenaikan membawa pilihan setahun', () => {
  it('dryRun menghitung dibawa dan terbuang tanpa menulis', async () => {
    // Fisika dan Kimia berpenanda di 12A tahun a, lalu Kimia dicabut: pilihan Kimia Ani terbuang.
    const target = await classOf(y.a, '12A');
    await db().delete(classSubjectParticipation).where(eq(classSubjectParticipation.classId, target!.id));
    await db()
      .insert(classSubjectParticipation)
      .values({ schoolId, classId: target!.id, subjectId: id.fis!, mode: 'selected', updatedBy: 'test' });
    const res = await apply(y.a, { dryRun: true });
    expect(res.statusCode).toBe(200);
    // Disalin: Ani-Fisika, Budi-Fisika, Eka-Fisika. Terbuang: Ani-Kimia, Dodi-Fisika (12B tanpa penanda). Cici hanya semester.
    expect(res.json()).toMatchObject({ choicesCopied: 3, choicesDropped: 2 });
    expect(await choicesIn(y.a)).toHaveLength(0);
  });

  it('menyalin pilihan setahun ke tahun tujuan dan melaporkan yang terbuang', async () => {
    const res = await apply(y.a);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ placed: 5, choicesCopied: 3, choicesDropped: 2 });
    const rows = await choicesIn(y.a);
    expect(rows.map((r) => `${r.studentId}:${r.subjectId}`).sort()).toEqual(
      [`${id.ani}:${id.fis}`, `${id.budi}:${id.fis}`, `${id.eka}:${id.fis}`].sort(),
    );
    expect(rows.every((r) => r.semesterId === null && r.source === 'choice')).toBe(true);
    // Data tahun sumber utuh (termasuk baris semester Cici).
    expect(await choicesIn(y.src)).toHaveLength(6);
  });

  it('penerapan ulang tidak punya keputusan baru dan tidak menambah apa pun', async () => {
    const res = await apply(y.a);
    expect(res.statusCode).toBe(200);
    expect(res.json()).not.toHaveProperty('choicesCopied');
    expect(await choicesIn(y.a)).toHaveLength(3);
  });

  it('copySubjectChoices false menempatkan murid tanpa membawa pilihan', async () => {
    await rollover(y.b); // kelas 12A/12B tahun b (tanpa penanda; lihat uji di atas)
    await db()
      .update(promotionDecision)
      .set({ appliedAt: null })
      .where(eq(promotionDecision.academicYearId, y.src));
    const res = await apply(y.b, { copySubjectChoices: false });
    expect(res.statusCode).toBe(200);
    expect(res.json().placed).toBe(5);
    expect(res.json()).not.toHaveProperty('choicesCopied');
    expect(await choicesIn(y.b)).toHaveLength(0);
  });

  it('sekolah tanpa pilihan murid: respons tanpa field baru', async () => {
    // Tahun c: hapus semua pilihan sumber, penerapan ulang tidak memunculkan field.
    await db().delete(studentSubjectEnrollment).where(eq(studentSubjectEnrollment.academicYearId, y.src));
    await db()
      .update(promotionDecision)
      .set({ appliedAt: null })
      .where(eq(promotionDecision.academicYearId, y.src));
    await rollover(y.c);
    const res = await apply(y.c);
    expect(res.statusCode).toBe(200);
    expect(res.json()).not.toHaveProperty('choicesCopied');
    expect(res.json()).not.toHaveProperty('choicesDropped');
    expect(await choicesIn(y.c)).toHaveLength(0);
  });
});
