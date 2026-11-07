import {
  classifyIdentifier,
  isValidUsername,
  normalizeUsername,
  OTP_LENGTH,
  OTP_RESEND_SECONDS,
} from '@edusync/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { resolveUser, usernameTaken } from '../account-lookup';
import type { Env } from '../env';
import { errorSchema, HttpError } from '../http-error';
import { requireUser } from '../identity/guards';
import { channelsFor, checkOtp, issueOtp, setPasswordAndRevoke } from '../recovery-lib';
import { Throttle } from '../throttle';

const tag = ['Identity'];
const HOUR = 3_600_000;

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(254)
  .describe('Email, nama pengguna, atau NIK 16 digit. NIK yang dipakai beberapa akun tidak bisa dipakai.');
const channel = z.enum(['email', 'whatsapp']);
const code = z.string().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`));

const NEUTRAL = 'Jika data ditemukan, pilihan pengiriman akan tampil.';

/**
 * Pemulihan kata sandi dengan pilihan saluran (email atau WhatsApp) dan pemeriksaan nama pengguna.
 * Semua jawaban untuk isian yang tidak dikenal sama dengan yang ambigu, supaya tidak ada akun yang bisa dipastikan
 * ada selain lewat petunjuk saluran yang memang ditampilkan kepada pemilik isian yang benar (kompromi yang disetujui).
 */
export async function recoveryRoutes(instance: FastifyInstance, options: { env: Env }) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { env } = options;

  const tooMany = (retryAfter: number, message = 'Terlalu banyak percobaan. Coba lagi nanti.') =>
    new HttpError(429, 'rate_limited', `${message} (${retryAfter} detik)`);

  /** Batas per IP dan (bila ada) per isian, dihitung per jenis tindakan. Melempar 429 bila terlampaui. */
  function limit(
    request: FastifyRequest,
    kind: string,
    ipMax: number,
    windowMs: number,
    given?: { value: string; max: number },
  ) {
    const wait = Math.max(
      app.throttle.hit(Throttle.key(`${kind}-ip`, request.ip), ipMax, windowMs),
      given
        ? app.throttle.hit(
            Throttle.key(`${kind}-id`, classifyIdentifier(given.value).value.toLowerCase()),
            given.max,
            windowMs,
          )
        : 0,
    );
    if (wait > 0) throw tooMany(wait);
  }

  app.post(
    '/v1/auth/recovery/lookup',
    {
      schema: {
        tags: tag,
        summary: 'Cari akun untuk pemulihan kata sandi dan tampilkan pilihan saluran',
        description:
          'Publik. Isian (email, nama pengguna, atau NIK) dicocokkan ke TEPAT SATU akun. Bila cocok, jawabannya memuat ' +
          'saluran yang tersedia: `email` (alamat disamarkan, mis. ri***@gmail.com) dan `whatsapp` (petunjuk nomor, ' +
          'mis. 6281****789; hanya bila akun punya nomor dan penyedia pesan platform aktif). Bila tidak cocok atau ' +
          'ambigu (NIK dipakai beberapa akun), jawabannya sama bentuknya dengan `channels` kosong. Batas: 10 per jam ' +
          'per IP dan 5 per jam per isian (429 `rate_limited`). Menampilkan petunjuk saluran berarti akun itu ada; ' +
          'ini kompromi yang disetujui.',
        body: z.object({ identifier }),
        response: {
          200: z.object({
            channels: z.array(z.object({ channel, hint: z.string() })),
            message: z.string(),
          }),
          400: errorSchema,
          429: errorSchema,
        },
      },
    },
    async (request) => {
      const { identifier: given } = request.body;
      limit(request, 'lookup', app.authLimits.lookupIpPerHour, HOUR, {
        value: given,
        max: app.authLimits.lookupIdentifierPerHour,
      });
      const found = await resolveUser(request.server.platformDb, given);
      if (!found) return { channels: [], message: NEUTRAL };
      const { options: channels } = await channelsFor(request.server.platformDb, env, found);
      return { channels, message: NEUTRAL };
    },
  );

  app.post(
    '/v1/auth/recovery/send',
    {
      schema: {
        tags: tag,
        summary: 'Kirim kode pemulihan 6 digit lewat saluran pilihan',
        description:
          'Publik. Mengirim kode 6 digit (berlaku 10 menit, disimpan sebagai hash, satu kode aktif per akun dan ' +
          'saluran, maksimum 5 kali salah) lewat `email` atau `whatsapp`. Jawabannya selalu `sent: true` bila isian ' +
          'tidak cocok atau salurannya tidak tersedia (tidak ada yang dikirim). Pengiriman ulang ke saluran yang sama ' +
          'ditolak 429 `cooldown` selama 60 detik. Batas: 10 per jam per IP dan 5 per jam per isian (429 ' +
          '`rate_limited`). Penyedia pesan `log` hanya mencatat kode di log/outbox worker (pengembangan).',
        body: z.object({ identifier, channel }),
        response: {
          200: z.object({ sent: z.literal(true), resendInSeconds: z.number().int() }),
          400: errorSchema,
          429: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { identifier: given, channel: via } = request.body;
      limit(request, 'send', app.authLimits.sendIpPerHour, HOUR, {
        value: given,
        max: app.authLimits.sendIdentifierPerHour,
      });
      const ok = { sent: true as const, resendInSeconds: OTP_RESEND_SECONDS };
      const db = request.server.platformDb;
      const found = await resolveUser(db, given);
      if (!found) return ok;
      const { options: available, phone } = await channelsFor(db, env, found);
      if (!available.some((o) => o.channel === via)) return ok;
      const result = await issueOtp(
        db,
        env.AUTH_SECRET,
        { userId: found.id, email: found.email, phone },
        via,
      );
      if (!result.sent) {
        return reply
          .code(429)
          .header('retry-after', String(result.retryAfter))
          .send({
            error: {
              code: 'cooldown',
              message: `Kode baru bisa diminta lagi dalam ${result.retryAfter} detik.`,
            },
          } as never);
      }
      return ok;
    },
  );

  app.post(
    '/v1/auth/recovery/verify',
    {
      schema: {
        tags: tag,
        summary: 'Periksa kode pemulihan tanpa menghabiskannya',
        description:
          'Publik. Kode benar menjawab `valid: true` dan tetap bisa dipakai di langkah reset. Kode salah, ' +
          'kedaluwarsa, hangus (5 kali salah), atau isian tak dikenal semuanya dijawab 400 `invalid_code`. Setiap ' +
          'pemeriksaan dihitung sebagai satu percobaan sampai kodenya terbukti benar. Batas: 30 per jam per IP.',
        body: z.object({ identifier, channel, code }),
        response: { 200: z.object({ valid: z.literal(true) }), 400: errorSchema, 429: errorSchema },
      },
    },
    async (request) => {
      limit(request, 'check', app.authLimits.checkIpPerHour, HOUR);
      const { identifier: given, channel: via, code: otp } = request.body;
      const db = request.server.platformDb;
      const found = await resolveUser(db, given);
      const ok = found ? await checkOtp(db, env.AUTH_SECRET, found.id, via, otp, false) : false;
      if (!ok) throw new HttpError(400, 'invalid_code', 'Kode salah atau sudah kedaluwarsa.');
      return { valid: true as const };
    },
  );

  app.post(
    '/v1/auth/recovery/reset',
    {
      schema: {
        tags: tag,
        summary: 'Atur kata sandi baru dengan kode pemulihan',
        description:
          'Publik. Kode benar dihabiskan (sekali pakai), kata sandi (12-128 karakter) diganti, dan SEMUA sesi akun ' +
          'itu dikeluarkan. Kode salah, kedaluwarsa, hangus, atau isian tak dikenal dijawab 400 `invalid_code`. ' +
          'Batas: 30 per jam per IP.',
        body: z.object({ identifier, channel, code, password: z.string().min(12).max(128) }),
        response: { 200: z.object({ ok: z.literal(true) }), 400: errorSchema, 429: errorSchema },
      },
    },
    async (request) => {
      limit(request, 'check', app.authLimits.checkIpPerHour, HOUR);
      const { identifier: given, channel: via, code: otp, password } = request.body;
      const db = request.server.platformDb;
      const found = await resolveUser(db, given);
      const ok = found ? await checkOtp(db, env.AUTH_SECRET, found.id, via, otp, true) : false;
      if (!found || !ok) throw new HttpError(400, 'invalid_code', 'Kode salah atau sudah kedaluwarsa.');
      await setPasswordAndRevoke(request.server.auth, db, found.id, password);
      return { ok: true as const };
    },
  );

  app.get(
    '/v1/account/username-check',
    {
      onRequest: [requireUser],
      schema: {
        tags: tag,
        summary: 'Cek ketersediaan nama pengguna',
        description:
          'Untuk pengguna yang sudah masuk. `valid` false bila bentuknya tidak sah (3-30 karakter huruf kecil, angka, ' +
          'titik, garis bawah, strip; bukan 16 digit). `available` false bila dipakai akun lain; nama pengguna ' +
          'sendiri dianggap tersedia. Nama disimpan lewat pembaruan profil (`updateUser`).',
        querystring: z.object({ username: z.string().max(60) }),
        response: { 200: z.object({ valid: z.boolean(), available: z.boolean() }), 401: errorSchema },
      },
    },
    async (request) => {
      const username = normalizeUsername(request.query.username);
      if (!isValidUsername(username)) return { valid: false, available: false };
      const taken = await usernameTaken(request.server.platformDb, username, request.userId as string);
      return { valid: true, available: !taken };
    },
  );
}
