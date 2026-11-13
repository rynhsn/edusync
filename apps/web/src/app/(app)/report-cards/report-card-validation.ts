/**
 * Aturan isian rapor, sama dengan zod di apps/api/src/routes/report-card.ts:
 * - catatan wali kelas: opsional, maks. 500;
 * - pengaturan: nama kepala sekolah maks. 120, NIP maks. 40, kota maks. 80, alamat maks. 300 (semuanya opsional);
 *   deskripsi capaian predikat A sampai D wajib diisi, maks. 500.
 * - catatan kokurikuler/perkembangan maks. 1.000, tanggapan wali 1-1.000, lama jendela tanggapan 1-365 hari atau kosong.
 * Kolom isian di layar membatasi deskripsi 300 dan alamat 200 karakter (batas tampilan yang sudah ada), lebih ketat dari API.
 */
import { compact, optionalText, requiredText } from '../../../lib/area-rules';
import { intInRange } from '../../../lib/form-issues';
import type { FieldErrors } from '../../../lib/form-validation';
import {
  RESPONSE_TEXT_MAX,
  RESPONSE_WINDOW_MAX_DAYS,
  RESPONSE_WINDOW_MIN_DAYS,
  SECTION_NOTE_MAX,
} from '../../../lib/report-v2';

export function validateHomeroomNote(note: string) {
  return compact<'note'>([['note', optionalText(note, 500)]]);
}

/** Catatan kokurikuler dan catatan perkembangan: opsional, maksimal 1.000 karakter (sama dengan API). */
export function validateSections(v: { cocurricularNote: string; developmentNote: string }) {
  return compact<'cocurricularNote' | 'developmentNote'>([
    ['cocurricularNote', optionalText(v.cocurricularNote, SECTION_NOTE_MAX)],
    ['developmentNote', optionalText(v.developmentNote, SECTION_NOTE_MAX)],
  ]);
}

/** Tanggapan orang tua/wali yang disalin staf: wajib, maksimal 1.000 karakter. */
export function validateResponseText(text: string) {
  return compact<'text'>([['text', requiredText(text, RESPONSE_TEXT_MAX)]]);
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
  /** Lama jendela tanggapan wali (hari); kosong = tanpa batas. Hanya diperiksa bila ada. */
  responseWindowDays?: string;
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
  'responseWindowDays',
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
    [
      'responseWindowDays',
      intInRange(v.responseWindowDays ?? '', RESPONSE_WINDOW_MIN_DAYS, RESPONSE_WINDOW_MAX_DAYS, {
        required: false,
      }),
    ],
  ]);
}
