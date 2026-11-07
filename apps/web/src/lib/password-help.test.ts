import { describe, expect, it } from 'vitest';
import { validateHelp } from './password-help';

const ok = { name: 'Siti Aminah', info: 'Ibu dari Ani kelas 3A', phone: '0812-3456-7890', identifier: '' };

describe('validateHelp', () => {
  it('menerima isian yang benar', () => {
    expect(validateHelp(ok)).toEqual({});
  });
  it('nama dan nomor HP wajib; nomor harus masuk akal', () => {
    expect(validateHelp({ ...ok, name: ' ', phone: '' })).toEqual({
      name: { code: 'required' },
      phone: { code: 'required' },
    });
    expect(validateHelp({ ...ok, phone: 'abc' }).phone).toEqual({ code: 'phone' });
  });
  it('membatasi panjang', () => {
    expect(validateHelp({ ...ok, info: 'x'.repeat(501) }).info).toEqual({ code: 'tooLong', max: 500 });
    expect(validateHelp({ ...ok, identifier: 'x'.repeat(121) }).identifier).toEqual({
      code: 'tooLong',
      max: 120,
    });
  });
});
