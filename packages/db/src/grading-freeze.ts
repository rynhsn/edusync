import {
  type CalculationMode,
  type CriteriaMode,
  type FreezeOrigin,
  type FrozenComponent,
  type FrozenCriteria,
  GRADING_CONFIG_VERSION,
  type ResolvedFrozenGradingConfig,
  resolveFrozenGradingConfig,
} from '@edusync/contracts';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db, Tx } from './client';
import {
  achievementCriteria,
  achievementRubricLevel,
  gradeComponent,
  gradingSetting,
  semesterGradingConfig,
} from './schema';

type Executor = Db | Tx;

/** Nilai bawaan sekolah yang belum punya baris `grading_setting` (sama dengan default kolom dan `DEFAULT_SETTINGS` API). */
const DEFAULT_SETTINGS = {
  kkm: 75,
  predicateA: 90,
  predicateB: 80,
  predicateC: 70,
  calculationMode: 'weighted_average' as CalculationMode,
};

export interface FreezeParams {
  schoolId: string;
  semesterId: string;
  origin: FreezeOrigin;
  /** `user.id` pelaku; null untuk proses sistem (migrator, backfill). */
  actorId: string | null;
  /** true: timpa baris yang sudah ada. false: biarkan baris yang ada apa adanya. */
  overwrite: boolean;
}

/** Konfigurasi HIDUP sekolah dalam bentuk salinan. Setiap kueri memfilter `school_id` sendiri, jadi aman di koneksi BYPASSRLS. */
export async function readLiveGradingConfig(ex: Executor, schoolId: string) {
  const [setting] = await ex.select().from(gradingSetting).where(eq(gradingSetting.schoolId, schoolId));
  const components: FrozenComponent[] = await ex
    .select({
      id: gradeComponent.id,
      name: gradeComponent.name,
      weight: gradeComponent.weight,
      sort: gradeComponent.sort,
    })
    .from(gradeComponent)
    .where(eq(gradeComponent.schoolId, schoolId))
    .orderBy(asc(gradeComponent.sort), asc(gradeComponent.name));

  // Hanya kriteria aktif tingkat mapel (tanpa TP): satu-satunya yang dipakai pemecah KKM.
  const rows = (
    await ex
      .select()
      .from(achievementCriteria)
      .where(and(eq(achievementCriteria.schoolId, schoolId), eq(achievementCriteria.active, true)))
      .orderBy(asc(achievementCriteria.createdAt), asc(achievementCriteria.id))
  ).filter((r) => r.objectiveId === null);
  const levels = rows.length
    ? await ex
        .select()
        .from(achievementRubricLevel)
        .where(
          and(
            eq(achievementRubricLevel.schoolId, schoolId),
            inArray(
              achievementRubricLevel.criteriaId,
              rows.map((r) => r.id),
            ),
          ),
        )
        .orderBy(asc(achievementRubricLevel.sortOrder), asc(achievementRubricLevel.id))
    : [];
  const criteria: FrozenCriteria[] = rows.map((r) => ({
    id: r.id,
    subjectId: r.subjectId,
    mode: r.mode as CriteriaMode,
    threshold: r.threshold,
    levelCode: r.levelCode,
    programId: r.programId,
    objectiveId: null,
    active: true,
    levels: levels
      .filter((l) => l.criteriaId === r.id)
      .map((l) => ({
        label: l.label,
        descriptor: l.descriptor,
        minScore: l.minScore,
        maxScore: l.maxScore,
        isAchieved: l.isAchieved,
      })),
  }));
  return {
    kkm: setting?.kkm ?? DEFAULT_SETTINGS.kkm,
    predicateA: setting?.predicateA ?? DEFAULT_SETTINGS.predicateA,
    predicateB: setting?.predicateB ?? DEFAULT_SETTINGS.predicateB,
    predicateC: setting?.predicateC ?? DEFAULT_SETTINGS.predicateC,
    calculationMode: (setting?.calculationMode ?? DEFAULT_SETTINGS.calculationMode) as CalculationMode,
    components,
    criteria,
  };
}

/**
 * Baca salinan beku sebuah semester lewat pembaca lintas versi (`config_version` 1 dan 2; kunci yang hilang = nilai bawaan).
 * Null bila semester belum beku. Memfilter `school_id` sendiri, jadi aman di koneksi BYPASSRLS. Salinan versi tak dikenal
 * melempar galat jelas. Kolom v2 (`objective_criteria`, `objective_aggregation`, `remedial_policy`) belum ada di tabel pada tahap
 * 3.0, jadi hasilnya selalu bernilai bawaan sampai migrasi fase 3 menambahkannya.
 */
export async function readFrozenGradingConfig(
  ex: Executor,
  schoolId: string,
  semesterId: string,
): Promise<ResolvedFrozenGradingConfig | null> {
  const [row] = await ex
    .select()
    .from(semesterGradingConfig)
    .where(
      and(eq(semesterGradingConfig.schoolId, schoolId), eq(semesterGradingConfig.semesterId, semesterId)),
    );
  return row ? resolveFrozenGradingConfig(row) : null;
}

/**
 * Bekukan konfigurasi nilai sebuah semester: salin konfigurasi hidup sekolah ke `semester_grading_config` (satu baris per
 * semester). Tanpa `overwrite`, baris yang sudah ada dibiarkan (idempoten). Dipakai jalur runtime API dan backfill supaya bentuk
 * salinan satu sumber. Semester harus milik `schoolId` (FK komposit; selain itu galat 23503). Mengembalikan true bila baris ditulis.
 */
export async function freezeSemesterGradingConfig(ex: Executor, p: FreezeParams): Promise<boolean> {
  const live = await readLiveGradingConfig(ex, p.schoolId);
  const values = {
    schoolId: p.schoolId,
    semesterId: p.semesterId,
    ...live,
    configVersion: GRADING_CONFIG_VERSION,
    origin: p.origin,
    frozenBy: p.actorId,
  };
  const query = ex.insert(semesterGradingConfig).values(values);
  const rows = p.overwrite
    ? await query
        .onConflictDoUpdate({
          target: semesterGradingConfig.semesterId,
          set: {
            ...live,
            configVersion: GRADING_CONFIG_VERSION,
            origin: p.origin,
            frozenBy: p.actorId,
            frozenAt: new Date(),
            updatedAt: new Date(),
          },
          setWhere: eq(semesterGradingConfig.schoolId, p.schoolId),
        })
        .returning({ semesterId: semesterGradingConfig.semesterId })
    : await query.onConflictDoNothing().returning({ semesterId: semesterGradingConfig.semesterId });
  return rows.length > 0;
}
