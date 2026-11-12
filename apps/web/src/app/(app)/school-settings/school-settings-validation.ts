/**
 * Aturan isian pengaturan sekolah (murni, mudah diuji). Mengikuti zod di apps/api/src/routes/school-settings.ts.
 */

import type { FieldErrors, FieldIssue } from '@/lib/form-validation';
import { compactErrors, customIssue, intInRange, optionalText, requiredText } from '../../../lib/form-issues';
import { optionalEmail, optionalUrl } from '../../../lib/form-issues-extra';

// Pengaturan umum -------------------------------------------------------------------------------------------------------

export interface GeneralValues {
  workingDayCount: number;
  semesterNames: string[];
  lessonStart: string;
  lessonMinutes: number;
}
export type GeneralField = 'workingDays' | 'semesters' | 'lessonStart' | 'lessonMinutes';
export const GENERAL_ORDER: GeneralField[] = ['workingDays', 'semesters', 'lessonStart', 'lessonMinutes'];

/** Nama semester: tidak kosong, maksimal 40, tidak kembar (tanpa membedakan huruf besar-kecil). */
export function semestersIssue(names: string[]): FieldIssue | undefined {
  const trimmed = names.map((n) => n.trim());
  if (trimmed.some((n) => n === '')) return customIssue('schoolSettings.semesterInvalid');
  if (trimmed.some((n) => n.length > 40)) return { code: 'tooLong', max: 40 };
  const lowered = trimmed.map((n) => n.toLowerCase());
  return new Set(lowered).size !== lowered.length ? customIssue('schoolSettings.semesterInvalid') : undefined;
}

export function validateGeneral(v: GeneralValues): FieldErrors<GeneralField> {
  return compactErrors<GeneralField>([
    ['workingDays', v.workingDayCount === 0 ? customIssue('schoolSettings.daysInvalid') : undefined],
    ['semesters', semestersIssue(v.semesterNames)],
    ['lessonStart', requiredText(v.lessonStart, 5)],
    [
      'lessonMinutes',
      intInRange(Number.isNaN(v.lessonMinutes) ? '' : String(v.lessonMinutes), 10, 180, { required: true }),
    ],
  ]);
}

// Tingkat ---------------------------------------------------------------------------------------------------------------

export interface LevelCreateValues {
  code: string;
  label: string;
  sort: string;
  /** Menit per JP (opsional, 1 sampai 300). */
  periodMinutes?: string;
  /** Minggu efektif per tahun (opsional, 1 sampai 60). */
  effectiveWeeks?: string;
}
export type LevelCreateField = keyof LevelCreateValues;
export const LEVEL_CREATE_ORDER: LevelCreateField[] = [
  'code',
  'label',
  'sort',
  'periodMinutes',
  'effectiveWeeks',
];

export function validateLevelCreate(v: LevelCreateValues): FieldErrors<LevelCreateField> {
  const code = v.code.trim();
  return compactErrors<LevelCreateField>([
    [
      'code',
      requiredText(v.code, 20) ?? (/^[A-Za-z0-9._-]+$/.test(code) ? undefined : { code: 'codeFormat' }),
    ],
    ['label', requiredText(v.label, 60)],
    ['sort', intInRange(v.sort, 0, 10_000, { required: false })],
    ['periodMinutes', intInRange(v.periodMinutes ?? '', 1, 300, { required: false })],
    ['effectiveWeeks', intInRange(v.effectiveWeeks ?? '', 1, 60, { required: false })],
  ]);
}

export interface LevelEditValues {
  label: string;
  sort: string;
  periodMinutes?: string;
  effectiveWeeks?: string;
}
export type LevelEditField = keyof LevelEditValues;
export const LEVEL_EDIT_ORDER: LevelEditField[] = ['label', 'sort', 'periodMinutes', 'effectiveWeeks'];

export function validateLevelEdit(v: LevelEditValues): FieldErrors<LevelEditField> {
  return compactErrors<LevelEditField>([
    ['label', requiredText(v.label, 60)],
    ['sort', intInRange(v.sort, 0, 10_000, { required: true })],
    ['periodMinutes', intInRange(v.periodMinutes ?? '', 1, 300, { required: false })],
    ['effectiveWeeks', intInRange(v.effectiveWeeks ?? '', 1, 60, { required: false })],
  ]);
}

// Identitas sekolah -----------------------------------------------------------------------------------------------------

export const IDENTITY_FIELDS = [
  'officialName',
  'street',
  'village',
  'district',
  'city',
  'province',
  'postalCode',
  'phone',
  'fax',
  'email',
  'website',
] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number];
export type IdentityValues = Record<IdentityField, string>;

const IDENTITY_MAX: Record<Exclude<IdentityField, 'email' | 'website'>, number> = {
  officialName: 200,
  street: 300,
  village: 100,
  district: 100,
  city: 100,
  province: 100,
  postalCode: 10,
  phone: 30,
  fax: 30,
};

/** Alamat tanpa skema ("www.sekolah.sch.id") dilengkapi https:// oleh API, jadi diperiksa dalam bentuk itu. */
export function websiteIssue(value: string): FieldIssue | undefined {
  const v = value.trim();
  if (v === '') return undefined;
  return optionalUrl(/^https?:\/\//i.test(v) ? v : `https://${v}`, 300);
}

export function validateIdentity(v: IdentityValues): FieldErrors<IdentityField> {
  return compactErrors<IdentityField>(
    IDENTITY_FIELDS.map((f): [IdentityField, FieldIssue | undefined] => {
      if (f === 'email') return [f, optionalEmail(v.email, 254)];
      if (f === 'website') return [f, websiteIssue(v.website)];
      return [f, optionalText(v[f], IDENTITY_MAX[f])];
    }),
  );
}
