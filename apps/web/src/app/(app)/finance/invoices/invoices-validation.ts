/**
 * Aturan isian dialog di halaman Tagihan (buat massal, ubah diskon/jatuh tempo, pecah cicilan, batalkan). Mengikuti zod
 * di apps/api/src/routes/finance.ts; murni, tanpa React.
 */

import type { FieldErrors, FieldIssue } from '@/lib/form-validation';
import { compact, requiredDate } from '../../../../lib/area-rules';
import { optionalText, requiredChoice } from '../../../../lib/form-issues';
import { financeIssue, installmentCount, rupiahAmount, voidReason } from '../finance-rules';

// ---------------------------------------------------------------------------------------------------------------------
// Buat tagihan massal

export interface GenerateValues {
  feeTypeId: string;
  /** Jenis biaya terpilih: bulanan wajib periode TTTT-BB, semester wajib S1/S2, lainnya tanpa periode. */
  kind: 'monthly' | 'semester' | 'one_time' | 'yearly' | null;
  period: string;
  dueDate: string;
  installments: string;
}
export type GenerateField = 'feeTypeId' | 'period' | 'dueDate' | 'installments';
export const GENERATE_ORDER: GenerateField[] = ['feeTypeId', 'period', 'dueDate', 'installments'];

function periodIssue(kind: GenerateValues['kind'], period: string): FieldIssue | undefined {
  if (kind === 'monthly') {
    if (period === '') return { code: 'required' };
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? undefined : financeIssue('periodMonthInvalid');
  }
  if (kind === 'semester') {
    if (period === '') return { code: 'required' };
    return period === 'S1' || period === 'S2' ? undefined : financeIssue('periodSemesterInvalid');
  }
  return undefined;
}

/** Cicilan (2..12) hanya untuk jenis non-bulanan dan opsional (kosong = satu tagihan). */
export function validateGenerate(v: GenerateValues): FieldErrors<GenerateField> {
  return compact<GenerateField>([
    ['feeTypeId', requiredChoice(v.feeTypeId)],
    ['period', periodIssue(v.kind, v.period)],
    ['dueDate', requiredDate(v.dueDate)],
    [
      'installments',
      v.kind === null || v.kind === 'monthly' || v.installments === ''
        ? undefined
        : installmentCount(v.installments),
    ],
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Ubah diskon dan jatuh tempo

export interface InvoiceEditValues {
  discount: string;
  discountReason: string;
  dueDate: string;
  /** Nominal tagihan dan yang sudah dibayar, untuk batas atas diskon. */
  amount: number;
  paid: number;
}
export type InvoiceEditField = 'discount' | 'dueDate' | 'discountReason';
export const INVOICE_EDIT_ORDER: InvoiceEditField[] = ['discount', 'dueDate', 'discountReason'];

/**
 * Diskon rupiah bulat >= 0 (kosong dianggap 0), tidak melebihi nominal tagihan dikurangi yang sudah dibayar (API:
 * 400 `invalid_discount` dan 409 `overpay`); jatuh tempo wajib; alasan maksimal 300.
 */
export function validateInvoiceEdit(v: InvoiceEditValues): FieldErrors<InvoiceEditField> {
  const limit = Math.max(0, v.amount - v.paid);
  const base = rupiahAmount(v.discount, { min: 0, required: false });
  const n = v.discount.trim() === '' ? 0 : Number(v.discount);
  return compact<InvoiceEditField>([
    ['discount', base ?? (n > limit ? financeIssue('discountOver', { max: limit }) : undefined)],
    ['dueDate', requiredDate(v.dueDate)],
    ['discountReason', optionalText(v.discountReason, 300)],
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Pecah menjadi cicilan

export interface SplitValues {
  count: string;
  firstDue: string;
}
export type SplitField = keyof SplitValues;
export const SPLIT_ORDER: SplitField[] = ['count', 'firstDue'];

/** Jumlah cicilan 2..12 dan jatuh tempo pertama wajib. */
export function validateSplit(v: SplitValues): FieldErrors<SplitField> {
  return compact<SplitField>([
    ['count', installmentCount(v.count)],
    ['firstDue', requiredDate(v.firstDue)],
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Batalkan tagihan

export type VoidField = 'reason';
export const VOID_ORDER: VoidField[] = ['reason'];

/** Alasan wajib, 1..300 karakter. */
export function validateVoid(v: { reason: string }): FieldErrors<VoidField> {
  return compact<VoidField>([['reason', voidReason(v.reason)]]);
}
