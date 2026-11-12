import { type CriteriaMode, type KktpRow, type ResolvedKkm, resolveKkm } from '@edusync/contracts';
import {
  achievementCriteria,
  achievementRubricLevel,
  and,
  asc,
  classRoom,
  eq,
  inArray,
  type Tx,
} from '@edusync/db';

/**
 * Pemuat KKTP untuk penghitung nilai. Memuat seluruh kriteria mapel-mapel yang diminta dalam dua kueri (kriteria dan
 * levelnya), jadi satu kelas penuh tidak menimbulkan N+1. Tanpa kriteria, hasilnya `fallback` (KKM sekolah).
 */

export interface KktpResolver {
  (subjectId: string): number;
  /** KKM efektif beserta cakupan dan kriteria penentunya. */
  detail(subjectId: string): ResolvedKkm;
}

/** Kriteria tingkat mapel (tanpa TP, aktif) milik mapel-mapel itu, beserta levelnya. */
export async function loadKktpRows(tx: Tx, subjectIds: string[]): Promise<Map<string, KktpRow[]>> {
  const bySubject = new Map<string, KktpRow[]>();
  if (subjectIds.length === 0) return bySubject;
  const rows = await tx
    .select()
    .from(achievementCriteria)
    .where(and(inArray(achievementCriteria.subjectId, subjectIds), eq(achievementCriteria.active, true)));
  const usable = rows.filter((r) => r.objectiveId === null);
  if (usable.length === 0) return bySubject;
  const levels = await tx
    .select()
    .from(achievementRubricLevel)
    .where(
      inArray(
        achievementRubricLevel.criteriaId,
        usable.map((r) => r.id),
      ),
    )
    .orderBy(asc(achievementRubricLevel.sortOrder), asc(achievementRubricLevel.id));
  for (const r of usable) {
    const list = bySubject.get(r.subjectId) ?? [];
    list.push({
      id: r.id,
      mode: r.mode as CriteriaMode,
      threshold: r.threshold,
      levelCode: r.levelCode,
      programId: r.programId,
      objectiveId: r.objectiveId,
      active: r.active,
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
    bySubject.set(r.subjectId, list);
  }
  return bySubject;
}

/** Pemecah KKM untuk satu tingkat/program dan sekumpulan mapel. */
export async function loadKktpResolver(
  tx: Tx,
  p: { levelCode: string | null; programId: string | null; subjectIds: string[]; fallback: number },
): Promise<KktpResolver> {
  return makeKktpResolver(await loadKktpRows(tx, p.subjectIds), p);
}

/** Pemecah KKM dari baris kriteria yang sudah dimuat (tabel hidup atau salinan beku). Tanpa akses database. */
export function makeKktpResolver(
  rows: Map<string, KktpRow[]>,
  p: { levelCode: string | null; programId: string | null; fallback: number },
): KktpResolver {
  const detail = (subjectId: string) =>
    resolveKkm(rows.get(subjectId) ?? [], { levelCode: p.levelCode, programId: p.programId }, p.fallback);
  return Object.assign((subjectId: string) => detail(subjectId).kkm, { detail });
}

/** Sama, dengan tingkat dan program dibaca dari kelas. Kelas tak dikenal dianggap tanpa tingkat dan program. */
export async function loadKktpResolverForClass(
  tx: Tx,
  p: { classId: string; subjectIds: string[]; fallback: number },
): Promise<KktpResolver> {
  const [cls] = await tx
    .select({ level: classRoom.level, programId: classRoom.programId })
    .from(classRoom)
    .where(eq(classRoom.id, p.classId));
  return loadKktpResolver(tx, {
    levelCode: cls?.level ?? null,
    programId: cls?.programId ?? null,
    subjectIds: p.subjectIds,
    fallback: p.fallback,
  });
}
