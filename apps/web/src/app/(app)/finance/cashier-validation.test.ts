import { describe, expect, it } from 'vitest';
import { lineKey, paymentOrder, validatePayment, validateReason } from './cashier-validation';

const line = (id: string, amount: string, outstanding = 100_000) => ({ id, amount, outstanding });
const base = { lines: [line('a', '100000')], method: 'cash', paidAt: '2026-11-09', note: '' };

describe('validatePayment', () => {
  it('menerima pembayaran penuh dan sebagian', () => {
    expect(validatePayment(base)).toEqual({});
    expect(validatePayment({ ...base, lines: [line('a', '1')] })).toEqual({});
  });
  it('wajib memilih tagihan', () => {
    expect(validatePayment({ ...base, lines: [] }).lines).toMatchObject({ key: 'financeForms.pickInvoice' });
  });
  it('jumlah 1..sisa tagihan, bulat', () => {
    expect(validatePayment({ ...base, lines: [line('a', '')] })[lineKey('a')]).toEqual({ code: 'required' });
    expect(validatePayment({ ...base, lines: [line('a', '0')] })[lineKey('a')]).toMatchObject({
      key: 'financeForms.amountPositive',
    });
    expect(validatePayment({ ...base, lines: [line('a', '100001')] })[lineKey('a')]).toMatchObject({
      key: 'financeForms.overOutstanding',
      values: { max: 100_000 },
    });
    expect(validatePayment({ ...base, lines: [line('a', '1.5')] })[lineKey('a')]).toEqual({
      code: 'intInvalid',
    });
  });
  it('tiap tagihan dinilai sendiri', () => {
    const r = validatePayment({ ...base, lines: [line('a', '5', 10), line('b', '50', 10)] });
    expect(Object.keys(r)).toEqual([lineKey('b')]);
  });
  it('lebih dari 50 tagihan atau total di atas 2 miliar ditolak', () => {
    const many = Array.from({ length: 51 }, (_, i) => line(`i${i}`, '1', 1));
    expect(validatePayment({ ...base, lines: many }).lines).toMatchObject({
      key: 'financeForms.tooManyInvoices',
    });
    const big = [line('a', '1500000000', 2_000_000_000), line('b', '1500000000', 2_000_000_000)];
    expect(validatePayment({ ...base, lines: big }).lines).toMatchObject({ key: 'financeForms.totalTooBig' });
  });
  it('metode, tanggal, dan catatan', () => {
    expect(validatePayment({ ...base, method: '' }).method).toEqual({ code: 'choose' });
    expect(validatePayment({ ...base, paidAt: '' }).paidAt).toEqual({ code: 'required' });
    expect(validatePayment({ ...base, paidAt: '2026-02-30' }).paidAt).toEqual({ code: 'dateInvalid' });
    expect(validatePayment({ ...base, note: 'a'.repeat(301) }).note).toEqual({ code: 'tooLong', max: 300 });
  });
});

describe('paymentOrder', () => {
  it('daftar, jumlah per tagihan, lalu metode, tanggal, catatan', () => {
    expect(paymentOrder([{ id: 'a' }, { id: 'b' }])).toEqual([
      'lines',
      'amt-a',
      'amt-b',
      'method',
      'paidAt',
      'note',
    ]);
  });
});

describe('validateReason', () => {
  it('wajib, maksimal 300', () => {
    expect(validateReason({ reason: ' ' }).reason).toEqual({ code: 'required' });
    expect(validateReason({ reason: 'salah input' })).toEqual({});
    expect(validateReason({ reason: 'a'.repeat(301) }).reason).toEqual({ code: 'tooLong', max: 300 });
  });
});
