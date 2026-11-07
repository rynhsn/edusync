import { account, type Db, session, user, verification } from '@edusync/db';
import { enqueue, QUEUES } from '@edusync/jobs';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { oneTimeToken } from 'better-auth/plugins/one-time-token';
import { resolveLoginEmail } from './account-lookup';
import type { Env } from './env';
import { createDynamicOriginChecker, createOriginMatcher, type HostResolver } from './origins';
import { normalizePhone } from './routes/guardians';

/** Foto profil disimpan sebagai gambar kecil (sudah dikecilkan di peramban) langsung di baris pengguna. */
const PHOTO_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const PHOTO_MAX_CHARS = 120_000;

/** Email pengganti saat isian masuk tidak cocok dengan akun mana pun: Better Auth tetap menghitung hash lalu menolak. */
const NO_ACCOUNT_EMAIL = 'tidak-ada@identitas.invalid';

/** Jalur OTP bawaan Better Auth untuk lupa kata sandi dinonaktifkan; pemulihan memakai /v1/auth/recovery/*. */
const RETIRED_RESET_PATHS = new Set([
  '/email-otp/request-password-reset',
  '/forget-password/email-otp',
  '/email-otp/reset-password',
]);
const OTP_PATHS_WITH_TYPE = new Set([
  '/email-otp/send-verification-otp',
  '/email-otp/check-verification-otp',
]);

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
          const mail =
            type === 'forget-password'
              ? {
                  subject: 'Kode reset kata sandi Edusync',
                  text:
                    `Kode untuk mengatur ulang kata sandi Anda: ${otp}\n\n` +
                    'Berlaku 10 menit dan hanya bisa dipakai sekali. Jangan bagikan kode ini kepada siapa pun.\n' +
                    'Bila Anda tidak memintanya, abaikan email ini; kata sandi Anda tidak berubah.',
                }
              : type === 'change-email'
                ? {
                    subject: 'Kode konfirmasi email baru Edusync',
                    text:
                      `Kode untuk mengonfirmasi email baru akun Edusync Anda: ${otp}\n\n` +
                      'Berlaku 10 menit dan hanya bisa dipakai sekali. Jangan bagikan kode ini kepada siapa pun.\n' +
                      'Bila Anda tidak memintanya, abaikan email ini; email akun tidak berubah.',
                  }
                : null;
          if (!mail) return;
          void outboxDb
            .transaction((tx) => enqueue(tx, QUEUES.emailSend, { to: email, ...mail }))
            .catch(() => {});
        },
        // Ganti email: kode dikirim ke ALAMAT BARU, jadi hanya pemilik alamat itu yang bisa memakainya.
        changeEmail: { enabled: true },
      }),
    ],
    database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
    user: { additionalFields: { phone: { type: 'string', required: false, input: true } } },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        // Masuk dengan email atau NIK: NIK dikembalikan ke email akun di sini, di server, sehingga
        // email tidak pernah dikirim ke klien. Yang tidak cocok (atau NIK dipakai beberapa akun) diberi email
        // pengganti: Better Auth tetap menghitung hash dan menolak dengan jawaban yang sama seperti kata sandi salah.
        if (ctx.path === '/sign-in/email') {
          const given = typeof body.email === 'string' ? body.email.trim() : '';
          if (given.includes('@')) return { context: { body: { ...body, email: given } } };
          const email = given ? await resolveLoginEmail(outboxDb, given) : null;
          return { context: { body: { ...body, email: email ?? NO_ACCOUNT_EMAIL } } };
        }
        if (
          RETIRED_RESET_PATHS.has(ctx.path ?? '') ||
          (OTP_PATHS_WITH_TYPE.has(ctx.path ?? '') && body.type === 'forget-password')
        ) {
          throw APIError.from('NOT_FOUND', {
            code: 'RESET_PATH_RETIRED',
            message: 'Gunakan /v1/auth/recovery untuk memulihkan kata sandi.',
          });
        }
      }),
    },
    databaseHooks: {
      user: {
        update: {
          before: async (data) => {
            const next: Record<string, unknown> = { ...data };
            if (typeof next.name === 'string') {
              const name = next.name.trim().replace(/\s+/g, ' ');
              if (name.length < 2 || name.length > 120) {
                throw APIError.from('BAD_REQUEST', {
                  code: 'INVALID_NAME',
                  message: 'Nama harus 2 sampai 120 huruf.',
                });
              }
              next.name = name;
            }
            if ('phone' in next) {
              const phone = normalizePhone(typeof next.phone === 'string' ? next.phone : '');
              if (phone === undefined) {
                throw APIError.from('BAD_REQUEST', {
                  code: 'INVALID_PHONE',
                  message: 'Nomor telepon tidak valid.',
                });
              }
              next.phone = phone;
            }
            if (typeof next.image === 'string' && next.image !== '') {
              if (!PHOTO_PATTERN.test(next.image) || next.image.length > PHOTO_MAX_CHARS) {
                throw APIError.from('BAD_REQUEST', {
                  code: 'INVALID_IMAGE',
                  message: 'Foto harus gambar JPG, PNG, atau WebP yang kecil.',
                });
              }
            }
            if (next.image === '') next.image = null;
            return { data: next };
          },
        },
      },
    },
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
