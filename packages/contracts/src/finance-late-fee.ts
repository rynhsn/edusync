/**
 * Denda keterlambatan SPP. Fungsi murni agar dipakai bersama oleh API dan web.
 * Semua nominal rupiah bulat; tanggal berbentuk TTTT-BB-HH (tanpa zona waktu).
 */

export const LATE_FEE_MODES = ['none', 'flat', 'percent'] as const;
export type LateFeeMode = (typeof LATE_FEE_MODES)[number];

/** Awalan `period` pada tagihan denda; sisanya adalah id tagihan induk. */
export const LATE_FEE_PERIOD_PREFIX = 'denda-';

export interface LateFeeSetting {
  mode: LateFeeMode;
  /** Rupiah (flat) atau persen dari sisa tagihan (percent). */
  value: number;
  /** Hari toleransi setelah jatuh tempo. */
  graceDays: number;
  /** Batas denda per tagihan; null = tanpa batas. */
  capAmount: number | null;
}

export interface LateFeeInput {
  /** Sisa tagihan yang belum dibayar. */
  outstanding: number;
  dueDate: string;
  today: string;
}

const MS_PER_DAY = 86_400_000;

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

/** Tanggal TTTT-BB-HH ditambah `days` hari (boleh negatif). */
export function addDays(date: string, days: number): string {
  return new Date(toUtc(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Selisih hari `to` - `from` (positif bila `to` sesudah `from`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY);
}

/** Id tagihan induk dari `period` tagihan denda; null bila bukan tagihan denda. */
export function lateFeeParentId(period: string | null): string | null {
  return period?.startsWith(LATE_FEE_PERIOD_PREFIX) ? period.slice(LATE_FEE_PERIOD_PREFIX.length) : null;
}

/**
 * Denda keterlambatan satu tagihan, rupiah bulat. 0 bila tidak ada denda (`none`), tidak ada sisa, atau hari ini belum
 * melewati `dueDate` + `graceDays` (hari terakhir toleransi masih belum kena denda). `flat` = nilai tetap; `percent` =
 * persen dari sisa tagihan, dibulatkan ke rupiah terdekat; hasil dibatasi `capAmount` bila ada.
 */
export function computeLateFee(setting: LateFeeSetting, input: LateFeeInput): number {
  if (setting.mode === 'none') return 0;
  if (input.outstanding <= 0) return 0;
  const lastFreeDay = addDays(input.dueDate, Math.max(0, setting.graceDays));
  if (input.today <= lastFreeDay) return 0;
  const raw = setting.mode === 'flat' ? setting.value : Math.round((input.outstanding * setting.value) / 100);
  const capped = setting.capAmount === null ? raw : Math.min(raw, setting.capAmount);
  return Math.max(0, Math.round(capped));
}
