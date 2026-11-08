/**
 * Aturan isian wali siswa, sama dengan zod di apps/api/src/routes/guardians.ts: nama wajib (maks. 120), NIK opsional
 * (16 digit), telepon opsional (maks. 30, harus bisa dinormalkan), email opsional (format sah, maks. 254), alamat
 * opsional (maks. 300), pekerjaan opsional (maks. 120).
 */
import { compact, optionalEmail, optionalPhone, optionalText, requiredText } from '../../../lib/area-rules';
import { type FieldErrors, optionalNik } from '../../../lib/form-validation';

export interface GuardianValues {
  name: string;
  nik: string;
  phone: string;
  email: string;
  occupation: string;
  address: string;
}
export type GuardianField = keyof GuardianValues;
export const GUARDIAN_ORDER: GuardianField[] = ['name', 'nik', 'phone', 'email', 'occupation', 'address'];

export function validateGuardian(v: GuardianValues): FieldErrors<GuardianField> {
  return compact<GuardianField>([
    ['name', requiredText(v.name, 120)],
    ['nik', optionalNik(v.nik)],
    ['phone', optionalPhone(v.phone)],
    ['email', optionalEmail(v.email)],
    ['occupation', optionalText(v.occupation, 120)],
    ['address', optionalText(v.address, 300)],
  ]);
}
