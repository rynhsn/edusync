import { describe, expect, it } from 'vitest';
import {
  isSubjectGroup,
  isValidPeriods,
  SUBJECT_GROUPS,
  suggestedEffectiveWeeks,
  suggestedPeriodMinutes,
  totalPeriodsByLevel,
} from './curriculum';

describe('kelompok mapel', () => {
  it('mengenali kelompok yang sah saja', () => {
    for (const g of SUBJECT_GROUPS) expect(isSubjectGroup(g)).toBe(true);
    expect(isSubjectGroup('lainnya')).toBe(false);
    expect(isSubjectGroup(null)).toBe(false);
  });
});

describe('saran JP per profil', () => {
  it('menit per JP menurut jenjang; profil tak dikenal tanpa saran', () => {
    expect(['sd', 'mi'].map(suggestedPeriodMinutes)).toEqual([35, 35]);
    expect(['smp', 'mts'].map(suggestedPeriodMinutes)).toEqual([40, 40]);
    expect(['sma', 'ma', 'smk', 'mak'].map(suggestedPeriodMinutes)).toEqual([45, 45, 45, 45]);
    expect(suggestedPeriodMinutes('lain')).toBeNull();
    expect(suggestedPeriodMinutes(null)).toBeNull();
  });
  it('minggu efektif 36, tingkat akhir 32', () => {
    expect(suggestedEffectiveWeeks(false)).toBe(36);
    expect(suggestedEffectiveWeeks(true)).toBe(32);
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
      {
        levelCode: '7',
        programId: null,
        weeklyPeriods: 5,
        yearlyPeriods: 108,
        cocurricularYearlyPeriods: 0,
        weeks: 0,
      },
      {
        levelCode: '7',
        programId: 'p1',
        weeklyPeriods: 5,
        yearlyPeriods: 0,
        cocurricularYearlyPeriods: 0,
        weeks: 0,
      },
      {
        levelCode: '8',
        programId: null,
        weeklyPeriods: 4,
        yearlyPeriods: 144,
        cocurricularYearlyPeriods: 0,
        weeks: 0,
      },
    ]);
  });
  it('menjumlah JP kokurikuler dan minggu secara terpisah dari intrakurikuler', () => {
    const totals = totalPeriodsByLevel([
      { levelCode: 'XII', programId: 'p1', yearlyPeriods: 100, cocurricularYearlyPeriods: 36 },
      { levelCode: 'XII', programId: 'p1', yearlyPeriods: 50, cocurricularYearlyPeriods: 18 },
      { levelCode: 'XII', programId: 'p1', weeks: 22 },
    ]);
    expect(totals).toEqual([
      {
        levelCode: 'XII',
        programId: 'p1',
        weeklyPeriods: 0,
        yearlyPeriods: 150,
        cocurricularYearlyPeriods: 54,
        weeks: 22,
      },
    ]);
  });
  it('daftar kosong menghasilkan kosong', () => {
    expect(totalPeriodsByLevel([])).toEqual([]);
  });
});
