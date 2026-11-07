import { describe, expect, it } from 'vitest';
import { validatePortalInvite } from './portal-admin-validation';

describe('validatePortalInvite', () => {
  it('email boleh kosong', () => {
    expect(validatePortalInvite('')).toEqual({});
    expect(validatePortalInvite('  ')).toEqual({});
  });
  it('email yang diisi harus valid', () => {
    expect(validatePortalInvite('ortu@')).toEqual({ email: { code: 'email' } });
    expect(validatePortalInvite('ortu@gmail.com')).toEqual({});
  });
  it('maksimal 254 karakter', () => {
    expect(validatePortalInvite(`${'a'.repeat(250)}@x.id`).email).toEqual({ code: 'tooLong', max: 254 });
  });
});
