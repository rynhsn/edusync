/**
 * Aturan isian rapor, sama dengan zod di apps/api/src/routes/report-card.ts:
 * - catatan wali kelas: opsional, maks. 500;
 * - pengaturan: nama kepala sekolah maks. 120, NIP maks. 40, kota maks. 80, alamat maks. 300 (semuanya opsional);
 *   deskripsi capaian predikat A sampai D wajib diisi, maks. 500.
 * Kolom isian di layar membatasi deskripsi 300 dan alamat 200 karakter (batas tampilan yang sudah ada), lebih ketat dari API.
 */
import { compact, optionalText, requiredText } from '../../../lib/area-rules';
import type { FieldErrors } from '../../../lib/form-validation';

export function validateHomeroomNote(note: string) {
  return compact<'note'>([['note', optionalText(note, 500)]]);
}

export interface ReportSettingsValues {
  principalName: string;
  principalNip: string;
  city: string;
  address: string;
  descA: string;
  descB: string;
  descC: string;
  descD: string;
}
export type ReportSettingsField = keyof ReportSettingsValues;
export const REPORT_SETTINGS_ORDER: ReportSettingsField[] = [
  'principalName',
  'principalNip',
  'city',
  'address',
  'descA',
  'descB',
  'descC',
  'descD',
];

export function validateReportSettings(v: ReportSettingsValues): FieldErrors<ReportSettingsField> {
  return compact<ReportSettingsField>([
    ['principalName', optionalText(v.principalName, 120)],
    ['principalNip', optionalText(v.principalNip, 40)],
    ['city', optionalText(v.city, 80)],
    ['address', optionalText(v.address, 300)],
    ['descA', requiredText(v.descA, 500)],
    ['descB', requiredText(v.descB, 500)],
    ['descC', requiredText(v.descC, 500)],
    ['descD', requiredText(v.descD, 500)],
  ]);
}
