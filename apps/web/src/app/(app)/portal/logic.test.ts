import { describe, expect, it } from 'vitest';
import {
  attendanceTone,
  avatarHue,
  buildMonthGrid,
  dayPart,
  gradeTone,
  initials,
  monthRange,
  ringDash,
  shiftMonth,
} from './logic';

describe('shiftMonth', () => {
  it('melewati batas tahun', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-10', 0)).toBe('2026-10');
  });
});

describe('buildMonthGrid', () => {
  it('pekan dimulai Senin dan terisi penuh', () => {
    // 1 November 2026 jatuh pada hari Minggu: enam sel kosong di depan.
    const weeks = buildMonthGrid('2026-11', [{ date: '2026-11-02', status: 'present' }]);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]?.slice(0, 6).every((c) => c === null)).toBe(true);
    expect(weeks[0]?.[6]).toMatchObject({ day: 1, weekend: true, status: null });
    expect(weeks[1]?.[0]).toMatchObject({ day: 2, status: 'present', weekend: false });
    const days = weeks.flat().filter(Boolean);
    expect(days).toHaveLength(30);
  });
  it('Februari kabisat', () => {
    const days = buildMonthGrid('2028-02', []).flat().filter(Boolean);
    expect(days).toHaveLength(29);
  });
});

describe('ringDash', () => {
  it('membatasi 0..100', () => {
    const c = 2 * Math.PI * 10;
    expect(ringDash(100, 10).offset).toBeCloseTo(0);
    expect(ringDash(0, 10).offset).toBeCloseTo(c);
    expect(ringDash(null, 10).offset).toBeCloseTo(c);
    expect(ringDash(250, 10).offset).toBeCloseTo(0);
    expect(ringDash(50, 10).offset).toBeCloseTo(c / 2);
  });
});

describe('nada', () => {
  it('kehadiran', () => {
    expect(attendanceTone(95)).toBe('good');
    expect(attendanceTone(80)).toBe('warn');
    expect(attendanceTone(60)).toBe('low');
    expect(attendanceTone(null)).toBe('none');
  });
  it('nilai terhadap KKM', () => {
    expect(gradeTone(90, 75)).toBe('good');
    expect(gradeTone(78, 75)).toBe('warn');
    expect(gradeTone(70, 75)).toBe('low');
    expect(gradeTone(80, null)).toBe('warn');
    expect(gradeTone(null, 75)).toBe('none');
  });
});

describe('avatar', () => {
  it('inisial', () => {
    expect(initials('Aisyah Putri Rahma')).toBe('AR');
    expect(initials('Budi')).toBe('BU');
    expect(initials('  ')).toBe('?');
  });
  it('rona stabil dan dalam rentang', () => {
    expect(avatarHue('Aisyah')).toBe(avatarHue('Aisyah'));
    expect(avatarHue('Aisyah')).toBeGreaterThanOrEqual(0);
    expect(avatarHue('Aisyah')).toBeLessThan(360);
  });
});

describe('dayPart', () => {
  it('menurut jam Jakarta (UTC+7)', () => {
    expect(dayPart(new Date('2026-10-31T00:00:00Z'))).toBe('morning'); // 07.00
    expect(dayPart(new Date('2026-10-31T06:00:00Z'))).toBe('noon'); // 13.00
    expect(dayPart(new Date('2026-10-31T09:00:00Z'))).toBe('afternoon'); // 16.00
    expect(dayPart(new Date('2026-10-31T14:00:00Z'))).toBe('evening'); // 21.00
  });
});

describe('monthRange', () => {
  it('awal dan akhir bulan', () => {
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthRange('2028-02').to).toBe('2028-02-29');
  });
});
