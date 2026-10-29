import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1),
    DATABASE_PLATFORM_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(32, 'minimal 32 karakter'),
    AUTH_URL: z.string().url().default('http://localhost:4000'),
    TRUSTED_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    /**
     * Domain dasar tempat sekolah diakses: <alamat-sekolah>.<APP_DOMAIN>. Hanya host dan port opsional,
     * tanpa skema atau path. Lokal: localhost:3000. Produksi: domain sebenarnya (belum tentu edusync.id).
     */
    APP_DOMAIN: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{2,5})?$/, 'hanya host dan port, tanpa http:// atau path')
      .default('localhost:3000'),
    /** Alamat web, dipakai untuk tautan pembayaran. */
    WEB_URL: z.string().url().default('http://localhost:3000'),
    PAYMENT_PROVIDER: z.enum(['dev', 'midtrans']).default('dev'),
    PAYMENT_DEV_SECRET: z.string().min(16).default('dev-only-payment-secret-do-not-use'),
    MIDTRANS_SERVER_KEY: z.string().optional(),
    MIDTRANS_SNAP_URL: z.string().url().default('https://app.sandbox.midtrans.com/snap/v1/transactions'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.PAYMENT_PROVIDER === 'dev') {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_PROVIDER'],
        message: 'penyedia dev dilarang di produksi',
      });
    }
    if (env.PAYMENT_PROVIDER === 'midtrans' && !env.MIDTRANS_SERVER_KEY) {
      ctx.addIssue({ code: 'custom', path: ['MIDTRANS_SERVER_KEY'], message: 'wajib untuk Midtrans' });
    }
  });

export type Env = z.infer<typeof schema>;

/** Gagal saat start bila konfigurasi salah, bukan saat request pertama. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Konfigurasi tidak valid: ${fields}`);
  }
  return parsed.data;
}
