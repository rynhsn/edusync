import { describe, expect, it } from 'vitest';
import { bodyFromDraft, draftFromSetting, EMPTY_LATE_FEE, isLateFeeDraftValid, pendingIds } from './late-fee';

describe('late-fee', () => {
  it('draftFromSetting dan bodyFromDraft bolak-balik', () => {
    const d = draftFromSetting({
      mode: 'percent',
      value: 5,
      graceDays: 3,
      capAmount: 50000,
      feeTypeId: 'f1',
    });
    expect(d).toEqual({ mode: 'percent', value: '5', graceDays: '3', capAmount: '50000', feeTypeId: 'f1' });
    expect(bodyFromDraft(d)).toEqual({
      mode: 'percent',
      value: 5,
      graceDays: 3,
      capAmount: 50000,
      feeTypeId: 'f1',
    });
  });

  it('mode none mengosongkan nilai, batas, dan jenis biaya', () => {
    expect(bodyFromDraft({ ...EMPTY_LATE_FEE, value: '9', capAmount: '5', feeTypeId: 'x' })).toEqual({
      mode: 'none',
      value: 0,
      graceDays: 0,
      capAmount: null,
      feeTypeId: null,
    });
  });

  it('validasi mengikuti aturan API', () => {
    const base = { ...EMPTY_LATE_FEE, feeTypeId: 'f1', value: '10' };
    expect(isLateFeeDraftValid(EMPTY_LATE_FEE)).toBe(true);
    expect(isLateFeeDraftValid({ ...base, mode: 'percent' })).toBe(true);
    expect(isLateFeeDraftValid({ ...base, mode: 'percent', value: '101' })).toBe(false);
    expect(isLateFeeDraftValid({ ...base, mode: 'flat', value: '0' })).toBe(false);
    expect(isLateFeeDraftValid({ ...base, mode: 'flat', feeTypeId: '' })).toBe(false);
    expect(isLateFeeDraftValid({ ...base, mode: 'flat', capAmount: '0' })).toBe(false);
    expect(isLateFeeDraftValid({ ...base, mode: 'flat', graceDays: '400' })).toBe(false);
  });

  it('pendingIds hanya yang belum dikenai denda', () => {
    expect(
      pendingIds([
        { invoiceId: 'a', fined: false },
        { invoiceId: 'b', fined: true },
      ]),
    ).toEqual(['a']);
  });
});
