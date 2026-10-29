import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface PaymentConfig {
  provider: 'dev' | 'midtrans';
  /** Alamat web, dipakai untuk tautan pembayaran penyedia dev. */
  webUrl: string;
  devSecret: string;
  midtransServerKey?: string | undefined;
  midtransSnapUrl: string;
}

export interface ChargeRequest {
  /** Id pesanan di sisi penyedia (invoice.providerRef). */
  orderId: string;
  amount: number;
  customer: { name: string; email: string };
  description: string;
}

export interface Charge {
  paymentUrl: string;
}

export interface PaymentEvent {
  /** Unik per kabar; dipakai agar pengulangan webhook tidak diproses dua kali. */
  eventId: string;
  orderId: string;
  status: 'paid' | 'failed' | 'pending';
  amount: number;
}

export class InvalidWebhookError extends Error {}

/**
 * Penyedia pembayaran ditukar lewat antarmuka ini. Logika langganan tidak tahu penyedia mana
 * yang dipakai; ia hanya menerima PaymentEvent yang sudah diverifikasi.
 */
export interface PaymentProvider {
  readonly name: 'dev' | 'midtrans';
  createCharge(request: ChargeRequest): Promise<Charge>;
  /** Verifikasi tanda tangan dan ubah isi webhook menjadi PaymentEvent. Melempar InvalidWebhookError. */
  parseWebhook(body: unknown): PaymentEvent;
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/* ---------- Penyedia dev: tanpa uang, hanya untuk pengembangan dan tes ---------- */

export function signDevEvent(secret: string, e: Omit<PaymentEvent, never>) {
  return createHmac('sha256', secret)
    .update(`${e.eventId}.${e.orderId}.${e.status}.${e.amount}`)
    .digest('hex');
}

function devProvider(env: PaymentConfig): PaymentProvider {
  return {
    name: 'dev',
    async createCharge(request) {
      return { paymentUrl: `${env.webUrl}/pay/${encodeURIComponent(request.orderId)}` };
    },
    parseWebhook(body) {
      const b = body as Partial<PaymentEvent> & { signature?: string };
      if (
        !b ||
        typeof b !== 'object' ||
        !b.eventId ||
        !b.orderId ||
        !b.status ||
        typeof b.amount !== 'number'
      ) {
        throw new InvalidWebhookError('Bentuk webhook tidak valid');
      }
      const event: PaymentEvent = {
        eventId: b.eventId,
        orderId: b.orderId,
        status: b.status,
        amount: b.amount,
      };
      if (!b.signature || !safeEqual(b.signature, signDevEvent(env.devSecret, event))) {
        throw new InvalidWebhookError('Tanda tangan tidak cocok');
      }
      return event;
    },
  };
}

/* ---------- Midtrans (Snap). Belum diuji terhadap akun sandbox sungguhan. ---------- */

interface MidtransNotification {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  transaction_status?: string;
  fraud_status?: string;
  transaction_id?: string;
}

/** signature_key = SHA512(order_id + status_code + gross_amount + server_key), sesuai dokumentasi Midtrans. */
export function midtransSignature(n: MidtransNotification, serverKey: string) {
  return createHash('sha512')
    .update(`${n.order_id}${n.status_code}${n.gross_amount}${serverKey}`)
    .digest('hex');
}

function midtransProvider(env: PaymentConfig): PaymentProvider {
  const serverKey = env.midtransServerKey as string;
  return {
    name: 'midtrans',
    async createCharge(request) {
      const res = await fetch(env.midtransSnapUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`,
        },
        body: JSON.stringify({
          transaction_details: { order_id: request.orderId, gross_amount: request.amount },
          customer_details: { first_name: request.customer.name, email: request.customer.email },
          item_details: [
            {
              id: request.orderId,
              price: request.amount,
              quantity: 1,
              name: request.description.slice(0, 50),
            },
          ],
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { redirect_url?: string };
      if (!res.ok || !data.redirect_url)
        throw new Error(`Midtrans menolak pembuatan transaksi (${res.status})`);
      return { paymentUrl: data.redirect_url };
    },
    parseWebhook(body) {
      const n = body as MidtransNotification;
      if (
        !n ||
        typeof n !== 'object' ||
        !n.order_id ||
        !n.status_code ||
        !n.gross_amount ||
        !n.signature_key
      ) {
        throw new InvalidWebhookError('Bentuk webhook tidak valid');
      }
      if (!safeEqual(n.signature_key, midtransSignature(n, serverKey))) {
        throw new InvalidWebhookError('Tanda tangan tidak cocok');
      }
      const status = n.transaction_status;
      const paid = status === 'settlement' || (status === 'capture' && n.fraud_status === 'accept');
      const failed = status === 'expire' || status === 'cancel' || status === 'deny' || status === 'failure';
      return {
        eventId: `${n.transaction_id ?? n.order_id}:${status}`,
        orderId: n.order_id,
        status: paid ? 'paid' : failed ? 'failed' : 'pending',
        amount: Math.round(Number(n.gross_amount)),
      };
    },
  };
}

export function createPaymentProvider(env: PaymentConfig): PaymentProvider {
  return env.provider === 'midtrans' ? midtransProvider(env) : devProvider(env);
}
