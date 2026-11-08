import { describe, expect, it } from 'vitest';
import { GUARDIAN_ORDER, validateGuardian } from './guardian-validation';

const blank = { name: 'Budi', nik: '', phone: '', email: '', occupation: '', address: '' };
const ok = {
  name: 'Budi Santoso',
  nik: '3201234567890001',
  phone: '081234567890',
  email: 'budi@contoh.sch.id',
  occupation: 'Wiraswasta',
  address: 'Jl. Merdeka 1',
};

describe('validateGuardian', () => {
  it('menerima isian lengkap, dan hanya nama yang wajib', () => {
    expect(validateGuardian(ok)).toEqual({});
    expect(validateGuardian(blank)).toEqual({});
  });

  it('nama kosong atau terlalu panjang', () => {
    expect(validateGuardian({ ...ok, name: '  ' }).name).toEqual({ code: 'required' });
    expect(validateGuardian({ ...ok, name: 'x'.repeat(121) }).name).toEqual({ code: 'tooLong', max: 120 });
  });

  it('NIK: kosong boleh, harus 16 digit angka', () => {
    expect(validateGuardian({ ...ok, nik: '' }).nik).toBeUndefined();
    expect(validateGuardian({ ...ok, nik: '12345' }).nik).toEqual({ code: 'nik' });
    expect(validateGuardian({ ...ok, nik: '320123456789000x' }).nik).toEqual({ code: 'nik' });
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

  it('pekerjaan maks. 120 dan alamat maks. 300', () => {
    expect(validateGuardian({ ...ok, occupation: 'x'.repeat(121) }).occupation).toEqual({
      code: 'tooLong',
      max: 120,
    });
    expect(validateGuardian({ ...ok, address: 'x'.repeat(301) }).address).toEqual({
      code: 'tooLong',
      max: 300,
    });
  });

  it('urutan isian untuk fokus', () => {
    expect(
      Object.keys(
        validateGuardian({
          name: '',
          nik: 'x',
          phone: 'x',
          email: 'x',
          occupation: 'x'.repeat(121),
          address: 'x'.repeat(301),
        }),
      ),
    ).toEqual(GUARDIAN_ORDER);
  });
});
