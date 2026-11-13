import { componentAverage, percentOf } from './grading';
import { OBJECTIVE_AGGREGATIONS, type ObjectiveAggregation } from './grading-config';
import {
  effectiveThreshold,
  isAchieved,
  type KktpRow,
  type ObjectiveCriteriaScope,
  type ResolvedKkm,
  type ResolvedObjectiveCriteria,
} from './kktp';

/**
 * Ketercapaian tujuan pembelajaran (TP) per murid (rancangan: docs/rancangan-fase-3-asesmen-rapor.md, bagian 3.2). Murni,
 * tanpa database. Nilai efektif sebuah (murid, TP) = keputusan guru (override) bila ada, selain itu hasil hitung dari skor
 * penilaian yang dikaitkan ke TP itu. Hanya penilaian SUMATIF yang dihitung (K3); formatif tampil terpisah sebagai kemajuan.
 *
 * Satu skor penilaian berlaku untuk semua TP yang dikaitkan padanya (K5).
 */

export { OBJECTIVE_AGGREGATIONS, type ObjectiveAggregation };

/** Jumlah TP maksimal yang boleh dikaitkan ke satu penilaian. */
export const MAX_OBJECTIVES_PER_ASSESSMENT = 20;

export const OBJECTIVE_ERROR_CODES = [
  'objective_subject_mismatch',
  'objective_inactive',
  'too_many_objectives',
] as const;
export type ObjectiveErrorCode = (typeof OBJECTIVE_ERROR_CODES)[number];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Satu skor terisi pada penilaian yang dikaitkan ke sebuah TP. */
export interface ObjectiveScoreEntry {
  value: number;
  /** Skor maksimum penilaian itu. */
  max: number;
  /** Tanggal penilaian (YYYY-MM-DD); menentukan "terbaru". */
  date: string;
  /** Pemecah seri tanggal yang sama (mis. `createdAt` lalu id): yang urutannya lebih besar dianggap lebih baru. */
  order?: string;
}

/**
 * Persen ketercapaian sebuah TP dari skor-skornya menurut aturan agregasi, dibulatkan 2 desimal; null bila tak ada skor.
 * - `mean`: rata-rata persen (rumus `componentAverage` yang sama dengan nilai akhir);
 * - `latest`: persen penilaian terbaru menurut tanggal (seri dipecah `order`);
 * - `max`: persen tertinggi.
 */
export function aggregateObjectivePercent(
  entries: readonly ObjectiveScoreEntry[],
  mode: ObjectiveAggregation = 'mean',
): number | null {
  if (entries.length === 0) return null;
  if (mode === 'latest') {
    const latest = entries.reduce((best, e) => {
      const a = `${e.date}|${e.order ?? ''}`;
      const b = `${best.date}|${best.order ?? ''}`;
      return a > b ? e : best;
    });
    return round2(percentOf(latest.value, latest.max));
  }
  if (mode === 'max') return round2(Math.max(...entries.map((e) => percentOf(e.value, e.max))));
  const avg = componentAverage(entries.map((e) => ({ value: e.value, max: e.max })));
  return avg === null ? null : round2(avg);
}

/** Sumber ambang yang dipakai: kriteria per TP (empat jenjang), KKM mapel (KKTP tingkat mapel), atau KKM sekolah. */
export const OBJECTIVE_STATUS_SCOPES = [
  'objective_level_program',
  'objective_level',
  'objective_program',
  'objective',
  'subject_kkm',
  'school_kkm',
] as const satisfies readonly (ObjectiveCriteriaScope | 'subject_kkm' | 'school_kkm')[];
export type ObjectiveStatusScope = (typeof OBJECTIVE_STATUS_SCOPES)[number];

export interface ObjectiveStatus {
  /** null = tidak dapat ditentukan otomatis (mis. deskriptor tanpa rentang angka): perlu keputusan guru. */
  achieved: boolean | null;
  /** Label level yang memuat persen (mode interval, rubrik, deskriptor dengan rentang); null selain itu. */
  levelLabel: string | null;
  scope: ObjectiveStatusScope;
  /** Ambang terkecil yang dianggap tercapai (null bila tak dapat dihitung). */
  threshold: number | null;
}

