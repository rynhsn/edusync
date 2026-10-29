import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { type Db, eq, platformSetting } from '@edusync/db';
import { DomainError } from './errors';
import { createPaymentProvider, type PaymentConfig, type PaymentProvider } from './provider';

const SANDBOX_URL = 'https://app.sandbox.midtrans.com/snap/v1/transactions';
const PRODUCTION_URL = 'https://app.midtrans.com/snap/v1/transactions';
const PAYMENT_KEY = 'payment';

export type MidtransMode = 'sandbox' | 'production';

/** Kunci enkripsi diturunkan dari rahasia aplikasi (AUTH_SECRET); mengganti rahasia itu membuat kunci tersimpan tak terbaca. */
const cipherKey = (secret: string) => createHash('sha256').update(`edusync:settings:${secret}`).digest();

/** AES-256-GCM. Bentuk: v1.<iv>.<tag>.<data>, semuanya base64url. */
export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cipherKey(secret), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.');
}

export function decryptSecret(blob: string, secret: string): string {
  const [version, iv, tag, data] = blob.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Format rahasia tersimpan tidak dikenal');
  const decipher = createDecipheriv('aes-256-gcm', cipherKey(secret), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

interface StoredPayment {
  provider: 'dev' | 'midtrans';
  mode: MidtransMode;
  serverKeyEnc?: string;
}

async function readStored(db: Db): Promise<StoredPayment | null> {
  const [row] = await db.select().from(platformSetting).where(eq(platformSetting.key, PAYMENT_KEY));
  return (row?.value as unknown as StoredPayment | undefined) ?? null;
}

export interface PaymentSettingsView {
  provider: 'dev' | 'midtrans';
  mode: MidtransMode;
  hasServerKey: boolean;
  /** Empat karakter terakhir kunci, untuk memastikan kunci yang benar tersimpan; kunci utuh tidak pernah dikembalikan. */
  serverKeyHint: string | null;
  /** Dari mana pengaturan yang berlaku: pengaturan di database, atau variabel lingkungan bila belum diatur. */
  source: 'database' | 'environment';
}

const modeOf = (url: string): MidtransMode => (url === PRODUCTION_URL ? 'production' : 'sandbox');
const hint = (key: string) => key.slice(-4);

export async function paymentSettingsView(
  db: Db,
  secret: string,
  base: PaymentConfig,
): Promise<PaymentSettingsView> {
  const stored = await readStored(db);
  if (!stored) {
    return {
      provider: base.provider,
      mode: modeOf(base.midtransSnapUrl),
      hasServerKey: Boolean(base.midtransServerKey),
      serverKeyHint: base.midtransServerKey ? hint(base.midtransServerKey) : null,
      source: 'environment',
    };
  }
  return {
    provider: stored.provider,
    mode: stored.mode,
    hasServerKey: Boolean(stored.serverKeyEnc),
    serverKeyHint: stored.serverKeyEnc ? hint(decryptSecret(stored.serverKeyEnc, secret)) : null,
    source: 'database',
  };
}

export interface PaymentSettingsInput {
  provider: 'dev' | 'midtrans';
  mode: MidtransMode;
  /** Kosong atau tidak diisi = pertahankan kunci yang tersimpan. */
  serverKey?: string | undefined;
}

/**
 * Simpan pengaturan penyedia pembayaran. Midtrans wajib punya kunci server (baru atau yang sudah tersimpan),
 * dan penyedia simulasi `dev` tidak boleh dipakai di produksi.
 */
export async function savePaymentSettings(
  db: Db,
  secret: string,
  staffId: string,
  input: PaymentSettingsInput,
  options: { production: boolean },
) {
  if (options.production && input.provider === 'dev') {
    throw new DomainError(400, 'invalid_provider', 'Penyedia simulasi tidak boleh dipakai di produksi.');
  }
  const stored = await readStored(db);
  const newKey = input.serverKey?.trim();
  const serverKeyEnc = newKey ? encryptSecret(newKey, secret) : stored?.serverKeyEnc;
  if (input.provider === 'midtrans' && !serverKeyEnc) {
    throw new DomainError(400, 'server_key_required', 'Kunci server Midtrans wajib diisi.');
  }
  const value: StoredPayment = {
    provider: input.provider,
    mode: input.mode,
    ...(serverKeyEnc ? { serverKeyEnc } : {}),
  };
  await db
    .insert(platformSetting)
    .values({ key: PAYMENT_KEY, value: value as unknown as Record<string, unknown>, updatedBy: staffId })
    .onConflictDoUpdate({
      target: platformSetting.key,
      set: { value: value as unknown as Record<string, unknown>, updatedBy: staffId, updatedAt: new Date() },
    });
}

/** Konfigurasi penyedia yang berlaku: pengaturan di database menimpa variabel lingkungan. */
export async function resolvePaymentConfig(
  db: Db,
  secret: string,
  base: PaymentConfig,
): Promise<PaymentConfig> {
  const stored = await readStored(db);
  if (!stored) return base;
  return {
    ...base,
    provider: stored.provider,
    midtransServerKey: stored.serverKeyEnc ? decryptSecret(stored.serverKeyEnc, secret) : undefined,
    midtransSnapUrl: stored.mode === 'production' ? PRODUCTION_URL : SANDBOX_URL,
  };
}

/**
 * Penyedia pembayaran yang mengikuti pengaturan terbaru tanpa restart. Hasil disimpan singkat (TTL) agar tidak
 * membaca database di setiap permintaan; `invalidate()` dipanggil setelah pengaturan diubah.
 */
export class PaymentProviderResolver {
  private cached: { at: number; provider: PaymentProvider } | null = null;

  constructor(
    private readonly db: Db,
    private readonly secret: string,
    private readonly base: PaymentConfig,
    private readonly ttlMs = 15_000,
  ) {}

  async get(): Promise<PaymentProvider> {
    if (this.cached && Date.now() - this.cached.at < this.ttlMs) return this.cached.provider;
    const provider = createPaymentProvider(await resolvePaymentConfig(this.db, this.secret, this.base));
    this.cached = { at: Date.now(), provider };
    return provider;
  }

  invalidate() {
    this.cached = null;
  }
}
