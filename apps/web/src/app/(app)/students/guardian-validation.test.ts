import { describe, expect, it } from 'vitest';
import { GUARDIAN_ORDER, validateGuardian } from './guardian-validation';

const ok = { name: 'Budi Santoso', phone: '081234567890', email: 'budi@contoh.sch.id' };

describe('validateGuardian', () => {
  it('menerima isian lengkap, dan hanya nama yang wajib', () => {
    expect(validateGuardian(ok)).toEqual({});
    expect(validateGuardian({ name: 'Budi', phone: '', email: '' })).toEqual({});
  });

  it('nama kosong atau terlalu panjang', () => {
    expect(validateGuardian({ ...ok, name: '  ' }).name).toEqual({ code: 'required' });
    expect(validateGuardian({ ...ok, name: 'x'.repeat(121) }).name).toEqual({ code: 'tooLong', max: 120 });
  });

  it('telepon: format dan panjang mengikuti API', () => {
    expect(validateGuardian({ ...ok, phone: '+62 812-3456-7890' }).phone).toBeUndefined();
    expect(validateGuardian({ ...ok, phone: 'abc' }).phone).toEqual({ code: 'phone' });
    expect(validateGuardian({ ...ok, phone: '123' }).phone).toEqual({ code: 'phone' });
    expect(validateGuardian({ ...ok, phone: '1'.repeat(31) }).phone).toEqual({ code: 'tooLong', max: 30 });
  });

  it('email: kosong boleh, salah format ditolak', () => {
    expect(validateGuardian({ ...ok, email: 'budi@' }).email).toEqual({ code: 'email' });
    expect(validateGuardian({ ...ok, email: 'tanpa-at.com' }).email).toEqual({ code: 'email' });
  });

  it('urutan isian untuk fokus', () => {
    expect(Object.keys(validateGuardian({ name: '', phone: 'x', email: 'x' }))).toEqual(GUARDIAN_ORDER);
  });
});
