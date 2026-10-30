import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LETTER_TEMPLATES,
  formatAgendaNumber,
  formatLetterNumber,
  formatLongDateId,
  parseSignatureDataUrl,
  renderLetter,
  romanMonth,
  schoolCodeFromSlug,
  unknownLetterPlaceholders,
} from './letters';

describe('romanMonth', () => {
  it('memetakan 1..12', () => {
    expect([1, 4, 9, 10, 12].map(romanMonth)).toEqual(['I', 'IV', 'IX', 'X', 'XII']);
  });
  it('menolak di luar rentang', () => {
    expect(() => romanMonth(0)).toThrow(RangeError);
    expect(() => romanMonth(13)).toThrow(RangeError);
    expect(() => romanMonth(1.5)).toThrow(RangeError);
  });
});

describe('formatLetterNumber', () => {
  it('memberi nol di depan dan bulan Romawi', () => {
    expect(formatLetterNumber(12, 'SMP', 10, 2026)).toBe('012/SMP/X/2026');
    expect(formatLetterNumber(1234, 'SMP', 1, 2026)).toBe('1234/SMP/I/2026');
  });
  it('nomor agenda', () => {
    expect(formatAgendaNumber(7, 2026)).toBe('AG/007/2026');
  });
});

describe('schoolCodeFromSlug', () => {
  it('inisial untuk beberapa kata, awalan untuk satu kata, maksimal 6', () => {
    expect(schoolCodeFromSlug('smpit-miftahul-huda')).toBe('SMH');
    expect(schoolCodeFromSlug('smpnegeri')).toBe('SMPNEG');
    expect(schoolCodeFromSlug('a-b-c-d-e-f-g-h')).toBe('ABCDEF');
    expect(schoolCodeFromSlug('---')).toBe('SKL');
  });
});

describe('templat', () => {
  it('mengisi pengganti dan mengosongkan yang tak ada nilai', () => {
    expect(renderLetter('Nama: {{nama}}, NIS: {{nis}}', { nama: 'Ani', nis: null })).toBe('Nama: Ani, NIS:');
  });
  it('mendeteksi pengganti tak dikenal', () => {
    expect(unknownLetterPlaceholders('{{nama}} {{foo}} {{kelas}} {{foo}}')).toEqual(['foo']);
  });
  it('templat bawaan hanya memakai pengganti yang dikenal', () => {
    for (const t of DEFAULT_LETTER_TEMPLATES) expect(unknownLetterPlaceholders(t.body)).toEqual([]);
    expect(DEFAULT_LETTER_TEMPLATES).toHaveLength(3);
  });
  it('tanggal panjang', () => {
    expect(formatLongDateId('2026-10-05')).toBe('5 Oktober 2026');
  });
});

describe('parseSignatureDataUrl', () => {
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  it('menerima PNG sah', () => {
    expect(parseSignatureDataUrl(png)?.mime).toBe('image/png');
  });
  it('menolak magic bytes yang tidak cocok dan format lain', () => {
    expect(parseSignatureDataUrl(png.replace('image/png', 'image/jpeg'))).toBeNull();
    expect(parseSignatureDataUrl(`data:image/png;base64,${'PHN2ZyBvbmxvYWQ9MT4='}`)).toBeNull();
    expect(parseSignatureDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBeNull();
    expect(parseSignatureDataUrl('bukan data url')).toBeNull();
  });
});
