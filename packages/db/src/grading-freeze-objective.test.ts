import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  academicYear,
  achievementCriteria,
  achievementRubricLevel,
  assessment,
  assessmentObjective,
  classRoom,
  createDb,
  foundation,
  freezeSemesterGradingConfig,
  gradeComponent,
  gradingSetting,
  learningObjective,
  learningOutcome,
  readFrozenGradingConfig,
  readLiveGradingConfig,
  school,
  semester,
  semesterGradingConfig,
  student,
  studentObjectiveAchievement,
  subject,
  withTenant,
} from './index';

/**
 * Pembekuan kriteria TP dan agregasi (rancangan fase 3, tahap 3.3, migrasi 0098): kolom `objective_criteria` dan
 * `objective_aggregation` ditulis SPARSE dan TERPISAH dari `criteria`, `config_version` naik ke 2 hanya bila ada isi tahap 3.3,
 * salinan lama dibaca sebagai bawaan, salinan tidak mencampur sekolah, dan CHECK/FK komposit/RLS tabel baru.
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
  componentId: string;
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
    componentId: comp!.id,
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

async function addObjectiveCriteria(w: W, threshold = 70) {
  const [c] = await platform.db
    .insert(achievementCriteria)
    .values({
      schoolId: w.schoolId,
      subjectId: w.subjectId,
      objectiveId: w.objectiveId,
      mode: 'interval',
      threshold: null,
    })
    .returning();
  await platform.db.insert(achievementRubricLevel).values([
    {
      schoolId: w.schoolId,
      criteriaId: c!.id,
      label: 'Belum',
      minScore: 0,
      maxScore: threshold - 0.01,
      isAchieved: false,
      sortOrder: 0,
    },
    {
      schoolId: w.schoolId,
      criteriaId: c!.id,
      label: 'Tercapai',
      minScore: threshold,
      maxScore: 100,
      isAchieved: true,
      sortOrder: 1,
    },
  ]);
  return c!.id;
}

beforeAll(async () => {
  const [f] = await platform.db
    .insert(foundation)
    .values({ name: 'Yayasan Objektif Db', slug: `yobjdb-${run}` })
    .returning();
  foundationId = f!.id;
});

afterAll(async () => {
  for (const id of schoolIds) {
    await platform.db.delete(studentObjectiveAchievement).where(eq(studentObjectiveAchievement.schoolId, id));
    await platform.db.delete(assessmentObjective).where(eq(assessmentObjective.schoolId, id));
    await platform.db.delete(semesterGradingConfig).where(eq(semesterGradingConfig.schoolId, id));
    await platform.db.delete(achievementRubricLevel).where(eq(achievementRubricLevel.schoolId, id));
    await platform.db.delete(achievementCriteria).where(eq(achievementCriteria.schoolId, id));
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

describe('penulisan sparse', () => {
  it('tanpa kriteria TP dan agregasi bawaan: v1, kolom bawaan, konfigurasi hidup tidak memuat kunci baru', async () => {
    const w = await makeSchool('obj-v1');
    const live = await readLiveGradingConfig(platform.db, w.schoolId);
    expect(Object.keys(live).sort()).toEqual(
      ['calculationMode', 'components', 'criteria', 'kkm', 'predicateA', 'predicateB', 'predicateC'].sort(),
    );
    expect(await freeze(w)).toBe(true);
    const row = await rowOf(w.semesterId);
    expect(row.configVersion).toBe(1);
    expect(row.objectiveCriteria).toEqual([]);
    expect(row.objectiveAggregation).toBeNull();
    // Agregasi 'mean' eksplisit juga tidak menulis apa pun (bawaan).
    await platform.db.insert(gradingSetting).values({ schoolId: w.schoolId, objectiveAggregation: 'mean' });
    expect(Object.keys(await readLiveGradingConfig(platform.db, w.schoolId))).not.toContain(
      'objectiveAggregation',
    );
    await freeze(w, true);
    const again = await rowOf(w.semesterId);
    expect([again.configVersion, again.objectiveAggregation]).toEqual([1, null]);
  });

  it('kriteria ber-TP masuk `objective_criteria`, BUKAN `criteria`; versi 2; terbaca lintas versi', async () => {
    const w = await makeSchool('obj-v2');
    const id = await addObjectiveCriteria(w, 65);
    // Satu kriteria tingkat mapel juga ada: tetap di `criteria`.
    await platform.db
      .insert(achievementCriteria)
      .values({ schoolId: w.schoolId, subjectId: w.subjectId, mode: 'numeric', threshold: 60 });
    await freeze(w);
    const row = await rowOf(w.semesterId);
    expect(row.configVersion).toBe(2);
    expect((row.criteria as { objectiveId: unknown }[]).map((c) => c.objectiveId)).toEqual([null]);
    const oc = row.objectiveCriteria as { id: string; objectiveId: string; levels: unknown[] }[];
    expect(oc.map((c) => [c.id, c.objectiveId, c.levels.length])).toEqual([[id, w.objectiveId, 2]]);
    const cfg = await readFrozenGradingConfig(platform.db, w.schoolId, w.semesterId);
    expect(cfg!.objectiveCriteria.map((c) => c.objectiveId)).toEqual([w.objectiveId]);
    expect(cfg!.criteria).toHaveLength(1);
    expect(cfg!.objectiveAggregation).toBe('mean');
    // Konfigurasi hidup sama dengan salinan (jsonb round-trip).
    const live = await readLiveGradingConfig(platform.db, w.schoolId);
    expect(JSON.parse(JSON.stringify(live.objectiveCriteria))).toEqual(row.objectiveCriteria);
    // Kriteria dinonaktifkan lalu menimpa: kembali v1 dan '[]' (kolom ditimpa eksplisit, bukan dibiarkan).
    await platform.db
      .update(achievementCriteria)
      .set({ active: false })
      .where(eq(achievementCriteria.id, id));
    await freeze(w, true);
    const after = await rowOf(w.semesterId);
    expect(after.objectiveCriteria).toEqual([]);
    expect(after.configVersion).toBe(1);
  });

  it('agregasi bukan bawaan: versi 2 dan ikut salinan; kembali ke bawaan menimpa menjadi NULL', async () => {
    const w = await makeSchool('obj-agg');
    await platform.db.insert(gradingSetting).values({ schoolId: w.schoolId, objectiveAggregation: 'latest' });
    await freeze(w);
    const row = await rowOf(w.semesterId);
    expect([row.configVersion, row.objectiveAggregation]).toEqual([2, 'latest']);
    expect((await readFrozenGradingConfig(platform.db, w.schoolId, w.semesterId))!.objectiveAggregation).toBe(
      'latest',
    );
    await platform.db
      .update(gradingSetting)
      .set({ objectiveAggregation: null })
      .where(eq(gradingSetting.schoolId, w.schoolId));
    await freeze(w, true);
    const after = await rowOf(w.semesterId);
    expect([after.configVersion, after.objectiveAggregation]).toEqual([1, null]);
  });

  it('salinan lama (kolom tahap 3.3 bawaan) dibaca sebagai tanpa kriteria TP dan agregasi mean', async () => {
    const w = await makeSchool('obj-lama');
    await freeze(w);
    await platform.db
      .update(semesterGradingConfig)
      .set({ configVersion: 1, objectiveCriteria: [], objectiveAggregation: null })
      .where(eq(semesterGradingConfig.semesterId, w.semesterId));
    const cfg = await readFrozenGradingConfig(platform.db, w.schoolId, w.semesterId);
    expect(cfg).toMatchObject({ configVersion: 1, objectiveCriteria: [], objectiveAggregation: 'mean' });
  });

  it('T14: pembekuan lewat koneksi platform tidak mencampur kriteria TP antar sekolah', async () => {
    const a = await makeSchool('obj-a');
    const b = await makeSchool('obj-b');
    const ca = await addObjectiveCriteria(a, 61);
    const cb = await addObjectiveCriteria(b, 62);
    await freeze(a);
    await freeze(b);
    const rowA = await rowOf(a.semesterId);
    const rowB = await rowOf(b.semesterId);
    expect((rowA.objectiveCriteria as { id: string }[]).map((c) => c.id)).toEqual([ca]);
    expect((rowB.objectiveCriteria as { id: string }[]).map((c) => c.id)).toEqual([cb]);
    expect(JSON.stringify(rowA.objectiveCriteria)).not.toContain(b.objectiveId);
  });
});

describe('migrasi 0098: tabel kaitan dan keputusan guru', () => {
  it('assessment_objective: unik per pasangan, FK komposit menolak silang sekolah, hapus penilaian menghapus tautan, hapus TP ditolak', async () => {
    const a = await makeSchool('kait-a');
    const b = await makeSchool('kait-b');
    await platform.db
      .insert(assessmentObjective)
      .values({ schoolId: a.schoolId, assessmentId: a.assessmentId, objectiveId: a.objectiveId });
    await expect(
      platform.db
        .insert(assessmentObjective)
        .values({ schoolId: a.schoolId, assessmentId: a.assessmentId, objectiveId: a.objectiveId }),
    ).rejects.toThrow();
    await expect(
      platform.db
        .insert(assessmentObjective)
        .values({ schoolId: b.schoolId, assessmentId: a.assessmentId, objectiveId: b.objectiveId }),
    ).rejects.toThrow();
    await expect(
      platform.db
        .insert(assessmentObjective)
        .values({ schoolId: b.schoolId, assessmentId: b.assessmentId, objectiveId: a.objectiveId }),
    ).rejects.toThrow();
    // TP terkait tidak dapat dihapus (NO ACTION).
    await expect(
      platform.db.delete(learningObjective).where(eq(learningObjective.id, a.objectiveId)),
    ).rejects.toThrow();
    // Hapus penilaian ikut menghapus tautan (CASCADE).
    await platform.db.delete(assessment).where(eq(assessment.id, a.assessmentId));
    expect(
      await platform.db
        .select()
        .from(assessmentObjective)
        .where(eq(assessmentObjective.schoolId, a.schoolId)),
    ).toEqual([]);
  });

  it('student_objective_achievement: CHECK isi minimal dan panjang, unik per (semester, siswa, TP), FK komposit', async () => {
    const a = await makeSchool('ov-a');
    const b = await makeSchool('ov-b');
    const base = {
      schoolId: a.schoolId,
      semesterId: a.semesterId,
      classId: a.classId,
      subjectId: a.subjectId,
      studentId: a.studentId,
      objectiveId: a.objectiveId,
      updatedBy: 'uji',
    };
    const ins = (v: Partial<typeof studentObjectiveAchievement.$inferInsert>) =>
      platform.db.insert(studentObjectiveAchievement).values({ ...base, ...v });
    await expect(ins({})).rejects.toThrow();
    await expect(ins({ note: 'x'.repeat(501) })).rejects.toThrow();
    await expect(ins({ levelLabel: '' })).rejects.toThrow();
    await expect(ins({ achieved: false })).resolves.toBeDefined();
    await expect(ins({ achieved: true })).rejects.toThrow();
    // Lintas sekolah: siswa/TP milik B pada baris A, dan sebaliknya.
    await expect(ins({ schoolId: b.schoolId, achieved: true })).rejects.toThrow();
    await expect(ins({ objectiveId: b.objectiveId, achieved: true })).rejects.toThrow();
  });

  it('RLS: konteks tenant hanya melihat dan menulis barisnya sendiri', async () => {
    const a = await makeSchool('rls-a');
    const b = await makeSchool('rls-b');
    await platform.db
      .insert(assessmentObjective)
      .values({ schoolId: a.schoolId, assessmentId: a.assessmentId, objectiveId: a.objectiveId });
    await platform.db.insert(studentObjectiveAchievement).values({
      schoolId: a.schoolId,
      semesterId: a.semesterId,
      classId: a.classId,
      subjectId: a.subjectId,
      studentId: a.studentId,
      objectiveId: a.objectiveId,
      achieved: true,
      updatedBy: 'uji',
    });
    const seenByB = await withTenant(tenantDb.db, [b.schoolId], async (tx) => [
      await tx.select().from(assessmentObjective),
      await tx.select().from(studentObjectiveAchievement),
    ]);
    expect(seenByB).toEqual([[], []]);
    const seenByA = await withTenant(tenantDb.db, [a.schoolId], async (tx) => [
      await tx.select().from(assessmentObjective),
      await tx.select().from(studentObjectiveAchievement),
    ]);
    expect(seenByA.map((r) => r.length)).toEqual([1, 1]);
  });

  it('kolom pengaturan: CHECK agregasi pada grading_setting dan semester_grading_config', async () => {
    const w = await makeSchool('obj-ck');
    await expect(
      platform.db.insert(gradingSetting).values({ schoolId: w.schoolId, objectiveAggregation: 'median' }),
    ).rejects.toThrow();
    await freeze(w);
    await expect(
      platform.db
        .update(semesterGradingConfig)
        .set({ objectiveAggregation: 'median' })
        .where(eq(semesterGradingConfig.semesterId, w.semesterId)),
    ).rejects.toThrow();
  });
});
