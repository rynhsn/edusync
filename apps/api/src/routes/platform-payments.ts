import { paymentSettingsView, savePaymentSettings } from '@edusync/billing';
import { auditLog } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Env } from '../env';
import { errorSchema } from '../http-error';
import { requireStaff } from '../identity/guards';
import { paymentConfig } from '../payment-config';

const viewSchema = z.object({
  provider: z.enum(['dev', 'midtrans']),
  mode: z.enum(['sandbox', 'production']),
  hasServerKey: z.boolean(),
  serverKeyHint: z.string().nullable(),
  source: z.enum(['database', 'environment']),
  webhookUrl: z.string().describe('Alamat yang didaftarkan di dasbor penyedia sebagai notification URL'),
  devAllowed: z.boolean().describe('Penyedia simulasi hanya boleh di luar produksi'),
});
const tag = ['Platform'];

/** Pengaturan penyedia pembayaran dari konsol platform. Kunci server tersimpan terenkripsi dan tidak pernah dikembalikan. */
export async function platformPaymentRoutes(instance: FastifyInstance, options: { env: Env }) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { env } = options;

  const view = async () => {
    const base = await paymentSettingsView(app.platformDb, env.AUTH_SECRET, paymentConfig(env));
    const current = await app.payments.get();
    return {
      ...base,
      webhookUrl: `${env.WEB_URL.replace(/\/$/, '')}/v1/webhooks/payments/${current.name}`,
      devAllowed: env.NODE_ENV !== 'production',
    };
  };

  app.get(
    '/v1/platform/payment-settings',
    {
      onRequest: [requireStaff('read_only')],
      schema: {
        tags: tag,
        summary: 'Pengaturan penyedia pembayaran',
        description:
          'Staf platform. Kunci server tidak pernah dikembalikan, hanya empat karakter terakhirnya. `source` menunjukkan ' +
          'apakah pengaturan berasal dari database atau dari variabel lingkungan (bila belum pernah diatur di konsol).',
        response: { 200: viewSchema, 401: errorSchema, 403: errorSchema },
      },
    },
    async () => view(),
  );

  app.put(
    '/v1/platform/payment-settings',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Ubah pengaturan penyedia pembayaran',
        description:
          'Staf platform (admin). Berlaku untuk pendaftaran dan tagihan berikutnya, tanpa restart. `serverKey` kosong ' +
          'berarti mempertahankan kunci yang tersimpan. Midtrans wajib punya kunci; penyedia simulasi dilarang di produksi.',
        body: z.object({
          provider: z.enum(['dev', 'midtrans']),
          mode: z.enum(['sandbox', 'production']),
          serverKey: z.string().trim().max(200).optional(),
        }),
        response: { 200: viewSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema },
      },
    },
    async (request) => {
      const staffId = request.userId as string;
      await savePaymentSettings(app.platformDb, env.AUTH_SECRET, staffId, request.body, {
        production: env.NODE_ENV === 'production',
      });
      app.payments.invalidate();
      await app.platformDb.insert(auditLog).values({
        actorId: staffId,
        action: 'payment.settings.update',
        entityType: 'platform_setting',
        entityId: 'payment',
        // Kunci tidak dicatat; hanya fakta bahwa kunci diganti.
        details: {
          provider: request.body.provider,
          mode: request.body.mode,
          serverKeyChanged: Boolean(request.body.serverKey?.trim()),
        },
      });
      return view();
    },
  );
}
