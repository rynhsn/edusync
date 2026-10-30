import { describe, expect, it } from 'vitest';
import {
  averageGrade,
  buildLedgerRows,
  formatGrade,
  formatIdDate,
  ledgerWidths,
  reportCardFileName,
  safeSheetName,
  slugify,
} from './format';
import type { RecapClass } from './types';

const recap: RecapClass = {
  subjects: [
    { id: 's1', name: 'Matematika' },
    { id: 's2', name: 'Bahasa Indonesia' },
  ],
  students: [
    {
      studentId: 'a',
      name: 'Ani',
      nis: '0012',
      grades: [
        { subjectId: 's2', final: 80, predicate: 'B' },
        { subjectId: 's1', final: 90.5, predicate: 'A' },
      ],
    },
    { studentId: 'b', name: 'Budi', nis: null, grades: [{ subjectId: 's1', final: null, predicate: null }] },
  ],
};

describe('format rapor', () => {
  it('tanggal Indonesia dari ISO tanggal dan waktu', () => {
    expect(formatIdDate('2026-10-30T08:00:00.000Z')).toBe('30 Oktober 2026');
    expect(formatIdDate('2027-01-05')).toBe('5 Januari 2027');
    expect(formatIdDate('bukan tanggal')).toBe('bukan tanggal');
  });

  it('nilai memakai koma desimal dan maksimal 2 desimal', () => {
    expect(formatGrade(85)).toBe('85');
    expect(formatGrade(85.5)).toBe('85,5');
    expect(formatGrade(85.333)).toBe('85,33');
    expect(formatGrade(null)).toBe('');
  });

  it('nama berkas rapor', () => {
    expect(slugify('Ánî  Putri')).toBe('ani-putri');
    expect(reportCardFileName('Budi Santoso', 'Ganjil 2026/2027')).toBe(
      'rapor-budi-santoso-ganjil-2026-2027.pdf',
    );
  });

  it('rata-rata mengabaikan nilai kosong', () => {
    expect(averageGrade([80, null, 91])).toBe(85.5);
    expect(averageGrade([null, null])).toBeNull();
  });

  it('baris leger mengikuti urutan mapel, sel kosong untuk null', () => {
    const { headers, rows } = buildLedgerRows(recap);
    expect(headers).toEqual(['No', 'Nama', 'NIS', 'Matematika', 'Bahasa Indonesia', 'Rata-rata']);
    expect(rows[0]).toEqual([1, 'Ani', '0012', 90.5, 80, 85.25]);
    expect(rows[1]).toEqual([2, 'Budi', '', null, null, null]);
    expect(ledgerWidths(recap)).toHaveLength(headers.length);
  });

  it('nama lembar aman untuk Excel', () => {
    expect(safeSheetName('Leger 7/A: [x]').length).toBeLessThanOrEqual(31);
    expect(safeSheetName('Leger 7/A')).not.toContain('/');
    expect(safeSheetName('   ')).toBe('Leger');
  });
});
