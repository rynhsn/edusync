import { describe, expect, it } from 'vitest';
import {
  classOutsideScope,
  filterByName,
  MAX_CLASS_TARGETS,
  scopeBody,
  scopeError,
  summarizeTargets,
  toggleId,
} from './fee-scope';

describe('scopeError', () => {
  it('semua siswa tidak butuh sasaran', () => {
    expect(scopeError({ scope: 'all', classIds: [], studentIds: [] })).toBeNull();
  });
  it('kelas/siswa kosong ditolak', () => {
    expect(scopeError({ scope: 'class', classIds: [], studentIds: ['x'] })).toBe('targets_required');
    expect(scopeError({ scope: 'student', classIds: ['x'], studentIds: [] })).toBe('targets_required');
  });
  it('terisi lolos, melebihi batas ditolak', () => {
    expect(scopeError({ scope: 'class', classIds: ['a'], studentIds: [] })).toBeNull();
    const many = Array.from({ length: MAX_CLASS_TARGETS + 1 }, (_, i) => String(i));
    expect(scopeError({ scope: 'class', classIds: many, studentIds: [] })).toBe('too_many');
  });
});

describe('scopeBody', () => {
  it('mengosongkan sasaran cakupan lain dan membuang duplikat', () => {
    expect(scopeBody({ scope: 'class', classIds: ['a', 'a', 'b'], studentIds: ['s'] })).toEqual({
      scope: 'class',
      classIds: ['a', 'b'],
      studentIds: [],
    });
    expect(scopeBody({ scope: 'all', classIds: ['a'], studentIds: ['s'] })).toEqual({
      scope: 'all',
      classIds: [],
      studentIds: [],
    });
  });
});

describe('toggleId', () => {
  it('menambah tanpa duplikat dan mencabut', () => {
    expect(toggleId(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(toggleId(['a'], 'a', true)).toEqual(['a']);
    expect(toggleId(['a', 'b'], 'a', false)).toEqual(['b']);
    expect(toggleId(['a'], 'z', false)).toEqual(['a']);
  });
});

describe('summarizeTargets', () => {
  it('menampilkan beberapa nama dan sisa', () => {
    expect(summarizeTargets(['A', 'B', 'C', 'D'], 10)).toEqual({ shown: ['A', 'B', 'C'], more: 7 });
    expect(summarizeTargets(['A'], 1)).toEqual({ shown: ['A'], more: 0 });
    expect(summarizeTargets([], 0)).toEqual({ shown: [], more: 0 });
  });
});

describe('classOutsideScope', () => {
  const fee = { scope: 'class' as const, classIds: ['k1', 'k2'] };
  it('true hanya bila cakupan kelas dan kelas terpilih bukan sasaran', () => {
    expect(classOutsideScope(fee, 'k3')).toBe(true);
    expect(classOutsideScope(fee, 'k1')).toBe(false);
    expect(classOutsideScope(fee, '')).toBe(false);
    expect(classOutsideScope({ scope: 'all', classIds: [] }, 'k3')).toBe(false);
    expect(classOutsideScope({ scope: 'student', classIds: [] }, 'k3')).toBe(false);
    expect(classOutsideScope(undefined, 'k3')).toBe(false);
  });
});

describe('filterByName', () => {
  it('menyaring tanpa membedakan huruf', () => {
    const items = [{ name: 'VII-A' }, { name: 'VIII-B' }];
    expect(filterByName(items, 'viii')).toEqual([{ name: 'VIII-B' }]);
    expect(filterByName(items, '  ')).toEqual(items);
  });
});
