/**
 * Aturan isian formulir "Tagihan otomatis", sama dengan `validateAutoBillingRule` di packages/contracts (yang juga
 * dipakai API): bulanan wajib tanggal pembuatan 1-28, jatuh tempo menurut mode, semester wajib cara jalan, tahunan dan
 * sekali bayar wajib tanggal pembuatan, cicilan 2-12 hanya untuk non-bulanan. Murni (tanpa React).
 */
import {
  type AutoBillingDueMode,
  type AutoBillingKind,
  type AutoBillingRuleDraft,
  type AutoBillingSemesterRun,
  AUTO_BILLING_LIMITS as L,
  validateAutoBillingRule,
} from '@edusync/contracts';
import type { FieldErrors, FieldIssue } from '@/lib/form-validation';

export interface RuleForm {
  feeTypeId: string;
  /** Jenis biaya terpilih; null bila belum dipilih. */
  kind: AutoBillingKind | null;
  enabled: boolean;
  runDay: string;
  dueMode: AutoBillingDueMode;
  dueDay: string;
  dueDays: string;
  semesterRun: AutoBillingSemesterRun | '';
  semesterOffsetDays: string;
  runOn: string;
  installments: string;
  classIds: string[];
}

export type RuleField =
  | 'feeTypeId'
  | 'runDay'
  | 'dueDay'
  | 'dueDays'
  | 'semesterRun'
  | 'semesterOffsetDays'
  | 'runOn'
  | 'installments';

/** Urutan isian di formulir, untuk memfokuskan isian salah pertama. */
export const RULE_ORDER: RuleField[] = [
  'feeTypeId',
  'runDay',
  'semesterRun',
  'semesterOffsetDays',
  'runOn',
  'dueDay',
  'dueDays',
  'installments',
];

export const EMPTY_RULE_FORM: RuleForm = {
  feeTypeId: '',
  kind: null,
  enabled: true,
  runDay: '5',
  dueMode: 'fixed_day',
  dueDay: '10',
  dueDays: '14',
  semesterRun: 'start',
  semesterOffsetDays: '0',
  runOn: '',
  installments: '',
  classIds: [],
};

/** Teks angka bulat; kosong = null, selain angka bulat sah = NaN (ditolak validasi). */
function intOrNull(value: string): number | null {
  const v = value.trim();
  if (v === '') return null;
  return /^-?\d+$/.test(v) ? Number(v) : Number.NaN;
}

/** Bentuk draf aturan dari isian; kolom yang tak relevan untuk jenis biaya itu dikosongkan. */
export function toRuleDraft(f: RuleForm): AutoBillingRuleDraft | null {
  if (!f.kind) return null;
  const monthly = f.kind === 'monthly';
  const semester = f.kind === 'semester';
  const once = f.kind === 'one_time' || f.kind === 'yearly';
  const semesterRun = semester ? (f.semesterRun === '' ? null : f.semesterRun) : null;
  return {
    kind: f.kind,
    runDay: monthly ? intOrNull(f.runDay) : null,
    dueMode: f.dueMode,
    dueDay: f.dueMode === 'fixed_day' ? intOrNull(f.dueDay) : null,
    dueDays: f.dueMode === 'days_after' ? intOrNull(f.dueDays) : null,
    semesterRun,
    semesterOffsetDays: semesterRun === 'custom' ? intOrNull(f.semesterOffsetDays) : null,
    runOn: once ? (f.runOn === '' ? null : f.runOn) : null,
    installments: monthly ? null : intOrNull(f.installments),
  };
}

const RANGE: Record<string, { min: number; max: number }> = {
  runDay: { min: L.dayMin, max: L.dayMax },
  dueDay: { min: L.dayMin, max: L.dayMax },
  dueDays: { min: 0, max: L.dueDaysMax },
  semesterOffsetDays: { min: L.offsetMin, max: L.offsetMax },
  installments: { min: L.installmentsMin, max: L.installmentsMax },
};

export function validateRuleForm(f: RuleForm): FieldErrors<RuleField> {
  const out: FieldErrors<RuleField> = {};
  if (f.feeTypeId === '') out.feeTypeId = { code: 'choose' };
  const draft = toRuleDraft(f);
  if (!draft) return out;
  for (const issue of validateAutoBillingRule(draft)) {
    if (issue.code === 'not_allowed') continue;
    const field = issue.field as RuleField;
    let message: FieldIssue;
    if (issue.code === 'required') message = { code: 'required' };
    else if (field === 'runOn') message = { code: 'dateInvalid' };
    else message = { code: 'range', ...(RANGE[field] ?? { min: 0, max: 0 }) };
    out[field] = message;
  }
  return out;
}

/** Jatuh tempo jatuh di bulan berikutnya bila tanggal jatuh tempo lebih kecil dari tanggal pembuatan (bulanan). */
export function dueNextMonth(f: RuleForm): boolean {
  if (f.kind !== 'monthly' || f.dueMode !== 'fixed_day') return false;
  const run = intOrNull(f.runDay);
  const due = intOrNull(f.dueDay);
  return run !== null && due !== null && Number.isInteger(run) && Number.isInteger(due) && due < run;
}
