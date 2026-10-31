/**
 * Tipe kwitansi dan laporan keuangan. Bentuk mengikuti GET /v1/finance/payments/{id} dan
 * GET /v1/finance/reports/{arrears,daily}. Ganti dengan tipe turunan api-types bila sudah tersedia di sana.
 */

/** Kunci metode pembayaran (dinamis per sekolah). */
export type PaymentMethod = string;

export interface ReceiptDoc {
  id: string;
  receiptNo: string;
  paidAt: string;
  method: PaymentMethod;
  /** Label dari pengaturan sekolah; bila kosong dipakai kunci. */
  methodLabel?: string;
  total: number;
  note: string | null;
  voided: boolean;
  voidReason: string | null;
  cashierName: string | null;
  school: { name: string; address: string | null };
  student: { id: string; name: string; nis: string | null; className: string | null };
  items: { invoiceId: string; title: string; amount: number }[];
}

export interface ArrearsRow {
  studentId: string;
  name: string;
  nis: string | null;
  className: string;
  openInvoices: number;
  outstanding: number;
  overdueOutstanding: number;
  oldestDue: string | null;
}

export interface ArrearsReport {
  rows: ArrearsRow[];
  totals: { outstanding: number; overdueOutstanding?: number; openInvoices?: number; students?: number };
}

export interface DailyReport {
  totals: { receipts: number; amount: number };
  byMethod: { method: string; methodLabel?: string; receipts: number; amount: number }[];
  byFeeType: { feeTypeName: string; amount: number }[];
  byDay: { date: string; receipts: number; amount: number }[];
}
