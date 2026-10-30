import { describe, expect, it } from 'vitest';
import { formatRupiah } from './money';

describe('formatRupiah', () => {
  it('memakai titik sebagai pemisah ribuan tanpa desimal', () => {
    expect(formatRupiah(1250000)).toBe('Rp 1.250.000');
    expect(formatRupiah(0)).toBe('Rp 0');
    expect(formatRupiah(999)).toBe('Rp 999');
  });

  it('menulis tanda minus di depan', () => {
    expect(formatRupiah(-5000)).toBe('-Rp 5.000');
  });
});
