/**
 * Logika murni PKL dan prakerin (tanpa database) yang dipakai API dan UI:
 * aspek penilaian bawaan, nilai akhir tertimbang, predikat, dan transisi status penempatan.
 */
import { type Predicate, type PredicateSettings, predicateOf } from './grading';

export interface PklAspectInput {
  id: string;
  weight: number;
}

export interface PklScoreInput {
  aspectId: string;
  assessor: 'school' | 'industry';
  value: number;
}

export interface PklResult {
  /** Nilai per aspek (rata-rata nilai penilai yang ada), null bila belum ada nilai. */
  perAspect: { aspectId: string; value: number | null }[];
  /** Nilai akhir tertimbang, null bila belum ada nilai sama sekali. */
  final: number | null;
}

/** Aspek penilaian bawaan; total bobot 100. */
export const DEFAULT_PKL_ASPECTS = [
  { name: 'Disiplin', weight: 20 },
  { name: 'Kompetensi teknis', weight: 30 },
  { name: 'Etika kerja', weight: 20 },
  { name: 'Kerja sama', weight: 15 },
  { name: 'Laporan', weight: 15 },
] as const;

/** Ambang predikat PKL bawaan: A >= 90, B >= 80, C >= 70, selain itu D. Sekolah dapat mengubahnya (tabel pkl_setting). */
export const PKL_PREDICATE_SETTINGS = { predicateA: 90, predicateB: 80, predicateC: 70 } as const;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Nilai tiap aspek = rata-rata nilai penilai yang ada (sekolah dan industri). Nilai akhir = rata-rata tertimbang
 * aspek yang punya nilai (bobot dinormalisasi atas aspek itu saja), dibulatkan 2 desimal.
 */
export function pklResult(aspects: readonly PklAspectInput[], scores: readonly PklScoreInput[]): PklResult {
  let weighted = 0;
  let weights = 0;
  const perAspect = aspects.map((a) => {
    const mine = scores.filter((s) => s.aspectId === a.id);
    if (mine.length === 0) return { aspectId: a.id, value: null };
    const avg = mine.reduce((sum, s) => sum + s.value, 0) / mine.length;
    if (a.weight > 0) {
      weighted += avg * a.weight;
      weights += a.weight;
    }
    return { aspectId: a.id, value: round2(avg) };
  });
  return { perAspect, final: weights === 0 ? null : round2(weighted / weights) };
}

/** Predikat PKL dari nilai akhir; ambang bawaan bila `settings` tidak diberikan. */
export function pklPredicate(value: number, settings: PredicateSettings = PKL_PREDICATE_SETTINGS): Predicate {
  return predicateOf(value, settings);
}

/** Ambang valid: bilangan bulat 1-100 dengan A > B > C. */
export function validPklThresholds(t: PredicateSettings): boolean {
  const all = [t.predicateA, t.predicateB, t.predicateC];
  return (
    all.every((n) => Number.isInteger(n) && n >= 1 && n <= 100) &&
    t.predicateA > t.predicateB &&
    t.predicateB > t.predicateC
  );
}

export type PklPlacementStatus = 'planned' | 'active' | 'completed' | 'cancelled';

export const placementStatusTransitions: Record<PklPlacementStatus, readonly PklPlacementStatus[]> = {
  planned: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/** Boleh pindah dari status `from` ke `to`? (Status yang sama dianggap tidak berubah, bukan transisi.) */
export function canPlacementTransition(from: PklPlacementStatus, to: PklPlacementStatus): boolean {
  return placementStatusTransitions[from].includes(to);
}
