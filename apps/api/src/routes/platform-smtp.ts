import { resolveSmtpConfig, type SmtpConfig, saveSmtpSettings, smtpSettingsView } from '@edusync/billing';
import { auditLog } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import type { Env } from '../env';
import { errorSchema, HttpError } from '../http-error';
import { requireStaff } from '../identity/guards';

const tag = ['Platform'];

const viewSchema = z.object({
  host: z.string(),
  port: z.number().int(),
  secure: z.boolean(),
  user: z.string(),
  hasPassword: z.boolean(),
  from: z.string(),
  source: z.enum(['database', 'environment']),
});

const bodySchema = z.object({
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  secure: z
    .boolean()
    .describe('TLS langsung (biasanya port 465); port lain memakai STARTTLS bila ditawarkan'),
  user: z.string().trim().max(200).optional(),
  password: z.string().max(500).optional().describe('Kosong = pertahankan kata sandi tersimpan'),
  clearAuth: z.boolean().optional().describe('Hapus nama pengguna dan kata sandi (server tanpa login)'),
  from: z.string().trim().min(3).max(200).describe('Pengirim, misalnya `Edusync <noreply@contoh.com>`'),
});

/** Pengaturan SMTP dari konsol platform. Kata sandi tersimpan terenkripsi dan tidak pernah dikembalikan. */
export async function platformSmtpRoutes(instance: FastifyInstance, options: { env: Env }) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { env } = options;

  // Dasar bila belum diatur di konsol: bawaan Mailpit lokal.
  const base: SmtpConfig = {
    host: 'localhost',
    port: 1025,
    secure: false,
    from: 'Edusync <noreply@edusync.test>',
  };
  const view = () => smtpSettingsView(app.platformDb, base);

  app.get(
    '/v1/platform/smtp-settings',
    {
      onRequest: [requireStaff('read_only')],
      schema: {
        tags: tag,
        summary: 'Pengaturan SMTP (email keluar)',
        description:
          'Staf platform. Dipakai worker untuk mengirim kode OTP, undangan, dan pemberitahuan. Kata sandi tidak pernah ' +
          'dikembalikan. `source` = `environment` berarti belum pernah diatur di konsol (memakai Mailpit lokal).',
        response: { 200: viewSchema, 401: errorSchema, 403: errorSchema },
      },
    },
    async () => view(),
  );

  app.put(
    '/v1/platform/smtp-settings',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Ubah pengaturan SMTP',
        description:
          'Staf platform (admin). Berlaku untuk email berikutnya tanpa restart worker (jeda sekitar 15 detik). ' +
          'Nama pengguna wajib disertai kata sandi: 400 `smtp_password_required`.',
        body: bodySchema,
        response: { 200: viewSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema },
      },
    },
    async (request) => {
      const staffId = request.userId as string;
      await saveSmtpSettings(app.platformDb, env.AUTH_SECRET, staffId, request.body);
      await app.platformDb.insert(auditLog).values({
        actorId: staffId,
        action: 'smtp.settings.update',
        entityType: 'platform_setting',
        entityId: 'smtp',
        // Kata sandi tidak dicatat.
        details: {
          host: request.body.host,
          port: request.body.port,
          secure: request.body.secure,
          passwordChanged: Boolean(request.body.password?.trim()),
        },
      });
      return view();
    },
  );

  app.post(
    '/v1/platform/smtp-settings/test',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Kirim email uji dengan pengaturan SMTP tersimpan',
        description:
          'Staf platform (admin). Mengirim langsung (tanpa antrean) supaya galat sambungan terlihat: 400 `smtp_test_failed` ' +
          'dengan pesan dari server SMTP. Simpan pengaturan dulu, lalu uji.',
        body: z.object({ to: z.string().trim().email() }),
        response: {
          200: z.object({ ok: z.literal(true) }),
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (request) => {
      const config = await resolveSmtpConfig(app.platformDb, env.AUTH_SECRET, base);
      const transport = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 12000,
        ...(config.user ? { auth: { user: config.user, pass: config.password ?? '' } } : {}),
      });
      try {
        await transport.sendMail({
          from: config.from,
          to: request.body.to,
          subject: 'Uji email Edusync',
          text: 'Email ini dikirim dari konsol platform Edusync untuk menguji pengaturan SMTP. Tidak perlu dibalas.',
        });
      } catch (error) {
        throw new HttpError(
          400,
          'smtp_test_failed',
          error instanceof Error ? error.message : 'Gagal mengirim',
        );
      } finally {
        transport.close();
      }
      return { ok: true as const };
    },
  );
}
