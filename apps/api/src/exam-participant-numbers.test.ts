import {
  academicYear,
  assignRoles,
  classRoom,
  enrollment,
  entitlement,
  eq,
  examParticipantNumber,
  examType,
  foundation,
  member,
  school,
  seedSchoolRoles,
  semester,
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
let foundationId = '';
let schoolId = '';
let otherId = '';
let yearId = '';
let semesterId = '';
let classA = '';
let classB = '';
let adminCookie = '';
let teacherCookie = '';
let otherCookie = '';
const types: Record<string, string> = {};
const ids: Record<string, string> = {};
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
  return login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

const call = (
  method: 'GET' | 'POST' | 'PUT',
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

type Item = { name: string; className: string; participantNo: string; studentId: string };
const cards = async (classId: string, type: string): Promise<Item[]> => {
  const r = await call(
    'GET',
    `/v1/cards/exam-participants?semesterId=${semesterId}&classId=${classId}&examTypeId=${types[type]}`,
    adminCookie,
  );
  expect(r.statusCode, r.body).toBe(200);
  return r.json().items;
};
const numbersOf = (items: Item[]) => Object.fromEntries(items.map((i) => [i.name, i.participantNo]));
const setFormat = (type: string, body: object, cookie = adminCookie) =>
  call('PUT', '/v1/exams/participant-numbers/format', cookie, { examTypeId: types[type], ...body });
const reset = (type: string, body: object = {}) =>
  call('POST', '/v1/exams/participant-numbers/reset', adminCookie, {
    semesterId,
    examTypeId: types[type],
    ...body,
  });
const countOf = async (type: string) =>
  (
    await call(
      'GET',
      `/v1/exams/participant-numbers/summary?semesterId=${semesterId}&examTypeId=${types[type]}`,
      adminCookie,
    )
  ).json().count as number;

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Nomor', slug: `ynp-${run}` })
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
    await db.insert(entitlement).values({
      schoolId: s!.id,
      moduleKey: 'exams',
      subscriptionId: sub!.id,
      validUntil: sub!.currentPeriodEnd,
    });
    return s!.id;
  };
  schoolId = await makeSchool(`nomor-${run}`);
  otherId = await makeSchool(`nomor-lain-${run}`);

  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30', isActive: true })
    .returning();
  yearId = y!.id;
  const [sem] = await db
    .insert(semester)
    .values({
      schoolId,
      academicYearId: yearId,
      name: 'Ganjil',
      startsOn: '2026-07-13',
      endsOn: '2026-12-19',
    })
    .returning();
  semesterId = sem!.id;
  const made = await db
    .insert(examType)
    .values(
      ['ASTS', 'ASAS', 'KLS', 'RACE', 'SCH'].map((short) => ({
        schoolId,
        name: `Jenis ${short}`,
        shortName: short,
      })),
    )
    .returning();
  for (const t of made) types[t.shortName] = t.id;
  const [ka, kb] = await db
    .insert(classRoom)
    .values([
      { schoolId, academicYearId: yearId, name: '7A', level: '7' },
      { schoolId, academicYearId: yearId, name: '7B', level: '7' },
    ])
    .returning();
  classA = ka!.id;
  classB = kb!.id;
  const roster: [string, string, 'active' | 'transferred'][] = [
    ['Ani', classA, 'active'],
    ['Budi', classA, 'active'],
    ['Citra', classA, 'active'],
    ['Dodi', classB, 'active'],
    ['Eka', classB, 'active'],
    ['Fani', classA, 'transferred'],
  ];
  for (const [name, classId, status] of roster) {
    const [st] = await db.insert(student).values({ schoolId, name, gender: 'L', status }).returning();
    ids[name] = st!.id;
    await db.insert(enrollment).values({ schoolId, studentId: st!.id, classId, academicYearId: yearId });
  }
  adminCookie = await join('admin-nomor', schoolId, ['school_admin']);
  teacherCookie = await join('guru-nomor', schoolId, ['teacher']);
  otherCookie = await join('admin-nomor-lain', otherId, ['school_admin']);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherId]) {
    for (const table of [
      'audit_log',
      'exam_participant_number',
      'enrollment',
      'student',
      'exam_type',
      'semester',
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

describe('nomor peserta ujian permanen', () => {
  it('bawaan: urutan se-sekolah menurut kelas, nama; kelas pertama sama dengan perhitungan lama', async () => {
    expect(await countOf('ASTS')).toBe(0);
    const a = await cards(classA, 'ASTS');
    expect(numbersOf(a)).toEqual({ Ani: 'ASTS-26-001', Budi: 'ASTS-26-002', Citra: 'ASTS-26-003' });
    expect(numbersOf(await cards(classB, 'ASTS'))).toEqual({ Dodi: 'ASTS-26-004', Eka: 'ASTS-26-005' });
    expect(await countOf('ASTS')).toBe(5); // murid nonaktif tidak bernomor
    expect((await cards(classA, 'ASTS')).map((i) => i.participantNo)).toEqual(a.map((i) => i.participantNo));
  });

  it('stabil: pindah kelas, murid baru, dan urutan daftar berubah tidak menggeser nomor', async () => {
    const before = numbersOf(await cards(classA, 'ASTS'));
    await app.platformDb
      .update(enrollment)
      .set({ classId: classB })
      .where(eq(enrollment.studentId, ids.Ani!));
    const [aan] = await app.platformDb
      .insert(student)
      .values({ schoolId, name: 'Aan', gender: 'L' })
      .returning();
    await app.platformDb
      .insert(enrollment)
      .values({ schoolId, studentId: aan!.id, classId: classA, academicYearId: yearId });
    const a = numbersOf(await cards(classA, 'ASTS'));
    expect(a).toEqual({ Aan: 'ASTS-26-006', Budi: before.Budi, Citra: before.Citra });
    const b = numbersOf(await cards(classB, 'ASTS'));
    expect(b.Ani).toBe(before.Ani);
    expect(b.Dodi).toBe('ASTS-26-004');
    // Kembalikan susunan awal untuk tes berikutnya.
    await app.platformDb
      .update(enrollment)
      .set({ classId: classA })
      .where(eq(enrollment.studentId, ids.Ani!));
    await app.platformDb.delete(enrollment).where(eq(enrollment.studentId, aan!.id));
    await app.platformDb.delete(student).where(eq(student.id, aan!.id));
  });

  it('format dan lingkup diperiksa; izin exam:manage; hanya sekolah sendiri', async () => {
    for (const format of [
      'ABC',
      '{foo}{urut}',
      '{urut:0}',
      '{urut',
      `{urut}${'x'.repeat(40)}`,
      '{urut}\u0007',
      '   ',
    ]) {
      const r = await setFormat('KLS', { format, seqScope: 'school' });
      expect(r.statusCode, format).toBe(400);
      expect(r.json().error.code).toBe('invalid_format');
    }
    // Urutan per kelas tanpa {kelas} akan bertabrakan antarkelas.
    const noClass = await setFormat('KLS', { format: '{jenis}-{urut:2}', seqScope: 'class' });
    expect(noClass.statusCode).toBe(400);
    expect(noClass.json().error.code).toBe('invalid_format');
    expect((await setFormat('KLS', { format: '{urut}', seqScope: 'school', seqStart: 0 })).statusCode).toBe(
      400,
    );
    expect((await setFormat('KLS', { format: '{urut}', seqScope: 'school' }, teacherCookie)).statusCode).toBe(
      403,
    );
    expect(
      (
        await call('POST', '/v1/exams/participant-numbers/reset', teacherCookie, {
          semesterId,
          examTypeId: types.KLS,
        })
      ).statusCode,
    ).toBe(403);
    // Jenis ujian sekolah lain tidak terlihat.
    const cross = await call(
      'PUT',
      '/v1/exams/participant-numbers/format',
      otherCookie,
      { examTypeId: types.KLS, format: '{urut}', seqScope: 'school' },
      otherId,
    );
    expect(cross.statusCode).toBe(404);
    const sum = await call(
      'GET',
      `/v1/exams/participant-numbers/summary?semesterId=${semesterId}&examTypeId=${types.KLS}`,
      otherCookie,
      undefined,
      otherId,
    );
    expect(sum.statusCode).toBe(400);
    expect(sum.json().error.code).toBe('invalid_reference');
  });

  it('per kelas dengan {kelas}, angka mulai; nomor lama tidak berubah saat format diganti; reset menerapkan format baru', async () => {
    const put = await setFormat('KLS', { format: '{yyyy}/{kelas}/{urut:2}', seqScope: 'class', seqStart: 5 });
    expect(put.statusCode, put.body).toBe(200);
    expect(put.json()).toMatchObject({
      effectiveScope: 'class',
      example: expect.stringMatching(/^\d{4}\/7A\/05$/),
    });
    expect(numbersOf(await cards(classA, 'KLS'))).toEqual({
      Ani: '2026/7A/05',
      Budi: '2026/7A/06',
      Citra: '2026/7A/07',
    });
    expect(numbersOf(await cards(classB, 'KLS'))).toEqual({ Dodi: '2026/7B/05', Eka: '2026/7B/06' });

    // Murid pindah kelas: nomor tetap (snapshot kelas lama), murid baru di kelas itu lanjut dari urutan kelasnya.
    await app.platformDb
      .update(enrollment)
      .set({ classId: classB })
      .where(eq(enrollment.studentId, ids.Ani!));
    expect((await cards(classB, 'KLS')).find((i) => i.name === 'Ani')?.participantNo).toBe('2026/7A/05');
    await app.platformDb
      .update(enrollment)
      .set({ classId: classA })
      .where(eq(enrollment.studentId, ids.Ani!));

    // Ganti format: yang ada tidak berubah.
    await setFormat('KLS', { format: 'K-{kelas}-{urut:3}', seqScope: 'class', seqStart: 1 });
    expect((await cards(classA, 'KLS')).map((i) => i.participantNo)).toEqual([
      '2026/7A/05',
      '2026/7A/06',
      '2026/7A/07',
    ]);
    expect(await countOf('KLS')).toBe(5);

    // Reset satu kelas: hanya kelas itu yang berubah.
    const one = await reset('KLS', { classId: classA });
    expect(one.json()).toEqual({ removed: 3, assigned: 3 });
    expect(numbersOf(await cards(classA, 'KLS'))).toEqual({
      Ani: 'K-7A-001',
      Budi: 'K-7A-002',
      Citra: 'K-7A-003',
    });
    expect(numbersOf(await cards(classB, 'KLS'))).toEqual({ Dodi: '2026/7B/05', Eka: '2026/7B/06' });
    // Reset seluruh semester dan jenis.
    expect((await reset('KLS')).json()).toEqual({ removed: 5, assigned: 5 });
    expect(numbersOf(await cards(classB, 'KLS'))).toEqual({ Dodi: 'K-7B-001', Eka: 'K-7B-002' });
    expect((await reset('KLS', { classId: crypto.randomUUID() })).statusCode).toBe(400);
  });

  it('jenis ujian lain tidak ikut terpengaruh; ujian lama tanpa jenis memakai perhitungan posisi', async () => {
    expect(await countOf('ASAS')).toBe(0);
    const r = await call(
      'GET',
      `/v1/cards/exam-participants?semesterId=${semesterId}&classId=${classA}`,
      adminCookie,
    );
    expect(r.json().items.map((i: Item) => i.participantNo)).toEqual([
      'UJN-26-001',
      'UJN-26-002',
      'UJN-26-003',
    ]);
    expect(await countOf('ASAS')).toBe(0);
  });

  it('unik di basis data: murid ganda dan nomor ganda ditolak', async () => {
    const [row] = await app.platformDb
      .select()
      .from(examParticipantNumber)
      .where(eq(examParticipantNumber.examTypeId, types.ASTS!))
      .limit(1);
    const { id: _id, ...base } = row!;
    await expect(
      app.platformDb.insert(examParticipantNumber).values({ ...base, number: 'LAIN' }),
    ).rejects.toThrow();
    await expect(
      app.platformDb.insert(examParticipantNumber).values({ ...base, studentId: ids.Eka! }),
    ).rejects.toThrow();
  });

  it('konkurensi: pemuatan serempak tidak menghasilkan nomor ganda atau murid terlewat', async () => {
    const all = await Promise.all(Array.from({ length: 6 }, () => cards(classA, 'RACE')));
    const seen = new Set<string>();
    for (const items of all) expect(items).toHaveLength(3);
    for (const i of all[0]!) seen.add(i.participantNo);
    expect(seen.size).toBe(3);
    for (const items of all) expect(numbersOf(items)).toEqual(numbersOf(all[0]!));
    const both = await Promise.all([cards(classA, 'SCH'), cards(classB, 'SCH'), cards(classA, 'SCH')]);
    const nums = [...new Set(both.flatMap((x) => x.map((i) => i.participantNo)))];
    expect(nums).toHaveLength(5);
    expect(await countOf('SCH')).toBe(5);
  });
});
