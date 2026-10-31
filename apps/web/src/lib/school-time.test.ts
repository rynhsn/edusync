import { afterEach, describe, expect, it } from 'vitest';
import { nowHm, setSchoolTimezone, todayIso, todayWeekdayNumber } from './school-time';

afterEach(() => setSchoolTimezone(undefined));

describe('waktu sekolah di web', () => {
  const at = new Date('2026-10-31T17:30:00Z'); // 00:30 Minggu 1 Nov di WIB, 02:30 di WIT

  it('bawaan Asia/Jakarta', () => {
    expect(todayIso(at)).toBe('2026-11-01');
    expect(nowHm(at)).toBe('00:30');
    expect(todayWeekdayNumber(at)).toBe(7);
  });

  it('mengikuti zona sekolah dan kembali ke bawaan bila tak dikenal', () => {
    setSchoolTimezone('Asia/Jayapura');
    expect(nowHm(at)).toBe('02:30');
    setSchoolTimezone('UTC');
    expect(todayIso(at)).toBe('2026-10-31');
    setSchoolTimezone('Mars/Olympus');
    expect(todayIso(at)).toBe('2026-11-01');
  });
});
