import type { Tone } from '@/components/ui-kit';

/** Status transaksi pembayaran online (Midtrans) sekolah. */
export type ChargeStatus = 'pending' | 'paid' | 'failed';

/** Selang pemeriksaan ulang status (milidetik); server membatasi tanya ke Midtrans sekali per 4 detik. */
export const CHARGE_POLL_MS = 4000;
/** Setelah selama ini tanpa hasil, pemeriksaan otomatis berhenti dan pengguna diberi tombol periksa ulang. */
export const CHARGE_POLL_LIMIT_MS = 10 * 60_000;
/** Batas tagihan per transaksi online (mengikuti API). */
export const MAX_ONLINE_INVOICES = 50;

export const CHARGE_TONE: Record<ChargeStatus, Tone> = {
  pending: 'amber',
  paid: 'emerald',
  failed: 'rose',
};

/** Transaksi yang masih menunggu perlu diperiksa ulang; yang sudah final tidak. */
export function shouldPollCharge(status: ChargeStatus | undefined, elapsedMs: number): boolean {
  return status === 'pending' && elapsedMs < CHARGE_POLL_LIMIT_MS;
}

export type GatewayMode = 'sandbox' | 'production';

/** Awalan kunci yang diterima Midtrans menurut mode (mengikuti validasi API). */
export function keyPrefixes(mode: GatewayMode): { server: string; client: string } {
  return mode === 'sandbox'
    ? { server: 'SB-Mid-server-', client: 'SB-Mid-client-' }
    : { server: 'Mid-server-', client: 'Mid-client-' };
}

export interface GatewayForm {
  enabled: boolean;
  mode: GatewayMode;
  merchantId: string;
  clientKey: string;
  serverKey: string;
}

/**
 * Isi permintaan simpan. Kunci server hanya dikirim bila diisi (kosong berarti mempertahankan yang tersimpan);
 * Merchant ID dan kunci klien yang dikosongkan dikirim sebagai null.
 */
export function buildGatewayBody(form: GatewayForm) {
  const serverKey = form.serverKey.trim();
  return {
    enabled: form.enabled,
    mode: form.mode,
    merchantId: form.merchantId.trim() || null,
    clientKey: form.clientKey.trim() || null,
    ...(serverKey ? { serverKey } : {}),
  };
}

/** Pengaktifan butuh kunci server: sudah tersimpan atau baru diketik. */
export function canSaveGateway(form: GatewayForm, hasServerKey: boolean): boolean {
  return !form.enabled || hasServerKey || form.serverKey.trim().length > 0;
}

/** Jumlah sisa tagihan yang dipilih (id yang tidak dikenal diabaikan). */
export function selectedOutstanding(
  invoices: readonly { id: string; outstanding: number }[],
  selected: ReadonlySet<string>,
): number {
  return invoices.reduce((sum, inv) => (selected.has(inv.id) ? sum + inv.outstanding : sum), 0);
}

/** Tagihan yang bisa dibayar online: masih ada sisa dan belum dibatalkan. */
export function isPayableOnline(inv: { outstanding: number; status: string }): boolean {
  return inv.outstanding > 0 && inv.status !== 'void' && inv.status !== 'paid';
}
