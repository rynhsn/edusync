import {
  discountFor,
  installmentParts,
  isInstallmentPeriodOf,
  PERIOD_PATTERN,
  periodLabel,
  SEMESTER_PERIOD_PATTERN,
  type SemesterPeriod,
  semesterLabel,
} from '@edusync/contracts';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Tx } from './client';
import {
  academicYear,
  classRoom,
  enrollment,
  finDiscountRule,
  finFeePlan,
  finFeeTarget,
  finFeeType,
  finInvoice,
  finStudentDiscount,
  student,
} from './schema';

/**
 * Pembuatan tagihan massal per jenis biaya, dipakai bersama oleh `POST /v1/finance/invoices/generate` (manual) dan
 * penagihan otomatis di worker. Semua validasi, cakupan, keringanan, cicilan, dan idempotensi ada di sini; pemanggil
 * hanya menyediakan transaksi tenant (RLS) dan mencatat audit.
 */

export class FinanceGenerateError extends Error {
  constructor(
    readonly status: 400 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FinanceGenerateError';
  }
}

export interface GenerateInvoicesInput {
  schoolId: string;
  /** Penulis tagihan (`created_by`): id pengguna, atau penanda sistem untuk penagihan otomatis. */
  actorId: string;
  academicYearId: string;
  feeTypeId: string;
  /** TTTT-BB (bulanan), S1/S2 (semester), null (lainnya). */
  period: string | null;
  /** Batasi ke kelas-kelas ini (irisan dengan cakupan jenis biaya); null atau kosong = semua. */
  classIds: string[] | null;
  dueDate: string;
  installments: number | null;
}

export interface MissingPlanStudent {
  studentId: string;
  name: string;
  nis: string | null;
  className: string;
  level: string;
}

export interface GenerateInvoicesResult {
  created: number;
  skipped: number;
  free: number;
  discounted: number;
  outOfScope: number;
  missingPlan: MissingPlanStudent[];
  /** Cakupan jenis biaya yang dipakai (untuk audit). */
  scope: string;
}

