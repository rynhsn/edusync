/**
 * Aturan isian Kasir (pembayaran dan pembatalan kwitansi). Mengikuti zod `POST /v1/finance/payments` di
 * apps/api/src/routes/finance.ts: 1..50 tagihan, tiap jumlah bilangan bulat 1..sisa tagihan, total paling banyak
 * 2.000.000.000, metode wajib, tanggal sah, catatan paling banyak 300. Murni, tanpa React.
 */

import type { FieldErrors, FieldIssue } from '@/lib/form-validation';
import { compact, requiredDate } from '../../../lib/area-rules';
import { optionalText, requiredChoice } from '../../../lib/form-issues';
import { financeIssue, MAX_RUPIAH, rupiahAmount, voidReason } from './finance-rules';

export interface PaymentLine {
  id: string;
  /** Jumlah yang dibayar, teks angka. */
  amount: string;
  /** Sisa tagihan saat ini. */
  outstanding: number;
}

export interface PaymentValues {
  lines: PaymentLine[];
  method: string;
  paidAt: string;
  note: string;
}

/** Jumlah tagihan maksimal per kwitansi (sama dengan API). */
export const MAX_PAYMENT_LINES = 50;

/** Kunci galat untuk jumlah bayar satu tagihan; id isiannya `fin-amt-<id tagihan>`. */
export const lineKey = (invoiceId: string) => `amt-${invoiceId}`;

/** Urutan isian di layar: daftar tagihan, jumlah per tagihan, metode, tanggal, catatan. */
export function paymentOrder(lines: readonly { id: string }[]): string[] {
  return ['lines', ...lines.map((l) => lineKey(l.id)), 'method', 'paidAt', 'note'];
}

function lineIssue(line: PaymentLine): FieldIssue | undefined {
  const base = rupiahAmount(line.amount, { min: 1 });
  if (base) return base;
  return Number(line.amount) > line.outstanding
    ? financeIssue('overOutstanding', { max: line.outstanding })
    : undefined;
}

export function validatePayment(v: PaymentValues): FieldErrors<string> {
  const total = v.lines.reduce((s, l) => s + (/^\d+$/.test(l.amount.trim()) ? Number(l.amount) : 0), 0);
  const entries: [string, FieldIssue | undefined][] = [
    [
      'lines',
      v.lines.length === 0
        ? financeIssue('pickInvoice')
        : v.lines.length > MAX_PAYMENT_LINES
          ? financeIssue('tooManyInvoices', { max: MAX_PAYMENT_LINES })
          : total > MAX_RUPIAH
            ? financeIssue('totalTooBig', { max: MAX_RUPIAH })
            : undefined,
    ],
    ...v.lines.map((l): [string, FieldIssue | undefined] => [lineKey(l.id), lineIssue(l)]),
    ['method', requiredChoice(v.method)],
    ['paidAt', requiredDate(v.paidAt)],
    ['note', optionalText(v.note, 300)],
  ];
  return compact<string>(entries);
}

export type ReasonField = 'reason';
export const REASON_ORDER: ReasonField[] = ['reason'];

/** Alasan pembatalan kwitansi: wajib, 1..300 karakter. */
export function validateReason(v: { reason: string }): FieldErrors<ReasonField> {
  return compact<ReasonField>([['reason', voidReason(v.reason)]]);
}
