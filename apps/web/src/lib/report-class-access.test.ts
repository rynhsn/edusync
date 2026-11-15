import { describe, expect, it } from 'vitest';
import { pickClassId, reportClassList } from './report-class-access';

const classes = [
  { id: 'a', name: 'X AKL 1', homeroomIsMe: false },
  { id: 'b', name: 'XI TKJ 1', homeroomIsMe: true },
  { id: 'c', name: 'XI TKJ 2' },
];

describe('reportClassList', () => {
  it('pemegang akses luas melihat semua kelas', () => {
    expect(reportClassList(classes, true)).toHaveLength(3);
  });
  it('wali kelas hanya melihat kelas yang ia walikan', () => {
    expect(reportClassList(classes, false).map((c) => c.id)).toEqual(['b']);
  });
  it('bukan wali kelas sama sekali menghasilkan daftar kosong', () => {
    expect(reportClassList(classes.slice(0, 1), false)).toEqual([]);
  });
});

describe('pickClassId', () => {
  it('memilih kelas pertama pada daftar tersaring, bukan kelas pertama sekolah', () => {
    expect(pickClassId(reportClassList(classes, false), '')).toBe('b');
  });
  it('mempertahankan pilihan yang masih ada', () => {
    expect(pickClassId(classes, 'c')).toBe('c');
  });
  it('pilihan basi jatuh ke kelas pertama; daftar kosong menghasilkan string kosong', () => {
    expect(pickClassId(classes, 'zzz')).toBe('a');
    expect(pickClassId([], 'a')).toBe('');
  });
});
