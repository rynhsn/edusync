import {
  academicYear,
  achievementCriteria,
  assessment,
  assignRoles,
  classRoom,
  enrollment,
  entitlement,
  eq,
  foundation,
  gradeComponent,
  learningObjective,
  learningOutcome,
  member,
  program,
  school,
  schoolLevel,
  score,
  seedSchoolRoles,
  semester,
  sql,
  student,
  subject,
  subscription,
  user,
  withTenant,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { gradesFor } from './portal-lib';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const FAKE = '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let otherId = '';
let foundationId = '';
const userIds: string[] = [];
const cookie = {} as Record<'admin' | 'kurikulum' | 'teacher' | 'other', string>;
const ids = {} as Record<
  | 'sem'
  | 'class7A'
  | 'class7B'
  | 'mat'
  | 'ipa'
  | 'bio'
  | 'foreignSubject'
  | 'prg'
  | 'foreignPrg'
  | 'ani'
  | 'budi'
  | 'citra'
  | 'cp'
  | 'tp'
  | 'ipaTp',
  string
>;

const db = () => app.platformDb;

async function makeMember(label: string, sid: string, roles: string[]) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  const [m] = await db().insert(member).values({ userId: res.user.id, schoolId: sid }).returning();
  await assignRoles(db(), m!.id, sid, roles);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  who: string,
  payload?: object,
  sid = schoolId,
) =>
  app.inject({
    method,
    url,
    headers: {
      cookie: who,
      'x-school-id': sid,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

const create = (body: object, who = cookie.admin) => call('POST', '/v1/achievement-criteria', who, body);
const numeric = (subjectId: string, threshold: number, scope: object = {}) => ({
  subjectId,
  mode: 'numeric',
  threshold,
  ...scope,
});
const resolve = async (subjectId: string, levelCode?: string, programId?: string) => {
  const qs = new URLSearchParams({ subjectId });
  if (levelCode) qs.set('levelCode', levelCode);
  if (programId) qs.set('programId', programId);
  return (await call('GET', `/v1/achievement-criteria/resolve?${qs}`, cookie.admin)).json();
};
const recap = async (classId: string, subjectId: string) =>
  (
    await call(
      'GET',
      `/v1/grading/recap?semesterId=${ids.sem}&classId=${classId}&subjectId=${subjectId}`,
      cookie.admin,
    )
  ).json();
const reportDoc = async (studentId: string) =>
  (await call('GET', `/v1/report-cards/${studentId}?semesterId=${ids.sem}`, cookie.admin)).json();
const subjectRow = (doc: unknown, subjectId: string) =>
  (doc as { subjects: { subjectId: string }[] }).subjects.find(
    (s) => s.subjectId === subjectId,
  ) as unknown as {
    kkm: number;
    final: number | null;
    belowKkm: boolean;
  };
const portal = async (studentId: string) => {
  const [sem] = await db().select().from(semester).where(eq(semester.id, ids.sem));
  return withTenant(app.tenantDb, [schoolId], (tx) => gradesFor(tx, studentId, sem!));
};
const clearCriteria = () =>
  db().delete(achievementCriteria).where(eq(achievementCriteria.schoolId, schoolId));

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan KKTP', slug: `ykk-${run}` })
    .returning();
  foundationId = f!.id;
  const [sub] = await db()
    .insert(subscription)
    .values({
      foundationId,
      period: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  const make = async (slug: string) => {
    const [s] = await db()
      .insert(school)
      .values({ foundationId, slug, name: `Sekolah ${slug}` })
      .returning();
    await seedSchoolRoles(db(), s!.id);
    await db().insert(entitlement).values({
      schoolId: s!.id,
      moduleKey: 'grades',
      subscriptionId: sub!.id,
      validUntil: sub!.currentPeriodEnd,
    });
    return s!.id;
  };
  schoolId = await make(`kk-${run}`);
  otherId = await make(`kk2-${run}`);

  await db()
    .insert(schoolLevel)
    .values(['7', '8'].map((code, i) => ({ schoolId, code, label: `Kelas ${code}`, sort: i + 1 })));
  const [prg] = await db().insert(program).values({ schoolId, code: 'IPA', name: 'IPA' }).returning();
  const [fprg] = await db()
    .insert(program)
    .values({ schoolId: otherId, code: 'IPA', name: 'IPA' })
    .returning();
  ids.prg = prg!.id;
  ids.foreignPrg = fprg!.id;

  const [year] = await db()
    .insert(academicYear)
    .values({ schoolId, name: '2000-2099', startsOn: '2000-01-01', endsOn: '2099-12-31', isActive: true })
    .returning();
  const [sem] = await db()
    .insert(semester)
    .values({
      schoolId,
      academicYearId: year!.id,
      name: 'Ganjil',
      startsOn: '2026-07-01',
      endsOn: '2026-12-31',
      isActive: true,
    })
    .returning();
  ids.sem = sem!.id;
  const [c7a] = await db()
    .insert(classRoom)
    .values({ schoolId, academicYearId: year!.id, name: '7A', level: '7', programId: ids.prg })
    .returning();
  const [c7b] = await db()
    .insert(classRoom)
    .values({ schoolId, academicYearId: year!.id, name: '7B', level: '7' })
    .returning();
  ids.class7A = c7a!.id;
  ids.class7B = c7b!.id;

  for (const [key, code] of [
    ['mat', 'MAT'],
    ['ipa', 'IPA'],
    ['bio', 'BIO'],
  ] as const) {
    const [s] = await db().insert(subject).values({ schoolId, code, name: code }).returning();
    ids[key] = s!.id;
  }
  const [fs] = await db()
    .insert(subject)
    .values({ schoolId: otherId, code: 'MAT', name: 'Asing' })
    .returning();
  ids.foreignSubject = fs!.id;

  const mkStudent = async (name: string, classId: string) => {
    const [s] = await db()
      .insert(student)
      .values({ schoolId, name, gender: 'L', status: 'active', nis: `${name}-${run}` })
      .returning();
    await db().insert(enrollment).values({ schoolId, studentId: s!.id, classId, academicYearId: year!.id });
    return s!.id;
  };
  ids.ani = await mkStudent('Ani', ids.class7A);
  ids.budi = await mkStudent('Budi', ids.class7A);
  ids.citra = await mkStudent('Citra', ids.class7B);

  // Satu komponen berbobot 100: nilai akhir = skor langsung. KKM sekolah bawaan 75 (tanpa baris grading_setting).
  const [comp] = await db()
    .insert(gradeComponent)
    .values({ schoolId, name: 'Tugas', weight: 100, sort: 0 })
    .returning();
  const mkAssessment = async (subjectId: string, classId: string) => {
    const [a] = await db()
      .insert(assessment)
      .values({
        schoolId,
        semesterId: ids.sem,
        classId,
        subjectId,
        componentId: comp!.id,
        title: 'Tugas',
        date: '2026-08-01',
      })
      .returning();
    return a!.id;
  };
  const matA = await mkAssessment(ids.mat, ids.class7A);
  const matB = await mkAssessment(ids.mat, ids.class7B);
  const ipaA = await mkAssessment(ids.ipa, ids.class7A);
  const put = (assessmentId: string, studentId: string, value: number) =>
    db().insert(score).values({ schoolId, assessmentId, studentId, value, updatedBy: 'uji' });
  // MAT: Ani 80, Budi 72.5 (kelas 7A), Citra 72.5 (7B). IPA: Ani 90, Budi 60.
  await put(matA, ids.ani, 80);
  await put(matA, ids.budi, 72.5);
  await put(matB, ids.citra, 72.5);
  await put(ipaA, ids.ani, 90);
  await put(ipaA, ids.budi, 60);

  // CP/TP untuk kriteria berbasis TP: satu pada IPA, satu pada MAT.
  const mkObjective = async (subjectId: string) => {
    const [cp] = await db()
      .insert(learningOutcome)
      .values({ schoolId, subjectId, phase: 'D', description: 'CP' })
      .returning();
    const [tp] = await db()
      .insert(learningObjective)
      .values({ schoolId, outcomeId: cp!.id, description: 'TP' })
      .returning();
    return tp!.id;
  };
  ids.ipaTp = await mkObjective(ids.ipa);
  ids.tp = await mkObjective(ids.mat);

  cookie.admin = await makeMember('admin', schoolId, ['school_admin']);
  cookie.kurikulum = await makeMember('kurikulum', schoolId, ['curriculum']);
  cookie.teacher = await makeMember('guru', schoolId, ['teacher']);
  cookie.other = await makeMember('admin2', otherId, ['school_admin']);
}, 90_000);

afterAll(async () => {
  for (const sid of [schoolId, otherId]) {
    for (const table of [
      'audit_log',
      'report_card',
      'achievement_rubric_level',
      'achievement_criteria',
      'learning_objective',
      'learning_outcome',
      'score',
      'assessment',
      'grade_component',
      'grading_setting',
      'enrollment',
      'class_room',
      'subject',
      'student',
      'program',
      'school_level',
      'semester',
      'academic_year',
      'member',
      'role',
      'entitlement',
    ]) {
      await db().execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
    await db().delete(school).where(eq(school.id, sid));
  }
  await db().execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db().delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db().delete(user).where(eq(user.id, uid));
  await app.close();
});

/** Bentuk yang dibandingkan antara "sebelum" dan "sesudah" kriteria: tanpa cap waktu. */
const stable = (doc: { generatedAt?: string }) => ({ ...doc, generatedAt: undefined });
const baseline = {} as {
  recapMat: unknown;
  recapIpa: unknown;
  docAni: unknown;
  docBudi: unknown;
  portalBudi: unknown;
};

describe('tanpa kriteria: hasil sama seperti sebelum fitur ada', () => {
  it('rekap, rapor draf, dan portal memakai KKM sekolah 75 (bulat)', async () => {
    const recapMat = await recap(ids.class7A, ids.mat);
    expect(recapMat.settings).toMatchObject({ kkm: 75, calculationMode: 'weighted_average' });
    expect(recapMat.kkm).toBe(75);
    const budi = recapMat.students.find((s: { studentId: string }) => s.studentId === ids.budi);
    expect(budi).toMatchObject({ final: 72.5, belowKkm: true });
    expect(recapMat.stats.belowKkmCount).toBe(1);
    const docBudi = await reportDoc(ids.budi);
    expect(subjectRow(docBudi, ids.mat)).toMatchObject({ kkm: 75, final: 72.5, belowKkm: true });
    expect(subjectRow(docBudi, ids.ipa)).toMatchObject({ kkm: 75, final: 60, belowKkm: true });
    const p = await portal(ids.budi);
    expect(p.kkm).toBe(75);
    expect(p.subjects.find((s) => s.subjectId === ids.mat)).toMatchObject({ kkm: 75, belowKkm: true });

    baseline.recapMat = recapMat;
    baseline.recapIpa = await recap(ids.class7A, ids.ipa);
    baseline.docAni = stable(await reportDoc(ids.ani));
    baseline.docBudi = stable(docBudi);
    baseline.portalBudi = p;
  });

  it('GET daftar kosong dan resolve jatuh ke KKM sekolah', async () => {
    const list = await call('GET', '/v1/achievement-criteria', cookie.admin);
    expect(list.statusCode).toBe(200);
    expect(list.json().criteria).toEqual([]);
    expect(await resolve(ids.mat, '7', ids.prg)).toMatchObject({
      kkm: 75,
      scope: 'settings',
      criteriaId: null,
      mode: null,
      schoolKkm: 75,
    });
  });
});

describe('pengaturan nilai', () => {
  it('KKM sekolah tetap bilangan bulat: desimal ditolak', async () => {
    const res = await call('PUT', '/v1/grading/settings', cookie.admin, {
      kkm: 72.5,
      predicateA: 90,
      predicateB: 80,
      predicateC: 70,
    });
    expect(res.statusCode).toBe(400);
  });

  it('calculationMode opsional: klien lama tetap diterima; mode tak dikenal ditolak', async () => {
    const old = await call('PUT', '/v1/grading/settings', cookie.admin, {
      kkm: 75,
      predicateA: 90,
      predicateB: 80,
      predicateC: 70,
    });
    expect(old.statusCode).toBe(200);
    expect(old.json().calculationMode).toBe('weighted_average');
    const withMode = await call('PUT', '/v1/grading/settings', cookie.admin, {
      kkm: 75,
      predicateA: 90,
      predicateB: 80,
      predicateC: 70,
      calculationMode: 'weighted_average',
    });
    expect(withMode.statusCode).toBe(200);
    const bad = await call('PUT', '/v1/grading/settings', cookie.admin, {
      kkm: 75,
      predicateA: 90,
      predicateB: 80,
      predicateC: 70,
      calculationMode: 'median',
    });
    expect(bad.statusCode).toBe(400);
    expect((await call('GET', '/v1/grading/settings', cookie.admin)).json()).toMatchObject({
      kkm: 75,
      calculationMode: 'weighted_average',
    });
  });
});

describe('CRUD dan validasi empat mode', () => {
  it('numeric: simpan ambang desimal, baca, ubah, hapus', async () => {
    const res = await create(numeric(ids.bio, 72.5, { note: 'Praktik' }));
    expect(res.statusCode).toBe(201);
    const row = res.json();
    expect(row).toMatchObject({
      subjectId: ids.bio,
      mode: 'numeric',
      threshold: 72.5,
      effectiveThreshold: 72.5,
      levelCode: null,
      programId: null,
      objectiveId: null,
      active: true,
      levels: [],
    });
    const put = await call('PUT', `/v1/achievement-criteria/${row.id}`, cookie.kurikulum, {
      ...numeric(ids.bio, 70, { levelCode: '7' }),
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ threshold: 70, levelCode: '7', note: null });
    expect((await call('DELETE', `/v1/achievement-criteria/${row.id}`, cookie.admin)).json()).toEqual({
      ok: true,
    });
    expect((await call('DELETE', `/v1/achievement-criteria/${row.id}`, cookie.admin)).statusCode).toBe(404);
    expect(
      (await call('PUT', `/v1/achievement-criteria/${FAKE}`, cookie.admin, numeric(ids.bio, 70))).statusCode,
    ).toBe(404);
  });

  it('interval: level berangka, urutan dijaga, KKM efektif = min_score level tercapai', async () => {
    const res = await create({
      subjectId: ids.bio,
      mode: 'interval',
      levels: [
        { label: 'Belum', minScore: 0, maxScore: 59.99, isAchieved: false },
        { label: 'Tuntas', minScore: 60, maxScore: 100, isAchieved: true },
      ],
    });
    expect(res.statusCode).toBe(201);
    const row = res.json();
    expect(row.effectiveThreshold).toBe(60);
    expect(row.levels.map((l: { label: string }) => l.label)).toEqual(['Belum', 'Tuntas']);
    expect(row.levels[1]).toMatchObject({ minScore: 60, maxScore: 100, isAchieved: true, sortOrder: 1 });

    // PUT mengganti seluruh level sekaligus.
    const put = await call('PUT', `/v1/achievement-criteria/${row.id}`, cookie.admin, {
      subjectId: ids.bio,
      mode: 'interval',
      levels: [{ label: 'Semua', minScore: 55.5, maxScore: 100, isAchieved: true }],
    });
    expect(put.json().levels).toHaveLength(1);
    expect(put.json().effectiveThreshold).toBe(55.5);
    expect(
      (
        await db().execute(
          sql`select count(*)::int as n from achievement_rubric_level where criteria_id = ${row.id}`,
        )
      ).rows[0],
    ).toMatchObject({ n: 1 });

    const without = await call(
      'GET',
      `/v1/achievement-criteria?subjectId=${ids.bio}&includeRubric=false`,
      cookie.admin,
    );
    expect(without.json().criteria[0].levels).toBeUndefined();
    expect(without.json().criteria[0].effectiveThreshold).toBe(55.5);
    await call('DELETE', `/v1/achievement-criteria/${row.id}`, cookie.admin);
    expect(
      (
        await db().execute(
          sql`select count(*)::int as n from achievement_rubric_level where criteria_id = ${row.id}`,
        )
      ).rows[0],
    ).toMatchObject({ n: 0 });
  });

  it('rubric dan descriptor: tersimpan; deskriptor boleh tanpa angka', async () => {
    const rubric = await create({
      subjectId: ids.bio,
      levelCode: '8',
      mode: 'rubric',
      levels: [
        {
          label: 'Perlu bimbingan',
          descriptor: 'Belum konsisten',
          minScore: 0,
          maxScore: 64,
          isAchieved: false,
        },
        { label: 'Cakap', descriptor: 'Konsisten', minScore: 65, maxScore: 84, isAchieved: true },
        { label: 'Mahir', minScore: 85, maxScore: 100, isAchieved: true },
      ],
    });
    expect(rubric.statusCode).toBe(201);
    expect(rubric.json().levels[0].descriptor).toBe('Belum konsisten');
    expect(rubric.json().effectiveThreshold).toBe(65);

    const desc = await create({
      subjectId: ids.bio,
      levelCode: '7',
      mode: 'descriptor',
      levels: [
        { label: 'Berkembang', descriptor: 'Mulai memahami', isAchieved: false },
        { label: 'Tercapai', descriptor: 'Memahami', isAchieved: true },
      ],
    });
    expect(desc.statusCode).toBe(201);
    expect(desc.json().effectiveThreshold).toBeNull();
    expect(desc.json().levels[1]).toMatchObject({ minScore: null, maxScore: null, isAchieved: true });

    const list = await call('GET', `/v1/achievement-criteria?subjectId=${ids.bio}`, cookie.teacher);
    expect(list.statusCode).toBe(200);
    expect(list.json().criteria).toHaveLength(2);
    const byLevel = await call(
      'GET',
      `/v1/achievement-criteria?subjectId=${ids.bio}&levelCode=8`,
      cookie.admin,
    );
    expect(byLevel.json().criteria.map((c: { mode: string }) => c.mode)).toEqual(['rubric']);

    // Deskriptor tanpa angka tidak menentukan KKM: pemecah melewatinya ke KKM sekolah.
    expect(await resolve(ids.bio, '7')).toMatchObject({ kkm: 75, scope: 'settings' });
    expect(await resolve(ids.bio, '8')).toMatchObject({ kkm: 65, scope: 'subject_level', mode: 'rubric' });
    await clearCriteria();
  });

  it('menolak bentuk yang tak sah', async () => {
    const code = async (body: object, status = 400) => {
      const res = await create(body);
      expect(res.statusCode).toBe(status);
      return res.json().error.code as string;
    };
    expect(await code({ subjectId: ids.bio, mode: 'numeric' })).toBe('invalid_criteria');
    expect(await code(numeric(ids.bio, 101))).toBe('validation');
    expect(await code(numeric(ids.bio, 70.123))).toBe('validation');
    expect(
      await code({
        ...numeric(ids.bio, 70),
        levels: [{ label: 'x', minScore: 0, maxScore: 100, isAchieved: true }],
      }),
    ).toBe('invalid_criteria');
    expect(await code({ subjectId: ids.bio, mode: 'interval' })).toBe('invalid_criteria');
    expect(
      await code({ subjectId: ids.bio, mode: 'rubric', levels: [{ label: 'x', isAchieved: true }] }),
    ).toBe('invalid_criteria');
    expect(
      await code({
        subjectId: ids.bio,
        mode: 'interval',
        levels: [{ label: 'x', minScore: 80, maxScore: 70, isAchieved: true }],
      }),
    ).toBe('invalid_criteria');
    expect(
      await code({
        subjectId: ids.bio,
        mode: 'interval',
        threshold: 60,
        levels: [{ label: 'x', minScore: 0, maxScore: 100, isAchieved: true }],
      }),
    ).toBe('invalid_criteria');
    expect(await code({ subjectId: ids.bio, mode: 'median' })).toBe('validation');
    expect(
      await code({
        subjectId: ids.bio,
        mode: 'interval',
        levels: [
          { label: 'A', minScore: 0, maxScore: 70, isAchieved: false },
          { label: 'B', minScore: 70, maxScore: 100, isAchieved: true },
        ],
      }),
    ).toBe('overlapping_levels');
    expect(
      await code({
        subjectId: ids.bio,
        mode: 'rubric',
        levels: [
          { label: 'A', minScore: 0, maxScore: 80, isAchieved: false },
          { label: 'B', minScore: 50, maxScore: 100, isAchieved: true },
        ],
      }),
    ).toBe('overlapping_levels');
    expect(await code(numeric(ids.bio, 70, { levelCode: '99' }))).toBe('invalid_level');
    expect(await code(numeric(FAKE, 70))).toBe('invalid_reference');
    expect(await code(numeric(ids.foreignSubject, 70))).toBe('invalid_reference');
    expect(await code(numeric(ids.bio, 70, { programId: ids.foreignPrg }))).toBe('invalid_reference');
    expect(await code(numeric(ids.bio, 70, { programId: FAKE }))).toBe('invalid_reference');
    // TP milik mapel lain tidak boleh dipakai.
    expect(await code(numeric(ids.bio, 70, { objectiveId: ids.tp }))).toBe('invalid_reference');
  });

  it('cakupan ganda ditolak 409 criteria_exists, juga lewat PUT', async () => {
    const first = await create(numeric(ids.bio, 70, { levelCode: '7', programId: ids.prg }));
    expect(first.statusCode).toBe(201);
    const dup = await create(numeric(ids.bio, 80, { levelCode: '7', programId: ids.prg }));
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('criteria_exists');
    // Cakupan berbeda tetap boleh, lalu memindahkannya ke cakupan terpakai ditolak.
    const other = await create(numeric(ids.bio, 80, { levelCode: '7' }));
    expect(other.statusCode).toBe(201);
    const move = await call(
      'PUT',
      `/v1/achievement-criteria/${other.json().id}`,
      cookie.admin,
      numeric(ids.bio, 80, { levelCode: '7', programId: ids.prg }),
    );
    expect(move.statusCode).toBe(409);
    expect(move.json().error.code).toBe('criteria_exists');
    // Menyimpan ulang dirinya sendiri bukan bentrok.
    expect(
      (
        await call(
          'PUT',
          `/v1/achievement-criteria/${first.json().id}`,
          cookie.admin,
          numeric(ids.bio, 71, { levelCode: '7', programId: ids.prg }),
        )
      ).statusCode,
    ).toBe(200);
    await clearCriteria();
  });

  it('403 tanpa izin tulis; 401 tanpa sesi', async () => {
    const row = await create(numeric(ids.bio, 70));
    const id = row.json().id;
    expect((await create(numeric(ids.bio, 70, { levelCode: '8' }), cookie.teacher)).statusCode).toBe(403);
    expect(
      (await call('PUT', `/v1/achievement-criteria/${id}`, cookie.teacher, numeric(ids.bio, 60))).statusCode,
    ).toBe(403);
    expect((await call('DELETE', `/v1/achievement-criteria/${id}`, cookie.teacher)).statusCode).toBe(403);
    expect((await call('GET', '/v1/achievement-criteria', cookie.teacher)).statusCode).toBe(200);
    expect(
      (await call('GET', `/v1/achievement-criteria/resolve?subjectId=${ids.bio}`, cookie.teacher)).statusCode,
    ).toBe(200);
    expect((await app.inject('/v1/achievement-criteria')).statusCode).toBe(401);
    await clearCriteria();
  });

  it('resolve: mapel tak dikenal 404, query tak lengkap 400', async () => {
    expect(
      (await call('GET', `/v1/achievement-criteria/resolve?subjectId=${FAKE}`, cookie.admin)).statusCode,
    ).toBe(404);
    expect((await call('GET', '/v1/achievement-criteria/resolve', cookie.admin)).statusCode).toBe(400);
  });
});

describe('isolasi tenant', () => {
  it('sekolah lain tidak melihat atau mengubah kriteria kita', async () => {
    const row = await create(numeric(ids.bio, 70));
    const id = row.json().id;
    const theirs = await call('GET', '/v1/achievement-criteria', cookie.other, undefined, otherId);
    expect(theirs.json().criteria).toEqual([]);
    expect(
      (
        await call(
          'PUT',
          `/v1/achievement-criteria/${id}`,
          cookie.other,
          numeric(ids.foreignSubject, 1),
          otherId,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await call('DELETE', `/v1/achievement-criteria/${id}`, cookie.other, undefined, otherId)).statusCode,
    ).toBe(404);
    // Mapel kita tidak bisa dirujuk dari sekolah lain.
    expect(
      (await call('POST', '/v1/achievement-criteria', cookie.other, numeric(ids.bio, 70), otherId)).json()
        .error.code,
    ).toBe('invalid_reference');
    // Pengguna sekolah lain tidak bisa memakai x-school-id sekolah kita.
    expect(
      (await call('GET', '/v1/achievement-criteria', cookie.other, undefined, schoolId)).statusCode,
    ).toBe(403);
    await clearCriteria();
  });
});

describe('KKM per mapel di rekap, rapor draf, dan portal', () => {
  it('kriteria numerik desimal tingkat mapel mengubah belowKkm mapel itu saja', async () => {
    const res = await create(numeric(ids.mat, 72.5));
    expect(res.statusCode).toBe(201);
    const r = await recap(ids.class7A, ids.mat);
    expect(r.kkm).toBe(72.5);
    expect(r.settings.kkm).toBe(75);
    expect(r.students.find((s: { studentId: string }) => s.studentId === ids.budi)).toMatchObject({
      final: 72.5,
      belowKkm: false,
    });
    expect(r.stats.belowKkmCount).toBe(0);
    // Mapel lain tidak terpengaruh.
    expect(await recap(ids.class7A, ids.ipa)).toEqual(baseline.recapIpa);

    const doc = await reportDoc(ids.budi);
    expect(subjectRow(doc, ids.mat)).toMatchObject({ kkm: 72.5, belowKkm: false });
    expect(subjectRow(doc, ids.ipa)).toMatchObject({ kkm: 75, belowKkm: true });
    const p = await portal(ids.budi);
    expect(p.kkm).toBe(75);
    expect(p.subjects.find((s) => s.subjectId === ids.mat)).toMatchObject({ kkm: 72.5, belowKkm: false });
    expect(p.subjects.find((s) => s.subjectId === ids.ipa)).toMatchObject({ kkm: 75, belowKkm: true });
  });

  it('urutan fallback: (tingkat, program) > (tingkat) > (program) > (mapel) > KKM sekolah', async () => {
    // Sudah ada: MAT semua tingkat = 72.5. Tambah tiap tingkat dari yang paling umum.
    const program = await create(numeric(ids.mat, 65, { programId: ids.prg }));
    const level = await create(numeric(ids.mat, 80, { levelCode: '7' }));
    const levelProgram = await create(numeric(ids.mat, 90, { levelCode: '7', programId: ids.prg }));
    expect([program, level, levelProgram].map((r) => r.statusCode)).toEqual([201, 201, 201]);

    expect(await resolve(ids.mat, '7', ids.prg)).toMatchObject({
      kkm: 90,
      scope: 'subject_level_program',
      criteriaId: levelProgram.json().id,
      mode: 'numeric',
    });
    expect(await resolve(ids.mat, '7')).toMatchObject({ kkm: 80, scope: 'subject_level' });
    expect(await resolve(ids.mat, '8', ids.prg)).toMatchObject({ kkm: 65, scope: 'subject_program' });
    expect(await resolve(ids.mat, '8')).toMatchObject({ kkm: 72.5, scope: 'subject' });
    expect(await resolve(ids.ipa, '7', ids.prg)).toMatchObject({ kkm: 75, scope: 'settings' });

    // Kelas 7A (tingkat 7 + program) memakai 90, 7B (tingkat 7 tanpa program) memakai 80.
    const a = await recap(ids.class7A, ids.mat);
    expect(a.kkm).toBe(90);
    expect(a.stats.belowKkmCount).toBe(2);
    const b = await recap(ids.class7B, ids.mat);
    expect(b.kkm).toBe(80);
    expect(b.stats.belowKkmCount).toBe(1);
    expect(subjectRow(await reportDoc(ids.ani), ids.mat)).toMatchObject({
      kkm: 90,
      final: 80,
      belowKkm: true,
    });
    expect(subjectRow(await reportDoc(ids.citra), ids.mat)).toMatchObject({
      kkm: 80,
      final: 72.5,
      belowKkm: true,
    });
    expect((await portal(ids.ani)).subjects.find((s) => s.subjectId === ids.mat)).toMatchObject({
      kkm: 90,
      belowKkm: true,
    });

    // Hapus dari yang paling spesifik: tiap tingkat jatuh ke berikutnya.
    await call('DELETE', `/v1/achievement-criteria/${levelProgram.json().id}`, cookie.admin);
    expect((await recap(ids.class7A, ids.mat)).kkm).toBe(80);
    await call('DELETE', `/v1/achievement-criteria/${level.json().id}`, cookie.admin);
    expect((await recap(ids.class7A, ids.mat)).kkm).toBe(65);
    expect((await recap(ids.class7B, ids.mat)).kkm).toBe(72.5);
    await call('DELETE', `/v1/achievement-criteria/${program.json().id}`, cookie.admin);
    expect((await recap(ids.class7A, ids.mat)).kkm).toBe(72.5);
  });

  it('kriteria nonaktif dan kriteria TP diabaikan pemecah KKM mapel', async () => {
    const [mapel] = (await call('GET', `/v1/achievement-criteria?subjectId=${ids.mat}`, cookie.admin)).json()
      .criteria;
    const off = await call('PUT', `/v1/achievement-criteria/${mapel.id}`, cookie.admin, {
      ...numeric(ids.mat, 72.5),
      active: false,
    });
    expect(off.json().active).toBe(false);
    expect((await recap(ids.class7A, ids.mat)).kkm).toBe(75);

    const tp = await create(numeric(ids.mat, 99, { objectiveId: ids.tp }));
    expect(tp.statusCode).toBe(201);
    expect(tp.json().objectiveId).toBe(ids.tp);
    expect((await recap(ids.class7A, ids.mat)).kkm).toBe(75);
    expect(await resolve(ids.mat, '7', ids.prg)).toMatchObject({ kkm: 75, scope: 'settings' });
    // Kriteria TP dan kriteria mapel pada mapel yang sama boleh berdampingan.
    const reactivated = await call(
      'PUT',
      `/v1/achievement-criteria/${mapel.id}`,
      cookie.admin,
      numeric(ids.mat, 72.5),
    );
    expect(reactivated.json().active).toBe(true);
    expect((await recap(ids.class7A, ids.mat)).kkm).toBe(72.5);
    // Cakupan TP yang sama dua kali tetap ditolak.
    expect((await create(numeric(ids.mat, 50, { objectiveId: ids.tp }))).json().error.code).toBe(
      'criteria_exists',
    );
  });

  it('mode rubrik menentukan KKM lewat level tercapai terendah', async () => {
    const res = await create({
      subjectId: ids.ipa,
      mode: 'rubric',
      levels: [
        { label: 'Belum', minScore: 0, maxScore: 54.99, isAchieved: false },
        { label: 'Tercapai', minScore: 55, maxScore: 100, isAchieved: true },
      ],
    });
    expect(res.statusCode).toBe(201);
    const r = await recap(ids.class7A, ids.ipa);
    expect(r.kkm).toBe(55);
    expect(r.students.find((s: { studentId: string }) => s.studentId === ids.budi)).toMatchObject({
      final: 60,
      belowKkm: false,
    });
    expect(r.stats.belowKkmCount).toBe(0);
  });

  it('setelah semua kriteria dihapus hasilnya persis sama dengan sebelumnya', async () => {
    await clearCriteria();
    expect(await recap(ids.class7A, ids.mat)).toEqual(baseline.recapMat);
    expect(await recap(ids.class7A, ids.ipa)).toEqual(baseline.recapIpa);
    expect(stable(await reportDoc(ids.ani))).toEqual(baseline.docAni);
    expect(stable(await reportDoc(ids.budi))).toEqual(baseline.docBudi);
    expect(await portal(ids.budi)).toEqual(baseline.portalBudi);
  });
});

describe('penjaga rapor final', () => {
  it('rapor final tidak berubah, dan perubahan kriteria ditolak 409 report_final', async () => {
    const fin = await call('POST', '/v1/report-cards/finalize', cookie.admin, {
      semesterId: ids.sem,
      classId: ids.class7A,
    });
    expect(fin.statusCode).toBe(200);
    const frozenBudi = stable(await reportDoc(ids.budi));
    expect(frozenBudi).toMatchObject({ status: 'final' });
    expect(subjectRow(frozenBudi, ids.mat)).toMatchObject({ kkm: 75, belowKkm: true });

    const guard = { kind: 'report_final' };
    const blocked = await create(numeric(ids.mat, 60));
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe(guard.kind);
    expect((await call('GET', '/v1/achievement-criteria', cookie.admin)).json().criteria).toEqual([]);

    // Kriteria yang ada tidak bisa diubah atau dihapus lewat API; sisipkan langsung untuk menguji ketiganya.
    const [row] = await db()
      .insert(achievementCriteria)
      .values({ schoolId, subjectId: ids.mat, mode: 'numeric', threshold: 60 })
      .returning();
    const put = await call('PUT', `/v1/achievement-criteria/${row!.id}`, cookie.admin, numeric(ids.mat, 50));
    expect(put.statusCode).toBe(409);
    expect(put.json().error.code).toBe('report_final');
    const del = await call('DELETE', `/v1/achievement-criteria/${row!.id}`, cookie.admin);
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe('report_final');
    expect(
      (
        await call('PUT', '/v1/grading/settings', cookie.admin, {
          kkm: 70,
          predicateA: 90,
          predicateB: 80,
          predicateC: 70,
        })
      ).json().error.code,
    ).toBe('report_final');

    // Snapshot yang sudah beku dibaca apa adanya walau KKM efektif hidup kini 60.
    expect((await recap(ids.class7A, ids.mat)).kkm).toBe(60);
    expect(stable(await reportDoc(ids.budi))).toEqual(frozenBudi);
    // Kelas lain (rapor masih draf) mengikuti KKM baru.
    expect(subjectRow(await reportDoc(ids.citra), ids.mat)).toMatchObject({ kkm: 60, belowKkm: false });
  });
});
