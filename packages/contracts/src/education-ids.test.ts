import { describe, expect, it } from 'vitest';
import { normalizeNpsn, normalizeNsm, normalizeNuptk } from './education-ids';

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

describe('normalizeNsm', () => {
  it('menerima 8-16 angka, pemisah dibuang', () => {
    expect(normalizeNsm('12345678')).toBe('12345678');
    expect(normalizeNsm('1311 3273 0001')).toBe('131132730001');
    expect(normalizeNsm('1234567890123456')).toBe('1234567890123456');
  });
  it('menolak 7 atau 17 angka, huruf, dan kosong', () => {
    for (const bad of ['', '1234567', '12345678901234567', '1234567a', null, undefined]) {
      expect(normalizeNsm(bad as string | null | undefined), String(bad)).toBeNull();
    }
  });
});
