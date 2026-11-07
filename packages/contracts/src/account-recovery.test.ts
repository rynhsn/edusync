import { describe, expect, it } from 'vitest';
import {
  classifyIdentifier,
  isValidUsername,
  maskEmail,
  maskPhoneClue,
  normalizeUsername,
} from './account-recovery';

describe('classifyIdentifier', () => {
  const cases: [string, string, string][] = [
    ['Budi@Sekolah.ID', 'email', 'budi@sekolah.id'],
    ['  user@x.co ', 'email', 'user@x.co'],
    ['3201234567890001', 'nik', '3201234567890001'],
    ['  3201234567890001 ', 'nik', '3201234567890001'],
    ['budi.santoso', 'username', 'budi.santoso'],
    ['Budi_01', 'username', 'budi_01'],
    ['320123456789000', 'username', '320123456789000'],
    ['32012345678900012', 'username', '32012345678900012'],
    ['ab', 'invalid', 'ab'],
    ['dua kata', 'invalid', 'dua kata'],
    ['', 'invalid', ''],
  ];
  it.each(cases)('%s -> %s', (raw, kind, value) => {
    expect(classifyIdentifier(raw)).toEqual({ kind, value });
  });
});

describe('nama pengguna', () => {
  it('dirapikan menjadi huruf kecil', () => expect(normalizeUsername('  AbC.D ')).toBe('abc.d'));
  it('menolak yang pendek, panjang, berspasi, mirip NIK, atau berhuruf besar', () => {
    expect(isValidUsername('abc')).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('a'.repeat(30))).toBe(true);
    expect(isValidUsername('a'.repeat(31))).toBe(false);
    expect(isValidUsername('a b')).toBe(false);
    expect(isValidUsername('3201234567890001')).toBe(false);
    expect(isValidUsername('Abc')).toBe(false);
    expect(isValidUsername('a@b')).toBe(false);
  });
});

describe('maskEmail', () => {
  it('dua huruf pertama, ***, domain', () => {
    expect(maskEmail('riyan@gmail.com')).toBe('ri***@gmail.com');
  });
  it('bagian lokal pendek tidak terbuka seluruhnya', () => {
    expect(maskEmail('ab@x.id')).toBe('a***@x.id');
    expect(maskEmail('a@x.id')).toBe('***@x.id');
  });
  it('bukan email', () => expect(maskEmail('tanpa-at')).toBe('***'));
});

describe('maskPhoneClue', () => {
  it('4 angka, ****, 3 angka', () => {
    expect(maskPhoneClue('6281234567890')).toBe('6281****890');
    expect(maskPhoneClue('6281234567')).toBe('6281****567');
  });
  it('nomor pendek menampilkan lebih sedikit angka dan menyembunyikan sedikitnya 3', () => {
    const clue = maskPhoneClue('628123456');
    expect(clue).toBe('628****456');
    expect(9 - clue.replace('****', '').length).toBeGreaterThanOrEqual(3);
    expect(maskPhoneClue('12345')).toBe('1****5');
    expect(maskPhoneClue('123')).toBe('****');
  });
  it('mengabaikan karakter bukan angka', () => {
    expect(maskPhoneClue('+62 812-3456-7890')).toBe('6281****890');
  });
});
