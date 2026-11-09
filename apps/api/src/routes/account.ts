import {
  createChange,
  createNewUnit,
  listOwners,
  ownedFoundations,
  previewChange,
  previewNewUnit,
  requestRenewal,
} from '@edusync/billing';
import { slugSchema } from '@edusync/contracts';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema } from '../http-error';
import { requireUser } from '../identity/guards';

const iso = z.iso.datetime();

const foundationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  subscription: z
    .object({
      status: z.enum(['pending_payment', 'active', 'past_due', 'suspended', 'canceled']),
      period: z.enum(['monthly', 'yearly']),
      currentPeriodStart: iso,
      currentPeriodEnd: iso,
    })
    .nullable(),
  schools: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      slug: z.string(),
      status: z.enum(['active', 'suspended']),
      suspendedReason: z.enum(['billing', 'staff']).nullable(),
      suspendedNote: z.string().nullable().describe('Alasan yang ditulis staf platform; null untuk tagihan'),
      suspendedAt: iso.nullable(),
      tier: z.string(),
      modules: z.array(z.string()),
      scheduled: z.object({ removeModules: z.array(z.string()), tier: z.string().nullable() }).nullable(),
    }),
  ),
  invoices: z.array(
    z.object({
      id: z.uuid(),
      kind: z.enum(['registration', 'renewal', 'upgrade', 'new_unit']),
      amount: z.number().int(),
      currency: z.string(),
      status: z.enum(['open', 'paid', 'expired', 'void']),
      paymentUrl: z.string().nullable(),
      dueAt: iso,
      paidAt: iso.nullable(),
      createdAt: iso,
    }),
  ),
});

const changeInput = z.object({
  modules: z.array(z.string().min(1)).max(40),
  tier: z.string().min(1),
});

const newUnitInput = changeInput.extend({
  name: z.string().trim().min(3).max(120),
  slug: slugSchema,
  npsn: z.string().max(40).describe('NPSN 8 angka (wajib). Galat: invalid_npsn, npsn_taken.'),
});

const lineSchema = z.object({ key: z.string(), name: z.string(), amount: z.number().int() });

const changeQuoteSchema = z.object({
  addModules: z.array(z.string()),
  removeModules: z.array(z.string()),
  tier: z.string(),
  currentTier: z.string(),
  tierNow: z.boolean(),
  tierNext: z.boolean(),
  lines: z.array(lineSchema),
  total: z.number().int(),
  fraction: z.number(),
  periodEnd: iso,
});

const unitQuoteSchema = z.object({
  lines: z.array(lineSchema),
  total: z.number().int(),
  fraction: z.number(),
  periodEnd: iso,
  modules: z.array(z.string()),
});

