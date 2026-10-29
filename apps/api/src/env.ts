import { z } from 'zod';

const schema = z.object({
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
