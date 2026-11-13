import { type CalculationMode, finalGrade } from '@edusync/contracts';
import { type CategorizedComponent, countedWeightTotal } from './assessment-category';

/**
 * Contoh angka untuk menjelaskan mode nilai akhir dengan bahasa awam. Dihitung dengan `finalGrade` yang sama
 * dengan server, jadi contoh di layar selalu cocok dengan hasil sebenarnya.
 * Contoh: Tugas 80 (bobot 30), UTS 70 (bobot 30), dan UAS belum ada nilainya (bobot 40).
 */
export const CALC_EXAMPLE = {
  taskScore: 80,
  taskWeight: 30,
  midScore: 70,
  midWeight: 30,
  finalWeight: 40,
} as const;

export const CALC_MODE_KEYS: readonly CalculationMode[] = [
  'weighted_average',
  'percentage',
  'simple_average',
];

export function calcExampleResult(mode: CalculationMode): number | null {
  const e = CALC_EXAMPLE;
  return finalGrade(
    [
      { weight: e.taskWeight, scores: [{ value: e.taskScore, max: 100 }] },
      { weight: e.midWeight, scores: [{ value: e.midScore, max: 100 }] },
      { weight: e.finalWeight, scores: [{ value: null, max: 100 }] },
    ],
    mode,
  );
}

/** Mode dari API; data lama tanpa mode dianggap rata-rata tertimbang (bawaan server). */
export function modeOrDefault(mode: CalculationMode | null | undefined): CalculationMode {
  return mode ?? 'weighted_average';
}

/** Mode dikirim hanya bila berubah, supaya mengubah KKM saja tidak ikut menyentuh mode. */
export function modeChange(
  saved: CalculationMode | null | undefined,
  picked: CalculationMode,
): { calculationMode?: CalculationMode } {
  return picked !== modeOrDefault(saved) ? { calculationMode: picked } : {};
}

/**
 * Jumlah bobot komponen yang dihitung ke nilai akhir (sumatif dan ikut nilai akhir), sama dengan server supaya hasil cek klien
 * dan server selaras. Komponen formatif tidak ikut (bobotnya 0). Komponen tanpa kategori = sumatif.
 */
export function weightsTotal(items: readonly ({ weight: number } & CategorizedComponent)[]): number {
  return countedWeightTotal(items);
}

/** Mode persentase mensyaratkan jumlah bobot tepat 100. */
export function weightsAreComplete(total: number): boolean {
  return total === 100;
}

/**
 * Menyimpan mode persentase ditolak server bila jumlah bobot bukan 100. Dicek di klien hanya saat mode
 * persentase benar-benar akan dikirim (berubah dari mode tersimpan); server tetap sumber kebenaran.
 */
export function percentageSaveBlocked(
  saved: CalculationMode | null | undefined,
  picked: CalculationMode,
  total: number,
): boolean {
  return modeChange(saved, picked).calculationMode === 'percentage' && !weightsAreComplete(total);
}

/** Jumlah bobot yang dikembalikan server pada galat `weights_sum_invalid` ("sekarang 90"); null bila tak terbaca. */
export function weightsSumFromMessage(message: string): number | null {
  const m = /sekarang\s+(\d+(?:[.,]\d+)?)/i.exec(message);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
