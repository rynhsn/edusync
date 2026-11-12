import { describe, expect, it } from 'vitest';
import {
  deriveTargetClassName,
  firstLevel,
  isFinalLevel,
  nextLevel,
  shiftDateByYears,
  sortLevels,
} from './promotion';

const smp = [
  { code: '9', sort: 3 },
  { code: '7', sort: 1 },
  { code: '8', sort: 2 },
];
const sma = [
  { code: 'XII', sort: 3 },
  { code: 'X', sort: 1 },
  { code: 'XI', sort: 2 },
];

describe('urutan tingkat', () => {
  it('mengurutkan menurut sort, lalu kode', () => {
    expect(sortLevels(smp).map((l) => l.code)).toEqual(['7', '8', '9']);
    expect(
      sortLevels([
        { code: 'b', sort: 1 },
        { code: 'a', sort: 1 },
      ]).map((l) => l.code),
    ).toEqual(['a', 'b']);
    expect(firstLevel(smp)).toBe('7');
    expect(firstLevel([])).toBeNull();
  });

  it('nextLevel mengikuti sort, bukan urutan masuk', () => {
    expect(nextLevel(smp, '7')).toBe('8');
    expect(nextLevel(smp, '8')).toBe('9');
    expect(nextLevel(sma, 'X')).toBe('XI');
    expect(nextLevel(sma, 'XI')).toBe('XII');
  });

  it('nextLevel null untuk tingkat akhir, tingkat tak dikenal, dan daftar kosong', () => {
    expect(nextLevel(smp, '9')).toBeNull();
    expect(nextLevel(smp, 'X')).toBeNull();
    expect(nextLevel([], '7')).toBeNull();
  });

  it('isFinalLevel hanya benar untuk sort terbesar', () => {
    expect(isFinalLevel(smp, '9')).toBe(true);
    expect(isFinalLevel(smp, '8')).toBe(false);
    expect(isFinalLevel(sma, 'XII')).toBe(true);
    expect(isFinalLevel(smp, 'tak-dikenal')).toBe(false);
    expect(isFinalLevel([], '9')).toBe(false);
  });

  it('SD enam tingkat: hanya kelas 6 yang final', () => {
    const sd = [1, 2, 3, 4, 5, 6].map((n) => ({ code: String(n), sort: n }));
    expect(sd.filter((l) => isFinalLevel(sd, l.code)).map((l) => l.code)).toEqual(['6']);
    expect(nextLevel(sd, '5')).toBe('6');
  });
});

describe('deriveTargetClassName', () => {
  it('mengganti awalan tingkat', () => {
    expect(deriveTargetClassName('7A', '7', '8')).toEqual({ name: '8A', matched: true, warning: null });
    expect(deriveTargetClassName('7', '7', '8').name).toBe('8');
    expect(deriveTargetClassName('X TKJ 1', 'X', 'XI').name).toBe('XI TKJ 1');
    expect(deriveTargetClassName('XI-RPL 2', 'XI', 'XII').name).toBe('XII-RPL 2');
  });

  it('awalan harus berdiri sendiri', () => {
    // "XI A" bukan kelas tingkat X; "70" bukan tingkat 7.
    const r = deriveTargetClassName('XI A', 'X', 'XI');
    expect(r.matched).toBe(false);
    expect(r.name).toBe('XI A');
    expect(deriveTargetClassName('70', '7', '8').matched).toBe(false);
  });

  it('tidak cocok: nama tetap dan ada peringatan', () => {
    const r = deriveTargetClassName('Alpha', '7', '8');
    expect(r.name).toBe('Alpha');
    expect(r.matched).toBe(false);
    expect(r.warning).toContain('Alpha');
  });
});

describe('shiftDateByYears', () => {
  it('menggeser tahun dan menjaga bulan serta hari', () => {
    expect(shiftDateByYears('2026-07-13', 1)).toBe('2027-07-13');
    expect(shiftDateByYears('2026-12-31', 2)).toBe('2028-12-31');
  });
  it('29 Februari menjadi 28 Februari di tahun bukan kabisat', () => {
    expect(shiftDateByYears('2028-02-29', 1)).toBe('2029-02-28');
    expect(shiftDateByYears('2028-02-29', 4)).toBe('2032-02-29');
  });
});
