import { describe, expect, it } from 'vitest';
import { EMPTY_LATE_FEE } from '../late-fee';
import {
  accountNumberIssue,
  validateAssign,
  validateBankAccount,
  validateDiscountRule,
  validateFeeType,
  validateLateFee,
  validatePaymentMethod,
  validatePlan,
} from './settings-validation';

describe('validateFeeType', () => {
  const ok = { name: 'SPP', scope: 'all' as const, classIds: [], studentIds: [] };
  it('menerima isian benar', () => expect(validateFeeType(ok)).toEqual({}));
  it('nama wajib, maksimal 80', () => {
    expect(validateFeeType({ ...ok, name: ' ' }).name).toEqual({ code: 'required' });
    expect(validateFeeType({ ...ok, name: 'a'.repeat(81) }).name).toEqual({ code: 'tooLong', max: 80 });
    expect(validateFeeType({ ...ok, name: 'a'.repeat(80) })).toEqual({});
  });
  it('cakupan kelas atau siswa wajib punya sasaran', () => {
    expect(validateFeeType({ ...ok, scope: 'class' }).scope).toMatchObject({
      key: 'finance.feeScopeTargetsRequired',
    });
    expect(validateFeeType({ ...ok, scope: 'student' }).scope).toBeDefined();
    expect(validateFeeType({ ...ok, scope: 'class', classIds: ['c1'] })).toEqual({});
  });
  it('sasaran melebihi batas ditolak', () => {
    const many = Array.from({ length: 501 }, (_, i) => `c${i}`);
    expect(validateFeeType({ ...ok, scope: 'class', classIds: many }).scope).toMatchObject({
      key: 'financeForms.targetsTooMany',
      values: { max: 500 },
    });
  });
});

describe('validatePlan', () => {
  it('jenis biaya dan nominal wajib; nol boleh', () => {
    expect(validatePlan({ feeTypeId: '', amount: '' })).toEqual({
      feeTypeId: { code: 'choose' },
      amount: { code: 'required' },
    });
    expect(validatePlan({ feeTypeId: 'f', amount: '0' })).toEqual({});
    expect(validatePlan({ feeTypeId: 'f', amount: '2000000001' }).amount).toBeDefined();
  });
});

describe('validateDiscountRule', () => {
  it('persen 1..100', () => {
    const base = { name: 'Yatim', kind: 'percent' as const };
    expect(validateDiscountRule({ ...base, value: '' }).value).toEqual({ code: 'required' });
    expect(validateDiscountRule({ ...base, value: '0' }).value).toEqual({ code: 'range', min: 1, max: 100 });
    expect(validateDiscountRule({ ...base, value: '101' }).value).toEqual({
      code: 'range',
      min: 1,
      max: 100,
    });
    expect(validateDiscountRule({ ...base, value: '100' })).toEqual({});
  });
  it('nominal harus lebih dari 0', () => {
    const base = { name: 'Beasiswa', kind: 'amount' as const };
    expect(validateDiscountRule({ ...base, value: '0' }).value).toMatchObject({
      key: 'financeForms.amountPositive',
    });
    expect(validateDiscountRule({ ...base, value: '50000' })).toEqual({});
  });
  it('nama wajib, maksimal 80', () => {
    expect(validateDiscountRule({ name: '', kind: 'amount', value: '1' }).name).toEqual({ code: 'required' });
    expect(validateDiscountRule({ name: 'a'.repeat(81), kind: 'amount', value: '1' }).name).toEqual({
      code: 'tooLong',
      max: 80,
    });
  });
});

describe('validateAssign', () => {
  const base = {
    ruleId: 'r',
    yearId: 'y',
    scope: 'class' as const,
    classId: 'c',
    pickedCount: 0,
    reason: '',
  };
  it('mode kelas butuh kelas', () => {
    expect(validateAssign(base)).toEqual({});
    expect(validateAssign({ ...base, classId: '' }).classId).toEqual({ code: 'choose' });
  });
  it('mode siswa butuh 1..300 siswa', () => {
    const s = { ...base, scope: 'students' as const, classId: '' };
    expect(validateAssign(s).students).toMatchObject({ key: 'financeForms.pickStudents' });
    expect(validateAssign({ ...s, pickedCount: 300 })).toEqual({});
    expect(validateAssign({ ...s, pickedCount: 301 }).students).toMatchObject({
      key: 'financeForms.tooManyStudents',
    });
  });
  it('aturan dan alasan', () => {
    expect(validateAssign({ ...base, ruleId: '' }).ruleId).toEqual({ code: 'choose' });
    expect(validateAssign({ ...base, reason: 'a'.repeat(301) }).reason).toEqual({
      code: 'tooLong',
      max: 300,
    });
  });
});

