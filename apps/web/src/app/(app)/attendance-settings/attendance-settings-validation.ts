/**
 * Aturan isian pengaturan absensi, sama dengan zod dan pemeriksaan di apps/api/src/routes/gate.ts:
 * - kebijakan: jam terlambat dan jam pulang berbentuk HH:MM, jam terlambat harus lebih awal dari jam pulang
 *   (server: `lateAfter >= departureFrom` ditolak), jeda ulang bilangan bulat 0..600 detik;
 * - perangkat kiosk: nama 2..80 karakter setelah dipangkas.
 */
import { areaIssue, compact, isHm, requiredInt, requiredTextMin } from '../../../lib/area-rules';
import type { FieldErrors, FieldIssue } from '../../../lib/form-validation';

export interface PolicyValues {
  lateAfter: string;
  departureFrom: string;
  /** Teks apa adanya dari isian, supaya "abc" atau kosong bisa ditandai alih-alih diam-diam menjadi 0. */
  debounceSeconds: string;
}
export type PolicyField = keyof PolicyValues;
export const POLICY_ORDER: PolicyField[] = ['lateAfter', 'departureFrom', 'debounceSeconds'];

const hm = (value: string): FieldIssue | undefined => {
  if (value === '') return { code: 'required' };
  return isHm(value) ? undefined : areaIssue('timeInvalid');
};

export function validatePolicy(v: PolicyValues): FieldErrors<PolicyField> {
  const late = hm(v.lateAfter);
  const departure = hm(v.departureFrom);
  return compact<PolicyField>([
    ['lateAfter', late],
    [
      'departureFrom',
      departure ?? (!late && v.lateAfter >= v.departureFrom ? areaIssue('departureAfterLate') : undefined),
    ],
    ['debounceSeconds', requiredInt(v.debounceSeconds, 0, 600)],
  ]);
}

export interface DeviceValues {
  name: string;
}
export type DeviceField = keyof DeviceValues;
export const DEVICE_ORDER: DeviceField[] = ['name'];

export function validateDevice(v: DeviceValues): FieldErrors<DeviceField> {
  return compact<DeviceField>([['name', requiredTextMin(v.name, 2, 80)]]);
}
