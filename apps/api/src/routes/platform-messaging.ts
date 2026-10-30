import {
  auditLog,
  count,
  gte,
  loadPlatformMessaging,
  msgMessage,
  PLATFORM_MESSAGING_KEY,
  platformSetting,
  sql,
  waAccount,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Env } from '../env';
import { errorSchema, HttpError } from '../http-error';
import { requireStaff } from '../identity/guards';

const tag = ['Platform'];

const settingsBody = z.object({
  enabled: z.boolean().describe('Saklar global: mati = tak ada pesan dibuat atau dikirim di semua sekolah'),
  provider: z.enum(['whatsapp', 'log']).describe('`log` hanya mencatat pesan (pengembangan/uji)'),
  maxQueuedPerSchool: z.number().int().min(1).max(100_000).describe('Batas pesan antre per sekolah'),
});

const viewSchema = settingsBody.extend({
  messages24h: z.object({
    queued: z.number().int(),
    sent: z.number().int(),
    failed: z.number().int(),
    skipped: z.number().int(),
  }),
  accounts: z.object({
    ready: z.number().int(),
    qr: z.number().int(),
    connecting: z.number().int(),
    failed: z.number().int(),
    disconnected: z.number().int(),
  }),
});

/** Pengaturan global notifikasi WhatsApp dari konsol platform, beserta statistik 24 jam. */
export async function platformMessagingRoutes(instance: FastifyInstance, options: { env: Env }) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { env } = options;

  const view = async () => {
    const db = app.platformDb;
    const settings = await loadPlatformMessaging(db);
    const since = new Date(Date.now() - 24 * 3_600_000);
    const msgs = await db
      .select({ status: msgMessage.status, n: count() })
      .from(msgMessage)
      .where(gte(msgMessage.createdAt, since))
      .groupBy(msgMessage.status);
    const accs = await db
      .select({ status: waAccount.status, n: count() })
      .from(waAccount)
      .groupBy(waAccount.status);
    const m = (...s: string[]) => msgs.filter((r) => s.includes(r.status)).reduce((a, r) => a + r.n, 0);
    const a = (s: string) => accs.find((r) => r.status === s)?.n ?? 0;
    return {
      ...settings,
      messages24h: {
        queued: m('queued', 'sending'),
        sent: m('sent'),
        failed: m('failed'),
        skipped: m('skipped'),
      },
      accounts: {
        ready: a('ready'),
        qr: a('qr'),
        connecting: a('connecting'),
        failed: a('failed'),
        disconnected: a('disconnected'),
      },
    };
  };

  app.get(
    '/v1/platform/messaging',
    {
      onRequest: [requireStaff('read_only')],
      schema: {
        tags: tag,
        summary: 'Pengaturan notifikasi WhatsApp (global)',
        description:
          'Staf platform (baca). Bawaan: menyala, penyedia `whatsapp` di produksi dan `log` di tempat lain, batas ' +
          '500 pesan antre per sekolah. Variabel lingkungan `MESSAGING_PROVIDER` pada worker menimpa `provider`. ' +
          'Statistik: pesan dibuat dalam 24 jam terakhir (status `sending` dihitung `queued`) dan jumlah sambungan ' +
          'per status.',
        response: { 200: viewSchema, 401: errorSchema, 403: errorSchema },
      },
    },
    async () => view(),
  );

  app.put(
    '/v1/platform/messaging',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Ubah pengaturan notifikasi WhatsApp (global)',
        description:
          'Staf platform (admin). Berlaku untuk pesan berikutnya tanpa restart. Penyedia `log` dilarang di ' +
          'produksi: 400 `invalid_provider`.',
        body: settingsBody,
        response: { 200: viewSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema },
      },
    },
    async (request) => {
      const staffId = request.userId as string;
      if (env.NODE_ENV === 'production' && request.body.provider === 'log') {
        throw new HttpError(400, 'invalid_provider', 'Penyedia log tidak boleh dipakai di produksi.');
      }
      const value = request.body as unknown as Record<string, unknown>;
      await app.platformDb
        .insert(platformSetting)
        .values({ key: PLATFORM_MESSAGING_KEY, value, updatedBy: staffId })
        .onConflictDoUpdate({
          target: platformSetting.key,
          set: { value, updatedBy: staffId, updatedAt: sql`now()` },
        });
      await app.platformDb.insert(auditLog).values({
        actorId: staffId,
        action: 'messaging.platform_settings',
        entityType: 'platform_setting',
        entityId: PLATFORM_MESSAGING_KEY,
        details: request.body,
      });
      return view();
    },
  );
}
