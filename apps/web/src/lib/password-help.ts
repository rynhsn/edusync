import { type FieldErrors, normalizePhone } from './form-validation';

/** Isian formulir "Lapor lupa kata sandi" (halaman publik). Aturannya mengikuti zod di API (routes/password-help.ts). */
export type HelpField = 'name' | 'info' | 'phone' | 'identifier';

export interface HelpValues {
  name: string;
  info: string;
  phone: string;
  identifier: string;
}

export function validateHelp(v: HelpValues): FieldErrors<HelpField> {
  const errors: FieldErrors<HelpField> = {};
  const name = v.name.trim();
  if (name.length < 2) errors.name = { code: 'required' };
  else if (name.length > 120) errors.name = { code: 'tooLong', max: 120 };
  if (v.info.trim().length > 500) errors.info = { code: 'tooLong', max: 500 };
  if (!v.phone.trim()) errors.phone = { code: 'required' };
  else if (!normalizePhone(v.phone)) errors.phone = { code: 'phone' };
  if (v.identifier.trim().length > 120) errors.identifier = { code: 'tooLong', max: 120 };
  return errors;
}
