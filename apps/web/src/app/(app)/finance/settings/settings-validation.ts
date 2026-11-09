/**
 * Aturan isian formulir Pengaturan keuangan (jenis biaya, tarif, aturan keringanan, pemasangan keringanan, denda,
 * metode pembayaran, rekening bank). Mengikuti zod di apps/api/src/routes/finance*.ts; murni, tanpa React.
 */

import type { FieldErrors, FieldIssue } from '@/lib/form-validation';
import { compact, optionalText, requiredTextMin } from '../../../../lib/area-rules';
import { customIssue, intInRange, requiredChoice, requiredText } from '../../../../lib/form-issues';
import { type FeeScope, MAX_CLASS_TARGETS, MAX_STUDENT_TARGETS, scopeError } from '../fee-scope';
import { financeIssue, rupiahAmount } from '../finance-rules';
import type { LateFeeDraft } from '../late-fee';

// ---------------------------------------------------------------------------------------------------------------------
// Jenis biaya

export interface FeeTypeValues {
  name: string;
  scope: FeeScope;
  classIds: string[];
  studentIds: string[];
}
export type FeeTypeField = 'name' | 'scope';
export const FEE_TYPE_ORDER: FeeTypeField[] = ['name', 'scope'];

/** Nama 1..80, dan cakupan kelas/siswa wajib punya sasaran (maksimal 500 kelas, 2000 siswa). */
export function validateFeeType(v: FeeTypeValues): FieldErrors<FeeTypeField> {
  const scope = scopeError({ scope: v.scope, classIds: v.classIds, studentIds: v.studentIds });
  return compact<FeeTypeField>([
    ['name', requiredText(v.name, 80)],
    [
      'scope',
      scope === 'targets_required'
        ? customIssue('finance.feeScopeTargetsRequired')
        : scope === 'too_many'
          ? financeIssue('targetsTooMany', {
              max: v.scope === 'class' ? MAX_CLASS_TARGETS : MAX_STUDENT_TARGETS,
            })
          : undefined,
    ],
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Tarif

export interface PlanValues {
  feeTypeId: string;
  amount: string;
}
export type PlanField = keyof PlanValues;
export const PLAN_ORDER: PlanField[] = ['feeTypeId', 'amount'];

/** Jenis biaya dipilih; nominal bulat 0..2.000.000.000 (0 = gratis, sama dengan API). */
export function validatePlan(v: PlanValues): FieldErrors<PlanField> {
  return compact<PlanField>([
    ['feeTypeId', requiredChoice(v.feeTypeId)],
    ['amount', rupiahAmount(v.amount, { min: 0 })],
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Aturan keringanan

export interface DiscountRuleValues {
  name: string;
  kind: 'percent' | 'amount';
  value: string;
}
export type DiscountRuleField = 'name' | 'value';
export const DISCOUNT_RULE_ORDER: DiscountRuleField[] = ['name', 'value'];

/** Nama 1..80; persen 1..100 atau nominal rupiah > 0 sampai 2.000.000.000. */
export function validateDiscountRule(v: DiscountRuleValues): FieldErrors<DiscountRuleField> {
  return compact<DiscountRuleField>([
    ['name', requiredText(v.name, 80)],
    [
      'value',
      v.kind === 'percent'
        ? intInRange(v.value, 1, 100, { required: true })
        : rupiahAmount(v.value, { min: 1 }),
    ],
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Pemasangan keringanan

export interface AssignValues {
  ruleId: string;
  yearId: string;
  scope: 'class' | 'students';
  classId: string;
  pickedCount: number;
  reason: string;
}
export type AssignField = 'ruleId' | 'yearId' | 'classId' | 'students' | 'reason';
export const ASSIGN_ORDER: AssignField[] = ['ruleId', 'yearId', 'classId', 'students', 'reason'];

/** Jumlah siswa maksimal per pemasangan (sama dengan API). */
export const MAX_ASSIGN_STUDENTS = 300;

export function validateAssign(v: AssignValues): FieldErrors<AssignField> {
  return compact<AssignField>([
    ['ruleId', requiredChoice(v.ruleId)],
    ['yearId', requiredChoice(v.yearId)],
    ['classId', v.scope === 'class' ? requiredChoice(v.classId) : undefined],
    [
      'students',
      v.scope !== 'students'
        ? undefined
        : v.pickedCount === 0
          ? financeIssue('pickStudents')
          : v.pickedCount > MAX_ASSIGN_STUDENTS
            ? financeIssue('tooManyStudents', { max: MAX_ASSIGN_STUDENTS })
            : undefined,
    ],
    ['reason', optionalText(v.reason, 300)],
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Denda keterlambatan

export type LateFeeField = 'value' | 'graceDays' | 'dueDays' | 'capAmount' | 'feeTypeId';
export const LATE_FEE_ORDER: LateFeeField[] = ['value', 'graceDays', 'dueDays', 'capAmount', 'feeTypeId'];

/**
 * Mode `none` selalu benar. Selain itu: nilai persen 1..100 atau nominal > 0; toleransi 0..365 (kosong = 0); jatuh tempo
 * tagihan denda 1..365 hari; batas denda opsional > 0; jenis biaya denda wajib.
 */
export function validateLateFee(d: LateFeeDraft): FieldErrors<LateFeeField> {
  if (d.mode === 'none') return {};
  return compact<LateFeeField>([
    [
      'value',
      d.mode === 'percent'
        ? intInRange(d.value, 1, 100, { required: true })
        : rupiahAmount(d.value, { min: 1 }),
    ],
    ['graceDays', intInRange(d.graceDays, 0, 365, { required: false })],
    ['dueDays', intInRange(d.dueDays, 1, 365, { required: true })],
    ['capAmount', rupiahAmount(d.capAmount, { min: 1, required: false })],
    ['feeTypeId', requiredChoice(d.feeTypeId)],
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Metode pembayaran

export type PaymentMethodField = 'label';
export const PAYMENT_METHOD_ORDER: PaymentMethodField[] = ['label'];

/** Label 1..40 dan tidak kembar (tanpa membedakan huruf besar/kecil) dengan metode lain. */
export function validatePaymentMethod(
  v: { label: string },
  otherLabels: readonly string[],
): FieldErrors<PaymentMethodField> {
  const label = v.label.trim();
  const taken = otherLabels.some((l) => l.trim().toLowerCase() === label.toLowerCase());
  return compact<PaymentMethodField>([
    ['label', requiredText(v.label, 40) ?? (taken ? financeIssue('labelTaken') : undefined)],
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Rekening bank

export interface BankAccountValues {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  note: string;
}
export type BankAccountField = keyof BankAccountValues;
export const BANK_ACCOUNT_ORDER: BankAccountField[] = ['bankName', 'accountNumber', 'accountHolder', 'note'];

/** Nomor rekening: diawali angka, hanya angka/spasi/tanda hubung, 5..30 karakter dengan minimal 5 angka. */
export function accountNumberIssue(value: string): FieldIssue | undefined {
  const s = value.trim();
  if (s === '') return { code: 'required' };
  if (s.length > 30) return { code: 'tooLong', max: 30 };
  if (!/^[0-9][0-9 -]*$/.test(s)) return financeIssue('accountChars');
  if (s.length < 5 || s.replace(/\D/g, '').length < 5) return financeIssue('accountShort');
  return undefined;
}

export function validateBankAccount(v: BankAccountValues): FieldErrors<BankAccountField> {
  return compact<BankAccountField>([
    ['bankName', requiredTextMin(v.bankName, 2, 60)],
    ['accountNumber', accountNumberIssue(v.accountNumber)],
    ['accountHolder', requiredTextMin(v.accountHolder, 2, 100)],
    ['note', optionalText(v.note, 200)],
  ]);
}
