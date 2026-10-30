import {
  and,
  asc,
  classRoom,
  count,
  enrollment,
  eq,
  finFeeType,
  finInvoice,
  sql,
  student,
  type Tx,
} from '@edusync/db';
import { todayInJakarta } from './attendance-lib';

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'void';

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/** "2026-08" menjadi "Agustus 2026". */
export function periodLabel(period: string): string {
  const [year, month] = period.split('-');
  return `${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Jumlah yang sudah dibayar pada tagihan: item kwitansi yang tidak batal. Rujukan tabel ditulis lengkap karena dipakai di subquery. */
export const paidSql = sql<number>`coalesce((select sum(pi.amount) from fin_payment_item pi join fin_payment p on p.id = pi.payment_id where pi.invoice_id = "fin_invoice"."id" and p.voided_at is null), 0)::int`;

const netSql = sql`("fin_invoice"."amount" - "fin_invoice"."discount")`;

/** Status turunan; tidak pernah disimpan. */
export const statusSql = sql<InvoiceStatus>`case when "fin_invoice"."status" = 'void' then 'void' when ${paidSql} >= ${netSql} then 'paid' when ${paidSql} > 0 then 'partial' else 'unpaid' end`;

export interface InvoiceFilter {
  academicYearId?: string | undefined;
  classId?: string | undefined;
  studentId?: string | undefined;
  feeTypeId?: string | undefined;
  period?: string | undefined;
  status?: InvoiceStatus | undefined;
}

function conditions(f: InvoiceFilter) {
  return and(
    f.academicYearId ? eq(finInvoice.academicYearId, f.academicYearId) : undefined,
    f.classId ? eq(enrollment.classId, f.classId) : undefined,
    f.studentId ? eq(finInvoice.studentId, f.studentId) : undefined,
    f.feeTypeId ? eq(finInvoice.feeTypeId, f.feeTypeId) : undefined,
    f.period ? eq(finInvoice.period, f.period) : undefined,
    f.status ? sql`${statusSql} = ${f.status}` : undefined,
  );
}

export interface InvoiceView {
  id: string;
  studentId: string;
  studentName: string;
  nis: string | null;
  className: string | null;
  feeTypeId: string;
  feeTypeName: string;
  title: string;
  period: string | null;
  amount: number;
  discount: number;
  discountReason: string | null;
  paid: number;
  outstanding: number;
  dueDate: string;
  status: InvoiceStatus;
  overdue: boolean;
}

/**
 * Tagihan beserta jumlah terbayar dan status turunan. Tagihan batal tidak punya sisa. `overdue` = masih ada sisa dan
 * jatuh tempo sebelum `asOf` (bawaan hari ini menurut zona Jakarta).
 */
export async function invoiceRows(
  tx: Tx,
  filter: InvoiceFilter,
  options: { limit?: number; offset?: number; asOf?: string } = {},
): Promise<{ items: InvoiceView[]; total: number }> {
  const where = conditions(filter);
  const asOf = options.asOf ?? todayInJakarta();
  const query = tx
    .select({
      id: finInvoice.id,
      studentId: finInvoice.studentId,
      studentName: student.name,
      nis: student.nis,
      className: classRoom.name,
      feeTypeId: finInvoice.feeTypeId,
      feeTypeName: finFeeType.name,
      title: finInvoice.title,
      period: finInvoice.period,
      amount: finInvoice.amount,
      discount: finInvoice.discount,
      discountReason: finInvoice.discountReason,
      dueDate: finInvoice.dueDate,
      paid: paidSql,
      status: statusSql,
    })
    .from(finInvoice)
    .innerJoin(student, eq(student.id, finInvoice.studentId))
    .innerJoin(finFeeType, eq(finFeeType.id, finInvoice.feeTypeId))
    .leftJoin(
      enrollment,
      and(
        eq(enrollment.studentId, finInvoice.studentId),
        eq(enrollment.academicYearId, finInvoice.academicYearId),
      ),
    )
    .leftJoin(classRoom, eq(classRoom.id, enrollment.classId))
    .where(where)
    .orderBy(asc(finInvoice.dueDate), asc(student.name), asc(finInvoice.title), asc(finInvoice.id));
  const rows = await (options.limit === undefined
    ? query
    : query.limit(options.limit).offset(options.offset ?? 0));

  const [totalRow] = await tx
    .select({ n: count() })
    .from(finInvoice)
    .leftJoin(
      enrollment,
      and(
        eq(enrollment.studentId, finInvoice.studentId),
        eq(enrollment.academicYearId, finInvoice.academicYearId),
      ),
    )
    .where(where);

  const items = rows.map((r) => {
    const outstanding = r.status === 'void' ? 0 : Math.max(0, r.amount - r.discount - r.paid);
    return {
      ...r,
      paid: r.status === 'void' ? 0 : r.paid,
      outstanding,
      overdue: outstanding > 0 && r.dueDate < asOf,
    };
  });
  return { items, total: totalRow?.n ?? 0 };
}

/* ---------- Keringanan dan cicilan ---------- */

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

/** Rincian cicilan 1..n: periode `C01`.., judul "<dasar> (cicilan i/n) <akhiran>", nominal, diskon, dan jatuh tempo bulanan. */
export function installmentParts(opts: {
  base: string;
  suffix: string;
  amount: number;
  discount: number;
  installments: number;
  firstDueDate: string;
}): InstallmentPart[] {
  const { installments: n } = opts;
  const amounts = splitEven(opts.amount, n);
  const discounts = splitDiscount(opts.discount, amounts);
  return amounts.map((amount, i) => ({
    period: `C${String(i + 1).padStart(2, '0')}`,
    title: `${opts.base} (cicilan ${i + 1}/${n})${opts.suffix ? ` ${opts.suffix}` : ''}`,
    amount,
    discount: discounts[i] as number,
    dueDate: addMonths(opts.firstDueDate, i),
  }));
}

/** Jumlah terbayar per tagihan (kwitansi tidak batal) untuk tagihan yang sudah dikunci. */
export async function paidFor(tx: Tx, invoiceIds: string[]) {
  const map = new Map<string, number>();
  if (invoiceIds.length === 0) return map;
  const rows = await tx.execute<{ invoice_id: string; paid: number }>(sql`
    select pi.invoice_id, sum(pi.amount)::int as paid
    from fin_payment_item pi join fin_payment p on p.id = pi.payment_id
    where pi.invoice_id in (${sql.join(
      invoiceIds.map((i) => sql`${i}::uuid`),
      sql`, `,
    )}) and p.voided_at is null
    group by pi.invoice_id`);
  for (const r of rows.rows) map.set(r.invoice_id, Number(r.paid));
  return map;
}
