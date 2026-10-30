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