export async function accountRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const who = (request: { authUser?: unknown }) =>
    request.authUser as { id: string; name: string; email: string };

  app.get(
    '/v1/account',
    {
      onRequest: [requireUser],
      schema: {
        tags: ['Account'],
        summary: 'Langganan dan tagihan yayasan milik pengguna',
        description:
          'Untuk pemilik yayasan: status langganan, unit beserta modulnya (dan penurunan yang dijadwalkan), dan tagihan terbaru. ' +
          'Pengguna yang bukan pemilik mendapat daftar kosong. Tautan bayar hanya untuk tagihan yang masih terbuka.',
        response: { 200: z.object({ foundations: z.array(foundationSchema) }), 401: errorSchema },
      },
    },
    async (request) => {
      const rows = await ownedFoundations(request.server.platformDb, request.userId as string);
      return {
        foundations: rows.map((f) => ({
          ...f,
          subscription: f.subscription
            ? {
                ...f.subscription,
                currentPeriodStart: f.subscription.currentPeriodStart.toISOString(),
                currentPeriodEnd: f.subscription.currentPeriodEnd.toISOString(),
              }
            : null,
          schools: f.schools.map((s) => ({ ...s, suspendedAt: s.suspendedAt?.toISOString() ?? null })),
          invoices: f.invoices.map((i) => ({
            ...i,
            dueAt: i.dueAt.toISOString(),
            paidAt: i.paidAt?.toISOString() ?? null,
            createdAt: i.createdAt.toISOString(),
          })),
        })),
      };
    },
  );

  app.post(
    '/v1/account/units/:schoolId/change-quote',
    {
      onRequest: [requireUser],
      schema: {
        tags: ['Account'],
        summary: 'Hitung perubahan paket unit (tanpa menyimpan)',
        description:
          'Pemilik yayasan. Harga dari katalog server; modul syarat otomatis ikut. Penambahan modul dan kenaikan tingkat ' +
          'dihitung prorata untuk sisa periode dan berlaku setelah bayar; pelepasan modul dan penurunan tingkat berlaku ' +
          'di periode berikutnya tanpa biaya. Galat: invalid_selection, no_change, subscription_inactive, not_found.',
        params: z.object({ schoolId: z.uuid() }),
        body: changeInput,
        response: {
          200: changeQuoteSchema,
          400: errorSchema,
          401: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request) => {
      const p = await previewChange(
        request.server.platformDb,
        request.userId as string,
        request.params.schoolId,
        request.body,
      );
      return { ...p, periodEnd: p.periodEnd.toISOString() };
    },
  );

  app.post(
    '/v1/account/units/:schoolId/change',
    {
      onRequest: [requireUser],
      schema: {
        tags: ['Account'],
        summary: 'Tingkatkan paket, tambah modul, atau ubah tingkat siswa unit',
        description:
          'Pemilik yayasan. Membuat invoice "upgrade" bila ada biaya sekarang; setelah pembayaran terkonfirmasi ' +
          '(webhook/dev) hak modul dan tingkat unit diperbarui sekali saja. Penurunan dijadwalkan ke periode berikutnya ' +
          'dan menggantikan jadwal sebelumnya. Galat: invalid_selection, no_change, subscription_inactive, payment_unavailable.',
        params: z.object({ schoolId: z.uuid() }),
        body: changeInput,
        response: {
          201: z.object({
            invoiceId: z.uuid().nullable(),
            amount: z.number().int(),
            paymentUrl: z.string().nullable(),
            appliedNow: z.boolean(),
            scheduled: z.boolean(),
          }),
          400: errorSchema,
          401: errorSchema,
          404: errorSchema,
          409: errorSchema,
          502: errorSchema,
        },
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await createChange(
            request.server.platformDb,
            await request.server.payments.get(),
            who(request),
            request.params.schoolId,
            request.body,
          ),
        ),
  );

  app.post(
    '/v1/account/foundations/:foundationId/units/quote',
    {
      onRequest: [requireUser],
      schema: {
        tags: ['Account'],
        summary: 'Hitung biaya unit sekolah baru (tanpa menyimpan)',
        description:
          'Pemilik yayasan. Biaya penuh paket dikali sisa periode langganan yayasan (prorata). ' +
          'Galat: invalid_selection, subscription_inactive, not_found.',
        params: z.object({ foundationId: z.uuid() }),
        body: newUnitInput,
        response: {
          200: unitQuoteSchema,
          400: errorSchema,
          401: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request) => {
      const q = await previewNewUnit(
        request.server.platformDb,
        request.userId as string,
        request.params.foundationId,
        request.body,
      );
      return {
        lines: q.lines,
        total: q.total,
        fraction: q.fraction,
        periodEnd: q.sub.currentPeriodEnd.toISOString(),
        modules: q.modules,
      };
    },
  );

  app.post(
    '/v1/account/foundations/:foundationId/units',
    {
      onRequest: [requireUser],
      schema: {
        tags: ['Account'],
        summary: 'Tambah unit sekolah ke yayasan dan buat invoice',
        description:
          'Pemilik yayasan. Subdomain dipesan 24 jam. Setelah pembayaran terkonfirmasi unit dibuat lengkap (peran bawaan, ' +
          'pemilik menjadi admin awal, hak modul tersambung ke langganan yayasan). Status dapat dipantau lewat ' +
          'GET /v1/registrations/{id}. Galat: invalid_selection, slug_taken, subscription_inactive, payment_unavailable.',
        params: z.object({ foundationId: z.uuid() }),
        body: newUnitInput,
        response: {
          201: z.object({
            registrationId: z.uuid(),
            invoiceId: z.uuid(),
            amount: z.number().int(),
            paymentUrl: z.string(),
            expiresAt: iso,
          }),
          400: errorSchema,
          401: errorSchema,
          404: errorSchema,
          409: errorSchema,
          502: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const r = await createNewUnit(
        request.server.platformDb,
        await request.server.payments.get(),
        who(request),
        request.params.foundationId,
        request.body,
      );
      return reply.code(201).send({ ...r, expiresAt: r.expiresAt.toISOString() });
    },
  );

  app.post(
    '/v1/account/foundations/:foundationId/renewal',
    {
      onRequest: [requireUser],
      schema: {
        tags: ['Account'],
        summary: 'Perpanjang langganan yayasan sekarang',
        description:
          'Pemilik yayasan. Mengembalikan tagihan perpanjangan yang sudah terbuka, atau membuatnya bila belum ada. ' +
          'Penurunan paket terjadwal ikut diperhitungkan. Galat: subscription_inactive, payment_unavailable.',
        params: z.object({ foundationId: z.uuid() }),
        response: {
          200: z.object({ invoiceId: z.uuid(), amount: z.number().int(), paymentUrl: z.string() }),
          401: errorSchema,
          404: errorSchema,
          409: errorSchema,
          502: errorSchema,
        },
      },
    },
    async (request) => {
      const inv = await requestRenewal(
        request.server.platformDb,
        await request.server.payments.get(),
        who(request),
        request.params.foundationId,
      );
      return { invoiceId: inv.id, amount: inv.amount, paymentUrl: inv.paymentUrl as string };
    },
  );

  app.get(
    '/v1/account/foundations/:foundationId/owners',
    {
      onRequest: [requireUser],
      schema: {
        tags: ['Account'],
        summary: 'Daftar pemilik yayasan',
        description: 'Hanya untuk sesama pemilik yayasan. Galat: not_found.',
        params: z.object({ foundationId: z.uuid() }),
        response: {
          200: z.object({
            owners: z.array(
              z.object({ userId: z.string(), name: z.string(), email: z.string(), since: iso }),
            ),
          }),
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request) => {
      const rows = await listOwners(
        request.server.platformDb,
        request.userId as string,
        request.params.foundationId,
      );
      return { owners: rows.map((o) => ({ ...o, since: o.since.toISOString() })) };
    },
  );
}
