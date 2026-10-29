import { account, type Db, session, user, verification } from '@edusync/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { Env } from './env';

/**
 * Satu instance Better Auth untuk seluruh sistem. Pengguna bersifat global;
 * keanggotaan dan peran per unit ada di tabel member (lihat identity/).
 */
export function createAuth(env: Env, db: Db) {
  return betterAuth({
    appName: 'Edusync',
    baseURL: env.AUTH_URL,
    basePath: '/api/auth',
    secret: env.AUTH_SECRET,
    trustedOrigins: env.TRUSTED_ORIGINS,
    database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
    advanced: {
      useSecureCookies: env.NODE_ENV === 'production',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
