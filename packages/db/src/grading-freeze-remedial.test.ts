import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  academicYear,
  assessment,
  classRoom,
  createDb,
  foundation,
  freezeSemesterGradingConfig,
  gradeComponent,
  gradingSetting,
  learningObjective,
  learningOutcome,
  learningSupport,
  learningSupportObjective,
  learningSupportParticipant,
  readFrozenGradingConfig,
  readLiveGradingConfig,
  school,
  scoreRemedialAttempt,
  semester,
  semesterGradingConfig,
  student,
  subject,
  withTenant,
} from './index';

/**
 * Kebijakan remedial beku dan tabel pendampingan (rancangan fase 3, tahap 3.5, migrasi 0100): `remedial_policy` ditulis SPARSE di
 * salinan beku (hanya bila bukan `record_only`), `config_version` naik ke 2 hanya bila ada isinya, salinan lama dibaca
 * `record_only`, serta CHECK, FK komposit, CASCADE/SET NULL, dan RLS tabel baru.
 */

const platformUrl = process.env.DATABASE_PLATFORM_URL;
const appUrl = process.env.DATABASE_URL;
if (!platformUrl || !appUrl) throw new Error('DATABASE_PLATFORM_URL dan DATABASE_URL wajib diisi');
const platform = createDb(platformUrl);
const tenantDb = createDb(appUrl);
const run = Math.random().toString(36).slice(2, 8);

let foundationId = '';
const schoolIds: string[] = [];

interface W {
  schoolId: string;
  semesterId: string;
  yearId: string;
  subjectId: string;
  classId: string;
  studentId: string;
  objectiveId: string;
  assessmentId: string;
}

async function makeSchool(tag: string): Promise<W> {
  const [s] = await platform.db
    .insert(school)
    .values({ foundationId, slug: `${tag}-${run}`, name: tag })
    .returning();
  const schoolId = s!.id;
  schoolIds.push(schoolId);
  const [y] = await platform.db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30' })
    .returning();
  const [sem] = await platform.db
    .insert(semester)
    .values({ schoolId, academicYearId: y!.id, name: 'Ganjil', startsOn: '2026-07-13', endsOn: '2026-12-20' })
    .returning();
  const [comp] = await platform.db
    .insert(gradeComponent)
    .values({ schoolId, name: 'Tugas', weight: 100, sort: 0 })
    .returning();
  const [sub] = await platform.db.insert(subject).values({ schoolId, code: 'MAT', name: 'Mat' }).returning();
  const [cls] = await platform.db
    .insert(classRoom)
    .values({ schoolId, academicYearId: y!.id, name: '7A', level: '7' })
    .returning();
  const [stu] = await platform.db
    .insert(student)
    .values({ schoolId, name: `Siswa ${tag}`, gender: 'L', status: 'active' })
    .returning();
  const [cp] = await platform.db
    .insert(learningOutcome)
    .values({ schoolId, subjectId: sub!.id, phase: 'D', description: 'CP' })
    .returning();
  const [tp] = await platform.db
    .insert(learningObjective)
    .values({ schoolId, outcomeId: cp!.id, description: 'TP' })
    .returning();
  const [asm] = await platform.db
    .insert(assessment)
    .values({
      schoolId,
      semesterId: sem!.id,
      classId: cls!.id,
      subjectId: sub!.id,
      componentId: comp!.id,
      title: 'T',
      date: '2026-08-01',
    })
    .returning();
  return {
    schoolId,
    semesterId: sem!.id,
    yearId: y!.id,
    subjectId: sub!.id,
    classId: cls!.id,
    studentId: stu!.id,
    objectiveId: tp!.id,
    assessmentId: asm!.id,
  };
}

const freeze = (w: W, overwrite = false) =>
  freezeSemesterGradingConfig(platform.db, {
    schoolId: w.schoolId,
    semesterId: w.semesterId,
    origin: 'manual',
    actorId: null,
    overwrite,
  });
const rowOf = async (semesterId: string) =>
  (
    await platform.db
      .select()
      .from(semesterGradingConfig)
      .where(eq(semesterGradingConfig.semesterId, semesterId))
  )[0]!;
const setPolicy = (w: W, remedialPolicy: string | null) =>
  platform.db
    .insert(gradingSetting)
    .values({ schoolId: w.schoolId, remedialPolicy })
    .onConflictDoUpdate({ target: gradingSetting.schoolId, set: { remedialPolicy } });

