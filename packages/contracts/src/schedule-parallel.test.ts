import { describe, expect, it } from 'vitest';
import { combinedMatches, nextFreeLane, parallelViolations, SCHEDULE_MAX_LANE } from './schedule-parallel';

describe('parallelViolations', () => {
  const selected = new Set(['fis', 'kim']);
  it('satu sel di lane 0 sah apa pun mapelnya (perilaku lama)', () => {
    expect(parallelViolations([{ subjectId: 'mtk', lane: 0 }], selected)).toEqual([]);
  });
  it('lebih dari satu sel mensyaratkan semua mapel berpenanda', () => {
    expect(
      parallelViolations(
        [
          { subjectId: 'fis', lane: 0 },
          { subjectId: 'kim', lane: 1 },
        ],
        selected,
      ),
    ).toEqual([]);
    expect(
      parallelViolations(
        [
          { subjectId: 'mtk', lane: 0 },
          { subjectId: 'kim', lane: 1 },
        ],
        selected,
      ),
    ).toEqual(['mtk']);
  });
  it('sel tunggal di lane > 0 tetap mensyaratkan mapel berpenanda', () => {
    expect(parallelViolations([{ subjectId: 'mtk', lane: 2 }], selected)).toEqual(['mtk']);
    expect(parallelViolations([{ subjectId: 'fis', lane: 2 }], selected)).toEqual([]);
  });
});

describe('nextFreeLane', () => {
  it('mengambil lane kosong terkecil dan null bila penuh', () => {
    expect(nextFreeLane([])).toBe(0);
    expect(nextFreeLane([0, 1, 3])).toBe(2);
    expect(nextFreeLane(Array.from({ length: SCHEDULE_MAX_LANE + 1 }, (_, i) => i))).toBeNull();
  });
});

describe('combinedMatches', () => {
  const base = {
    classId: 'a',
    subjectId: 'fis',
    teacherId: 't',
    weekday: 1,
    periodId: 'p',
    semesterId: null,
  };
  it('cocok bila rombel berbeda dan guru, mapel, hari, jam, cakupan sama', () => {
    expect(combinedMatches(base, { ...base, classId: 'b' })).toBe(true);
  });
  it('menolak rombel sama atau salah satu atribut berbeda', () => {
    expect(combinedMatches(base, base)).toBe(false);
    for (const patch of [
      { subjectId: 'kim' },
      { teacherId: 'u' },
      { weekday: 2 },
      { periodId: 'q' },
      { semesterId: 's1' },
    ]) {
      expect(combinedMatches(base, { ...base, classId: 'b', ...patch })).toBe(false);
    }
  });
});
