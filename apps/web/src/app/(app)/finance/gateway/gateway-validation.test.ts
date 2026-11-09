import { describe, expect, it } from 'vitest';
import { validateGateway } from './gateway-validation';

const form = { enabled: false, mode: 'sandbox' as const, merchantId: '', clientKey: '', serverKey: '' };

describe('validateGateway', () => {
  it('formulir kosong yang tidak diaktifkan benar', () => {
    expect(validateGateway(form, false)).toEqual({});
  });
  it('pengaktifan butuh kunci server tersimpan atau baru', () => {
    expect(validateGateway({ ...form, enabled: true }, false).serverKey).toMatchObject({
      key: 'finance.gwKeyRequired',
    });
    expect(validateGateway({ ...form, enabled: true }, true)).toEqual({});
    expect(validateGateway({ ...form, enabled: true, serverKey: 'SB-Mid-server-abc' }, false)).toEqual({});
  });
  it('awalan kunci server harus cocok dengan mode', () => {
    expect(validateGateway({ ...form, serverKey: 'Mid-server-abc' }, false).serverKey).toMatchObject({
      key: 'financeForms.serverKeyPrefix',
      values: { prefix: 'SB-Mid-server-' },
    });
    expect(validateGateway({ ...form, mode: 'production', serverKey: 'Mid-server-abc' }, false)).toEqual({});
    expect(
      validateGateway({ ...form, mode: 'production', serverKey: 'SB-Mid-server-abc' }, false).serverKey,
    ).toBeDefined();
  });
  it('batas panjang', () => {
    expect(validateGateway({ ...form, merchantId: 'a'.repeat(61) }, false).merchantId).toEqual({
      code: 'tooLong',
      max: 60,
    });
    expect(validateGateway({ ...form, clientKey: 'a'.repeat(201) }, false).clientKey).toEqual({
      code: 'tooLong',
      max: 200,
    });
    expect(
      validateGateway({ ...form, serverKey: `SB-Mid-server-${'a'.repeat(200)}` }, false).serverKey,
    ).toEqual({
      code: 'tooLong',
      max: 200,
    });
  });
});
