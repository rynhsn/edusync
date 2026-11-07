import { describe, expect, it } from 'vitest';
import { estimateTextWidthMm, fitFontSize, MIN_FONT_PT, wrapLines } from './text-fit';

describe('perkiraan lebar teks', () => {
  it('lebih panjang dan lebih besar = lebih lebar; tebal sedikit lebih lebar', () => {
    const a = estimateTextWidthMm('Nama', 10, false);
    expect(estimateTextWidthMm('Nama lengkap', 10, false)).toBeGreaterThan(a);
    expect(estimateTextWidthMm('Nama', 20, false)).toBeCloseTo(a * 2, 6);
    expect(estimateTextWidthMm('Nama', 10, true)).toBeGreaterThan(a);
  });
});

describe('wrapLines', () => {
  it('membungkus per kata dan menghormati baris baru', () => {
    const lines = wrapLines('satu dua tiga empat lima', 10, false, 20);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('satu dua tiga empat lima');
    expect(wrapLines('a\nb', 10, false, 100)).toEqual(['a', 'b']);
  });

  it('memecah kata yang lebih panjang dari lebar', () => {
    const lines = wrapLines('Supercalifragilisticexpialidocious', 10, false, 15);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('Supercalifragilisticexpialidocious');
  });
});

describe('fitFontSize', () => {
  it('teks pendek tetap ukuran semula', () => {
    expect(fitFontSize({ text: 'Budi', fontSize: 10, bold: false, widthMm: 50, heightMm: 6 })).toBe(10);
  });

  it('teks panjang diperkecil agar muat tinggi kotak', () => {
    const size = fitFontSize({
      text: 'Muhammad Raden Alif Naufal Pradipta Wicaksono Kusumawardhana',
      fontSize: 10,
      bold: true,
      widthMm: 40,
      heightMm: 5,
    });
    expect(size).toBeLessThan(10);
    expect(size).toBeGreaterThanOrEqual(MIN_FONT_PT);
  });

  it('tidak turun di bawah minimum', () => {
    expect(fitFontSize({ text: 'x '.repeat(500), fontSize: 10, bold: false, widthMm: 10, heightMm: 3 })).toBe(
      MIN_FONT_PT,
    );
  });

  it('teks kosong atau kotak nol mengembalikan ukuran semula', () => {
    expect(fitFontSize({ text: '  ', fontSize: 9, bold: false, widthMm: 10, heightMm: 5 })).toBe(9);
    expect(fitFontSize({ text: 'abc', fontSize: 9, bold: false, widthMm: 0, heightMm: 5 })).toBe(9);
  });
});
