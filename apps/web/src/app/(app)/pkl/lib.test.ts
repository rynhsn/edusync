import { describe, expect, it } from 'vitest';
import { avatarTone, initials, monthGrid, parseScore, periodProgress, shiftMonth, weightTotal } from './lib';

describe('initials', () => {
  it('mengambil dua huruf awal', () => {
    expect(initials('Budi Santoso')).toBe('BS');
    expect(initials('  siti   nur  aini ')).toBe('SN');
    expect(initials('Dewi')).toBe('D');
    expect(initials('')).toBe('?');
  });
});

describe('avatarTone', () => {
  it('stabil untuk nama yang sama', () => {
    expect(avatarTone('Budi')).toBe(avatarTone('Budi'));
  });
});

describe('shiftMonth', () => {
  it('menggeser lintas tahun', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-10', 0)).toBe('2026-10');
  });
});

describe('monthGrid', () => {
  it('Oktober 2026 dimulai Kamis (pekan mulai Senin)', () => {
    const weeks = monthGrid('2026-10');
    expect(weeks[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weeks.at(-1)?.at(-1)).toBeNull();
  });
  it('Februari 2027 tepat empat pekan', () => {
    const weeks = monthGrid('2027-02');
    expect(weeks).toHaveLength(4);
    expect(weeks.flat().filter(Boolean)).toHaveLength(28);
  });
});

describe('periodProgress', () => {
  it('belum mulai, berjalan, selesai', () => {
    expect(periodProgress('2026-10-01', '2026-10-10', '2026-09-30').state).toBe('upcoming');
    const mid = periodProgress('2026-10-01', '2026-10-10', '2026-10-05');
    expect(mid).toMatchObject({ state: 'running', elapsed: 5, total: 10, pct: 50 });
    expect(periodProgress('2026-10-01', '2026-10-10', '2026-10-11')).toMatchObject({
      state: 'done',
      pct: 100,
    });
  });
});

describe('weightTotal', () => {
  it('menjumlah bobot', () => {
    expect(weightTotal([{ weight: 20 }, { weight: 30 }])).toBe(50);
    expect(weightTotal([])).toBe(0);
  });
});

describe('parseScore', () => {
  it('menerima bilangan bulat 0..100 saja', () => {
    expect(parseScore('85')).toBe(85);
    expect(parseScore(' 0 ')).toBe(0);
    expect(parseScore('100')).toBe(100);
    expect(parseScore('101')).toBeNull();
    expect(parseScore('')).toBeNull();
    expect(parseScore('8.5')).toBeNull();
    expect(parseScore('-3')).toBeNull();
  });
});
