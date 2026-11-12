import { describe, expect, it } from 'vitest';
import {
  type AllocationRow,
  diffAllocations,
  diffVersions,
  parsePeriods,
  periodsToText,
  sumPeriods,
} from './curriculum-grid';

const row = (
  subjectId: string,
  w: number | null,
  y: number | null,
  note: string | null = null,
): AllocationRow => ({ subjectId, weeklyPeriods: w, yearlyPeriods: y, note });

describe('parsePeriods', () => {
  it('mengurai bilangan bulat, kosong menjadi null, selain itu tidak valid', () => {
    expect(parsePeriods('')).toBeNull();
    expect(parsePeriods('  ')).toBeNull();
    expect(parsePeriods('0')).toBe(0);
    expect(parsePeriods(' 36 ')).toBe(36);
    expect(parsePeriods('9999')).toBe(9999);
    for (const bad of ['-1', '1.5', '1,5', 'abc', '10000', '1e2']) {
      expect(parsePeriods(bad), bad).toBe('invalid');
    }
  });
  it('periodsToText', () => {
    expect(periodsToText(null)).toBe('');
    expect(periodsToText(0)).toBe('0');
  });
});

describe('diffAllocations', () => {
  const saved = [row('a', 2, 72, 'catatan'), row('b', 4, null)];

  it('hanya mengirim baris yang berubah', () => {
    const r = diffAllocations('7', null, saved, { a: { weekly: '2' }, b: { weekly: '5' } });
    expect(r.invalid).toEqual([]);
    expect(r.items).toEqual([
      { levelCode: '7', programId: null, subjectId: 'b', weeklyPeriods: 5, yearlyPeriods: null, note: null },
    ]);
  });

  it('membawa catatan baris yang ada', () => {
    const r = diffAllocations('7', 'p1', saved, { a: { yearly: '80' } });
    expect(r.items[0]).toMatchObject({
      subjectId: 'a',
      programId: 'p1',
      weeklyPeriods: 2,
      yearlyPeriods: 80,
      note: 'catatan',
    });
  });

  it('kedua JP kosong pada baris yang ada berarti hapus', () => {
    const r = diffAllocations('7', null, saved, { a: { weekly: '', yearly: '' } });
    expect(r.items).toEqual([
      {
        levelCode: '7',
        programId: null,
        subjectId: 'a',
        weeklyPeriods: null,
        yearlyPeriods: null,
        note: 'catatan',
      },
    ]);
  });

  it('baris baru yang tetap kosong tidak dikirim', () => {
    expect(diffAllocations('7', null, saved, { z: { weekly: '' }, y: {} }).items).toEqual([]);
  });

  it('baris baru terisi dikirim', () => {
    const r = diffAllocations('7', null, saved, { z: { weekly: '3' } });
    expect(r.items).toEqual([
      { levelCode: '7', programId: null, subjectId: 'z', weeklyPeriods: 3, yearlyPeriods: null, note: null },
    ]);
  });

  it('isian tidak valid dilaporkan dan tidak dikirim', () => {
    const r = diffAllocations('7', null, saved, { a: { weekly: 'x' }, b: { yearly: '10' } });
    expect(r.invalid).toEqual(['a']);
    expect(r.items.map((i) => i.subjectId)).toEqual(['b']);
  });

  it('kembali ke nilai semula berarti tidak berubah', () => {
    expect(diffAllocations('7', null, saved, { a: { weekly: '2', yearly: '72' } }).items).toEqual([]);
  });
});

describe('sumPeriods', () => {
  it('menjumlahkan nilai tersimpan dengan suntingan, kosong dihitung 0', () => {
    const saved = [row('a', 2, 72), row('b', 4, null), row('c', null, null)];
    const t = sumPeriods(saved, { b: { weekly: '5' }, c: { weekly: '1', yearly: '36' } }, [
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(t).toEqual({ weekly: 8, yearly: 108, filled: 3 });
  });
  it('isian tidak valid dihitung 0', () => {
    expect(sumPeriods([row('a', 2, 72)], { a: { weekly: 'x' } }, ['a'])).toEqual({
      weekly: 0,
      yearly: 72,
      filled: 1,
    });
  });
  it('tanpa mapel menghasilkan nol', () => {
    expect(sumPeriods([], {}, [])).toEqual({ weekly: 0, yearly: 0, filled: 0 });
  });
});

describe('diffVersions', () => {
  const saved = [
    { levelCode: '7', curriculumKey: 'merdeka', effectiveFrom: '2026-07-13', note: 'n' },
    { levelCode: '8', curriculumKey: 'k13', effectiveFrom: null, note: null },
  ];
  it('mengirim hanya tingkat yang berubah', () => {
    const r = diffVersions(saved, { '7': { curriculumKey: 'merdeka' }, '8': { curriculumKey: 'merdeka' } });
    expect(r).toEqual([{ levelCode: '8', curriculumKey: 'merdeka', effectiveFrom: null, note: null }]);
  });
  it('mengubah tanggal saja dan membawa catatan', () => {
    expect(diffVersions(saved, { '7': { effectiveFrom: '2026-08-01' } })).toEqual([
      { levelCode: '7', curriculumKey: 'merdeka', effectiveFrom: '2026-08-01', note: 'n' },
    ]);
  });
  it('mengosongkan kurikulum menghapus versi yang ada, dan mengabaikan yang tidak ada', () => {
    expect(diffVersions(saved, { '7': { curriculumKey: '' }, '9': { curriculumKey: '' } })).toEqual([
      { levelCode: '7', curriculumKey: null, effectiveFrom: null, note: null },
    ]);
  });
  it('menambah versi baru; tanggal kosong menjadi null', () => {
    expect(diffVersions(saved, { '9': { curriculumKey: 'k13', effectiveFrom: '' } })).toEqual([
      { levelCode: '9', curriculumKey: 'k13', effectiveFrom: null, note: null },
    ]);
  });
});
