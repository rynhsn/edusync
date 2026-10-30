import { describe, expect, it } from 'vitest';
import {
  certificateFileName,
  formatGrade,
  formatIdDate,
  PREDICATE_WORD,
  periodRangeText,
  placeAndDate,
} from './format';

describe('certificateFileName', () => {
  it('menyusun nama berkas dari siswa dan periode', () => {
    expect(certificateFileName('Siti Nurhaliza', 'PKL Gelombang 1 2026/2027')).toBe(
      'sertifikat-pkl-siti-nurhaliza-pkl-gelombang-1-2026-2027.pdf',
    );
  });
  it('membuang diakritik dan tanda baca', () => {
    expect(certificateFileName("Rénata  O'Neil", '')).toBe('sertifikat-pkl-renata-o-neil.pdf');
  });
});

describe('format tanggal dan nilai', () => {
  it('tanggal Indonesia', () => {
    expect(formatIdDate('2026-10-30')).toBe('30 Oktober 2026');
    expect(formatIdDate('2026-01-05')).toBe('5 Januari 2026');
  });
  it('rentang periode', () => {
    expect(periodRangeText('2026-10-01', '2026-11-30')).toBe('1 Oktober 2026 s.d. 30 November 2026');
  });
  it('tempat dan tanggal', () => {
    expect(placeAndDate('Bandung', '2026-10-30')).toBe('Bandung, 30 Oktober 2026');
    expect(placeAndDate('  ', '2026-10-30')).toBe('30 Oktober 2026');
  });
  it('nilai berkoma desimal', () => {
    expect(formatGrade(85.5)).toBe('85,5');
    expect(formatGrade(90)).toBe('90');
    expect(formatGrade(null)).toBe('');
  });
  it('kata predikat lengkap', () => {
    expect(Object.keys(PREDICATE_WORD).sort()).toEqual(['A', 'B', 'C', 'D']);
  });
});