const support = (w: W, over: Partial<typeof learningSupport.$inferInsert> = {}) =>
  platform.db
    .insert(learningSupport)
    .values({
      schoolId: w.schoolId,
      semesterId: w.semesterId,
      classId: w.classId,
      subjectId: w.subjectId,
      kind: 'remedial',
      title: 'Remedial 1',
      createdBy: 'uji',
      ...over,
    })
    .returning();

beforeAll(async () => {
  const [f] = await platform.db
    .insert(foundation)
    .values({ name: 'Yayasan Remedial Db', slug: `yremdb-${run}` })
    .returning();
  foundationId = f!.id;
});

afterAll(async () => {
  for (const id of schoolIds) {
    await platform.db.delete(scoreRemedialAttempt).where(eq(scoreRemedialAttempt.schoolId, id));
    await platform.db.delete(learningSupportParticipant).where(eq(learningSupportParticipant.schoolId, id));
    await platform.db.delete(learningSupportObjective).where(eq(learningSupportObjective.schoolId, id));
    await platform.db.delete(learningSupport).where(eq(learningSupport.schoolId, id));
    await platform.db.delete(semesterGradingConfig).where(eq(semesterGradingConfig.schoolId, id));
    await platform.db.delete(assessment).where(eq(assessment.schoolId, id));
    await platform.db.delete(learningObjective).where(eq(learningObjective.schoolId, id));
    await platform.db.delete(learningOutcome).where(eq(learningOutcome.schoolId, id));
    await platform.db.delete(gradingSetting).where(eq(gradingSetting.schoolId, id));
    await platform.db.delete(gradeComponent).where(eq(gradeComponent.schoolId, id));
    await platform.db.delete(student).where(eq(student.schoolId, id));
    await platform.db.delete(subject).where(eq(subject.schoolId, id));
    await platform.db.delete(classRoom).where(eq(classRoom.schoolId, id));
    await platform.db.delete(semester).where(eq(semester.schoolId, id));
    await platform.db.delete(academicYear).where(eq(academicYear.schoolId, id));
    await platform.db.delete(school).where(eq(school.id, id));
  }
  await platform.db.delete(foundation).where(eq(foundation.id, foundationId));
  await platform.pool.end();
  await tenantDb.pool.end();
});

describe('kebijakan remedial beku (sparse)', () => {
  it('tanpa kebijakan atau record_only: v1, kolom NULL, konfigurasi hidup tidak memuat kuncinya', async () => {
    const w = await makeSchool('rem-v1');
    const live = await readLiveGradingConfig(platform.db, w.schoolId);
    expect(Object.keys(live)).not.toContain('remedialPolicy');
    await freeze(w);
    const row = await rowOf(w.semesterId);
    expect([row.configVersion, row.remedialPolicy]).toEqual([1, null]);
    // `record_only` eksplisit juga tidak menulis apa pun (bawaan).
    await setPolicy(w, 'record_only');
    expect(Object.keys(await readLiveGradingConfig(platform.db, w.schoolId))).not.toContain('remedialPolicy');
    await freeze(w, true);
    const again = await rowOf(w.semesterId);
    expect([again.configVersion, again.remedialPolicy]).toEqual([1, null]);
    expect((await readFrozenGradingConfig(platform.db, w.schoolId, w.semesterId))!.remedialPolicy).toBe(
      'record_only',
    );
  });

  it('kebijakan bukan bawaan: versi 2, ikut salinan, terbaca lintas versi; kembali ke bawaan menimpa menjadi NULL', async () => {
    const w = await makeSchool('rem-v2');
    await setPolicy(w, 'cap_at_criteria');
    expect(await readLiveGradingConfig(platform.db, w.schoolId)).toMatchObject({
      remedialPolicy: 'cap_at_criteria',
    });
    await freeze(w);
    const row = await rowOf(w.semesterId);
    expect([row.configVersion, row.remedialPolicy]).toEqual([2, 'cap_at_criteria']);
    expect((await readFrozenGradingConfig(platform.db, w.schoolId, w.semesterId))!.remedialPolicy).toBe(
      'cap_at_criteria',
    );
    // Salinan beku tidak berubah bila konfigurasi hidup diubah tanpa menimpa.
    await setPolicy(w, 'max');
    await freeze(w, false);
    expect((await rowOf(w.semesterId)).remedialPolicy).toBe('cap_at_criteria');
    await setPolicy(w, null);
    await freeze(w, true);
    const after = await rowOf(w.semesterId);
    expect([after.configVersion, after.remedialPolicy]).toEqual([1, null]);
  });

  it('salinan lama (kolom NULL) dibaca sebagai record_only walau konfigurasi hidup memakai kebijakan lain', async () => {
    const w = await makeSchool('rem-lama');
    await freeze(w);
    await setPolicy(w, 'replace_latest');
    const cfg = await readFrozenGradingConfig(platform.db, w.schoolId, w.semesterId);
    expect(cfg).toMatchObject({ configVersion: 1, remedialPolicy: 'record_only' });
  });

  it('CHECK kebijakan pada grading_setting dan semester_grading_config', async () => {
    const w = await makeSchool('rem-ck');
    await expect(setPolicy(w, 'tebak')).rejects.toThrow();
    await freeze(w);
    await expect(
      platform.db
        .update(semesterGradingConfig)
        .set({ remedialPolicy: 'tebak' })
        .where(eq(semesterGradingConfig.semesterId, w.semesterId)),
    ).rejects.toThrow();
  });

  it('T14: pembekuan lewat koneksi platform tidak mencampur kebijakan antar sekolah', async () => {
    const a = await makeSchool('rem-a');
    const b = await makeSchool('rem-b');
    await setPolicy(a, 'max');
    await freeze(a);
    await freeze(b);
    expect((await rowOf(a.semesterId)).remedialPolicy).toBe('max');
    expect((await rowOf(b.semesterId)).remedialPolicy).toBeNull();
  });
});

