/**
 * Aturan murni KKTP (kriteria ketercapaian tujuan pembelajaran), fase 2B tahap 3. Tanpa akses database.
 *
 * Satu kriteria berlaku pada cakupan (mapel, tingkat?, program?, tujuan pembelajaran?). Mode:
 * - `numeric`: tuntas bila nilai >= `threshold`;
 * - `interval`/`rubric`: rentang nilai per level, tiap level bertanda tercapai atau belum;
 * - `descriptor`: level berdeskripsi; angka min/max boleh kosong.
 * Nilai KKM efektif sebuah mapel dicari berjenjang dan, bila tak ada kriteria, jatuh ke `grading_setting.kkm`.
 */

export const CRITERIA_MODES = ['numeric', 'interval', 'descriptor', 'rubric'] as const;
export type CriteriaMode = (typeof CRITERIA_MODES)[number];

export function isCriteriaMode(value: unknown): value is CriteriaMode {
  return typeof value === 'string' && (CRITERIA_MODES as readonly string[]).includes(value);
}

/** Jumlah level rubrik maksimal dalam satu kriteria. */
export const MAX_RUBRIC_LEVELS = 20;

export interface RubricLevelInput {
  label: string;
  descriptor?: string | null | undefined;
  minScore?: number | null | undefined;
  maxScore?: number | null | undefined;
  isAchieved: boolean;
}

export interface CriteriaInput {
  mode: CriteriaMode;
  threshold?: number | null | undefined;
  levels?: RubricLevelInput[] | undefined;
}

const inScale = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
const has = (n: number | null | undefined): n is number => typeof n === 'number';

/**
 * Nilai terkecil yang dianggap tuntas, atau null bila tidak dapat dihitung (kriteria dilewati oleh pemecah).
 * numeric: `threshold`; selain itu `min_score` terkecil di antara level tercapai yang punya `min_score`.
 */
export function effectiveThreshold(c: CriteriaInput): number | null {
  if (c.mode === 'numeric') return has(c.threshold) ? c.threshold : null;
  const mins = (c.levels ?? [])
    .filter((l) => l.isAchieved && has(l.minScore))
    .map((l) => l.minScore as number);
  return mins.length > 0 ? Math.min(...mins) : null;
}

/**
 * Apakah nilai memenuhi kriteria. numeric: nilai >= threshold. Selain itu level yang memuat nilai (batas inklusif)
 * menentukan; nilai di luar semua level dianggap belum tercapai. null bila tak dapat ditentukan (mode deskriptor tanpa
 * rentang angka, atau numeric tanpa ambang).
 */
export function isAchieved(score: number, c: CriteriaInput): boolean | null {
  if (c.mode === 'numeric') return has(c.threshold) ? score >= c.threshold : null;
  const ranged = (c.levels ?? []).filter((l) => has(l.minScore) && has(l.maxScore));
  if (ranged.length === 0) return null;
  const hit = ranged.find((l) => score >= (l.minScore as number) && score <= (l.maxScore as number));
  return hit ? hit.isAchieved : false;
}

/** Pasangan label level yang rentangnya bertumpuk (batas inklusif), atau null bila tidak ada. */
export function findOverlap(levels: RubricLevelInput[]): [string, string] | null {
  const ranged = levels.filter((l) => has(l.minScore) && has(l.maxScore));
  for (let i = 0; i < ranged.length; i++) {
    for (let j = i + 1; j < ranged.length; j++) {
      const a = ranged[i] as RubricLevelInput;
      const b = ranged[j] as RubricLevelInput;
      if (
        (a.minScore as number) <= (b.maxScore as number) &&
        (b.minScore as number) <= (a.maxScore as number)
      ) {
        return [a.label, b.label];
      }
    }
  }
  return null;
}

export type CriteriaProblem = { code: 'invalid_criteria' | 'overlapping_levels'; message: string };

