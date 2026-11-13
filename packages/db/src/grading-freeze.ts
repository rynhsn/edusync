import {
  type CalculationMode,
  type ComponentCategory,
  type CriteriaMode,
  DEFAULT_OBJECTIVE_AGGREGATION,
  type FreezeOrigin,
  type FrozenComponent,
  type FrozenCriteria,
  type FrozenObjectiveCriteria,
  gradingConfigVersionOf,
  type ObjectiveAggregation,
  type ResolvedFrozenGradingConfig,
  resolveFrozenGradingConfig,
  sparseFrozenComponent,
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
  // Field kategori ditulis SPARSE (hanya bila bukan bawaan): sekolah tanpa komponen formatif tetap menghasilkan jsonb v1
  // byte demi byte, jadi `matchesLive` dan salinan lama tidak bergeser (rancangan fase 3, risiko R3).
  const components: FrozenComponent[] = (
    await ex
      .select({
        id: gradeComponent.id,
        name: gradeComponent.name,
        weight: gradeComponent.weight,
        sort: gradeComponent.sort,
        category: gradeComponent.category,
        includeInFinal: gradeComponent.includeInFinal,
      })
      .from(gradeComponent)
      .where(eq(gradeComponent.schoolId, schoolId))
      .orderBy(asc(gradeComponent.sort), asc(gradeComponent.name))
  ).map((c) => sparseFrozenComponent({ ...c, category: c.category as ComponentCategory }));

  // Kriteria aktif: yang tanpa TP masuk `criteria` (satu-satunya yang dipakai pemecah KKM; skema baca v1 mewajibkan objectiveId
  // null), yang ber-TP masuk `objectiveCriteria` (kolom terpisah, tahap 3.3). Satu kueri kriteria dan satu kueri level untuk keduanya.
  const allRows = await ex
    .select()
    .from(achievementCriteria)
    .where(and(eq(achievementCriteria.schoolId, schoolId), eq(achievementCriteria.active, true)))
    .orderBy(asc(achievementCriteria.createdAt), asc(achievementCriteria.id));
  const levels = allRows.length
    ? await ex
        .select()
        .from(achievementRubricLevel)
        .where(
          and(
            eq(achievementRubricLevel.schoolId, schoolId),
            inArray(
              achievementRubricLevel.criteriaId,
              allRows.map((r) => r.id),
            ),
          ),
        )
        .orderBy(asc(achievementRubricLevel.sortOrder), asc(achievementRubricLevel.id))
    : [];
  const frozenRow = (r: (typeof allRows)[number]) => ({
    id: r.id,
    subjectId: r.subjectId,
    mode: r.mode as CriteriaMode,
    threshold: r.threshold,
    levelCode: r.levelCode,
    programId: r.programId,
    active: true as const,
    levels: levels
      .filter((l) => l.criteriaId === r.id)
      .map((l) => ({
        label: l.label,
        descriptor: l.descriptor,
        minScore: l.minScore,
        maxScore: l.maxScore,
        isAchieved: l.isAchieved,
      })),
  });
  const criteria: FrozenCriteria[] = allRows
    .filter((r) => r.objectiveId === null)
    .map((r) => ({ ...frozenRow(r), objectiveId: null }));
  const objectiveCriteria: FrozenObjectiveCriteria[] = allRows.flatMap((r) =>
    r.objectiveId === null ? [] : [{ ...frozenRow(r), objectiveId: r.objectiveId }],
  );
  const aggregation = (setting?.objectiveAggregation ?? null) as ObjectiveAggregation | null;
  return {
    kkm: setting?.kkm ?? DEFAULT_SETTINGS.kkm,
    predicateA: setting?.predicateA ?? DEFAULT_SETTINGS.predicateA,
    predicateB: setting?.predicateB ?? DEFAULT_SETTINGS.predicateB,
    predicateC: setting?.predicateC ?? DEFAULT_SETTINGS.predicateC,
    calculationMode: (setting?.calculationMode ?? DEFAULT_SETTINGS.calculationMode) as CalculationMode,
    components,
    criteria,
    // Bagian tahap 3.3 ditulis SPARSE (R3): kunci hanya ada bila bukan bawaan, jadi sekolah tanpa kriteria TP dan dengan agregasi
    // bawaan tetap menghasilkan salinan v1 byte demi byte dan `matchesLive` tidak bergeser.
    ...(objectiveCriteria.length > 0 ? { objectiveCriteria } : {}),
    ...(aggregation !== null && aggregation !== DEFAULT_OBJECTIVE_AGGREGATION
      ? { objectiveAggregation: aggregation }
      : {}),
  };
}

/**
 * Baca salinan beku sebuah semester lewat pembaca lintas versi (`config_version` 1 dan 2; kunci yang hilang = nilai bawaan).
 * Null bila semester belum beku. Memfilter `school_id` sendiri, jadi aman di koneksi BYPASSRLS. Salinan versi tak dikenal
 * melempar galat jelas. Kolom tahap 3.3 (`objective_criteria`, `objective_aggregation`) dibaca bila ada; kolom
 * `remedial_policy` (tahap 3.5) belum ada di tabel, jadi bernilai bawaan sampai migrasi tahap itu menambahkannya.
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
  // Versi 2 hanya bila ada komponen yang memuat field kategori, kriteria TP, atau agregasi TP bukan bawaan; selain itu v1
  // seperti sebelum fase 3.
  const configVersion = gradingConfigVersionOf(live.components, live);
  // Kolom tahap 3.3 selalu ditulis eksplisit supaya menimpa salinan lama yang memuatnya (Drizzle mengabaikan `undefined` di `set`).
  const v2 = {
    objectiveCriteria: live.objectiveCriteria ?? [],
    objectiveAggregation: live.objectiveAggregation ?? null,
  };
  const { objectiveCriteria: _oc, objectiveAggregation: _oa, ...base } = live;
  const values = {
    schoolId: p.schoolId,
    semesterId: p.semesterId,
    ...base,
    ...v2,
    configVersion,
    origin: p.origin,
    frozenBy: p.actorId,
  };
  const query = ex.insert(semesterGradingConfig).values(values);
  const rows = p.overwrite
    ? await query
        .onConflictDoUpdate({
          target: semesterGradingConfig.semesterId,
          set: {
            ...base,
            ...v2,
            configVersion,
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
