import {
  academicYear,
  achievementCriteria,
  assignRoles,
  classRoom,
  curriculumSubjectAllocation,
  enrollment,
  eq,
  foundation,
  learningFlow,
  member,
  program,
  promotionDecision,
  refCurriculum,
  reportCard,
  school,
  schoolCurriculumVersion,
  schoolLevel,
  seedSchoolRoles,
  semester,
  sql,
  student,
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
 * Perbaikan hasil review kode dan audit keamanan fase 2A-2C: finalLevelCode program, penghapusan tingkat yang dirujuk,
 * pemilihan kelas tujuan, validasi ulang lulus, catatan keputusan yang dipertahankan, balapan penerapan, sinkron
 * `kind`/`isLocalContent`, FK RESTRICT, dan perangkat ajar. (Mode `percentage` diuji di grading.test.ts dan contracts.)
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let foundationId = '';
const userIds: string[] = [];
let adminCookie = '';

const years = {} as Record<string, string>;
const cls = {} as Record<string, string>;
const stu = {} as Record<string, string>;

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

const db = () => app.platformDb;

const mkYear = async (key: string, startYear: number) => {
  const [y] = await db()
    .insert(academicYear)
    .values({
      schoolId,
      name: `${startYear}/${startYear + 1}`,
      startsOn: `${startYear}-07-15`,
      endsOn: `${startYear + 1}-06-30`,
      isActive: false,
    })
    .returning();
  years[key] = y!.id;
  return y!.id;
};

const mkClass = async (key: string, yearKey: string, name: string, level: string, programId?: string) => {
  const [c] = await db()
    .insert(classRoom)
    .values({
      schoolId,
      academicYearId: years[yearKey]!,
      name,
      level,
      ...(programId ? { programId } : {}),
    })
    .returning();
  cls[key] = c!.id;
  return c!.id;
};

const mkStudent = async (key: string, classKey: string | null, yearKey?: string) => {
  const [s] = await db()
    .insert(student)
    .values({ schoolId, name: `Siswa ${key}`, gender: 'L', nis: `${key}-${run}` })
    .returning();
  stu[key] = s!.id;
  if (classKey) {
    await db()
      .insert(enrollment)
      .values({ schoolId, studentId: s!.id, classId: cls[classKey]!, academicYearId: years[yearKey!]! });
  }
  return s!.id;
};

const decide = (yearKey: string, decisions: object[]) =>
  call('PUT', `/v1/academic-years/${years[yearKey]}/promotions`, { decisions });
const apply = (from: string, to: string, extra: object = {}) =>
  call('POST', `/v1/academic-years/${years[from]}/promotions/apply`, { targetYearId: years[to], ...extra });
const errOf = (res: { statusCode: number; json: () => { error?: { code: string } } }) => [
  res.statusCode,
  res.json().error?.code,
];
const pgCode = (e: unknown) => {
  const x = e as { code?: string; cause?: { code?: string } };
  return x?.cause?.code ?? x?.code;
};

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Review', slug: `yrv-${run}` })
    .returning();
  foundationId = f!.id;
  const [s] = await db()
    .insert(school)
    .values({ foundationId, slug: `rv-${run}`, name: `rv-${run}` })
    .returning();
  schoolId = s!.id;
  await seedSchoolRoles(db(), schoolId);
  await db()
    .insert(schoolLevel)
    .values(['7', '8', '9'].map((code, i) => ({ schoolId, code, label: `Kelas ${code}`, sort: i + 1 })));

  const u = await makeUser('admin-review');
  const [m] = await db().insert(member).values({ userId: u.id, schoolId }).returning();
  await assignRoles(db(), m!.id, schoolId, ['school_admin']);
  adminCookie = await login(u.email);

  let y = 2026;
  for (const key of ['a1', 'a2', 'g1', 'g2', 'r1', 'r2', 'r3', 'n1', 'n2', 'u1', 'u2', 't1', 't2']) {
    await mkYear(key, y++);
  }
});

