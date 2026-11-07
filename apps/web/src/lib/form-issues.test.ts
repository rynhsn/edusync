import { describe, expect, it } from 'vitest';
import {
  compactErrors,
  decimalInRange,
  intInRange,
  optionalText,
  parseDecimal,
  requiredChoice,
  requiredText,
  timeOfDay,
} from './form-issues';

describe('requiredText / optionalText', () => {
  it('menolak kosong dan spasi saja', () => {
    expect(requiredText('', 10)).toEqual({ code: 'required' });
    expect(requiredText('   ', 10)).toEqual({ code: 'required' });
  });
  it('memangkas sebelum menghitung panjang', () => {
    expect(requiredText('  abc  ', 3)).toBeUndefined();
    expect(requiredText('abcd', 3)).toEqual({ code: 'tooLong', max: 3 });
  });
  it('opsional hanya dibatasi panjangnya', () => {
    expect(optionalText('', 3)).toBeUndefined();
    expect(optionalText('abcd', 3)).toEqual({ code: 'tooLong', max: 3 });
  });
});

describe('requiredChoice', () => {
  it('kosong berarti belum memilih', () => {
    expect(requiredChoice('')).toEqual({ code: 'choose' });
    expect(requiredChoice('x')).toBeUndefined();
  });
});

describe('intInRange', () => {
  it('kosong: wajib atau lolos', () => {
    expect(intInRange('', 5, 600, { required: true })).toEqual({ code: 'required' });
    expect(intInRange(' ', 5, 600, { required: false })).toBeUndefined();
  });
  it('menolak pecahan, huruf, dan notasi ilmiah', () => {
    for (const v of ['5.5', 'abc', '1e3', '--1', '5,5']) {
      expect(intInRange(v, 5, 600, { required: true })).toEqual({ code: 'intInvalid' });
    }
  });
  it('batas bawah dan atas termasuk', () => {
    expect(intInRange('5', 5, 600, { required: true })).toBeUndefined();
    expect(intInRange('600', 5, 600, { required: true })).toBeUndefined();
    expect(intInRange('4', 5, 600, { required: true })).toEqual({ code: 'range', min: 5, max: 600 });
    expect(intInRange('601', 5, 600, { required: true })).toEqual({ code: 'range', min: 5, max: 600 });
  });
});

describe('desimal', () => {
  it('membaca koma dan titik', () => {
    expect(parseDecimal('7,5')).toBe(7.5);
    expect(parseDecimal('7.5')).toBe(7.5);
    expect(parseDecimal('x')).toBeUndefined();
    expect(parseDecimal('')).toBeUndefined();
  });
  it('rentang', () => {
    expect(decimalInRange('', 0, 10)).toBeUndefined();
    expect(decimalInRange('10', 0, 10)).toBeUndefined();
    expect(decimalInRange('10,1', 0, 10)).toEqual({ code: 'range', min: 0, max: 10 });
    expect(decimalInRange('-1', 0, 10)).toEqual({ code: 'range', min: 0, max: 10 });
    expect(decimalInRange('abc', 0, 10)?.code).toBe('custom');
  });
});

describe('timeOfDay', () => {
  it('format HH:MM', () => {
    expect(timeOfDay('')).toBeUndefined();
    expect(timeOfDay('07:30')).toBeUndefined();
    expect(timeOfDay('24:00')?.code).toBe('custom');
    expect(timeOfDay('7:30')?.code).toBe('custom');
  });
});

describe('compactErrors', () => {
  it('membuang yang tanpa galat', () => {
    expect(
      compactErrors<'a' | 'b'>([
        ['a', undefined],
        ['b', { code: 'required' }],
      ]),
    ).toEqual({
      b: { code: 'required' },
    });
  });
});
