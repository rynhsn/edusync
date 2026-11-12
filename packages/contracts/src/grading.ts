/**
 * Logika penilaian murni (tanpa database) yang dipakai API dan UI.
 * Nilai disimpan sebagai skor mentah per penilaian; persen, rata-rata komponen, nilai akhir, dan predikat
 * dihitung dari skor itu supaya aturan bobot/KKM yang berubah langsung berlaku.
 */

export type Predicate = 'A' | 'B' | 'C' | 'D';

export interface PredicateSettings {
  predicateA: number;
  predicateB: number;
  predicateC: number;
}

export interface ScoreInput {
  /** Skor siswa; `null` berarti belum diisi dan diabaikan. */
  value: number | null;
  /** Skor maksimum penilaian itu. */
  max: number;
}

export interface ComponentInput {
  weight: number;
  scores: readonly ScoreInput[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Skor sebagai persen dari skor maksimum (0 bila maksimum bukan bilangan positif). */
export function percentOf(score: number, max: number): number {
  if (!(max > 0)) return 0;
  return (score / max) * 100;
}

/** Rata-rata persen penilaian dalam satu komponen; skor kosong diabaikan. `null` bila tak ada skor. */
export function componentAverage(scores: readonly ScoreInput[]): number | null {
  const filled = scores.filter((s): s is { value: number; max: number } => s.value !== null);
  if (filled.length === 0) return null;
  const total = filled.reduce((sum, s) => sum + percentOf(s.value, s.max), 0);
  return total / filled.length;
}

/** Mode perhitungan nilai akhir (Panduan Pembelajaran dan Asesmen 2025). */
export const CALCULATION_MODES = ['weighted_average', 'percentage', 'simple_average'] as const;
export type CalculationMode = (typeof CALCULATION_MODES)[number];

/**
 * Nilai akhir menurut mode (bawaan `weighted_average`, rumus lama). Dibulatkan 2 desimal; `null` bila tidak ada skor.
 * - `weighted_average`: rata-rata tertimbang komponen yang punya minimal satu skor; bobot dinormalisasi hanya atas
 *   komponen itu, jadi komponen kosong tidak menarik nilai ke bawah.
 * - `percentage`: jumlah (rata-rata komponen x bobot%) / 100 TANPA renormalisasi; komponen tanpa skor menyumbang 0.
 *   Hanya bermakna bila bobot berjumlah 100 (API menolak mode ini bila tidak); sebagai pengaman hasil dibatasi 0..100.
 * - `simple_average`: rata-rata tanpa bobot dari rata-rata komponen yang punya skor.
 */
export function finalGrade(
  components: readonly ComponentInput[],
  mode: CalculationMode = 'weighted_average',
): number | null {
  if (mode === 'simple_average') {
    const avgs = components.map((c) => componentAverage(c.scores)).filter((a): a is number => a !== null);
    if (avgs.length === 0) return null;
    return round2(avgs.reduce((sum, a) => sum + a, 0) / avgs.length);
  }
  let weighted = 0;
  let weights = 0;
  let anyScore = false;
  for (const c of components) {
    const avg = componentAverage(c.scores);
    if (avg === null) continue;
    anyScore = true;
    if (!(c.weight > 0)) continue;
    weighted += avg * c.weight;
    weights += c.weight;
  }
  if (mode === 'percentage') {
    return anyScore && weights > 0 ? Math.min(100, Math.max(0, round2(weighted / 100))) : null;
  }
  if (weights === 0) return null;
  return round2(weighted / weights);
}

/** Predikat huruf menurut batas minimal A, B, dan C; di bawah batas C menjadi D. */
export function predicateOf(value: number, settings: PredicateSettings): Predicate {
  if (value >= settings.predicateA) return 'A';
  if (value >= settings.predicateB) return 'B';
  if (value >= settings.predicateC) return 'C';
  return 'D';
}
