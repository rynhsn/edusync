import { describe, expect, it } from 'vitest';
import { isSubjectGroup, isValidPeriods, SUBJECT_GROUPS, totalPeriodsByLevel } from './curriculum';

describe('kelompok mapel', () => {
  it('mengenali kelompok yang sah saja', () => {
    for (const g of SUBJECT_GROUPS) expect(isSubjectGroup(g)).toBe(true);
    expect(isSubjectGroup('lainnya')).toBe(false);
    expect(isSubjectGroup(null)).toBe(false);
  });
});

describe('JP', () => {
  it('menerima bilangan bulat tidak negatif dan kosong', () => {
    expect(isValidPeriods(0)).toBe(true);
    expect(isValidPeriods(4)).toBe(true);
    expect(isValidPeriods(null)).toBe(true);
    expect(isValidPeriods(undefined)).toBe(true);
    expect(isValidPeriods(-1)).toBe(false);
    expect(isValidPeriods(2.5)).toBe(false);
  });
});

describe('totalPeriodsByLevel', () => {
  it('menjumlah per tingkat dan program, JP kosong dihitung 0', () => {
    const totals = totalPeriodsByLevel([
      { levelCode: '8', weeklyPeriods: 4, yearlyPeriods: 144 },
      { levelCode: '7', weeklyPeriods: 2 },
      { levelCode: '7', weeklyPeriods: 3, yearlyPeriods: 108 },
      { levelCode: '7', programId: 'p1', weeklyPeriods: 5 },
    ]);
    expect(totals).toEqual([
      { levelCode: '7', programId: null, weeklyPeriods: 5, yearlyPeriods: 108 },
      { levelCode: '7', programId: 'p1', weeklyPeriods: 5, yearlyPeriods: 0 },
      { levelCode: '8', programId: null, weeklyPeriods: 4, yearlyPeriods: 144 },
    ]);
  });
  it('daftar kosong menghasilkan kosong', () => {
    expect(totalPeriodsByLevel([])).toEqual([]);
  });
});
