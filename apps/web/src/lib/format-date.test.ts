import { describe, expect, it } from 'vitest';
import { formatCalendarDate } from './format-date';

describe('formatCalendarDate', () => {
  it('Sunda memakai nama bulan Sunda', () => {
    expect(formatCalendarDate('su', '2026-07-13')).toBe('13 Juli 2026');
    expect(formatCalendarDate('su', '2027-02-01')).toBe('1 Pébruari 2027');
    expect(formatCalendarDate('su', '2026-12-31')).toBe('31 Désémber 2026');
  });

  it('Indonesia dan Inggris memakai Intl', () => {
    expect(formatCalendarDate('id', '2026-07-13')).toBe('13 Juli 2026');
    expect(formatCalendarDate('en', '2026-07-13')).toBe('July 13, 2026');
  });

  it('tidak bergeser sehari karena zona waktu', () => {
    expect(formatCalendarDate('en', '2026-01-01')).toBe('January 1, 2026');
  });
});