/** Label level yang rentangnya memuat `percent` (batas inklusif); null bila tak ada atau kriteria numerik. */
export function levelLabelOf(percent: number, c: KktpRow): string | null {
  if (c.mode === 'numeric') return null;
  const hit = (c.levels ?? []).find(
    (l) =>
      typeof l.minScore === 'number' &&
      typeof l.maxScore === 'number' &&
      percent >= l.minScore &&
      percent <= l.maxScore,
  );
  return hit ? hit.label : null;
}

/**
 * Status ketercapaian sebuah persen. Pemecah bertingkat: kriteria per TP (`tp`, dari `resolveObjectiveCriteria`) -> KKM mapel
 * (`kkm`, dari `resolveKkm`; `scope` 'settings' = KKM sekolah). Tanpa kriteria TP, tercapai bila persen >= KKM.
 */
export function objectiveStatus(
  percent: number,
  tp: ResolvedObjectiveCriteria | null,
  kkm: ResolvedKkm,
): ObjectiveStatus {
  if (tp) {
    return {
      achieved: isAchieved(percent, tp.row),
      levelLabel: levelLabelOf(percent, tp.row),
      scope: tp.scope,
      threshold: effectiveThreshold(tp.row),
    };
  }
  return {
    achieved: percent >= kkm.kkm,
    levelLabel: null,
    scope: kkm.scope === 'settings' ? 'school_kkm' : 'subject_kkm',
    threshold: kkm.kkm,
  };
}

/** Keputusan guru atas satu (murid, TP); `achieved` null = tidak menimpa status hitung. */
export interface ObjectiveOverride {
  achieved: boolean | null;
  levelLabel: string | null;
  note: string | null;
}

export type ObjectiveCellSource = 'computed' | 'override';

export interface ObjectiveCell {
  /** Persen agregat penilaian sumatif yang dikaitkan; null bila belum ada skor. */
  percent: number | null;
  achieved: boolean | null;
  levelLabel: string | null;
  /** 'override' bila guru memutuskan status; 'computed' bila dari skor; null bila belum ada keduanya. */
  source: ObjectiveCellSource | null;
  scope: ObjectiveStatusScope | null;
  threshold: number | null;
  /** Jumlah penilaian sumatif terkait yang sudah punya skor siswa ini. */
  scoredCount: number;
  note: string | null;
  /** Kemajuan dari penilaian formatif terkait (TIDAK dipakai untuk status); ada hanya bila siswa punya skor semacam itu. */
  formative?: { average: number; count: number };
}

/**
 * Gabungkan hasil hitung dengan keputusan guru: override yang berstatus menang atas hitungan (`source` 'override');
 * override tanpa status (hanya label/catatan) hanya menambah label dan catatan.
 */
export function mergeObjectiveCell(
  computed: {
    percent: number | null;
    status: ObjectiveStatus | null;
    scoredCount: number;
    formative?: { average: number; count: number } | undefined;
  },
  override: ObjectiveOverride | null | undefined,
): ObjectiveCell {
  const decided = override != null && override.achieved !== null;
  const source: ObjectiveCellSource | null = decided ? 'override' : computed.status ? 'computed' : null;
  return {
    percent: computed.percent,
    achieved: decided ? (override as ObjectiveOverride).achieved : (computed.status?.achieved ?? null),
    levelLabel: override?.levelLabel ?? computed.status?.levelLabel ?? null,
    source,
    scope: computed.status?.scope ?? null,
    threshold: computed.status?.threshold ?? null,
    scoredCount: computed.scoredCount,
    note: override?.note ?? null,
    ...(computed.formative ? { formative: computed.formative } : {}),
  };
}

/** Ringkasan satu TP atas sekumpulan sel: berapa yang berstatus dan berapa yang tercapai. */
export function summarizeObjective(cells: readonly ObjectiveCell[]): { assessed: number; achieved: number } {
  const decided = cells.filter((c) => c.achieved !== null);
  return { assessed: decided.length, achieved: decided.filter((c) => c.achieved === true).length };
}

/** Aturan agregasi yang sah; kunci tak dikenal ditolak. */
export const isObjectiveAggregation = (v: unknown): v is ObjectiveAggregation =>
  (OBJECTIVE_AGGREGATIONS as readonly unknown[]).includes(v);
