import { describe, expect, it } from 'vitest';
import { averageOfFinals, DEFAULT_PREDICATE_DESCRIPTIONS, descriptionOf, rankPositions } from './report-card';

describe('rata-rata nilai akhir', () => {
  it('mengabaikan mapel tanpa nilai', () => {
    expect(averageOfFinals([80, null, 90])).toBe(85);
    expect(averageOfFinals([81.5, 82])).toBe(81.75);
    expect(averageOfFinals([null, null])).toBeNull();
    expect(averageOfFinals([])).toBeNull();
  });
});

describe('peringkat', () => {
  it('berbagi peringkat pada rata-rata sama dan melompat sesudahnya', () => {
    const r = rankPositions([
      { id: 'a', average: 90 },
      { id: 'b', average: 85 },
      { id: 'c', average: 85 },
      { id: 'd', average: 70 },
      { id: 'e', average: null },
    ]);
    expect(r.get('a')).toEqual({ position: 1, of: 4 });
    expect(r.get('b')).toEqual({ position: 2, of: 4 });
    expect(r.get('c')).toEqual({ position: 2, of: 4 });
    expect(r.get('d')).toEqual({ position: 4, of: 4 });
    expect(r.has('e')).toBe(false);
  });
  it('kosong bila tak ada rata-rata', () => {
    expect(rankPositions([{ id: 'a', average: null }]).size).toBe(0);
  });
});

describe('deskripsi capaian', () => {
  it('memilih deskripsi menurut predikat', () => {
    const d = { descA: 'a', descB: 'b', descC: 'c', descD: 'd' };
    expect(['A', 'B', 'C', 'D'].map((p) => descriptionOf(p as 'A', d))).toEqual(['a', 'b', 'c', 'd']);
    expect(descriptionOf('A', DEFAULT_PREDICATE_DESCRIPTIONS)).toContain('sangat baik');
  });
});
