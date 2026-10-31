import { describe, expect, it } from 'vitest';
import {
  endOfDayIn,
  isValidTimezone,
  localParts,
  normalizeTimezone,
  startOfDayIn,
  timeIn,
  todayIn,
  weekdayOfDate,
  zonedTimeToDate,
} from './timezone';

// 2026-10-30 18:30 UTC = 31 Okt 01:30 WIB = 02:30 WITA = 03:30 WIT
const instant = new Date('2026-10-30T18:30:00Z');

describe('zona waktu sekolah', () => {
  it('tanggal dan jam bergeser menurut zona', () => {
    expect(localParts(instant, 'Asia/Jakarta')).toEqual({ date: '2026-10-31', time: '01:30', weekday: 6 });
    expect(localParts(instant, 'Asia/Makassar').time).toBe('02:30');
    expect(localParts(instant, 'Asia/Jayapura').time).toBe('03:30');
    expect(todayIn('UTC', instant)).toBe('2026-10-30');
    expect(timeIn('Asia/Jayapura', instant)).toBe('03:30');
  });

  it('zona tak dikenal jatuh ke Asia/Jakarta', () => {
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
    expect(normalizeTimezone('Mars/Olympus')).toBe('Asia/Jakarta');
    expect(normalizeTimezone(null)).toBe('Asia/Jakarta');
    expect(todayIn('Mars/Olympus', instant)).toBe('2026-10-31');
  });

  it('awal dan akhir hari sebagai instan UTC', () => {
    expect(startOfDayIn('2026-10-30', 'Asia/Jakarta').toISOString()).toBe('2026-10-29T17:00:00.000Z');
    expect(startOfDayIn('2026-10-30', 'Asia/Makassar').toISOString()).toBe('2026-10-29T16:00:00.000Z');
    expect(startOfDayIn('2026-10-30', 'Asia/Jayapura').toISOString()).toBe('2026-10-29T15:00:00.000Z');
    expect(endOfDayIn('2026-10-30', 'Asia/Jakarta').toISOString()).toBe('2026-10-30T17:00:00.000Z');
    expect(startOfDayIn('2026-10-30', 'UTC').toISOString()).toBe('2026-10-30T00:00:00.000Z');
  });

  it('jam dinding ke instan dan bolak-balik', () => {
    const at = zonedTimeToDate('2026-10-30', '07:15', 'Asia/Makassar');
    expect(at.toISOString()).toBe('2026-10-29T23:15:00.000Z');
    expect(localParts(at, 'Asia/Makassar')).toMatchObject({ date: '2026-10-30', time: '07:15' });
  });

  it('zona dengan DST tetap benar', () => {
    // Perth tanpa DST; uji zona ber-DST: Sydney tidak ada di daftar tetapi fungsinya generik.
    expect(startOfDayIn('2026-01-15', 'Australia/Sydney').toISOString()).toBe('2026-01-14T13:00:00.000Z');
    expect(startOfDayIn('2026-07-15', 'Australia/Sydney').toISOString()).toBe('2026-07-14T14:00:00.000Z');
  });

  it('hari dalam pekan', () => {
    expect(weekdayOfDate('2026-10-31')).toBe(6);
    expect(weekdayOfDate('2026-11-01')).toBe(7);
    expect(weekdayOfDate('2026-11-02')).toBe(1);
  });
});
