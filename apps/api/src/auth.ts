import { account, type Db, session, user, verification } from '@edusync/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { oneTimeToken } from 'better-auth/plugins/one-time-token';
import type { Env } from './env';
import { createOriginMatcher } from './origins';

/** Pencocok asal yang dipakai bersama oleh login (Better Auth) dan CORS. */
export function originMatcherFor(env: Env) {
  return createOriginMatcher({
    appDomain: env.APP_DOMAIN,
    scheme: new URL(env.AUTH_URL).protocol === 'https:' ? 'https:' : 'http:',
    extra: env.TRUSTED_ORIGINS,
  });
}

/**
 * Satu instance Better Auth untuk seluruh sistem. Pengguna bersifat global;
 * keanggotaan dan peran per unit ada di tabel member (lihat identity/).
 */
export function createAuth(env: Env, db: Db) {
  const isTrusted = originMatcherFor(env);
  return betterAuth({
    appName: 'Edusync',
    baseURL: env.AUTH_URL,
    basePath: '/api/auth',
    secret: env.AUTH_SECRET,
    // Setiap subdomain sekolah adalah asal yang sah; sesi tetap terikat ke alamat tempat login dilakukan.
    trustedOrigins: (request) => {
      const origin = request?.headers.get('origin');
      return [...env.TRUSTED_ORIGINS, ...(origin && isTrusted(origin) ? [origin] : [])];
    },
    // Token sekali pakai untuk berpindah alamat (mis. dari alamat utama ke subdomain sekolah): satu menit,
    // disimpan dalam bentuk hash, dan hanya berlaku sekali.
    plugins: [oneTimeToken({ expiresIn: 1, storeToken: 'hashed' })],
    database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
    advanced: {
      useSecureCookies: env.NODE_ENV === 'production',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
