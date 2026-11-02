import { account, type Db, session, user, verification } from '@edusync/db';
import { enqueue, QUEUES } from '@edusync/jobs';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { oneTimeToken } from 'better-auth/plugins/one-time-token';
import type { Env } from './env';
import { createDynamicOriginChecker, createOriginMatcher, type HostResolver } from './origins';

const schemeOf = (env: Env) => (new URL(env.AUTH_URL).protocol === 'https:' ? 'https:' : 'http:');

/** Pencocok asal statis (APP_DOMAIN dan TRUSTED_ORIGINS) yang dipakai bersama oleh login dan CORS. */
export function originMatcherFor(env: Env) {
  return createOriginMatcher({
    appDomain: env.APP_DOMAIN,
    scheme: schemeOf(env),
    extra: env.TRUSTED_ORIGINS,
  });
}

/**
 * Satu instance Better Auth untuk seluruh sistem. Pengguna bersifat global;
 * keanggotaan dan peran per unit ada di tabel member (lihat identity/).
 */
export function createAuth(env: Env, db: Db, hosts: HostResolver, outboxDb: Db) {
  const isTrusted = dynamicOriginCheckerFor(env, hosts);
  return betterAuth({
    appName: 'Edusync',
    baseURL: env.AUTH_URL,
    basePath: '/api/auth',
    secret: env.AUTH_SECRET,
    // Setiap subdomain sekolah adalah asal yang sah; sesi tetap terikat ke alamat tempat login dilakukan.
    trustedOrigins: async (request) => {
      const origin = request?.headers.get('origin');
      return [...env.TRUSTED_ORIGINS, ...(origin && (await isTrusted(origin)) ? [origin] : [])];
    },
    // Token sekali pakai untuk berpindah alamat (mis. dari alamat utama ke subdomain sekolah): satu menit,
    // disimpan dalam bentuk hash, dan hanya berlaku sekali.
    plugins: [
      oneTimeToken({ expiresIn: 1, storeToken: 'hashed' }),
      // Lupa kata sandi: kode 6 digit ke email, berlaku 10 menit, 3 kali salah lalu hangus, disimpan hash.
      // Better Auth tetap menjawab sukses untuk email yang tidak terdaftar (tidak membocorkan akun).
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 3,
        storeOTP: 'hashed',
        // Tidak ditunggu agar waktu respons tidak membedakan email terdaftar dan tidak.
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== 'forget-password') return;
          void outboxDb
            .transaction((tx) =>
              enqueue(tx, QUEUES.emailSend, {
                to: email,
                subject: 'Kode reset kata sandi Edusync',
                text:
                  `Kode untuk mengatur ulang kata sandi Anda: ${otp}\n\n` +
                  'Berlaku 10 menit dan hanya bisa dipakai sekali. Jangan bagikan kode ini kepada siapa pun.\n' +
                  'Bila Anda tidak memintanya, abaikan email ini; kata sandi Anda tidak berubah.',
              }),
            )
            .catch(() => {});
        },
      }),
    ],
    database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      // Setelah kata sandi diganti, semua sesi lama (mis. milik pihak yang membobolnya) ikut keluar.
      revokeSessionsOnPasswordReset: true,
    },
    advanced: {
      useSecureCookies: env.NODE_ENV === 'production',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
    },
  });
}

/** Seperti originMatcherFor, ditambah domain sendiri sekolah yang sudah terverifikasi. */
export const dynamicOriginCheckerFor = (env: Env, hosts: HostResolver) =>
  createDynamicOriginChecker(originMatcherFor(env), hosts, schemeOf(env));

export type Auth = ReturnType<typeof createAuth>;
