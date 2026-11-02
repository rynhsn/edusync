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
  /** Mengunci pengirim pesan wali murid: 'log' hanya mencatat, 'whatsapp' memakai whatsapp-web.js. Kosong = ikut pilihan di konsol platform. */
  MESSAGING_PROVIDER: z.enum(['log', 'whatsapp']).optional(),
  /** Jalur Chrome/Chromium untuk whatsapp-web.js; wajib bila provider whatsapp. */
  WA_CHROME_PATH: z.string().optional(),
  /** Folder sesi WhatsApp (satu subfolder per sekolah). */
  WA_SESSION_DIR: z.string().default('./.wa-sessions'),
  /** Batas klien WhatsApp (satu Chrome per sekolah, sekitar 300 MB RAM) yang berjalan bersamaan. */
  WA_MAX_CLIENTS: z.coerce.number().int().positive().default(20),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Konfigurasi worker tidak valid: ${fields}`);
  }
  return parsed.data;
}
