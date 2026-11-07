import { describe, expect, it } from 'vitest';
import { CODE128_PATTERNS, code128Bars, code128Values } from './code128';

describe('tabel pola Code 128', () => {
  it('107 pola; 0..105 berjumlah 11 modul dan penutup 13 modul', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    for (let v = 0; v <= 105; v++) {
      const digits = [...(CODE128_PATTERNS[v] ?? '')].map(Number);
      expect(digits, `nilai ${v}`).toHaveLength(6);
      expect(
        digits.reduce((a, b) => a + b, 0),
        `jumlah ${v}`,
      ).toBe(11);
      // Sifat paritas Code 128: total lebar batang genap, total lebar spasi ganjil.
      const bars = (digits[0] ?? 0) + (digits[2] ?? 0) + (digits[4] ?? 0);
      const spaces = (digits[1] ?? 0) + (digits[3] ?? 0) + (digits[5] ?? 0);
      expect(bars % 2, `batang ${v}`).toBe(0);
      expect(spaces % 2, `spasi ${v}`).toBe(1);
    }
    const stop = [...(CODE128_PATTERNS[106] ?? '')].map(Number);
    expect(stop.reduce((a, b) => a + b, 0)).toBe(13);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
  });
});

describe('code128Values', () => {
  it('subset B untuk teks biasa dengan pemeriksa modulo 103', () => {
    // "A": start B 104, A = 33, pemeriksa = (104 + 33*1) % 103 = 34
    expect(code128Values('A')).toEqual([104, 33, 34]);
    const v = code128Values('NIS-2024') as number[];
    let sum = 104;
    [...'NIS-2024'].forEach((ch, i) => {
      sum += ((ch.codePointAt(0) ?? 0) - 32) * (i + 1);
    });
    expect(v[v.length - 1]).toBe(sum % 103);
  });

  it('subset C untuk deret angka genap minimal 4 digit', () => {
    // 123456: start C 105, 12, 34, 56, pemeriksa = (105 + 12 + 34*2 + 56*3) % 103 = 353 % 103 = 44
    expect(code128Values('123456')).toEqual([105, 12, 34, 56, 44]);
  });

  it('angka ganjil atau pendek memakai subset B', () => {
    expect(code128Values('12345')?.[0]).toBe(104);
    expect(code128Values('12')?.[0]).toBe(104);
  });

  it('menolak teks kosong atau non-ASCII', () => {
    expect(code128Values('')).toBeNull();
    expect(code128Values('Ünal')).toBeNull();
  });
});

describe('code128Bars', () => {
  it('lebar total = 11 modul per simbol + 13 untuk penutup', () => {
    const r = code128Bars('123456') as NonNullable<ReturnType<typeof code128Bars>>;
    // awal + 3 data + pemeriksa = 5 simbol
    expect(r.modules).toBe(5 * 11 + 13);
    for (let i = 1; i < r.bars.length; i++) {
      const prev = r.bars[i - 1] as { x: number; w: number };
      expect((r.bars[i] as { x: number }).x).toBeGreaterThan(prev.x + prev.w - 1e-9);
    }
    const last = r.bars[r.bars.length - 1] as { x: number; w: number };
    expect(last.x + last.w).toBe(r.modules);
  });

  it('null untuk teks yang tidak bisa disandikan', () => {
    expect(code128Bars('')).toBeNull();
  });
});
