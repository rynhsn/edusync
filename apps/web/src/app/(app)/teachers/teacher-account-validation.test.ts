import { describe, expect, it } from 'vitest';
import { validateTeacherAccount } from './teacher-account-validation';

describe('validateTeacherAccount', () => {
  it('tautkan: akun wajib dipilih, email diabaikan', () => {
    expect(validateTeacherAccount('link', '', '')).toEqual({ pick: { code: 'choose' } });
    expect(validateTeacherAccount('link', 'm1', 'bukan-email')).toEqual({});
  });
  it('undang: email wajib dan berbentuk email', () => {
    expect(validateTeacherAccount('invite', '', '')).toEqual({ email: { code: 'required' } });
    expect(validateTeacherAccount('invite', '', 'abc').email?.code).toBe('email');
    expect(validateTeacherAccount('invite', '', ' guru@sekolah.sch.id ')).toEqual({});
    expect(validateTeacherAccount('invite', '', `${'a'.repeat(250)}@x.id`).email?.code).toBe('tooLong');
  });
});