/** Pemeriksaan bentuk kriteria; null bila sah. */
export function checkCriteria(c: CriteriaInput): CriteriaProblem | null {
  const levels = c.levels ?? [];
  const invalid = (message: string): CriteriaProblem => ({ code: 'invalid_criteria', message });
  if (!isCriteriaMode(c.mode)) return invalid('Mode kriteria tidak dikenal.');
  if (levels.length > MAX_RUBRIC_LEVELS) return invalid(`Level rubrik maksimal ${MAX_RUBRIC_LEVELS}.`);
  if (c.mode === 'numeric') {
    if (!has(c.threshold) || !inScale(c.threshold))
      return invalid('Mode numerik wajib berambang 0 sampai 100.');
    if (levels.length > 0) return invalid('Mode numerik tidak memakai level.');
    return null;
  }
  if (has(c.threshold)) return invalid('Ambang hanya untuk mode numerik.');
  if ((c.mode === 'interval' || c.mode === 'rubric') && levels.length === 0) {
    return invalid('Mode ini wajib punya sedikitnya satu level.');
  }
  for (const l of levels) {
    if (l.label.trim().length === 0) return invalid('Label level wajib diisi.');
    const needsRange = c.mode === 'interval' || c.mode === 'rubric';
    if (needsRange && !(has(l.minScore) && has(l.maxScore))) {
      return invalid(`Level "${l.label}" wajib punya nilai minimal dan maksimal.`);
    }
    if (has(l.minScore) && !inScale(l.minScore))
      return invalid(`Nilai minimal level "${l.label}" harus 0 sampai 100.`);
    if (has(l.maxScore) && !inScale(l.maxScore))
      return invalid(`Nilai maksimal level "${l.label}" harus 0 sampai 100.`);
    if (has(l.minScore) && has(l.maxScore) && l.minScore > l.maxScore) {
      return invalid(`Level "${l.label}": nilai minimal tidak boleh melebihi maksimal.`);
    }
  }
  const overlap = findOverlap(levels);
  if (overlap) {
    return {
      code: 'overlapping_levels',
      message: `Rentang level "${overlap[0]}" dan "${overlap[1]}" saling tumpang tindih.`,
    };
  }
  return null;
}

/* ---------- Pemecah KKM berjenjang ---------- */

export interface KktpRow extends CriteriaInput {
  id: string;
  levelCode: string | null;
  programId: string | null;
  objectiveId: string | null;
  active: boolean;
}

export type KkmScope = 'subject_level_program' | 'subject_level' | 'subject_program' | 'subject' | 'settings';

export interface ResolvedKkm {
  kkm: number;
  scope: KkmScope;
  /** Kriteria yang menentukan; null bila jatuh ke pengaturan sekolah. */
  criteriaId: string | null;
}

/**
 * KKM efektif satu mapel. `rows` = kriteria mapel itu (baris lain diabaikan oleh pemanggil). Urutan: (tingkat, program)
 * -> (tingkat) -> (semua tingkat, program) -> (mapel saja) -> `fallback`. Hanya baris aktif tanpa tujuan pembelajaran;
 * kriteria yang ambangnya tak dapat dihitung dilewati ke tingkat berikutnya.
 */
export function resolveKkm(
  rows: KktpRow[],
  target: { levelCode: string | null; programId: string | null },
  fallback: number,
): ResolvedKkm {
  const usable = rows.filter((r) => r.active && r.objectiveId === null);
  const tiers: { scope: KkmScope; levelCode: string | null; programId: string | null }[] = [];
  if (target.levelCode !== null && target.programId !== null) {
    tiers.push({ scope: 'subject_level_program', levelCode: target.levelCode, programId: target.programId });
  }
  if (target.levelCode !== null)
    tiers.push({ scope: 'subject_level', levelCode: target.levelCode, programId: null });
  if (target.programId !== null)
    tiers.push({ scope: 'subject_program', levelCode: null, programId: target.programId });
  tiers.push({ scope: 'subject', levelCode: null, programId: null });
  for (const tier of tiers) {
    for (const r of usable) {
      if (r.levelCode !== tier.levelCode || r.programId !== tier.programId) continue;
      const kkm = effectiveThreshold(r);
      if (kkm !== null) return { kkm, scope: tier.scope, criteriaId: r.id };
    }
  }
  return { kkm: fallback, scope: 'settings', criteriaId: null };
}
