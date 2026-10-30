import { describe, expect, it } from 'vitest';
import { componentAverage, finalGrade, percentOf, predicateOf } from './grading';

const s = (value: number | null, max = 100) => ({ value, max });

describe('percentOf', () => {
  it.each([
    [80, 100, 80],
    [45, 50, 90],
    [0, 100, 0],
    [7, 8, 87.5],
    [5, 0, 0],
  ])('%d dari %d = %d%%', (score, max, expected) => {
    expect(percentOf(score, max)).toBeCloseTo(expected, 10);
  });
});

describe('componentAverage', () => {
  it('rata-rata persen, skala maksimum berbeda disamakan', () => {
    expect(componentAverage([s(80), s(45, 50)])).toBe(85);
  });
  it('skor kosong diabaikan, bukan dihitung nol', () => {
    expect(componentAverage([s(80), s(null), s(60)])).toBe(70);
  });
  it('tanpa skor sama sekali: null', () => {
    expect(componentAverage([])).toBeNull();
    expect(componentAverage([s(null), s(null)])).toBeNull();
  });
});

describe('finalGrade', () => {
  it('rata-rata tertimbang biasa', () => {
    const grade = finalGrade([
      { weight: 20, scores: [s(100)] },
      { weight: 30, scores: [s(80), s(60)] },
      { weight: 50, scores: [s(90)] },
    ]);
    // (100*20 + 70*30 + 90*50) / 100
    expect(grade).toBe(86);
  });
  it('komponen tanpa skor tidak ikut: bobot dinormalisasi', () => {
    expect(
      finalGrade([
        { weight: 20, scores: [s(100)] },
        { weight: 80, scores: [s(null)] },
      ]),
    ).toBe(100);
    expect(
      finalGrade([
        { weight: 30, scores: [s(90)] },
        { weight: 20, scores: [s(60)] },
        { weight: 50, scores: [] },
      ]),
    ).toBe(78);
  });
  it('bobot tidak berjumlah 100 tetap dinormalisasi', () => {
    expect(
      finalGrade([
        { weight: 1, scores: [s(100)] },
        { weight: 3, scores: [s(60)] },
      ]),
    ).toBe(70);
  });
  it('tanpa skor sama sekali atau tanpa komponen: null', () => {
    expect(finalGrade([])).toBeNull();
    expect(finalGrade([{ weight: 50, scores: [s(null)] }])).toBeNull();
  });
  it('skor nol adalah skor yang sah', () => {
    expect(finalGrade([{ weight: 100, scores: [s(0)] }])).toBe(0);
  });
  it('dibulatkan 2 desimal', () => {
    expect(
      finalGrade([
        { weight: 1, scores: [s(100)] },
        { weight: 2, scores: [s(50)] },
      ]),
    ).toBe(66.67);
    expect(finalGrade([{ weight: 100, scores: [s(7, 8)] }])).toBe(87.5);
    expect(finalGrade([{ weight: 100, scores: [s(2, 3)] }])).toBe(66.67);
  });
});

describe('predicateOf', () => {
  const settings = { predicateA: 90, predicateB: 80, predicateC: 70 };
  it.each([
    [100, 'A'],
    [90, 'A'],
    [89.99, 'B'],
    [80, 'B'],
    [79.99, 'C'],
    [70, 'C'],
    [69.99, 'D'],
    [0, 'D'],
  ])('%d -> %s', (value, expected) => {
    expect(predicateOf(value, settings)).toBe(expected);
  });
  it('mengikuti batas yang diatur sekolah', () => {
    expect(predicateOf(85, { predicateA: 85, predicateB: 75, predicateC: 60 })).toBe('A');
  });
});
