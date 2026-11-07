/**
 * Aturan isian tahun ajaran dan semester, sama dengan zod di apps/api/src/routes/academic-years.ts dan semesters.ts:
 * nama wajib (maks. 40), tanggal mulai dan selesai wajib, selesai harus setelah mulai (tidak boleh sama).
 * Pemeriksaan "semester di dalam tahun ajaran" dan "tidak tumpang tindih" tetap di server (butuh data lain).
 */
import { areaIssue, compact, requiredDate, requiredText } from '../../../lib/area-rules';
import type { FieldErrors } from '../../../lib/form-validation';

export interface PeriodValues {
  name: string;
  startsOn: string;
  endsOn: string;
}
export type PeriodField = keyof PeriodValues;

/** Urutan isian di formulir, untuk memfokuskan isian salah pertama. */
export const PERIOD_ORDER: PeriodField[] = ['name', 'startsOn', 'endsOn'];

export function validatePeriod(v: PeriodValues): FieldErrors<PeriodField> {
  const startsOn = requiredDate(v.startsOn);
  const endsOn = requiredDate(v.endsOn);
  return compact<PeriodField>([
    ['name', requiredText(v.name, 40)],
    ['startsOn', startsOn],
    ['endsOn', endsOn ?? (!startsOn && v.startsOn >= v.endsOn ? areaIssue('dateAfterStart') : undefined)],
  ]);
}
