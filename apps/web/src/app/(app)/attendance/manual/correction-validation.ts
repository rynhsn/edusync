/**
 * Aturan isian koreksi absensi: jam datang dan jam pulang boleh kosong; bila diisi harus terbaca sebagai jam
 * (7:05, 07:05, 07.05, 0705), dan jam pulang tidak boleh sebelum jam datang. Pemeriksaan "tidak ada perubahan" tetap
 * di buildCorrection dan tampil sebagai pesan dialog.
 */
import { areaIssue, compact } from '../../../../lib/area-rules';
import type { FieldErrors, FieldIssue } from '../../../../lib/form-validation';
import { parseHm } from './manual-logic';

export interface CorrectionTimes {
  checkIn: string;
  checkOut: string;
}
export type CorrectionField = keyof CorrectionTimes;
export const CORRECTION_ORDER: CorrectionField[] = ['checkIn', 'checkOut'];

const time = (value: string): FieldIssue | undefined =>
  value.trim() === '' || parseHm(value) ? undefined : areaIssue('timeInvalid');

export function validateCorrection(v: CorrectionTimes): FieldErrors<CorrectionField> {
  const inIssue = time(v.checkIn);
  const outIssue = time(v.checkOut);
  const a = parseHm(v.checkIn);
  const b = parseHm(v.checkOut);
  return compact<CorrectionField>([
    ['checkIn', inIssue],
    ['checkOut', outIssue ?? (a && b && b < a ? areaIssue('checkOutBeforeIn') : undefined)],
  ]);
}
