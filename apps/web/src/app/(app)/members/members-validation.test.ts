import { describe, expect, it } from 'vitest';
import { validateEditRoles, validateInvite } from './members-validation';

describe('validateInvite', () => {
  it('menerima email benar dan satu peran', () => {
    expect(validateInvite({ email: 'guru@sekolah.sch.id', roleCount: 1 })).toEqual({});
  });
  it('email wajib dan harus valid', () => {
    expect(validateInvite({ email: ' ', roleCount: 1 }).email).toEqual({ code: 'required' });
    expect(validateInvite({ email: 'guru@', roleCount: 1 }).email).toEqual({ code: 'email' });
  });
  it('peran minimal satu, maksimal sepuluh', () => {
    expect(validateInvite({ email: 'a@b.id', roleCount: 0 }).roles).toEqual({ code: 'choose' });
    expect(validateInvite({ email: 'a@b.id', roleCount: 11 }).roles).toEqual({
      code: 'range',
      min: 1,
      max: 10,
    });
  });
});

describe('validateEditRoles', () => {
  it('butuh minimal satu peran', () => {
    expect(validateEditRoles(0)).toEqual({ roles: { code: 'choose' } });
    expect(validateEditRoles(2)).toEqual({});
  });
});
