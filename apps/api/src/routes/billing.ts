import { randomUUID } from 'node:crypto';
import {
  createRegistration,
  getRegistration,
  handlePaymentEvent,
  InvalidWebhookError,
  latestRegistration,
  signDevEvent,
  slugStatus,
} from '@edusync/billing';
import {
  BILLING_PERIODS,
  educationProfileSchema,
  registrationInput,
  requirementMap,
  slugSchema,
} from '@edusync/contracts';
import {
  asc,
  eq,
  invoice,
  loadBillingSettings,
  loadCatalog,
  planPreset,
  refEducationProfile,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Env } from '../env';
import { errorSchema, HttpError } from '../http-error';
import { requireUser } from '../identity/guards';

const invoiceSchema = z.object({
  id: z.uuid(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.enum(['open', 'paid', 'expired', 'void']),
  paymentUrl: z.string().nullable(),
  lines: z.array(z.object({ key: z.string(), name: z.string(), amount: z.number().int() })),
});

const outcomeSchema = z.object({
  outcome: z.enum([
    'activated',
    'renewed',
    'upgraded',
    'duplicate',
    'unknown_invoice',
    'recorded',
    'failed',
    'amount_mismatch',
    'needs_review',
  ]),
});

export async function billingRoutes(instance: FastifyInstance, options: { env: Env }) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { env } = options;

  /**
   * Cadangan webhook: bila pendaftaran masih menunggu, tanya penyedia langsung (dibatasi sekali per 4 detik per
   * pesanan). Galat jaringan atau transaksi yang belum ada diabaikan; tanda tangan tetap diverifikasi.
   */
  const lastChecked = new Map<string, number>();
  async function reconcile(registrationId: string, userId: string) {
    const { reg, invoice: inv } = await getRegistration(app.platformDb, registrationId, userId);
    if (reg.status !== 'pending_payment' || !inv?.providerRef) return;
    const provider = await app.payments.get();
    if (!provider.fetchStatus) return;
    if (Date.now() - (lastChecked.get(inv.providerRef) ?? 0) < 4000) return;
    lastChecked.set(inv.providerRef, Date.now());
    try {
      const body = await provider.fetchStatus(inv.providerRef);
      if (!body || typeof body !== 'object') return;
      const event = provider.parseWebhook(body);
      await handlePaymentEvent(app.platformDb, provider.name, event, body as Record<string, unknown>, {
        webUrl: env.WEB_URL,
      });
    } catch (error) {
      app.log.warn({ err: error }, 'rekonsiliasi pembayaran gagal');
    }
  }

  app.get(
    '/v1/education-profiles',
    {
      schema: {
        tags: ['Billing'],
        summary: 'Daftar profil jenjang',
        description:
          'Publik. Jenjang yang bisa dipilih saat mendaftarkan unit sekolah (satu unit satu jenjang), beserta tingkat ' +
          'dan fase bawaannya. Kunci dikirim sebagai `educationProfile` pada pendaftaran dan unit baru.',
        response: { 200: z.array(educationProfileSchema) },
      },
    },
    async () => {
      const rows = await app.platformDb
        .select()
        .from(refEducationProfile)
        .where(eq(refEducationProfile.active, true))
        .orderBy(asc(refEducationProfile.sort));
      return rows.map((r) => ({
        key: r.key,
        name: r.name,
        levelGroup: r.levelGroup,
        authority: r.authority,
        teacherModel: r.teacherModel,
        vocational: r.vocational,
        levels: r.levels,
      }));
    },
  );

  app.get(
    '/v1/catalog',
    {
      schema: {
        tags: ['Billing'],
        summary: 'Katalog modul dan harga',
        description:
          'Publik. Harga per unit per bulan dalam Rupiah. Bayar tahunan dihitung sebanyak `yearlyMonths` bulan.',
        response: {
          200: z.object({
            currency: z.literal('IDR'),
            yearlyMonths: z.number(),
            requires: z.record(z.string(), z.array(z.string())),
            plans: z.array(
              z.object({
                key: z.string(),
                name: z.string(),
                description: z.string(),
                modules: z.array(z.string()),
                tier: z.string(),
              }),
            ),
            items: z.array(
              z.object({
                kind: z.enum(['base', 'module', 'tier']),
                key: z.string(),
                name: z.string(),
                priceMonthly: z.number().int(),
                requires: z.array(z.string()),
                maxStudents: z.number().int().nullable(),
              }),
            ),
          }),
        },
      },
    },
    async () => {
      const catalog = await loadCatalog(app.platformDb);
      return {
        currency: 'IDR' as const,
        yearlyMonths: (await loadBillingSettings(app.platformDb)).yearlyMonths,
        requires: requirementMap(catalog),
        plans: (
          await app.platformDb
            .select()
            .from(planPreset)
            .where(eq(planPreset.active, true))
            .orderBy(asc(planPreset.sort))
        ).map(({ key, name, description, modules, tier }) => ({ key, name, description, modules, tier })),
        items: catalog.map(({ kind, key, name, priceMonthly, requires, maxStudents }) => ({
          kind,
          key,
          name,
          priceMonthly,
          requires: [...(requires ?? [])],
          maxStudents: maxStudents ?? null,
        })),
      };
    },
  );

  app.get(
    '/v1/slugs/:slug/availability',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['Billing'],
        summary: 'Cek ketersediaan subdomain',
        params: z.object({ slug: z.string().max(80) }),
        response: { 200: z.object({ status: z.enum(['available', 'taken', 'invalid']) }) },
      },
    },
    async (request) => {
      if (!slugSchema.safeParse(request.params.slug).success) return { status: 'invalid' as const };
      return { status: await slugStatus(app.platformDb, request.params.slug) };
    },
  );

  app.post(
    '/v1/registrations',
    {
      onRequest: [requireUser],
      schema: {
        tags: ['Billing'],
        summary: 'Daftarkan yayasan dan unit, lalu buat invoice',
        description:
          'Harga dihitung ulang di server dari katalog; harga dari klien tidak dipakai. Subdomain dipesan 24 jam. ' +
          'Pendaftaran tertunda milik pengguna yang sama digantikan oleh yang baru. Setelah pembayaran terkonfirmasi, ' +
          'yayasan dan unit dibuat otomatis. Tiap unit wajib membawa NPSN 8 angka. Galat: invalid_npsn (format), ' +
          'npsn_duplicate (NPSN sama dua kali dalam satu pendaftaran), npsn_taken (sudah dipakai sekolah atau ' +
          'pendaftaran lain yang menunggu pembayaran), slug_taken, invalid_selection.',
        body: registrationInput,
        response: {
          201: z.object({
            registrationId: z.uuid(),
            invoiceId: z.uuid(),
            amount: z.number().int(),
            currency: z.literal('IDR'),
            paymentUrl: z.string(),
            expiresAt: z.iso.datetime(),
          }),
          400: errorSchema,
          401: errorSchema,
          409: errorSchema,
          502: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const account = request.authUser as { id: string; name: string; email: string };
      const result = await createRegistration(
        app.platformDb,
        await app.payments.get(),
        account,
        request.body,
      );
      return reply.code(201).send({
        registrationId: result.registrationId,
        invoiceId: result.invoiceId,
        amount: result.amount,
        currency: 'IDR' as const,
        paymentUrl: result.paymentUrl,
        expiresAt: result.expiresAt.toISOString(),
      });
    },
  );

  app.get(
    '/v1/registrations/latest',
    {
      onRequest: [requireUser],
      schema: {
        tags: ['Billing'],
        summary: 'Pendaftaran terbaru milik saya',
        description:
          'Dipakai agar pendaftar yang belum membayar bisa melanjutkan pembayaran setelah halaman bayar tertutup. ' +
          '404 bila pengguna belum pernah mendaftar.',
        response: {
          200: z.object({
            id: z.uuid(),
            status: z.enum(['pending_payment', 'paid', 'expired']),
            foundationName: z.string(),
            expiresAt: z.iso.datetime(),
            paymentUrl: z.string().nullable(),
          }),
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request) => {
      const first = await latestRegistration(app.platformDb, request.userId as string);
      await reconcile(first.reg.id, request.userId as string);
      const { reg, invoice: inv } = await latestRegistration(app.platformDb, request.userId as string);
      return {
        id: reg.id,
        status: reg.status,
        foundationName: reg.foundationName,
        expiresAt: reg.expiresAt.toISOString(),
        paymentUrl: inv?.paymentUrl ?? null,
      };
    },
  );

  app.get(
    '/v1/registrations/:id',
    {
      onRequest: [requireUser],
      schema: {
        tags: ['Billing'],
        summary: 'Status pendaftaran',
        description:
          'Hanya pemilik pendaftaran. Dipakai untuk memeriksa apakah pembayaran sudah mengaktifkan sekolah.',
        params: z.object({ id: z.uuid() }),
        response: {
          200: z.object({
            id: z.uuid(),
            status: z.enum(['pending_payment', 'paid', 'expired']),
            foundationName: z.string(),
            period: z.enum(BILLING_PERIODS),
            expiresAt: z.iso.datetime(),
            invoice: invoiceSchema.nullable(),
            schools: z.array(
              z.object({ id: z.uuid(), slug: z.string(), name: z.string(), npsn: z.string().nullable() }),
            ),
            units: z
              .array(z.object({ name: z.string(), slug: z.string(), npsn: z.string().nullable() }))
              .describe('Unit yang didaftarkan, lengkap dengan NPSN-nya (null pada pendaftaran lama).'),
          }),
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request) => {
      await reconcile(request.params.id, request.userId as string);
      const {
        reg,
        invoice: inv,
        schools,
      } = await getRegistration(app.platformDb, request.params.id, request.userId as string);
      return {
        id: reg.id,
        status: reg.status,
        foundationName: reg.foundationName,
        period: reg.period,
        expiresAt: reg.expiresAt.toISOString(),
        invoice: inv
          ? {
              id: inv.id,
              amount: inv.amount,
              currency: inv.currency,
              status: inv.status,
              paymentUrl: inv.paymentUrl,
              lines: inv.lines,
            }
          : null,
        schools,
        units: reg.units.map((u) => ({ name: u.name, slug: u.slug, npsn: u.npsn ?? null })),
      };
    },
  );

  app.post(
    '/v1/webhooks/payments/:provider',
    {
      schema: {
        tags: ['Billing'],
        summary: 'Webhook dari penyedia pembayaran',
        description:
          'Dipanggil oleh penyedia pembayaran. Tanda tangan diverifikasi; kabar yang sama boleh dikirim berulang kali ' +
          'tanpa efek ganda.',
        params: z.object({ provider: z.string() }),
        body: z.record(z.string(), z.unknown()),
        response: { 200: outcomeSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request) => {
      const provider = await app.payments.get();
      if (request.params.provider !== provider.name) {
        throw new HttpError(404, 'not_found', 'Penyedia tidak dikenal.');
      }
      let event: ReturnType<typeof provider.parseWebhook>;
      try {
        event = provider.parseWebhook(request.body);
      } catch (error) {
        if (error instanceof InvalidWebhookError) {
          throw new HttpError(401, 'invalid_signature', 'Tanda tangan webhook tidak valid.');
        }
        throw error;
      }
      const outcome = await handlePaymentEvent(app.platformDb, provider.name, event, request.body, {
        webUrl: env.WEB_URL,
      });
      return { outcome };
    },
  );

  // Hanya penyedia dev di luar produksi: mensimulasikan pembayaran lewat jalur webhook yang sama.
  if (env.NODE_ENV !== 'production') {
    app.post(
      '/v1/dev/payments/:orderId/simulate',
      {
        schema: {
          tags: ['Billing'],
          summary: 'Simulasikan pembayaran berhasil (hanya development)',
          params: z.object({ orderId: z.string() }),
          response: { 200: outcomeSchema, 404: errorSchema },
        },
      },
      async (request) => {
        const provider = await app.payments.get();
        if (provider.name !== 'dev')
          throw new HttpError(404, 'not_found', 'Simulasi hanya untuk penyedia dev.');
        const [inv] = await app.platformDb
          .select()
          .from(invoice)
          .where(eq(invoice.providerRef, request.params.orderId));
        if (!inv) throw new HttpError(404, 'not_found', 'Invoice tidak ditemukan.');
        const event = {
          eventId: `sim-${randomUUID()}`,
          orderId: inv.providerRef,
          status: 'paid' as const,
          amount: inv.amount,
        };
        const body = { ...event, signature: signDevEvent(env.PAYMENT_DEV_SECRET, event) };
        const parsed = provider.parseWebhook(body);
        return {
          outcome: await handlePaymentEvent(app.platformDb, 'dev', parsed, body, { webUrl: env.WEB_URL }),
        };
      },
    );
  }
}