export async function generateInvoices(
  tx: Tx,
  input: GenerateInvoicesInput,
): Promise<GenerateInvoicesResult> {
  const { period, installments } = input;
  const classIds = input.classIds && input.classIds.length > 0 ? input.classIds : null;

  const [year] = await tx.select().from(academicYear).where(eq(academicYear.id, input.academicYearId));
  if (!year) throw new FinanceGenerateError(400, 'invalid_reference', 'Tahun ajaran tidak ditemukan.');
  const [fee] = await tx.select().from(finFeeType).where(eq(finFeeType.id, input.feeTypeId));
  if (!fee) throw new FinanceGenerateError(400, 'invalid_reference', 'Jenis biaya tidak ditemukan.');

  if (fee.kind === 'monthly') {
    if (!period || !PERIOD_PATTERN.test(period)) {
      throw new FinanceGenerateError(
        400,
        'period_required',
        'Biaya bulanan wajib punya periode berformat TTTT-BB.',
      );
    }
  } else if (fee.kind === 'semester') {
    if (!period) {
      throw new FinanceGenerateError(
        400,
        'period_required',
        'Biaya semester wajib punya periode S1 (ganjil) atau S2 (genap).',
      );
    }
    if (!SEMESTER_PERIOD_PATTERN.test(period)) {
      throw new FinanceGenerateError(
        400,
        'period_invalid',
        'Periode biaya semester hanya S1 (ganjil) atau S2 (genap).',
      );
    }
  } else if (period !== null) {
    throw new FinanceGenerateError(
      400,
      'period_required',
      'Periode hanya untuk biaya bulanan dan semester; isi null untuk jenis ini.',
    );
  }
  const semesterPeriod = fee.kind === 'semester' ? (period as SemesterPeriod) : null;
  if (!fee.active) throw new FinanceGenerateError(409, 'inactive', 'Jenis biaya ini tidak aktif.');
  if (installments !== null && (fee.kind === 'monthly' || installments < 2 || installments > 12)) {
    throw new FinanceGenerateError(
      400,
      'installments_invalid',
      'Cicilan hanya untuk biaya non-bulanan dan harus 2 sampai 12 kali.',
    );
  }
  if (classIds) {
    const found = await tx
      .select({ id: classRoom.id })
      .from(classRoom)
      .where(and(inArray(classRoom.id, classIds), eq(classRoom.academicYearId, year.id)));
    if (found.length !== new Set(classIds).size) {
      throw new FinanceGenerateError(
        400,
        'invalid_reference',
        'Kelas tidak ditemukan pada tahun ajaran itu.',
      );
    }
  }

  const plans = await tx
    .select()
    .from(finFeePlan)
    .where(and(eq(finFeePlan.academicYearId, year.id), eq(finFeePlan.feeTypeId, fee.id)));
  const byLevel = new Map(plans.filter((p) => p.level !== null).map((p) => [p.level as string, p.amount]));
  const allLevels = plans.find((p) => p.level === null)?.amount;

  const roster = await tx
    .select({
      id: student.id,
      name: student.name,
      nis: student.nis,
      classId: enrollment.classId,
      className: classRoom.name,
      level: classRoom.level,
    })
    .from(enrollment)
    .innerJoin(student, eq(student.id, enrollment.studentId))
    .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
    .where(
      and(
        eq(enrollment.academicYearId, year.id),
        isNull(student.deletedAt),
        eq(student.status, 'active'),
        classIds ? inArray(enrollment.classId, classIds) : undefined,
      ),
    )
    .orderBy(asc(student.name), asc(student.id));

  // Cakupan jenis biaya: hanya siswa yang termasuk sasaran yang ditagih.
  let outOfScope = 0;
  if (fee.scope !== 'all') {
    const targets = await tx.select().from(finFeeTarget).where(eq(finFeeTarget.feeTypeId, fee.id));
    const classTargets = new Set(targets.map((t) => t.classId).filter((v): v is string => v !== null));
    const studentTargets = new Set(targets.map((t) => t.studentId).filter((v): v is string => v !== null));
    const inScope = roster.filter((s) =>
      fee.scope === 'class' ? classTargets.has(s.classId) : studentTargets.has(s.id),
    );
    outOfScope = roster.length - inScope.length;
    roster.splice(0, roster.length, ...inScope);
  }

  const existing = await tx
    .select({ studentId: finInvoice.studentId, period: finInvoice.period })
    .from(finInvoice)
    .where(and(eq(finInvoice.academicYearId, year.id), eq(finInvoice.feeTypeId, fee.id)));
  // Mode cicilan: siswa dengan tagihan apa pun (utuh atau cicilan) dilewati. Mode biasa: periode yang sama,
  // atau sudah dicicil (periode C..) agar tidak tertagih dua kali.
  // Biaya semester: cicilan berperiode `S1C01`.. dan hanya semester yang sama yang dihitung.
  const have = new Set(
    existing
      .filter((e) =>
        semesterPeriod !== null
          ? e.period === semesterPeriod || isInstallmentPeriodOf(e.period, semesterPeriod)
          : installments !== null || (e.period ?? null) === period || isInstallmentPeriodOf(e.period, null),
      )
      .map((e) => e.studentId),
  );

  // Keringanan aktif yang terpasang pada tahun ajaran ini dan berlaku untuk jenis biaya ini.
  const assigned = await tx
    .select({
      studentId: finStudentDiscount.studentId,
      name: finDiscountRule.name,
      kind: finDiscountRule.kind,
      value: finDiscountRule.value,
    })
    .from(finStudentDiscount)
    .innerJoin(finDiscountRule, eq(finDiscountRule.id, finStudentDiscount.ruleId))
    .where(
      and(
        eq(finStudentDiscount.academicYearId, year.id),
        eq(finDiscountRule.active, true),
        sql`(${finDiscountRule.feeTypeId} is null or ${finDiscountRule.feeTypeId} = ${fee.id})`,
      ),
    )
    .orderBy(asc(finDiscountRule.name));
  const rulesByStudent = new Map<string, typeof assigned>();
  for (const a of assigned) {
    const list = rulesByStudent.get(a.studentId) ?? [];
    list.push(a);
    rulesByStudent.set(a.studentId, list);
  }

  const semesterName = semesterPeriod ? semesterLabel(semesterPeriod) : null;
  const title = semesterName
    ? `${fee.name} ${semesterName} ${year.name}`
    : period
      ? `${fee.name} ${periodLabel(period)}`
      : `${fee.name} ${year.name}`;
  const missingPlan: MissingPlanStudent[] = [];
  const toCreate: (typeof finInvoice.$inferInsert)[] = [];
  let skipped = 0;
  let free = 0;
  for (const s of roster) {
    if (have.has(s.id)) {
      skipped++;
      continue;
    }
    const amount = byLevel.get(s.level) ?? allLevels;
    if (amount === undefined) {
      missingPlan.push({
        studentId: s.id,
        name: s.name,
        nis: s.nis,
        className: s.className,
        level: s.level,
      });
      continue;
    }
    if (amount === 0) {
      free++;
      continue;
    }
    const rules = rulesByStudent.get(s.id) ?? [];
    const discount = discountFor(amount, rules);
    const discountReason =
      rules.length > 0 && discount > 0
        ? rules
            .map((r) => r.name)
            .join(', ')
            .slice(0, 300)
        : null;
    const base = {
      schoolId: input.schoolId,
      studentId: s.id,
      academicYearId: year.id,
      feeTypeId: fee.id,
    };
    if (installments === null) {
      toCreate.push({
        ...base,
        period,
        title,
        amount,
        discount,
        discountReason,
        dueDate: input.dueDate,
        createdBy: input.actorId,
      });
    } else {
      for (const part of installmentParts({
        base: semesterName ? `${fee.name} ${semesterName}` : fee.name,
        suffix: year.name,
        ...(semesterPeriod ? { periodPrefix: semesterPeriod } : {}),
        amount,
        discount,
        installments,
        firstDueDate: input.dueDate,
      })) {
        toCreate.push({
          ...base,
          period: part.period,
          title: part.title,
          amount: part.amount,
          discount: part.discount,
          discountReason: part.discount > 0 ? discountReason : null,
          dueDate: part.dueDate,
          createdBy: input.actorId,
        });
      }
    }
  }

  let created = 0;
  for (let i = 0; i < toCreate.length; i += 500) {
    const inserted = await tx
      .insert(finInvoice)
      .values(toCreate.slice(i, i + 500))
      .onConflictDoNothing()
      .returning({ id: finInvoice.id });
    created += inserted.length;
  }
  skipped += toCreate.length - created;
  const discounted = toCreate.filter((r) => (r.discount ?? 0) > 0).length;
  return { created, skipped, free, discounted, outOfScope, missingPlan, scope: fee.scope };
}
