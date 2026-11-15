import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_JOBS_URL: z.string().min(1),
  DATABASE_PLATFORM_URL: z.string().min(1),
  RELAY_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  /** Seberapa sering siklus penagihan (invoice perpanjangan dan status langganan) dijalankan. */
  BILLING_CYCLE_MS: z.coerce.number().int().positive().default(600_000),
  /** Dipakai untuk membuka kunci penyedia pembayaran yang disimpan terenkripsi (sama dengan API). */
  AUTH_SECRET: z.string().min(32, 'minimal 32 karakter'),
  PAYMENT_PROVIDER: z.enum(['dev', 'midtrans']).default('dev'),
  PAYMENT_DEV_SECRET: z.string().min(16).default('dev-only-payment-secret-do-not-use'),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  MIDTRANS_SERVER_KEY: z.string().optional(),
  MIDTRANS_SNAP_URL: z.string().url().default('https://app.sandbox.midtrans.com/snap/v1/transactions'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default('Edusync <noreply@edusync.test>'),
  /** Mengunci pengirim pesan wali murid: 'log' hanya mencatat, 'whatsapp' memakai Baileys. Kosong = ikut pilihan di konsol platform. */
  MESSAGING_PROVIDER: z.enum(['log', 'whatsapp']).optional(),
  /** Batas klien WhatsApp (satu soket Baileys per sekolah, beberapa puluh MB RAM) yang berjalan bersamaan. */
  WA_MAX_CLIENTS: z.coerce.number().int().positive().default(20),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Konfigurasi worker tidak valid: ${fields}`);
  }
  // Di produksi penyedia pesan hanya ditentukan pengaturan platform; env itu hanya untuk pengembangan dan uji.
  if (parsed.data.NODE_ENV === 'production') return { ...parsed.data, MESSAGING_PROVIDER: undefined };
  return parsed.data;
}
