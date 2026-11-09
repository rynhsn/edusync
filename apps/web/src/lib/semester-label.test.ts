import { describe, expect, it } from 'vitest';
import { semesterLabel } from './semester-label';

describe('semesterLabel', () => {
  it('memuat tahun ajaran agar Ganjil/Genap tidak tampak dobel', () => {
    expect(semesterLabel({ name: 'Ganjil', academicYearName: '2025/2026' })).toBe('Ganjil 2025/2026');
    expect(semesterLabel({ name: 'Genap', academicYearName: '2026/2027' })).toBe('Genap 2026/2027');
  });

  it('tanpa nama tahun memakai nama semester saja', () => {
    expect(semesterLabel({ name: 'Ganjil' })).toBe('Ganjil');
    expect(semesterLabel({ name: 'Ganjil', academicYearName: null })).toBe('Ganjil');
    expect(semesterLabel({ name: 'Ganjil', academicYearName: '' })).toBe('Ganjil');
  });
});
