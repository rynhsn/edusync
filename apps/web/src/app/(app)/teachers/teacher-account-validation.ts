/**
 * Aturan dialog "tautkan akun / undang lewat email" untuk guru. Tautkan: akun wajib dipilih. Undang: email wajib,
 * maksimal 254, berbentuk email (pola sama dengan z.email() di API).
 */
import { compactErrors, requiredChoice } from '../../../lib/form-issues';
import { EMAIL, type FieldErrors, type FieldIssue } from '../../../lib/form-validation';

export type TeacherAccountField = 'pick' | 'email';
export const TEACHER_ACCOUNT_ORDER: TeacherAccountField[] = ['pick', 'email'];

export function validateTeacherAccount(
  mode: 'link' | 'invite',
  pick: string,
  email: string,
): FieldErrors<TeacherAccountField> {
  const e = email.trim();
  const emailIssue: FieldIssue | undefined =
    e === ''
      ? { code: 'required' }
      : e.length > 254
        ? { code: 'tooLong', max: 254 }
        : EMAIL.test(e)
          ? undefined
          : { code: 'email' };
  return compactErrors<TeacherAccountField>([
    ['pick', mode === 'link' ? requiredChoice(pick) : undefined],
    ['email', mode === 'invite' ? emailIssue : undefined],
  ]);
}
