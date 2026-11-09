/**
 * Blok penyusun aturan isian formulir keuangan (murni, tanpa React). Aturannya mengikuti zod di API
 * (apps/api/src/routes/finance*.ts): nominal rupiah bulat 0..2.000.000.000, alasan 1..300 karakter, tanggal TTTT-BB-HH.
 * Hasilnya `FieldIssue`; pesan khusus keuangan memakai kunci `financeForms.*` di berkas pesan.
 */

import type { FieldIssue } from '@/lib/form-validation';
import { customIssue, requiredText } from '../../../lib/form-issues';

/** Batas atas nominal rupiah di API (`rupiah` di finance.ts). */
export const MAX_RUPIAH = 2_000_000_000;

/** Galat dengan pesan lengkap dari berkas pesan (`financeForms.<nama>`). */
export const financeIssue = (name: string, values?: Record<string, string | number>): FieldIssue =>
  customIssue(`financeForms.${name}`, values);

/**
 * Nominal rupiah bulat dari isian angka. `min` 1 berarti harus lebih dari 0. Kosong: `required` bila wajib,
 * selain itu lolos. `max` bawaan 2.000.000.000 (sama dengan API).
 */
export function rupiahAmount(
  value: string,
  options: { min: 0 | 1; required?: boolean; max?: number },
): FieldIssue | undefined {
  const v = value.trim();
  if (v === '') return options.required === false ? undefined : { code: 'required' };
  if (!/^\d+$/.test(v)) return { code: 'intInvalid' };
  const n = Number(v);
  if (options.min === 1 && n < 1) return financeIssue('amountPositive');
  const max = options.max ?? MAX_RUPIAH;
  if (n > max) return financeIssue(max === MAX_RUPIAH ? 'amountTooBig' : 'amountOver', { max });
  return undefined;
}

/** Alasan pembatalan: wajib, 1..300 karakter (sama dengan `reason` di API). */
export function voidReason(value: string): FieldIssue | undefined {
  return requiredText(value, 300);
}

/** Jumlah cicilan 2..12 dari isian pilihan; kosong = `required`. */
export function installmentCount(value: string): FieldIssue | undefined {
  const v = value.trim();
  if (v === '') return { code: 'required' };
  if (!/^\d+$/.test(v)) return { code: 'intInvalid' };
  const n = Number(v);
  return n < 2 || n > 12 ? { code: 'range', min: 2, max: 12 } : undefined;
}
