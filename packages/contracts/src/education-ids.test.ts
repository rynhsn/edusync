import { describe, expect, it } from 'vitest';
import { normalizeNpsn, normalizeNuptk } from './education-ids';

describe('normalizeNpsn', () => {
  it('menerima 8 angka dengan atau tanpa pemisah', () => {
    expect(normalizeNpsn('69999001')).toBe('69999001');
    expect(normalizeNpsn(' 6999 9001 ')).toBe('69999001');
    expect(normalizeNpsn('6999-9001')).toBe('69999001');
    expect(normalizeNpsn('6999.9001')).toBe('69999001');
  });

  it('menolak panjang salah, huruf, dan kosong', () => {
    for (const bad of ['', '1234567', '123456789', '1234567a', 'abcdefgh', '12 34', null, undefined]) {
      expect(normalizeNpsn(bad as string | null | undefined), String(bad)).toBeNull();
    }
  });
});

describe('normalizeNuptk', () => {
  it('menerima 16 angka dengan pemisah', () => {
    expect(normalizeNuptk('7777123412341234')).toBe('7777123412341234');
    expect(normalizeNuptk('7777 1234 1234 1234')).toBe('7777123412341234');
    expect(normalizeNuptk('7777-1234-1234-1234')).toBe('7777123412341234');
  });

  it('menolak yang bukan 16 angka', () => {
    for (const bad of ['', '777712341234123', '77771234123412345', '777712341234123x', null]) {
      expect(normalizeNuptk(bad as string | null), String(bad)).toBeNull();
    }
  });
});
