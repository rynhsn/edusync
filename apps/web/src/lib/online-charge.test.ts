import { describe, expect, it } from 'vitest';
import {
  buildGatewayBody,
  CHARGE_POLL_LIMIT_MS,
  canSaveGateway,
  isPayableOnline,
  keyPrefixes,
  selectedOutstanding,
  shouldPollCharge,
} from './online-charge';

const base = { enabled: true, mode: 'sandbox' as const, merchantId: '', clientKey: '', serverKey: '' };

describe('shouldPollCharge', () => {
  it('hanya memeriksa ulang transaksi menunggu dan belum kedaluwarsa', () => {
    expect(shouldPollCharge('pending', 0)).toBe(true);
    expect(shouldPollCharge('pending', CHARGE_POLL_LIMIT_MS)).toBe(false);
    expect(shouldPollCharge('paid', 0)).toBe(false);
    expect(shouldPollCharge('failed', 0)).toBe(false);
    expect(shouldPollCharge(undefined, 0)).toBe(false);
  });
});

describe('buildGatewayBody', () => {
  it('tidak mengirim kunci server yang kosong (mempertahankan yang tersimpan)', () => {
    expect(buildGatewayBody({ ...base, serverKey: '   ' })).not.toHaveProperty('serverKey');
  });
  it('mengirim kunci server yang diisi, tanpa spasi tepi', () => {
    expect(buildGatewayBody({ ...base, serverKey: ' SB-Mid-server-abc ' }).serverKey).toBe(
      'SB-Mid-server-abc',
    );
  });
  it('mengubah isian kosong menjadi null', () => {
    const body = buildGatewayBody({ ...base, merchantId: ' ', clientKey: '' });
    expect(body.merchantId).toBeNull();
    expect(body.clientKey).toBeNull();
  });
});

describe('canSaveGateway', () => {
  it('menonaktifkan boleh tanpa kunci', () => {
    expect(canSaveGateway({ ...base, enabled: false }, false)).toBe(true);
  });
  it('mengaktifkan butuh kunci tersimpan atau baru diketik', () => {
    expect(canSaveGateway(base, false)).toBe(false);
    expect(canSaveGateway(base, true)).toBe(true);
    expect(canSaveGateway({ ...base, serverKey: 'k' }, false)).toBe(true);
  });
});

describe('keyPrefixes', () => {
  it('mengikuti mode', () => {
    expect(keyPrefixes('sandbox').server).toBe('SB-Mid-server-');
    expect(keyPrefixes('production').client).toBe('Mid-client-');
  });
});

describe('pembayaran tagihan online', () => {
  const invoices = [
    { id: 'a', outstanding: 100_000 },
    { id: 'b', outstanding: 250_000 },
  ];
  it('menjumlah sisa tagihan terpilih', () => {
    expect(selectedOutstanding(invoices, new Set(['a', 'b', 'x']))).toBe(350_000);
    expect(selectedOutstanding(invoices, new Set())).toBe(0);
  });
  it('hanya tagihan yang masih ada sisa dan tidak batal yang bisa dibayar', () => {
    expect(isPayableOnline({ outstanding: 10, status: 'unpaid' })).toBe(true);
    expect(isPayableOnline({ outstanding: 10, status: 'partial' })).toBe(true);
    expect(isPayableOnline({ outstanding: 0, status: 'paid' })).toBe(false);
    expect(isPayableOnline({ outstanding: 10, status: 'void' })).toBe(false);
  });
});
