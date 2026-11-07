import { describe, expect, it } from 'vitest';
import { CARD_ORDER, validateCard } from './card-validation';

describe('validateCard', () => {
  it('menerima siswa terpilih dan kode 4..64 karakter', () => {
    expect(validateCard({ studentId: 'abc', code: '04A1B2C3' })).toEqual({});
    expect(validateCard({ studentId: 'abc', code: 'x'.repeat(64) })).toEqual({});
  });

  it('siswa belum dipilih dan kode kosong, urutan fokus mengikuti formulir', () => {
    const errors = validateCard({ studentId: '', code: '' });
    expect(errors.studentId).toEqual({ code: 'choose' });
    expect(errors.code).toEqual({ code: 'required' });
    expect(Object.keys(errors)).toEqual(CARD_ORDER);
  });

  it('kode kurang dari 4 karakter (spasi tidak dihitung) atau lebih dari 64', () => {
    expect(validateCard({ studentId: 'abc', code: ' ab ' }).code).toMatchObject({
      key: 'areaForms.minLength',
      values: { min: 4 },
    });
    expect(validateCard({ studentId: 'abc', code: 'x'.repeat(65) }).code).toEqual({
      code: 'tooLong',
      max: 64,
    });
  });
});
