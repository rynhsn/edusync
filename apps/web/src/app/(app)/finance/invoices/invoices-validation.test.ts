import { describe, expect, it } from 'vitest';
import { validateGenerate, validateInvoiceEdit, validateSplit, validateVoid } from './invoices-validation';

describe('validateGenerate', () => {
  const base = {
    feeTypeId: 'f',
    kind: 'one_time' as const,
    period: '',
    dueDate: '2026-11-10',
    installments: '',
  };
  it('jenis biaya dan jatuh tempo wajib', () => {
    expect(validateGenerate({ ...base, feeTypeId: '', dueDate: '' })).toEqual({
      feeTypeId: { code: 'choose' },
      dueDate: { code: 'required' },
    });
    expect(validateGenerate({ ...base, dueDate: '2026-02-30' }).dueDate).toEqual({ code: 'dateInvalid' });
    expect(validateGenerate(base)).toEqual({});
  });
  it('bulanan wajib periode TTTT-BB', () => {
    const m = { ...base, kind: 'monthly' as const };
    expect(validateGenerate({ ...m, period: '' }).period).toEqual({ code: 'required' });
    expect(validateGenerate({ ...m, period: '2026-13' }).period).toMatchObject({
      key: 'financeForms.periodMonthInvalid',
    });
    expect(validateGenerate({ ...m, period: '2026-08' })).toEqual({});
  });
  it('semester wajib S1 atau S2', () => {
    const s = { ...base, kind: 'semester' as const };
    expect(validateGenerate({ ...s, period: '' }).period).toEqual({ code: 'required' });
    expect(validateGenerate({ ...s, period: 'S3' }).period).toBeDefined();
    expect(validateGenerate({ ...s, period: 'S2' })).toEqual({});
  });
  it('cicilan 2..12, hanya jenis non-bulanan', () => {
    expect(validateGenerate({ ...base, installments: '1' }).installments).toEqual({
      code: 'range',
      min: 2,
      max: 12,
    });
    expect(validateGenerate({ ...base, installments: '12' })).toEqual({});
    expect(validateGenerate({ ...base, kind: 'monthly', period: '2026-08', installments: '99' })).toEqual({});
  });
});

describe('validateInvoiceEdit', () => {
  const base = { discount: '0', discountReason: '', dueDate: '2026-11-10', amount: 500_000, paid: 100_000 };
  it('diskon kosong dianggap nol', () => {
    expect(validateInvoiceEdit({ ...base, discount: '' })).toEqual({});
  });
  it('diskon bulat tidak negatif', () => {
    expect(validateInvoiceEdit({ ...base, discount: '1.5' }).discount).toEqual({ code: 'intInvalid' });
    expect(validateInvoiceEdit({ ...base, discount: '-1' }).discount).toEqual({ code: 'intInvalid' });
  });
  it('diskon tidak melebihi nominal dikurangi yang sudah dibayar', () => {
    expect(validateInvoiceEdit({ ...base, discount: '400000' })).toEqual({});
    expect(validateInvoiceEdit({ ...base, discount: '400001' }).discount).toMatchObject({
      key: 'financeForms.discountOver',
      values: { max: 400_000 },
    });
  });
  it('jatuh tempo wajib, alasan maksimal 300', () => {
    expect(validateInvoiceEdit({ ...base, dueDate: '' }).dueDate).toEqual({ code: 'required' });
    expect(validateInvoiceEdit({ ...base, discountReason: 'a'.repeat(301) }).discountReason).toEqual({
      code: 'tooLong',
      max: 300,
    });
  });
});

describe('validateSplit', () => {
  it('cicilan 2..12 dan tanggal wajib', () => {
    expect(validateSplit({ count: '3', firstDue: '2026-11-10' })).toEqual({});
    expect(validateSplit({ count: '1', firstDue: '' })).toEqual({
      count: { code: 'range', min: 2, max: 12 },
      firstDue: { code: 'required' },
    });
  });
});

describe('validateVoid', () => {
  it('alasan wajib, maksimal 300', () => {
    expect(validateVoid({ reason: '' }).reason).toEqual({ code: 'required' });
    expect(validateVoid({ reason: 'salah' })).toEqual({});
    expect(validateVoid({ reason: 'a'.repeat(301) }).reason).toEqual({ code: 'tooLong', max: 300 });
  });
});
