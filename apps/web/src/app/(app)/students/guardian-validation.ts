/**
 * Aturan isian wali siswa, sama dengan zod di apps/api/src/routes/guardians.ts: nama wajib (maks. 120), telepon opsional
 * (maks. 30, harus bisa dinormalkan), email opsional (format sah, maks. 254).
 */
import { compact, optionalEmail, optionalPhone, requiredText } from '../../../lib/area-rules';
import type { FieldErrors } from '../../../lib/form-validation';

export interface GuardianValues {
  name: string;
  phone: string;
  email: string;
}
export type GuardianField = keyof GuardianValues;
export const GUARDIAN_ORDER: GuardianField[] = ['name', 'phone', 'email'];

export function validateGuardian(v: GuardianValues): FieldErrors<GuardianField> {
  return compact<GuardianField>([
    ['name', requiredText(v.name, 120)],
    ['phone', optionalPhone(v.phone)],
    ['email', optionalEmail(v.email)],
  ]);
}
