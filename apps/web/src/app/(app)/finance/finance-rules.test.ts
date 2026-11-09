import { describe, expect, it } from 'vitest';
import { installmentCount, MAX_RUPIAH, rupiahAmount, voidReason } from './finance-rules';

describe('rupiahAmount', () => {
  it('kosong wajib kecuali dinyatakan opsional', () => {
    expect(rupiahAmount('', { min: 0 })).toEqual({ code: 'required' });
    expect(rupiahAmount('  ', { min: 1 })).toEqual({ code: 'required' });
    expect(rupiahAmount('', { min: 0, required: false })).toBeUndefined();
  });
  it('min 0 menerima nol (tarif gratis), min 1 menolaknya', () => {
    expect(rupiahAmount('0', { min: 0 })).toBeUndefined();
    expect(rupiahAmount('0', { min: 1 })).toMatchObject({
      code: 'custom',
      key: 'financeForms.amountPositive',
    });
    expect(rupiahAmount('1', { min: 1 })).toBeUndefined();
  });
  it('menolak pecahan, huruf, tanda minus, dan notasi ilmiah', () => {
    for (const v of ['1.5', '1,5', 'abc', '-5', '1e3']) {
      expect(rupiahAmount(v, { min: 0 })).toEqual({ code: 'intInvalid' });
    }
  });
  it('batas atas 2.000.000.000 dan batas khusus', () => {
    expect(rupiahAmount(String(MAX_RUPIAH), { min: 0 })).toBeUndefined();
    expect(rupiahAmount(String(MAX_RUPIAH + 1), { min: 0 })).toMatchObject({
      key: 'financeForms.amountTooBig',
    });
    expect(rupiahAmount('101', { min: 0, max: 100 })).toMatchObject({ key: 'financeForms.amountOver' });
  });
});

describe('voidReason', () => {
  it('wajib dan paling banyak 300 karakter', () => {
    expect(voidReason('   ')).toEqual({ code: 'required' });
    expect(voidReason('a')).toBeUndefined();
    expect(voidReason('a'.repeat(300))).toBeUndefined();
    expect(voidReason('a'.repeat(301))).toEqual({ code: 'tooLong', max: 300 });
  });
});

describe('installmentCount', () => {
  it('2 sampai 12', () => {
    expect(installmentCount('')).toEqual({ code: 'required' });
    expect(installmentCount('1')).toEqual({ code: 'range', min: 2, max: 12 });
    expect(installmentCount('13')).toEqual({ code: 'range', min: 2, max: 12 });
    expect(installmentCount('2')).toBeUndefined();
    expect(installmentCount('12')).toBeUndefined();
    expect(installmentCount('2.5')).toEqual({ code: 'intInvalid' });
  });
});
