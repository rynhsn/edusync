import type { PaymentConfig } from '@edusync/billing';
import type { Env } from './env';

/** Konfigurasi penyedia pembayaran dari variabel lingkungan (dasar; pengaturan di konsol platform menimpanya). */
export const paymentConfig = (env: Env): PaymentConfig => ({
  provider: env.PAYMENT_PROVIDER,
  webUrl: env.WEB_URL,
  devSecret: env.PAYMENT_DEV_SECRET,
  midtransServerKey: env.MIDTRANS_SERVER_KEY,
  midtransSnapUrl: env.MIDTRANS_SNAP_URL,
});