describe('validateLateFee', () => {
  const on = { ...EMPTY_LATE_FEE, mode: 'flat' as const, value: '5000', feeTypeId: 'f' };
  it('mode none selalu benar', () => {
    expect(validateLateFee({ ...EMPTY_LATE_FEE, dueDays: '' })).toEqual({});
  });
  it('nominal tetap > 0, persen 1..100', () => {
    expect(validateLateFee(on)).toEqual({});
    expect(validateLateFee({ ...on, value: '' }).value).toEqual({ code: 'required' });
    expect(validateLateFee({ ...on, value: '0' }).value).toBeDefined();
    expect(validateLateFee({ ...on, mode: 'percent', value: '101' }).value).toEqual({
      code: 'range',
      min: 1,
      max: 100,
    });
    expect(validateLateFee({ ...on, mode: 'percent', value: '5' })).toEqual({});
  });
  it('toleransi 0..365 (kosong = 0), jatuh tempo denda 1..365', () => {
    expect(validateLateFee({ ...on, graceDays: '' })).toEqual({});
    expect(validateLateFee({ ...on, graceDays: '366' }).graceDays).toEqual({
      code: 'range',
      min: 0,
      max: 365,
    });
    expect(validateLateFee({ ...on, dueDays: '' }).dueDays).toEqual({ code: 'required' });
    expect(validateLateFee({ ...on, dueDays: '0' }).dueDays).toEqual({ code: 'range', min: 1, max: 365 });
  });
  it('batas opsional tetapi > 0, jenis biaya wajib', () => {
    expect(validateLateFee({ ...on, capAmount: '0' }).capAmount).toBeDefined();
    expect(validateLateFee({ ...on, capAmount: '1000' })).toEqual({});
    expect(validateLateFee({ ...on, feeTypeId: '' }).feeTypeId).toEqual({ code: 'choose' });
  });
});

describe('validatePaymentMethod', () => {
  it('label wajib, maksimal 40, tidak kembar', () => {
    expect(validatePaymentMethod({ label: ' ' }, []).label).toEqual({ code: 'required' });
    expect(validatePaymentMethod({ label: 'a'.repeat(41) }, []).label).toEqual({ code: 'tooLong', max: 40 });
    expect(validatePaymentMethod({ label: 'qris' }, ['QRIS']).label).toMatchObject({
      key: 'financeForms.labelTaken',
    });
    expect(validatePaymentMethod({ label: 'QRIS' }, ['Tunai'])).toEqual({});
  });
});

describe('rekening bank', () => {
  it('nomor rekening mengikuti API', () => {
    expect(accountNumberIssue('')).toEqual({ code: 'required' });
    expect(accountNumberIssue('12ab')).toMatchObject({ key: 'financeForms.accountChars' });
    expect(accountNumberIssue('-1234')).toMatchObject({ key: 'financeForms.accountChars' });
    expect(accountNumberIssue('1234')).toMatchObject({ key: 'financeForms.accountShort' });
    expect(accountNumberIssue('1 2 3 4')).toMatchObject({ key: 'financeForms.accountShort' });
    expect(accountNumberIssue('1'.repeat(31))).toEqual({ code: 'tooLong', max: 30 });
    expect(accountNumberIssue('1234-5678 90')).toBeUndefined();
  });
  it('bank dan pemilik minimal 2, catatan maksimal 200', () => {
    const ok = { bankName: 'BCA', accountNumber: '1234567890', accountHolder: 'Yayasan', note: '' };
    expect(validateBankAccount(ok)).toEqual({});
    expect(validateBankAccount({ ...ok, bankName: 'B' }).bankName).toMatchObject({
      key: 'areaForms.minLength',
    });
    expect(validateBankAccount({ ...ok, accountHolder: '' }).accountHolder).toEqual({ code: 'required' });
    expect(validateBankAccount({ ...ok, note: 'a'.repeat(201) }).note).toEqual({ code: 'tooLong', max: 200 });
    expect(validateBankAccount({ ...ok, bankName: 'a'.repeat(61) }).bankName).toEqual({
      code: 'tooLong',
      max: 60,
    });
  });
});
