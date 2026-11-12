import {
  academicYear,
  assignRoles,
  classRoom,
  curriculumSubjectAllocation,
  enrollment,
  eq,
  foundation,
  member,
  promotionDecision,
  school,
  schoolLevel,
  seedSchoolRoles,
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
 * Fase 2C: koreksi hasil verifikasi regulasi. K1 kelompok mapel acuan, K2 JP kokurikuler dan konfigurasi per tingkat,
 * K3 tingkat akhir per program (SMK 3 dan 4 tahun), K4 catatan keputusan kenaikan dan tanpa saran lulus otomatis.
 * (K5 diuji di grading.test.ts dan contracts, K7 di promotion.test.ts.)
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let foundationId = '';
const userIds: string[] = [];
let adminCookie = '';
let teacherCookie = '';

const years = {} as Record<'y1' | 'y2', string>;
const cls = {} as Record<string, string>;
const stu = {} as Record<string, string>;
const prog = {} as Record<'tkj3' | 'rpl4', string>;
const levelIds = {} as Record<string, string>;
let subjectId = '';

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

async function member_(label: string, sid: string, roles: string[]) {
  const u = await makeUser(label);
  const [m] = await app.platformDb.insert(member).values({ userId: u.id, schoolId: sid }).returning();
  await assignRoles(app.platformDb, m!.id, sid, roles);
  return login(u.email);
}

const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, cookie: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: {
      ...(cookie ? { cookie } : {}),
      'x-school-id': schoolId,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

const db = () => app.platformDb;

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Koreksi', slug: `yko-${run}` })
    .returning();
  foundationId = f!.id;
  const [s] = await db()
    .insert(school)
    .values({ foundationId, slug: `ko-${run}`, name: `ko-${run}` })
    .returning();
  schoolId = s!.id;
  await seedSchoolRoles(db(), schoolId);

  // SMK dengan tingkat X-XIII dalam satu sekolah: program 3 tahun (final XII) dan 4 tahun (final XIII).
  const lv = await db()
    .insert(schoolLevel)
    .values(
      ['X', 'XI', 'XII', 'XIII'].map((code, i) => ({ schoolId, code, label: `Kelas ${code}`, sort: i + 1 })),
    )
    .returning();
  for (const l of lv) levelIds[l.code] = l.id;

  const mkYear = async (key: 'y1' | 'y2', name: string, startsOn: string, endsOn: string) => {
    const [y] = await db()
      .insert(academicYear)
      .values({ schoolId, name, startsOn, endsOn, isActive: key === 'y1' })
      .returning();
    years[key] = y!.id;
  };
  await mkYear('y1', '2026/2027', '2026-07-13', '2027-06-30');
  await mkYear('y2', '2027/2028', '2027-07-12', '2028-06-30');

  adminCookie = await member_('admin-koreksi', schoolId, ['school_admin']);
  teacherCookie = await member_('guru-koreksi', schoolId, ['teacher']);
});