afterAll(async () => {
  for (const table of [
    'audit_log',
    'promotion_decision',
    'report_card_snapshot',
    'report_card',
    'learning_flow_item',
    'learning_flow',
    'learning_objective',
    'learning_outcome',
    'achievement_criteria',
    'curriculum_subject_allocation',
    'school_curriculum_version',
    'enrollment',
    'student',
    'class_room',
    'semester',
    'program',
    'subject',
    'school_level',
    'academic_year',
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

/* ---------- 2. finalLevelCode program dan penghapusan tingkat ---------- */

describe('finalLevelCode program dan penghapusan tingkat', () => {
  const progId: Record<string, string> = {};

  it('finalLevelCode harus kode tingkat sekolah (400 invalid_level); durationYears saja tetap sah', async () => {
    const bad = await call('POST', '/v1/programs', { code: `B1-${run}`, name: 'Bad', finalLevelCode: '99' });
    expect(errOf(bad)).toEqual([400, 'invalid_level']);

    const onlyDuration = await call('POST', '/v1/programs', {
      code: `D3-${run}`,
      name: 'Hanya durasi',
      durationYears: 3,
    });
    expect(onlyDuration.statusCode).toBe(201);
    expect(onlyDuration.json()).toMatchObject({ durationYears: 3, finalLevelCode: null });

    const good = await call('POST', '/v1/programs', {
      code: `G9-${run}`,
      name: 'Tingkat akhir 9',
      finalLevelCode: '9',
    });
    expect(good.statusCode).toBe(201);
    progId.good = good.json().id;

    const badPut = await call('PUT', `/v1/programs/${progId.good}`, {
      code: `G9-${run}`,
      name: 'Tingkat akhir 9',
      finalLevelCode: 'XX',
    });
    expect(errOf(badPut)).toEqual([400, 'invalid_level']);
    // Tanpa finalLevelCode (dihilangkan) atau null tetap sah.
    const keep = await call('PUT', `/v1/programs/${progId.good}`, { code: `G9-${run}`, name: 'Ganti nama' });
    expect(keep.json()).toMatchObject({ name: 'Ganti nama', finalLevelCode: '9' });
    const clear = await call('PUT', `/v1/programs/${progId.good}`, {
      code: `G9-${run}`,
      name: 'Ganti nama',
      finalLevelCode: null,
    });
    expect(clear.json().finalLevelCode).toBeNull();
  });

  it('DELETE tingkat ditolak 409 in_use bila dirujuk program, alokasi, versi kurikulum, ATP, atau KKTP', async () => {
    const [subj] = await db()
      .insert(subject)
      .values({ schoolId, code: `LV-${run}`, name: 'Mapel level' })
      .returning();
    const [curKey] = await db().select({ key: refCurriculum.key }).from(refCurriculum).limit(1);
    const levels = new Map<string, string>();
    for (const [i, code] of ['LP', 'LA', 'LV', 'LF', 'LC'].entries()) {
      const [l] = await db()
        .insert(schoolLevel)
        .values({ schoolId, code, label: code, sort: 50 + i })
        .returning();
      levels.set(code, l!.id);
    }
    const del = (code: string) => call('DELETE', `/v1/school/levels/${levels.get(code)}`);

    // Program.
    await call('PUT', `/v1/programs/${progId.good}`, {
      code: `G9-${run}`,
      name: 'Ganti nama',
      finalLevelCode: 'LP',
    });
    expect(errOf(await del('LP'))).toEqual([409, 'in_use']);
    await call('PUT', `/v1/programs/${progId.good}`, {
      code: `G9-${run}`,
      name: 'Ganti nama',
      finalLevelCode: null,
    });
    expect((await del('LP')).statusCode).toBe(200);

    // Alokasi JP.
    const [alloc] = await db()
      .insert(curriculumSubjectAllocation)
      .values({ schoolId, academicYearId: years.a1!, levelCode: 'LA', subjectId: subj!.id, weeklyPeriods: 2 })
      .returning();
    expect(errOf(await del('LA'))).toEqual([409, 'in_use']);
    await db().delete(curriculumSubjectAllocation).where(eq(curriculumSubjectAllocation.id, alloc!.id));
    expect((await del('LA')).statusCode).toBe(200);

    // Versi kurikulum.
    const [ver] = await db()
      .insert(schoolCurriculumVersion)
      .values({ schoolId, academicYearId: years.a1!, levelCode: 'LV', curriculumKey: curKey!.key })
      .returning();
    expect(errOf(await del('LV'))).toEqual([409, 'in_use']);
    await db().delete(schoolCurriculumVersion).where(eq(schoolCurriculumVersion.id, ver!.id));
    expect((await del('LV')).statusCode).toBe(200);

    // ATP.
    const [flow] = await db()
      .insert(learningFlow)
      .values({ schoolId, subjectId: subj!.id, academicYearId: years.a1!, levelCode: 'LF', name: 'ATP LF' })
      .returning();
    expect(errOf(await del('LF'))).toEqual([409, 'in_use']);
    await db().delete(learningFlow).where(eq(learningFlow.id, flow!.id));
    expect((await del('LF')).statusCode).toBe(200);

    // KKTP.
    const [crit] = await db()
      .insert(achievementCriteria)
      .values({ schoolId, subjectId: subj!.id, levelCode: 'LC', mode: 'numeric', threshold: 70 })
      .returning();
    expect(errOf(await del('LC'))).toEqual([409, 'in_use']);
    await db().delete(achievementCriteria).where(eq(achievementCriteria.id, crit!.id));
    expect((await del('LC')).statusCode).toBe(200);

    await db().delete(subject).where(eq(subject.id, subj!.id));
  });
});

/* ---------- 3. pickClass tanpa pool[0] ---------- */

describe('penerapan: pemilihan kelas tujuan tanpa jatuh ke kelas pertama', () => {
  it('nama turunan cocok, lalu satu-satunya kelas sejurusan; selain itu unplaced no_target_class', async () => {
    const [p1] = await db()
      .insert(program)
      .values({ schoolId, code: `PA1-${run}`, name: 'PA1' })
      .returning();
    const [p2] = await db()
      .insert(program)
      .values({ schoolId, code: `PA2-${run}`, name: 'PA2' })
      .returning();
    await mkClass('a1_7B', 'a1', '7B', '7');
    await mkClass('a1_7C', 'a1', '7C', '7', p1!.id);
    await mkClass('a1_7D', 'a1', '7D', '7', p2!.id);
    await mkClass('a1_7E', 'a1', '7E', '7');
    await mkClass('a2_8A', 'a2', '8A', '8');
    await mkClass('a2_8X', 'a2', '8X', '8', p1!.id);
    await mkClass('a2_8Y', 'a2', '8Y', '8', p2!.id);
    await mkClass('a2_8Z', 'a2', '8Z', '8', p2!.id);
    await mkClass('a2_8E', 'a2', '8E', '8');
    await mkStudent('aB', 'a1_7B', 'a1'); // tanpa program, 8B tidak ada, hanya 8A (tanpa program): TIDAK masuk 8A
    await mkStudent('aC', 'a1_7C', 'a1'); // program PA1: tepat satu kelas PA1 di tujuan (8X)
    await mkStudent('aD', 'a1_7D', 'a1'); // program PA2: dua kelas (8Y, 8Z) -> ambigu
    await mkStudent('aE', 'a1_7E', 'a1'); // nama turunan 8E ada

    const saved = await decide(
      'a1',
      ['aB', 'aC', 'aD', 'aE'].map((k) => ({ studentId: stu[k], decision: 'promote' })),
    );
    expect(saved.json()).toEqual({ saved: 4 });
    const res = await apply('a1', 'a2');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.placed).toBe(2);
    expect(
      body.unplaced.map((u: { studentId: string; reasonCode: string }) => [u.studentId, u.reasonCode]).sort(),
    ).toEqual(
      [
        [stu.aB, 'no_target_class'],
        [stu.aD, 'no_target_class'],
      ].sort(),
    );
    const placed = new Map(
      (await db().select().from(enrollment).where(eq(enrollment.academicYearId, years.a2!))).map((e) => [
        e.studentId,
        e.classId,
      ]),
    );
    expect(placed.get(stu.aC!)).toBe(cls.a2_8X);
    expect(placed.get(stu.aE!)).toBe(cls.a2_8E);
    expect(placed.has(stu.aB!)).toBe(false);
    expect(placed.has(stu.aD!)).toBe(false);
    // Yang tidak ditempatkan tidak ditandai diterapkan.
    const rows = await db()
      .select()
      .from(promotionDecision)
      .where(eq(promotionDecision.academicYearId, years.a1!));
    const applied = new Set(rows.filter((r) => r.appliedAt).map((r) => r.studentId));
    expect([...applied].sort()).toEqual([stu.aC, stu.aE].sort());
  });
});

/* ---------- 4. lulus: validasi ulang dan rapor belum final ---------- */

describe('penerapan: lulus divalidasi ulang dan peringatan rapor belum final', () => {
  it('tingkat akhir berubah setelah keputusan: unplaced not_final_level, siswa tetap aktif', async () => {
    await mkClass('g1_9G', 'g1', '9G', '9');
    await mkStudent('gA', 'g1_9G', 'g1');
    await mkStudent('gB', 'g1_9G', 'g1');
    expect(
      (
        await decide('g1', [
          { studentId: stu.gA, decision: 'graduate' },
          { studentId: stu.gB, decision: 'graduate' },
        ])
      ).statusCode,
    ).toBe(200);

    // Sekolah menambah tingkat 10: kelas tingkat 9 tidak lagi tingkat akhir.
    await db().insert(schoolLevel).values({ schoolId, code: '10', label: 'Kelas 10', sort: 4 });
    try {
      const res = await apply('g1', 'g2');
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.graduated).toBe(0);
      expect(body.unplaced.map((u: { reasonCode: string }) => u.reasonCode)).toEqual([
        'not_final_level',
        'not_final_level',
      ]);
      const [a] = await db().select().from(student).where(eq(student.id, stu.gA!));
      expect(a?.status).toBe('active');
      const rows = await db()
        .select()
        .from(promotionDecision)
        .where(eq(promotionDecision.academicYearId, years.g1!));
      expect(rows.every((r) => r.appliedAt === null)).toBe(true);
    } finally {
      await db().delete(schoolLevel).where(sql`school_id = ${schoolId} and code = '10'`);
    }
  });

  it('pratinjau dan penerapan memperingatkan lulusan yang rapor kelasnya belum final', async () => {
    const [sem] = await db()
      .insert(semester)
      .values({
        schoolId,
        academicYearId: years.g1!,
        name: 'Genap',
        startsOn: '2029-01-05',
        endsOn: '2029-06-30',
      })
      .returning();

    const preview = await apply('g1', 'g2', { dryRun: true });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().graduated).toBe(2);
    expect(preview.json().graduateReportNotFinal).toBe(2);
    expect(preview.json().warningItems).toContainEqual({
      code: 'graduate_report_not_final',
      params: { count: 2 },
    });

    // Rapor kelas baru draf: masih belum final.
    await db()
      .insert(reportCard)
      .values({ schoolId, semesterId: sem!.id, studentId: stu.gA!, classId: cls.g1_9G!, status: 'draft' });
    expect((await apply('g1', 'g2', { dryRun: true })).json().graduateReportNotFinal).toBe(2);

    // Setelah rapor kelas final pada semester terakhir, peringatan hilang.
    await db()
      .update(reportCard)
      .set({ status: 'final', finalizedAt: new Date(), snapshot: { marker: 'beku' } })
      .where(eq(reportCard.classId, cls.g1_9G!));
    const clean = await apply('g1', 'g2', { dryRun: true });
    expect(clean.json().graduateReportNotFinal).toBe(0);
    expect(clean.json().warningItems ?? []).toEqual([]);

    const real = await apply('g1', 'g2');
    expect(real.json()).toMatchObject({ graduated: 2, graduateReportNotFinal: 0 });
  });
});

/* ---------- 5. catatan keputusan dipertahankan ---------- */

describe('PUT keputusan: catatan yang tidak dikirim dipertahankan', () => {
  it('undefined = pertahankan, null eksplisit = kosongkan', async () => {
    await mkClass('n1_7N', 'n1', '7N', '7');
    await mkStudent('nA', 'n1_7N', 'n1');
    const read = async () => {
      const body = (await call('GET', `/v1/academic-years/${years.n1}/promotions`)).json() as {
        classes: { students: { studentId: string; [k: string]: unknown }[] }[];
      };
      return body.classes.flatMap((c) => c.students).find((s) => s.studentId === stu.nA);
    };
    await decide('n1', [
      {
        studentId: stu.nA,
        decision: 'retain',
        note: 'catatan awal',
        reason: 'Belum tuntas.',
        followUp: 'Remedial.',
        meetingDate: '2034-06-20',
      },
    ]);
    // Hanya keputusan: semua catatan tetap.
    await decide('n1', [{ studentId: stu.nA, decision: 'promote' }]);
    expect(await read()).toMatchObject({
      decision: 'promote',
      note: 'catatan awal',
      reason: 'Belum tuntas.',
      followUp: 'Remedial.',
      meetingDate: '2034-06-20',
    });
    // Sebagian dikirim: yang lain tetap.
    await decide('n1', [{ studentId: stu.nA, decision: 'retain', reason: 'Alasan baru.' }]);
    expect(await read()).toMatchObject({
      reason: 'Alasan baru.',
      followUp: 'Remedial.',
      meetingDate: '2034-06-20',
    });
    // null eksplisit mengosongkan hanya field itu.
    await decide('n1', [{ studentId: stu.nA, decision: 'retain', followUp: null, meetingDate: null }]);
    expect(await read()).toMatchObject({
      reason: 'Alasan baru.',
      followUp: null,
      meetingDate: null,
      note: 'catatan awal',
    });
    await decide('n1', [{ studentId: stu.nA, decision: 'retain', note: null, reason: null }]);
    expect(await read()).toMatchObject({ note: null, reason: null });
  });
});

/* ---------- 6. balapan penerapan ---------- */

describe('penerapan paralel ke dua tahun tujuan tidak menempatkan siswa ganda', () => {
  it('dua apply bersamaan dari tahun sumber yang sama', async () => {
    await mkClass('r1_7R', 'r1', '7R', '7');
    await mkClass('r2_8R', 'r2', '8R', '8');
    await mkClass('r3_8R', 'r3', '8R', '8');
    const keys: string[] = [];
    for (let i = 0; i < 30; i++) {
      const k = `r${i}`;
      keys.push(k);
      await mkStudent(k, 'r1_7R', 'r1');
    }
    expect(
      (
        await decide(
          'r1',
          keys.map((k) => ({ studentId: stu[k], decision: 'promote' })),
        )
      ).json(),
    ).toEqual({ saved: 30 });

    const [a, b] = await Promise.all([apply('r1', 'r2'), apply('r1', 'r3')]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(a.json().placed + b.json().placed).toBe(30);

    const rows = await db()
      .select()
      .from(enrollment)
      .where(
        sql`${enrollment.studentId} in (${sql.join(
          keys.map((k) => sql`${stu[k]}`),
          sql`, `,
        )})`,
      );
    const perStudent = new Map<string, number>();
    for (const r of rows) perStudent.set(r.studentId, (perStudent.get(r.studentId) ?? 0) + 1);
    // 30 enrollment tahun sumber + tepat satu enrollment tujuan per siswa.
    for (const k of keys) expect(perStudent.get(stu[k]!), k).toBe(2);
    const decisions = await db()
      .select()
      .from(promotionDecision)
      .where(eq(promotionDecision.academicYearId, years.r1!));
    expect(decisions.every((d) => d.appliedAt !== null)).toBe(true);
  });

  it('dua apply bersamaan ke tahun tujuan yang sama menempatkan sekali', async () => {
    // Tahun sumber baru untuk kasus ini: pakai t1 -> t2.
    await mkClass('t1_7T', 't1', '7T', '7');
    await mkClass('t2_8T', 't2', '8T', '8');
    const keys: string[] = [];
    for (let i = 0; i < 12; i++) {
      keys.push(`t${i}`);
      await mkStudent(`t${i}`, 't1_7T', 't1');
    }
    await decide(
      't1',
      keys.map((k) => ({ studentId: stu[k], decision: 'promote' })),
    );
    const [a, b] = await Promise.all([apply('t1', 't2'), apply('t1', 't2')]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(a.json().placed + b.json().placed).toBe(12);
    const placed = await db().select().from(enrollment).where(eq(enrollment.academicYearId, years.t2!));
    expect(placed).toHaveLength(12);
  });
});

/* ---------- 7. kind vs isLocalContent ---------- */

describe('sinkron kind dan isLocalContent', () => {
  const mk = async (body: object) => {
    const res = await call('POST', '/v1/subjects', {
      code: `K${Math.random().toString(36).slice(2, 7)}`,
      name: 'Mapel kind',
      ...body,
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; code: string; kind: string; isLocalContent: boolean };
  };
  const put = async (s: { id: string; code: string }, body: object) => {
    const res = await call('PUT', `/v1/subjects/${s.id}`, { code: s.code, name: 'Mapel kind', ...body });
    expect(res.statusCode).toBe(200);
    return res.json() as { kind: string; isLocalContent: boolean };
  };

  it('POST: isLocalContent true tanpa kind menjadi local_content; kind local_content menjadi isLocalContent true', async () => {
    expect(await mk({ isLocalContent: true })).toMatchObject({ kind: 'local_content', isLocalContent: true });
    expect(await mk({ kind: 'local_content' })).toMatchObject({
      kind: 'local_content',
      isLocalContent: true,
    });
    expect(await mk({ kind: 'local_content', isLocalContent: false })).toMatchObject({
      kind: 'local_content',
      isLocalContent: true,
    });
    expect(await mk({})).toMatchObject({ kind: 'compulsory', isLocalContent: false });
    expect(await mk({ kind: 'elective' })).toMatchObject({ kind: 'elective', isLocalContent: false });
    expect(await mk({ isLocalContent: false })).toMatchObject({ kind: 'compulsory', isLocalContent: false });
  });

  it('PUT: tiap kombinasi disinkronkan terhadap nilai sebelumnya', async () => {
    const s = await mk({ kind: 'elective' });
    // isLocalContent true tanpa kind -> local_content.
    expect(await put(s, { isLocalContent: true })).toMatchObject({
      kind: 'local_content',
      isLocalContent: true,
    });
    // Tanpa keduanya: tidak berubah.
    expect(await put(s, {})).toMatchObject({ kind: 'local_content', isLocalContent: true });
    // isLocalContent false tanpa kind, sebelumnya local_content -> compulsory.
    expect(await put(s, { isLocalContent: false })).toMatchObject({
      kind: 'compulsory',
      isLocalContent: false,
    });
    // isLocalContent false tanpa kind, sebelumnya bukan local_content -> kind tetap.
    const e = await mk({ kind: 'elective' });
    expect(await put(e, { isLocalContent: false })).toMatchObject({
      kind: 'elective',
      isLocalContent: false,
    });
    // kind local_content -> isLocalContent true, walau dikirim false.
    expect(await put(e, { kind: 'local_content', isLocalContent: false })).toMatchObject({
      kind: 'local_content',
      isLocalContent: true,
    });
    // kind berganti dari local_content tanpa isLocalContent -> false.
    expect(await put(e, { kind: 'project' })).toMatchObject({ kind: 'project', isLocalContent: false });
    expect(await put(e, { kind: 'local_content' })).toMatchObject({
      kind: 'local_content',
      isLocalContent: true,
    });
  });
});

/* ---------- 8. FK RESTRICT ---------- */

describe('FK RESTRICT: data yang dirujuk tidak ikut terhapus', () => {
  it('jurusan dan mapel dengan alokasi JP tidak bisa dihapus (409 in_use), alokasi tetap ada', async () => {
    const [p] = await db()
      .insert(program)
      .values({ schoolId, code: `RP-${run}`, name: 'RP' })
      .returning();
    const [s] = await db()
      .insert(subject)
      .values({ schoolId, code: `RS-${run}`, name: 'RS' })
      .returning();
    const [alloc] = await db()
      .insert(curriculumSubjectAllocation)
      .values({
        schoolId,
        academicYearId: years.a1!,
        levelCode: '7',
        programId: p!.id,
        subjectId: s!.id,
        weeklyPeriods: 3,
      })
      .returning();
    const delProgram = await call('DELETE', `/v1/programs/${p!.id}`);
    expect(errOf(delProgram)).toEqual([409, 'in_use']);
    const delSubject = await call('DELETE', `/v1/subjects/${s!.id}`);
    expect(errOf(delSubject)).toEqual([409, 'in_use']);
    expect(
      await db()
        .select()
        .from(curriculumSubjectAllocation)
        .where(eq(curriculumSubjectAllocation.id, alloc!.id)),
    ).toHaveLength(1);

    // Setelah alokasinya dihapus, penghapusan berhasil.
    await db().delete(curriculumSubjectAllocation).where(eq(curriculumSubjectAllocation.id, alloc!.id));
    expect((await call('DELETE', `/v1/programs/${p!.id}`)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/subjects/${s!.id}`)).statusCode).toBe(200);
  });

  it('kelas yang dirujuk keputusan kenaikan tidak bisa dihapus (409 in_use), keputusan tetap ada', async () => {
    const classId = await mkClass('fk_cls', 'a1', '7FK', '7');
    const studentId = await mkStudent('fkS', null);
    await db().insert(promotionDecision).values({
      schoolId,
      academicYearId: years.a1!,
      studentId,
      fromClassId: classId,
      decision: 'retain',
    });
    expect(errOf(await call('DELETE', `/v1/classes/${classId}`))).toEqual([409, 'in_use']);
    expect(
      await db().select().from(promotionDecision).where(eq(promotionDecision.fromClassId, classId)),
    ).toHaveLength(1);
    // Database sendiri menolak (bukan hanya handler): kode Postgres 23503.
    const err = await db()
      .delete(classRoom)
      .where(eq(classRoom.id, classId))
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(pgCode(err)).toBe('23503');
    await db().delete(promotionDecision).where(eq(promotionDecision.fromClassId, classId));
    expect((await call('DELETE', `/v1/classes/${classId}`)).statusCode).toBe(200);
  });
});

/* ---------- 9. perangkat ajar ---------- */

describe('perangkat ajar: versi lama tidak bisa diaktifkan kembali, ATP dengan TP nonaktif', () => {
  const st: Record<string, string> = {};

  it('PUT CP/TP active:true pada baris yang sudah punya penerus ditolak 409 superseded', async () => {
    const [subj] = await db()
      .insert(subject)
      .values({ schoolId, code: `TP-${run}`, name: 'Mapel ATP' })
      .returning();
    st.subject = subj!.id;
    const cp = await call('POST', `/v1/subjects/${st.subject}/outcomes`, {
      phase: 'D',
      code: 'CP-X',
      description: 'CP awal',
    });
    st.cp = cp.json().id;
    const a = await call('POST', `/v1/outcomes/${st.cp}/objectives`, { code: 'TP-A', description: 'TP A' });
    const b = await call('POST', `/v1/outcomes/${st.cp}/objectives`, { code: 'TP-B', description: 'TP B' });
    st.tpA = a.json().id;
    st.tpB = b.json().id;
    const flow = await call('POST', '/v1/learning-flows', {
      subjectId: st.subject,
      academicYearId: years.t1,
      levelCode: '7',
      name: 'ATP review',
      items: [{ objectiveId: st.tpA }, { objectiveId: st.tpB }],
    });
    expect(flow.statusCode).toBe(201);
    st.flow = flow.json().id;
    expect((await call('POST', `/v1/learning-flows/${st.flow}/publish`)).statusCode).toBe(200);

    // TP A direvisi (dipakai ATP terbit): lama dinonaktifkan, versi baru dibuat.
    const rev = await call('PUT', `/v1/objectives/${st.tpA}`, { code: 'TP-A', description: 'TP A revisi' });
    expect(rev.json()).toMatchObject({ versioned: true, previousId: st.tpA });
    const reTp = await call('PUT', `/v1/objectives/${st.tpA}`, { description: 'TP A', active: true });
    expect(errOf(reTp)).toEqual([409, 'superseded']);
    const stillOff = (await call('GET', `/v1/outcomes/${st.cp}/objectives?includeInactive=true`)).json()
      .objectives as { id: string; active: boolean }[];
    expect(stillOff.find((o) => o.id === st.tpA)?.active).toBe(false);

    // CP direvisi: lama dinonaktifkan; mengaktifkannya kembali ditolak.
    const revCp = await call('PUT', `/v1/outcomes/${st.cp}`, { phase: 'D', description: 'CP revisi' });
    expect(revCp.json()).toMatchObject({ versioned: true, previousId: st.cp });
    st.cp2 = revCp.json().id;
    const reCp = await call('PUT', `/v1/outcomes/${st.cp}`, {
      phase: 'D',
      description: 'CP awal',
      active: true,
    });
    expect(errOf(reCp)).toEqual([409, 'superseded']);
  });

  it('versi baru ATP memperingatkan item TP nonaktif; publish menolak 400 inactive_objective dengan daftar', async () => {
    const nv = await call('POST', `/v1/learning-flows/${st.flow}/new-version`);
    expect(nv.statusCode).toBe(201);
    expect(nv.json().itemCount).toBe(2);
    expect(nv.json().inactiveItemCount).toBe(2);
    st.draft = nv.json().id;

    const pub = await call('POST', `/v1/learning-flows/${st.draft}/publish`);
    expect(errOf(pub)).toEqual([400, 'inactive_objective']);
    expect(pub.json().error.message).toContain('TP-A');
    expect(pub.json().error.message).toContain('TP-B');

    // Ganti dengan TP aktif milik CP versi baru, lalu terbit.
    const active = (await call('GET', `/v1/outcomes/${st.cp2}/objectives`)).json().objectives as {
      id: string;
    }[];
    expect(active.length).toBeGreaterThan(0);
    const put = await call('PUT', `/v1/learning-flows/${st.draft}`, {
      items: active.map((o) => ({ objectiveId: o.id })),
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().inactiveItemCount).toBe(0);
    expect((await call('POST', `/v1/learning-flows/${st.draft}/publish`)).statusCode).toBe(200);
    st.activeTp = active[0]!.id;
  });

  it('rollover tetap menyalin ATP tetapi memperingatkan item TP nonaktif', async () => {
    // Nonaktifkan satu TP di ATP terbit terbaru (teks tidak berubah: diubah di tempat).
    const tp = (await call('GET', `/v1/outcomes/${st.cp2}/objectives`)).json().objectives as {
      id: string;
      description: string;
      code: string | null;
    }[];
    const target = tp.find((o) => o.id === st.activeTp)!;
    expect(
      (await call('PUT', `/v1/objectives/${target.id}`, { description: target.description, active: false }))
        .statusCode,
    ).toBe(200);
    const res = await call('POST', `/v1/academic-years/${years.t1}/rollover`, {
      targetYearId: years.t2,
      copyClasses: false,
      copyAssignments: false,
      copyCurriculum: false,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().flowsCreated).toBe(1);
    expect(res.json().warningItems).toContainEqual({
      code: 'flow_inactive_objectives',
      params: { flows: 1, items: 1 },
    });
  });
});

/* ---------- 10. kelas bertingkat tak dikenal ---------- */

describe('kelas bertingkat tak dikenal', () => {
  it('GET tanpa saran promote (levelUnknown), PUT promote tanpa toClassId ditolak 400 level_unknown', async () => {
    await mkClass('u1_Z', 'u1', 'ZZ1', 'Z');
    await mkClass('u2_8U', 'u2', '8U', '8');
    await mkStudent('uA', 'u1_Z', 'u1');
    await mkStudent('uB', 'u1_Z', 'u1');
    await mkStudent('uC', 'u1_Z', 'u1');

    const list = (await call('GET', `/v1/academic-years/${years.u1}/promotions`)).json() as {
      classes: { name: string; levelUnknown?: boolean; students: { suggestedDecision: string | null }[] }[];
    };
    const z = list.classes.find((c) => c.name === 'ZZ1')!;
    expect(z.levelUnknown).toBe(true);
    expect(z.students.every((s) => s.suggestedDecision === null)).toBe(true);
    // Kelas bertingkat dikenal: tidak ditandai.
    const known = (await call('GET', `/v1/academic-years/${years.a1}/promotions`)).json() as typeof list;
    expect(known.classes.every((c) => c.levelUnknown === false)).toBe(true);

    const noTarget = await decide('u1', [{ studentId: stu.uA, decision: 'promote' }]);
    expect(errOf(noTarget)).toEqual([400, 'level_unknown']);
    // Dengan kelas tujuan eksplisit atau tinggal kelas tetap diterima.
    expect(
      (await decide('u1', [{ studentId: stu.uA, decision: 'promote', toClassId: cls.u2_8U }])).statusCode,
    ).toBe(200);
    expect((await decide('u1', [{ studentId: stu.uB, decision: 'retain' }])).statusCode).toBe(200);
    // Lulus tetap ditolak: tingkat tak dikenal bukan tingkat akhir.
    expect(errOf(await decide('u1', [{ studentId: stu.uC, decision: 'graduate' }]))).toEqual([
      400,
      'not_final_level',
    ]);
  });

  it('apply: keputusan promote tanpa kelas tujuan untuk tingkat tak dikenal masuk unplaced no_next_level', async () => {
    await db().insert(promotionDecision).values({
      schoolId,
      academicYearId: years.u1!,
      studentId: stu.uC!,
      fromClassId: cls.u1_Z!,
      decision: 'promote',
    });
    const res = await apply('u1', 'u2');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(
      body.unplaced.map((u: { studentId: string; reasonCode: string }) => [u.studentId, u.reasonCode]).sort(),
    ).toEqual(
      [
        [stu.uB, 'no_target_class'], // tinggal kelas di tingkat tak dikenal: tak ada kelas sebaya di tujuan
        [stu.uC, 'no_next_level'],
      ].sort(),
    );
    expect(body.placed).toBe(1); // uA ke kelas eksplisit
    expect(body.retained).toBe(0);
  });
});
