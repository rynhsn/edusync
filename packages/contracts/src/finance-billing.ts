/**
 * Fungsi murni penagihan sekolah (periode, keringanan, cicilan). Dipakai bersama oleh API (tagihan massal manual),
 * penagihan otomatis di worker, dan web. Semua nominal rupiah bulat; tanggal berbentuk TTTT-BB-HH.
 */
import { formatMonthYearId } from './messaging';

/** "2026-08" menjadi "Agustus 2026". */
export const periodLabel = formatMonthYearId;

export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Periode biaya semester: `S1` (ganjil) dan `S2` (genap), urut menurut tanggal mulai semester pada tahun ajaran itu. */
export const SEMESTER_PERIODS = ['S1', 'S2'] as const;
export type SemesterPeriod = (typeof SEMESTER_PERIODS)[number];
export const SEMESTER_PERIOD_PATTERN = /^S[12]$/;
/** Periode yang sah untuk penyaring tagihan: bulan (TTTT-BB) atau semester (S1/S2). */
export const FILTER_PERIOD_PATTERN = /^(\d{4}-(0[1-9]|1[0-2])|S[12])$/;

/** "S1" menjadi "Semester Ganjil", "S2" menjadi "Semester Genap". */
export function semesterLabel(period: SemesterPeriod): string {
  return period === 'S1' ? 'Semester Ganjil' : 'Semester Genap';
}

/** Apakah `period` periode cicilan: `C01`.. untuk biaya biasa, `S1C01`.. untuk biaya semester (agar tidak bentrok antarsemester). */
export function isInstallmentPeriodOf(period: string | null, semesterPeriod: string | null): boolean {
  if (period === null) return false;
  return semesterPeriod === null
    ? /^C\d{2}$/.test(period)
    : new RegExp(`^${semesterPeriod}C\\d{2}$`).test(period);
}

export interface DiscountRuleLite {
  name: string;
  kind: 'percent' | 'amount';
  value: number;
}

/**
 * Diskon dari sekumpulan aturan atas satu nominal: persen dihitung per aturan dan dibulatkan ke bawah, ditambah
 * nominal tetap, lalu dibatasi paling banyak sebesar nominal.
 */
export function discountFor(amount: number, rules: DiscountRuleLite[]): number {
  let total = 0;
  for (const r of rules) total += r.kind === 'percent' ? Math.floor((r.value * amount) / 100) : r.value;
  return Math.min(amount, total);
}

/** Bagi rata `total` menjadi `n` bagian; sisa pembagian masuk ke bagian pertama. */
export function splitEven(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const parts = Array.from({ length: n }, () => base);
  parts[0] = base + (total - base * n);
  return parts;
}

/**
 * Bagi `discount` secara proporsional terhadap `amounts` (floor per bagian, sisa ke bagian pertama). Jumlahnya selalu
 * sama dengan `discount`, dan tiap bagian tidak melebihi nominalnya (kelebihan dialirkan ke bagian berikutnya).
 */
export function splitDiscount(discount: number, amounts: number[]): number[] {
  const total = amounts.reduce((a, b) => a + b, 0);
  if (total === 0 || discount <= 0) return amounts.map(() => 0);
  const parts = amounts.map((a) => Math.floor((discount * a) / total));
  parts[0] = discount - parts.slice(1).reduce((a, b) => a + b, 0);
  let overflow = 0;
  for (let i = 0; i < parts.length; i++) {
    const cap = amounts[i] as number;
    if ((parts[i] as number) > cap) {
      overflow += (parts[i] as number) - cap;
      parts[i] = cap;
    }
  }
  for (let i = 0; i < parts.length && overflow > 0; i++) {
    const room = (amounts[i] as number) - (parts[i] as number);
    const add = Math.min(room, overflow);
    parts[i] = (parts[i] as number) + add;
    overflow -= add;
  }
  return parts;
}

/** Tanggal TTTT-BB-HH ditambah `months` bulan; hari dijepit ke akhir bulan tujuan (31 Jan + 1 bulan = 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(year, 4)}-${pad(month)}-${pad(Math.min(d, lastDay))}`;
}

export interface InstallmentPart {
  period: string;
  title: string;
  amount: number;
  discount: number;
  dueDate: string;
}

/**
 * Rincian cicilan 1..n: periode `C01`.. (diawali `periodPrefix`, mis. `S1` untuk biaya semester), judul
 * "<dasar> (cicilan i/n) <akhiran>", nominal, diskon, dan jatuh tempo bulanan.
 */
export function installmentParts(opts: {
  base: string;
  suffix: string;
  periodPrefix?: string;
  amount: number;
  discount: number;
  installments: number;
  firstDueDate: string;
}): InstallmentPart[] {
  const { installments: n } = opts;
  const amounts = splitEven(opts.amount, n);
  const discounts = splitDiscount(opts.discount, amounts);
  return amounts.map((amount, i) => ({
    period: `${opts.periodPrefix ?? ''}C${String(i + 1).padStart(2, '0')}`,
    title: `${opts.base} (cicilan ${i + 1}/${n})${opts.suffix ? ` ${opts.suffix}` : ''}`,
    amount,
    discount: discounts[i] as number,
    dueDate: addMonths(opts.firstDueDate, i),
  }));
}
