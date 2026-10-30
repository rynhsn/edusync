import { describe, expect, it } from 'vitest';
import {
  addDays,
  computeLateFee,
  daysBetween,
  LATE_FEE_PERIOD_PREFIX,
  type LateFeeSetting,
  lateFeeParentId,
} from './finance-late-fee';

const flat: LateFeeSetting = { mode: 'flat', value: 25_000, graceDays: 3, capAmount: null };
const pct: LateFeeSetting = { mode: 'percent', value: 2, graceDays: 0, capAmount: null };

describe('tanggal', () => {
  it('menambah hari lintas bulan dan tahun kabisat', () => {
    expect(addDays('2027-01-31', 1)).toBe('2027-02-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-12-31', 7)).toBe('2028-01-07');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });
  it('menghitung selisih hari', () => {
    expect(daysBetween('2027-01-01', '2027-01-11')).toBe(10);
    expect(daysBetween('2027-01-11', '2027-01-01')).toBe(-10);
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1);
  });
});

describe('computeLateFee', () => {
  it('none selalu 0', () => {
    expect(
      computeLateFee(
        { mode: 'none', value: 10_000, graceDays: 0, capAmount: null },
        { outstanding: 500_000, dueDate: '2000-01-01', today: '2030-01-01' },
      ),
    ).toBe(0);
  });

  it('0 sampai hari terakhir toleransi, berlaku sehari sesudahnya', () => {
    const at = (today: string) =>
      computeLateFee(flat, { outstanding: 100_000, dueDate: '2027-03-10', today });
    expect(at('2027-03-09')).toBe(0);
    expect(at('2027-03-10')).toBe(0);
    expect(at('2027-03-13')).toBe(0);
    expect(at('2027-03-14')).toBe(25_000);
    expect(at('2028-01-01')).toBe(25_000);
  });

  it('tanpa toleransi, denda mulai sehari setelah jatuh tempo', () => {
    const at = (today: string) => computeLateFee(pct, { outstanding: 100_000, dueDate: '2027-03-10', today });
    expect(at('2027-03-10')).toBe(0);
    expect(at('2027-03-11')).toBe(2_000);
  });

  it('persen dari sisa tagihan dibulatkan ke rupiah terdekat', () => {
    const fee = (outstanding: number) =>
      computeLateFee(pct, { outstanding, dueDate: '2000-01-01', today: '2030-01-01' });
    expect(fee(250_000)).toBe(5_000);
    expect(fee(333_333)).toBe(6_667);
    expect(fee(25)).toBe(1);
    expect(fee(24)).toBe(0);
  });

  it('dibatasi capAmount', () => {
    const capped = { ...pct, value: 10, capAmount: 20_000 };
    expect(computeLateFee(capped, { outstanding: 100_000, dueDate: '2000-01-01', today: '2030-01-01' })).toBe(
      10_000,
    );
    expect(computeLateFee(capped, { outstanding: 900_000, dueDate: '2000-01-01', today: '2030-01-01' })).toBe(
      20_000,
    );
    const flatCap = { ...flat, capAmount: 10_000 };
    expect(
      computeLateFee(flatCap, { outstanding: 900_000, dueDate: '2000-01-01', today: '2030-01-01' }),
    ).toBe(10_000);
  });

  it('tanpa sisa tagihan tidak ada denda', () => {
    expect(computeLateFee(flat, { outstanding: 0, dueDate: '2000-01-01', today: '2030-01-01' })).toBe(0);
  });
});

describe('lateFeeParentId', () => {
  it('mengurai period tagihan denda', () => {
    expect(lateFeeParentId(`${LATE_FEE_PERIOD_PREFIX}abc`)).toBe('abc');
    expect(lateFeeParentId('2026-08')).toBeNull();
    expect(lateFeeParentId(null)).toBeNull();
  });
});