describe('migrasi 0100: pendampingan dan percobaan remedial', () => {
  it('learning_support: CHECK jenis, judul, tanggal; FK komposit menolak silang sekolah', async () => {
    const a = await makeSchool('ls-a');
    const b = await makeSchool('ls-b');
    await expect(support(a, { kind: 'lain' })).rejects.toThrow();
    await expect(support(a, { title: '' })).rejects.toThrow();
    await expect(support(a, { startsOn: '2026-09-02', endsOn: '2026-09-01' })).rejects.toThrow();
    await expect(
      support(a, { kind: 'enrichment', startsOn: '2026-09-01', endsOn: '2026-09-01' }),
    ).resolves.toBeDefined();
    await expect(support(a, { classId: b.classId })).rejects.toThrow();
    await expect(support(a, { subjectId: b.subjectId })).rejects.toThrow();
    await expect(support(a, { semesterId: b.semesterId })).rejects.toThrow();
    await expect(support(b, { classId: a.classId })).rejects.toThrow();
  });

  it('peserta dan TP sasaran: unik, status valid, FK komposit, CASCADE saat pendampingan dihapus, TP terkait tidak dapat dihapus', async () => {
    const a = await makeSchool('lp-a');
    const b = await makeSchool('lp-b');
    const [s] = await support(a);
    const part = (over: Partial<typeof learningSupportParticipant.$inferInsert> = {}) =>
      platform.db.insert(learningSupportParticipant).values({
        schoolId: a.schoolId,
        supportId: s!.id,
        studentId: a.studentId,
        updatedBy: 'uji',
        ...over,
      });
    await expect(part({ status: 'selesai' })).rejects.toThrow();
    await expect(part({ studentId: b.studentId })).rejects.toThrow();
    await expect(part({ outcomeNote: 'x'.repeat(1001) })).rejects.toThrow();
    await expect(part({ status: 'in_progress' })).resolves.toBeDefined();
    await expect(part()).rejects.toThrow();
    const link = (schoolId: string, objectiveId: string) =>
      platform.db.insert(learningSupportObjective).values({ schoolId, supportId: s!.id, objectiveId });
    await expect(link(a.schoolId, b.objectiveId)).rejects.toThrow();
    await expect(link(b.schoolId, b.objectiveId)).rejects.toThrow();
    await expect(link(a.schoolId, a.objectiveId)).resolves.toBeDefined();
    await expect(
      platform.db.delete(learningObjective).where(eq(learningObjective.id, a.objectiveId)),
    ).rejects.toThrow();
    // Hapus pendampingan menghapus peserta dan TP sasaran (CASCADE).
    await platform.db.delete(learningSupport).where(eq(learningSupport.id, s!.id));
    expect(
      await platform.db
        .select()
        .from(learningSupportParticipant)
        .where(eq(learningSupportParticipant.schoolId, a.schoolId)),
    ).toEqual([]);
    expect(
      await platform.db
        .select()
        .from(learningSupportObjective)
        .where(eq(learningSupportObjective.schoolId, a.schoolId)),
    ).toEqual([]);
  });

  it('score_remedial_attempt: unik, CHECK nomor/nilai, FK komposit, SET NULL pada pendampingan, penilaian tidak dapat dihapus saat ada percobaan', async () => {
    const a = await makeSchool('at-a');
    const b = await makeSchool('at-b');
    const [s] = await support(a);
    const att = (over: Partial<typeof scoreRemedialAttempt.$inferInsert> = {}) =>
      platform.db.insert(scoreRemedialAttempt).values({
        schoolId: a.schoolId,
        assessmentId: a.assessmentId,
        studentId: a.studentId,
        attemptNo: 1,
        value: 80,
        takenOn: '2026-09-01',
        recordedBy: 'uji',
        ...over,
      });
    await expect(att({ attemptNo: 0 })).rejects.toThrow();
    await expect(att({ attemptNo: 21 })).rejects.toThrow();
    await expect(att({ value: -1 })).rejects.toThrow();
    await expect(att({ note: 'x'.repeat(501) })).rejects.toThrow();
    await expect(att({ assessmentId: b.assessmentId })).rejects.toThrow();
    await expect(att({ studentId: b.studentId })).rejects.toThrow();
    await expect(att({ supportId: (await support(b))[0]!.id })).rejects.toThrow();
    await expect(att({ value: null, supportId: s!.id })).resolves.toBeDefined();
    await expect(att()).rejects.toThrow(); // attempt_no 1 sudah ada
    await expect(att({ attemptNo: 2 })).resolves.toBeDefined();
    // Penilaian dengan percobaan tidak dapat dihapus (NO ACTION; rute menghapus percobaan lebih dulu).
    await expect(platform.db.delete(assessment).where(eq(assessment.id, a.assessmentId))).rejects.toThrow();
    // Hapus pendampingan melepas tautan saja; percobaan dan school_id tetap.
    await platform.db.delete(learningSupport).where(eq(learningSupport.id, s!.id));
    const rows = await platform.db
      .select()
      .from(scoreRemedialAttempt)
      .where(eq(scoreRemedialAttempt.schoolId, a.schoolId));
    expect(rows.map((r) => [r.attemptNo, r.supportId, r.schoolId])).toEqual(
      expect.arrayContaining([
        [1, null, a.schoolId],
        [2, null, a.schoolId],
      ]),
    );
  });

  it('RLS: konteks tenant hanya melihat dan menulis barisnya sendiri', async () => {
    const a = await makeSchool('rls-a');
    const b = await makeSchool('rls-b');
    const [s] = await support(a);
    await platform.db.insert(learningSupportParticipant).values({
      schoolId: a.schoolId,
      supportId: s!.id,
      studentId: a.studentId,
      updatedBy: 'uji',
    });
    await platform.db.insert(learningSupportObjective).values({
      schoolId: a.schoolId,
      supportId: s!.id,
      objectiveId: a.objectiveId,
    });
    await platform.db.insert(scoreRemedialAttempt).values({
      schoolId: a.schoolId,
      assessmentId: a.assessmentId,
      studentId: a.studentId,
      attemptNo: 1,
      value: 70,
      takenOn: '2026-09-01',
      recordedBy: 'uji',
    });
    const read = (id: string) =>
      withTenant(tenantDb.db, [id], async (tx) => [
        await tx.select().from(learningSupport),
        await tx.select().from(learningSupportObjective),
        await tx.select().from(learningSupportParticipant),
        await tx.select().from(scoreRemedialAttempt),
      ]);
    expect((await read(b.schoolId)).map((r) => r.length)).toEqual([0, 0, 0, 0]);
    expect((await read(a.schoolId)).map((r) => r.length)).toEqual([1, 1, 1, 1]);
    // Tenant B tidak dapat menulis baris untuk sekolah A (WITH CHECK).
    await expect(
      withTenant(tenantDb.db, [b.schoolId], (tx) =>
        tx.insert(learningSupport).values({
          schoolId: a.schoolId,
          semesterId: a.semesterId,
          classId: a.classId,
          subjectId: a.subjectId,
          kind: 'remedial',
          title: 'x',
          createdBy: 'uji',
        }),
      ),
    ).rejects.toThrow();
  });
});
