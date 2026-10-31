import { BILLING_SETTINGS_KEY, billingSettingsSchema, DEFAULT_BILLING_SETTINGS } from '@edusync/contracts';
import { auditLog, invalidateBillingSettings, loadBillingSettings, platformSetting, sql } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { errorSchema } from '../http-error';
import { requireStaff } from '../identity/guards';

const tag = ['Platform'];
const viewSchema = billingSettingsSchema.extend({
  defaults: billingSettingsSchema.describe('Nilai bawaan bila belum diatur'),
});

/** Parameter penagihan (masa tenggang, pengingat perpanjangan, masa pesanan, pengali tahunan). Hanya staf platform. */
export async function platformBillingSettingsRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  const view = async () => {
    invalidateBillingSettings();
    return { ...(await loadBillingSettings(app.platformDb)), defaults: { ...DEFAULT_BILLING_SETTINGS } };
  };

  app.get(
    '/v1/platform/billing-settings',
    {
      onRequest: [requireStaff('read_only')],
      schema: {
        tags: tag,
        summary: 'Parameter penagihan (global)',
        description:
          'Staf platform (baca). Bawaan: masa tenggang 7 hari, invoice perpanjangan 7 hari sebelum periode habis, ' +
          'pesanan pendaftaran berlaku 24 jam, bayar tahunan = 10 bulan. Worker dan pendaftaran membaca nilai ini ' +
          'dengan cache singkat (beberapa detik).',
        response: { 200: viewSchema, 401: errorSchema, 403: errorSchema },
      },
    },
    async () => view(),
  );

  app.put(
    '/v1/platform/billing-settings',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Ubah parameter penagihan (global)',
        description:
          'Staf platform (admin). Berlaku untuk siklus penagihan dan pendaftaran berikutnya; invoice yang sudah ' +
          'dibuat tidak berubah. Pengali tahunan juga memengaruhi harga perpanjangan tahunan berikutnya. Nilai di ' +
          'luar rentang ditolak: 400 `validation_error`.',
        body: billingSettingsSchema,
        response: { 200: viewSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema },
      },
    },
    async (request) => {
      const staffId = request.userId as string;
      const before = await loadBillingSettings(app.platformDb);
      const value = request.body as unknown as Record<string, unknown>;
      await app.platformDb
        .insert(platformSetting)
        .values({ key: BILLING_SETTINGS_KEY, value, updatedBy: staffId })
        .onConflictDoUpdate({
          target: platformSetting.key,
          set: { value, updatedBy: staffId, updatedAt: sql`now()` },
        });
      await app.platformDb.insert(auditLog).values({
        actorId: staffId,
        action: 'billing.platform_settings',
        entityType: 'platform_setting',
        entityId: BILLING_SETTINGS_KEY,
        details: { before, after: request.body },
      });
      return view();
    },
  );
}