afterAll(async () => {
  for (const table of [
    'audit_log',
    'promotion_decision',
    'curriculum_subject_allocation',
    'enrollment',
    'student',
    'class_room',
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

describe('K1 kelompok mapel acuan', () => {
  it('GET /v1/reference/subject-groups: acuan awal beserta kunci lama; guru boleh baca', async () => {
    const res = await call('GET', '/v1/reference/subject-groups', teacherCookie);
    expect(res.statusCode).toBe(200);
    const groups = res.json().groups as {
      key: string;
      labelId: string;
      labelEn: string;
      labelSu: string;
      profileKeys: string[] | null;
      sort: number;
    }[];
    const keys = groups.map((g) => g.key);
    for (const k of [
      'general',
      'vocational_base',
      'vocational_concentration',
      'vocational_project',
      'elective',
      'internship',
      'religion',
      'vocational',
      'pai_arabic',
      'program_strengthening',
      'local_content',
      'arts_craft',
    ]) {
      expect(keys, k).toContain(k);
    }
    expect(groups.find((g) => g.key === 'religion')?.labelId).toBe('Pendidikan Agama dan Budi Pekerti');
    expect(groups.find((g) => g.key === 'pai_arabic')?.profileKeys).toEqual(['mi', 'mts', 'ma', 'mak']);
    expect(groups.find((g) => g.key === 'program_strengthening')?.profileKeys).toEqual(['ma', 'mak']);
    expect(groups.find((g) => g.key === 'general')?.profileKeys).toBeNull();
    expect(groups.every((g) => g.labelEn !== '' && g.labelSu !== '')).toBe(true);
    expect(groups.map((g) => g.sort)).toEqual([...groups.map((g) => g.sort)].sort((a, b) => a - b));
    expect((await call('GET', '/v1/reference/subject-groups', '')).statusCode).toBe(401);
  });

  it('tabel acuan tidak ber-RLS dan tidak punya school_id (seperti ref_education_profile)', async () => {
    const rows = (
      await db().execute(sql`
        select c.relname, c.relrowsecurity,
          exists (select 1 from information_schema.columns k
                  where k.table_name = c.relname and k.column_name = 'school_id') as has_school
        from pg_class c where c.relname in ('ref_subject_group', 'ref_education_profile')
        order by c.relname`)
    ).rows as { relname: string; relrowsecurity: boolean; has_school: boolean }[];
    expect(rows).toEqual([
      { relname: 'ref_education_profile', relrowsecurity: false, has_school: false },
      { relname: 'ref_subject_group', relrowsecurity: false, has_school: false },
    ]);
  });

  it('mapel menerima kelompok baru, jenis, dan varian agama; bawaan kind = compulsory', async () => {
    const plain = await call('POST', '/v1/subjects', adminCookie, { code: `P-${run}`, name: 'Biasa' });
    expect(plain.statusCode).toBe(201);
    expect(plain.json()).toMatchObject({ kind: 'compulsory', religionVariant: null, subjectGroup: null });

    const agama = await call('POST', '/v1/subjects', adminCookie, {
      code: `AG-${run}`,
      name: 'Pendidikan Agama Islam dan Budi Pekerti',
      subjectGroup: 'religion',
      kind: 'compulsory',
      religionVariant: 'islam',
    });
    expect(agama.statusCode).toBe(201);
    expect(agama.json()).toMatchObject({
      subjectGroup: 'religion',
      kind: 'compulsory',
      religionVariant: 'islam',
    });
    subjectId = agama.json().id;

    // PUT gaya lama (tanpa field baru) tidak menimpa.
    const old = await call('PUT', `/v1/subjects/${subjectId}`, adminCookie, {
      code: `AG-${run}`,
      name: 'PAI dan Budi Pekerti',
    });
    expect(old.json()).toMatchObject({
      subjectGroup: 'religion',
      kind: 'compulsory',
      religionVariant: 'islam',
    });

    const elective = await call('PUT', `/v1/subjects/${subjectId}`, adminCookie, {
      code: `AG-${run}`,
      name: 'PAI dan Budi Pekerti',
      kind: 'elective',
      religionVariant: null,
      subjectGroup: 'arts_craft',
    });
    expect(elective.json()).toMatchObject({
      kind: 'elective',
      religionVariant: null,
      subjectGroup: 'arts_craft',
    });
  });

  it('kelompok lama tetap sah; kelompok, jenis, dan varian tak dikenal ditolak 400', async () => {
    const legacy = await call('POST', '/v1/subjects', adminCookie, {
      code: `LG-${run}`,
      name: 'Lama',
      subjectGroup: 'vocational_base',
    });
    expect(legacy.statusCode).toBe(201);
    expect(legacy.json().subjectGroup).toBe('vocational_base');

    const badGroup = await call('POST', '/v1/subjects', adminCookie, {
      code: `BG-${run}`,
      name: 'X',
      subjectGroup: 'lainnya',
    });
    expect([badGroup.statusCode, badGroup.json().error.code]).toEqual([400, 'invalid_subject_group']);
    const badPut = await call('PUT', `/v1/subjects/${subjectId}`, adminCookie, {
      code: `AG-${run}`,
      name: 'X',
      subjectGroup: 'lainnya',
    });
    expect([badPut.statusCode, badPut.json().error.code]).toEqual([400, 'invalid_subject_group']);
    expect(
      (await call('POST', '/v1/subjects', adminCookie, { code: `BK-${run}`, name: 'X', kind: 'optional' }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await call('POST', '/v1/subjects', adminCookie, {
          code: `BV-${run}`,
          name: 'X',
          religionVariant: 'x',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', '/v1/subjects', teacherCookie, { code: `BT-${run}`, name: 'X' })).statusCode,
    ).toBe(403);
  });

  it('database menolak kelompok tak dikenal lewat FK', async () => {
    // Kode galat Postgres spesifik: 23503 = foreign_key_violation (bukan sembarang galat).
    const err = await db()
      .insert(subject)
      .values({ schoolId, code: `FK-${run}`, name: 'FK', subjectGroup: 'tak-ada' })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).not.toBeNull();
    const pg = err as { code?: string; cause?: { code?: string } };
    expect(pg.cause?.code ?? pg.code).toBe('23503');
  });
});

describe('K2 JP intrakurikuler/kokurikuler dan konfigurasi per tingkat', () => {
  it('menit per JP dan minggu efektif per tingkat: simpan, pertahankan, kosongkan, validasi', async () => {
    const id = levelIds.X!;
    const put = (body: object) => call('PUT', `/v1/school/levels/${id}`, adminCookie, body);
    const first = await put({ label: 'Kelas X', sort: 1, periodMinutes: 45, effectiveWeeks: 36 });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ code: 'X', periodMinutes: 45, effectiveWeeks: 36 });

    // Klien lama: tanpa field baru, nilai tidak berubah.
    expect((await put({ label: 'Kelas X', sort: 1 })).json()).toMatchObject({
      periodMinutes: 45,
      effectiveWeeks: 36,
    });
    const list = (await call('GET', '/v1/school/levels', teacherCookie)).json() as {
      code: string;
      periodMinutes: number | null;
      effectiveWeeks: number | null;
    }[];
    expect(list.find((l) => l.code === 'X')).toMatchObject({ periodMinutes: 45, effectiveWeeks: 36 });
    expect(list.find((l) => l.code === 'XI')).toMatchObject({ periodMinutes: null, effectiveWeeks: null });

    expect((await put({ label: 'Kelas X', sort: 1, periodMinutes: 0 })).statusCode).toBe(400);
    expect((await put({ label: 'Kelas X', sort: 1, effectiveWeeks: -1 })).statusCode).toBe(400);
    const cleared = await put({ label: 'Kelas X', sort: 1, periodMinutes: null });
    expect(cleared.json()).toMatchObject({ periodMinutes: null, effectiveWeeks: 36 });
  });

  it('alokasi: kokurikuler dan minggu disimpan; dihilangkan = dipertahankan; semua kosong = dihapus', async () => {
    const url = `/v1/academic-years/${years.y1}/curriculum/allocations`;
    const row = { levelCode: 'XII', subjectId };
    const saved = await call('PUT', url, adminCookie, {
      allocations: [
        { ...row, weeklyPeriods: 3, yearlyPeriods: 108, cocurricularYearlyPeriods: 36, weeks: 22 },
      ],
    });
    expect(saved.json()).toEqual({ upserted: 1, deleted: 0 });
    const get = async () =>
      ((await call('GET', url, teacherCookie)).json().allocations as Record<string, unknown>[]).filter(
        (a) => a.subjectId === subjectId,
      );
    expect(await get()).toMatchObject([
      { weeklyPeriods: 3, yearlyPeriods: 108, cocurricularYearlyPeriods: 36, weeks: 22 },
    ]);

    // Klien lama mengirim hanya weekly/yearly: kokurikuler dan minggu tidak hilang.
    await call('PUT', url, adminCookie, { allocations: [{ ...row, weeklyPeriods: 4, yearlyPeriods: 144 }] });
    expect(await get()).toMatchObject([
      { weeklyPeriods: 4, yearlyPeriods: 144, cocurricularYearlyPeriods: 36, weeks: 22 },
    ]);

    // Baris yang hanya berisi kokurikuler tetap disimpan (bukan baris kosong).
    const onlyCo = await call('PUT', url, adminCookie, {
      allocations: [
        { ...row, weeklyPeriods: null, yearlyPeriods: null, cocurricularYearlyPeriods: 36, weeks: null },
      ],
    });
    expect(onlyCo.json()).toEqual({ upserted: 1, deleted: 0 });
    expect(await get()).toMatchObject([
      { weeklyPeriods: null, yearlyPeriods: null, cocurricularYearlyPeriods: 36, weeks: null },
    ]);

    // Nilai negatif ditolak.
    const neg = await call('PUT', url, adminCookie, { allocations: [{ ...row, weeks: -1 }] });
    expect(neg.statusCode).toBe(400);

    // Semua kosong (termasuk field baru) -> dihapus.
    const empty = await call('PUT', url, adminCookie, {
      allocations: [
        { ...row, weeklyPeriods: null, yearlyPeriods: null, cocurricularYearlyPeriods: null, weeks: null },
      ],
    });
    expect(empty.json()).toEqual({ upserted: 0, deleted: 1 });
    expect(await get()).toEqual([]);
  });

  it('rollover menyalin kolom baru alokasi', async () => {
    const url = `/v1/academic-years/${years.y1}/curriculum/allocations`;
    await call('PUT', url, adminCookie, {
      allocations: [
        { levelCode: 'XIII', subjectId, yearlyPeriods: 200, cocurricularYearlyPeriods: 40, weeks: 18 },
      ],
    });
    const res = await call('POST', `/v1/academic-years/${years.y1}/rollover`, adminCookie, {
      targetYearId: years.y2,
      copyClasses: false,
      copyAssignments: false,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().allocationsCreated).toBe(1);
    const copied = await db()
      .select()
      .from(curriculumSubjectAllocation)
      .where(eq(curriculumSubjectAllocation.academicYearId, years.y2));
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatchObject({
      levelCode: 'XIII',
      yearlyPeriods: 200,
      cocurricularYearlyPeriods: 40,
      weeks: 18,
    });
    await db()
      .delete(curriculumSubjectAllocation)
      .where(eq(curriculumSubjectAllocation.academicYearId, years.y2));
  });

  it('GET /v1/education-profiles mengembalikan saran menit per JP (bukan nilai tersimpan)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/education-profiles' });
    expect(res.statusCode).toBe(200);
    const byKey = new Map(
      (
        res.json() as {
          key: string;
          suggestedPeriodMinutes: number | null;
          suggestedEffectiveWeeks: number;
        }[]
      ).map((p) => [p.key, p]),
    );
    expect(byKey.get('sd')?.suggestedPeriodMinutes).toBe(35);
    expect(byKey.get('mts')?.suggestedPeriodMinutes).toBe(40);
    expect(byKey.get('smk')?.suggestedPeriodMinutes).toBe(45);
    expect(byKey.get('smk')?.suggestedEffectiveWeeks).toBe(36);
  });
});

describe('K3 tingkat akhir per program: SMK 4 tahun (XIII) dan 3 tahun (XII) di satu sekolah', () => {
  it('CRUD program menerima durationYears dan finalLevelCode (opsional, kompatibel mundur)', async () => {
    const old = await call('POST', '/v1/programs', adminCookie, { code: `OLD-${run}`, name: 'Program lama' });
    expect(old.statusCode).toBe(201);
    expect(old.json()).toMatchObject({ durationYears: null, finalLevelCode: null });

    const tkj = await call('POST', '/v1/programs', adminCookie, {
      code: `TKJ-${run}`,
      name: 'TKJ 3 tahun',
      durationYears: 3,
      finalLevelCode: 'XII',
    });
    expect(tkj.statusCode).toBe(201);
    expect(tkj.json()).toMatchObject({ durationYears: 3, finalLevelCode: 'XII' });
    prog.tkj3 = tkj.json().id;
    const rpl = await call('POST', '/v1/programs', adminCookie, {
      code: `RPL-${run}`,
      name: 'RPL 4 tahun',
      durationYears: 4,
      finalLevelCode: 'XIII',
    });
    prog.rpl4 = rpl.json().id;

    // PUT gaya lama tidak menimpa; null mengosongkan; durasi tak sah ditolak.
    const renamed = await call('PUT', `/v1/programs/${prog.rpl4}`, adminCookie, {
      code: `RPL-${run}`,
      name: 'RPL',
    });
    expect(renamed.json()).toMatchObject({ name: 'RPL', durationYears: 4, finalLevelCode: 'XIII' });
    expect(
      (await call('POST', '/v1/programs', adminCookie, { code: `X5-${run}`, name: 'X', durationYears: 5 }))
        .statusCode,
    ).toBe(400);
    const cleared = await call('PUT', `/v1/programs/${old.json().id}`, adminCookie, {
      code: `OLD-${run}`,
      name: 'Program lama',
      durationYears: null,
      finalLevelCode: null,
    });
    expect(cleared.json()).toMatchObject({ durationYears: null, finalLevelCode: null });
    const list = (await call('GET', '/v1/programs', teacherCookie)).json() as {
      id: string;
      finalLevelCode: string | null;
    }[];
    expect(list.find((p) => p.id === prog.tkj3)?.finalLevelCode).toBe('XII');
  });

  it('kelas dan siswa disiapkan; daftar kenaikan memakai tingkat akhir program', async () => {
    const mkClass = async (key: string, name: string, level: string, programId: string) => {
      const [c] = await db()
        .insert(classRoom)
        .values({ schoolId, academicYearId: years.y1, name, level, programId })
        .returning();
      cls[key] = c!.id;
    };
    await mkClass('xi_tkj', 'XI-TKJ', 'XI', prog.tkj3);
    await mkClass('xii_tkj', 'XII-TKJ', 'XII', prog.tkj3);
    await mkClass('xii_rpl', 'XII-RPL', 'XII', prog.rpl4);
    await mkClass('xiii_rpl', 'XIII-RPL', 'XIII', prog.rpl4);
    for (const [key, c] of [
      ['a', 'xi_tkj'],
      ['b', 'xii_tkj'],
      ['c', 'xii_rpl'],
      ['d', 'xiii_rpl'],
      ['e', 'xii_tkj'],
    ] as const) {
      const [s] = await db()
        .insert(student)
        .values({ schoolId, name: `Siswa ${key}`, gender: 'L', nis: `${key}-${run}` })
        .returning();
      stu[key] = s!.id;
      await db()
        .insert(enrollment)
        .values({ schoolId, studentId: s!.id, classId: cls[c]!, academicYearId: years.y1 });
    }

    const res = await call('GET', `/v1/academic-years/${years.y1}/promotions`, adminCookie);
    expect(res.statusCode).toBe(200);
    const byName = new Map(
      (
        res.json().classes as {
          name: string;
          nextLevel: string | null;
          isFinalLevel: boolean;
          students: { suggestedDecision: string | null }[];
        }[]
      ).map((c) => [c.name, c]),
    );
    expect(byName.get('XII-TKJ')).toMatchObject({ isFinalLevel: true, nextLevel: null });
    expect(byName.get('XII-TKJ')?.students[0]?.suggestedDecision).toBeNull();
    expect(byName.get('XII-RPL')).toMatchObject({ isFinalLevel: false, nextLevel: 'XIII' });
    expect(byName.get('XII-RPL')?.students[0]?.suggestedDecision).toBe('promote');
    expect(byName.get('XIII-RPL')).toMatchObject({ isFinalLevel: true, nextLevel: null });
    expect(byName.get('XI-TKJ')).toMatchObject({ isFinalLevel: false, nextLevel: 'XII' });
  });

  it('keputusan: lulus hanya di tingkat akhir program, naik tidak dari tingkat akhir program', async () => {
    const put = (decisions: object[]) =>
      call('PUT', `/v1/academic-years/${years.y1}/promotions`, adminCookie, { decisions });
    const gradXiiRpl = await put([{ studentId: stu.c, decision: 'graduate' }]);
    expect([gradXiiRpl.statusCode, gradXiiRpl.json().error.code]).toEqual([400, 'not_final_level']);
    const promXiiTkj = await put([{ studentId: stu.b, decision: 'promote' }]);
    expect([promXiiTkj.statusCode, promXiiTkj.json().error.code]).toEqual([400, 'not_final_level']);
    const promXiiiRpl = await put([{ studentId: stu.d, decision: 'promote' }]);
    expect(promXiiiRpl.json().error.code).toBe('not_final_level');

    expect(
      (
        await put([
          { studentId: stu.c, decision: 'promote' },
          { studentId: stu.b, decision: 'graduate' },
          { studentId: stu.d, decision: 'graduate' },
          { studentId: stu.a, decision: 'promote' },
        ])
      ).json(),
    ).toEqual({ saved: 4 });
  });

  it('rollover: kelas tingkat akhir program tidak disalin, yang lain naik; tanpa kalender bawaan', async () => {
    const res = await call('POST', `/v1/academic-years/${years.y1}/rollover`, adminCookie, {
      targetYearId: years.y2,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const created = await db().select().from(classRoom).where(eq(classRoom.academicYearId, years.y2));
    expect(created.map((c) => `${c.name}:${c.level}`).sort()).toEqual(['XII-TKJ:XII', 'XIII-RPL:XIII']);
    // XII-TKJ (final 3 tahun) dan XIII-RPL (final 4 tahun) tidak disalin.
    expect(body.warningItems).toContainEqual({ code: 'final_level_not_copied', params: { count: 2 } });
    expect(body.eventsCreated).toBe(0);
  });

  it('penerapan: naik ke XIII untuk program 4 tahun, lulus hanya yang ditetapkan eksplisit', async () => {
    const res = await call('POST', `/v1/academic-years/${years.y1}/promotions/apply`, adminCookie, {
      targetYearId: years.y2,
    });
    expect(res.statusCode).toBe(200);
    // a: XI-TKJ -> XII-TKJ; c: XII-RPL -> XIII-RPL; b dan d lulus; e (XII-TKJ, tanpa keputusan) dilewati.
    expect(res.json()).toMatchObject({
      placed: 2,
      graduated: 2,
      retained: 0,
      unplaced: [],
      skippedNoDecision: 1,
    });
    const classes = new Map((await db().select().from(classRoom)).map((c) => [c.id, c.name]));
    const placed = new Map(
      (await db().select().from(enrollment).where(eq(enrollment.academicYearId, years.y2))).map((e) => [
        e.studentId,
        classes.get(e.classId),
      ]),
    );
    expect(placed.get(stu.a!)).toBe('XII-TKJ');
    expect(placed.get(stu.c!)).toBe('XIII-RPL');
    const status = async (id: string) =>
      (await db().select({ s: student.status }).from(student).where(eq(student.id, id)))[0]?.s;
    expect(await status(stu.b!)).toBe('graduated');
    expect(await status(stu.d!)).toBe('graduated');
    expect(await status(stu.e!)).toBe('active');
  });
});

describe('K4 catatan keputusan kenaikan kelas', () => {
  it('reason, followUp, meetingDate disimpan, dikembalikan, dipertahankan bila dihilangkan, dan dikosongkan dengan null', async () => {
    // Tahun y2: siswa a (XII-TKJ) tinggal kelas dengan catatan lengkap.
    const [dest] = await db().select().from(classRoom).where(eq(classRoom.academicYearId, years.y2));
    expect(dest).toBeDefined();
    const url = `/v1/academic-years/${years.y2}/promotions`;
    const saved = await call('PUT', url, adminCookie, {
      decisions: [
        {
          studentId: stu.a,
          decision: 'retain',
          reason: 'Belum menuntaskan sebagian besar mata pelajaran.',
          followUp: 'Remedial dan pendampingan wali kelas.',
          meetingDate: '2027-06-20',
        },
      ],
    });
    expect(saved.json()).toEqual({ saved: 1 });
    const student_ = async () => {
      const body = (await call('GET', url, adminCookie)).json() as {
        classes: { students: { studentId: string; [k: string]: unknown }[] }[];
      };
      return body.classes.flatMap((c) => c.students).find((s) => s.studentId === stu.a);
    };
    expect(await student_()).toMatchObject({
      decision: 'retain',
      reason: 'Belum menuntaskan sebagian besar mata pelajaran.',
      followUp: 'Remedial dan pendampingan wali kelas.',
      meetingDate: '2027-06-20',
    });

    // Field yang tidak dikirim DIPERTAHANKAN (sebelumnya terhapus diam-diam: perilaku keliru; lihat review-fixes.test.ts).
    await call('PUT', url, adminCookie, {
      decisions: [{ studentId: stu.a, decision: 'retain', note: 'ok' }],
    });
    expect(await student_()).toMatchObject({
      decision: 'retain',
      note: 'ok',
      reason: 'Belum menuntaskan sebagian besar mata pelajaran.',
      followUp: 'Remedial dan pendampingan wali kelas.',
      meetingDate: '2027-06-20',
    });
    // null eksplisit mengosongkan.
    await call('PUT', url, adminCookie, {
      decisions: [{ studentId: stu.a, decision: 'retain', reason: null, followUp: null, meetingDate: null }],
    });
    expect(await student_()).toMatchObject({
      decision: 'retain',
      note: 'ok',
      reason: null,
      followUp: null,
      meetingDate: null,
    });

    const bad = await call('PUT', url, adminCookie, {
      decisions: [{ studentId: stu.a, decision: 'retain', meetingDate: '20-06-2027' }],
    });
    expect(bad.statusCode).toBe(400);
    const tooLong = await call('PUT', url, adminCookie, {
      decisions: [{ studentId: stu.a, decision: 'retain', reason: 'x'.repeat(1001) }],
    });
    expect(tooLong.statusCode).toBe(400);

    const [row] = await db().select().from(promotionDecision).where(eq(promotionDecision.studentId, stu.a!));
    expect(row?.reason).toBeNull();
  });

  it('retain tidak menghapus enrollment lama dan riwayat rombel tetap utuh (C5)', async () => {
    // Siswa a punya enrollment y1 (XI-TKJ) dan y2 (XII-TKJ). Menjadikan keputusan tinggal kelas tidak menghapus keduanya.
    const url = `/v1/academic-years/${years.y2}/promotions`;
    await call('PUT', url, adminCookie, { decisions: [{ studentId: stu.a, decision: 'retain' }] });
    const enrolls = await db().select().from(enrollment).where(eq(enrollment.studentId, stu.a!));
    expect(enrolls.map((e) => e.academicYearId).sort()).toEqual([years.y1, years.y2].sort());
  });
});
