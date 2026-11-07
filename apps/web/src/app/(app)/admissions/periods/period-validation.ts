/**
 * Aturan isian gelombang SPMB dan jenis dokumen, sama dengan zod di apps/api/src/routes/admissions.ts
 * (periodBody) dan admission-document-types.ts (typeBody):
 * - gelombang: nama wajib (maks. 120), tingkat wajib (maks. 30), tahun ajaran wajib, tanggal buka dan tutup wajib
 *   dengan buka <= tutup (boleh sama), kuota opsional bilangan bulat 1..100.000;
 * - jenis dokumen: nama wajib (maks. 60).
 */
import {
  areaIssue,
  compact,
  optionalInt,
  requiredChoice,
  requiredDate,
  requiredText,
} from '../../../../lib/area-rules';
import type { FieldErrors } from '../../../../lib/form-validation';

export interface PeriodDraftValues {
  name: string;
  level: string;
  academicYearId: string;
  opensOn: string;
  closesOn: string;
  quota: string;
}
export type AdmissionPeriodField = keyof PeriodDraftValues;
export const ADMISSION_PERIOD_ORDER: AdmissionPeriodField[] = [
  'name',
  'level',
  'academicYearId',
  'opensOn',
  'closesOn',
  'quota',
];

export function validateAdmissionPeriod(v: PeriodDraftValues): FieldErrors<AdmissionPeriodField> {
  const opens = requiredDate(v.opensOn);
  const closes = requiredDate(v.closesOn);
  return compact<AdmissionPeriodField>([
    ['name', requiredText(v.name, 120)],
    ['level', requiredText(v.level, 30)],
    ['academicYearId', requiredChoice(v.academicYearId)],
    ['opensOn', opens],
    ['closesOn', closes ?? (!opens && v.opensOn > v.closesOn ? areaIssue('closeNotBeforeOpen') : undefined)],
    ['quota', optionalInt(v.quota, 1, 100_000)],
  ]);
}

export interface DocTypeValues {
  label: string;
}
export type DocTypeField = keyof DocTypeValues;
export const DOC_TYPE_ORDER: DocTypeField[] = ['label'];

export function validateDocType(v: DocTypeValues): FieldErrors<DocTypeField> {
  return compact<DocTypeField>([['label', requiredText(v.label, 60)]]);
}
