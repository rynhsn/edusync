import { describe, expect, it } from 'vitest';
import { qrShape, runsToPath } from './qr';

describe('qrShape', () => {
  it('menghasilkan path untuk teks pendek dan menyimpan cache', () => {
    const a = qrShape('2024001');
    expect(a).not.toBeNull();
    expect(a?.size).toBeGreaterThanOrEqual(21);
    expect(a?.path.startsWith('M')).toBe(true);
    expect(qrShape('2024001')).toBe(a);
  });
  it('teks kosong = null', () => {
    expect(qrShape('')).toBeNull();
  });
});

describe('runsToPath', () => {
  it('menggabungkan modul gelap sebaris', () => {
    const grid = ['110', '000', '101'];
    expect(runsToPath(3, (r, c) => grid[r]?.[c] === '1')).toBe('M0 0h2v1h-2zM0 2h1v1h-1zM2 2h1v1h-1z');
  });
});
