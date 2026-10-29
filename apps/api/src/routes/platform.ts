import {
  activateComplimentary,
  foundationDetail,
  listAudit,
  listFoundations,
  listPendingRegistrations,
  setSchoolSuspended,
} from '@edusync/billing';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema } from '../http-error';
import { requireStaff } from '../identity/guards';

const iso = z.iso.datetime();
const date = (d: Date) => d.toISOString();

const schoolSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(['active', 'suspended']),
  suspendedReason: z.enum(['billing', 'staff']).nullable(),
});

const foundationSummary = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  createdAt: iso,
  subscription: z
    .object({
      status: z.enum(['pending_payment', 'active', 'past_due', 'suspended', 'canceled']),
      period: z.enum(['monthly', 'yearly']),
      currentPeriodEnd: iso,
    })
    .nullable(),
  openInvoices: z.number().int(),
  schools: z.array(schoolSchema),
});

const reason = z.object({ reason: z.string().trim().min(3).max(500) });
const ok = z.object({ ok: z.literal(true) });
const tag = ['Platform'];
const guarded = { 401: errorSchema, 403: errorSchema };

type Summary = Awaited<ReturnType<typeof listFoundations>>[number];
const serializeSummary = (f: Summary) => ({
  ...f,
  createdAt: date(f.createdAt),
  subscription: f.subscription
    ? { ...f.subscription, currentPeriodEnd: date(f.subscription.currentPeriodEnd) }
    : null,
});

/** Konsol staf EduSync. Semua endpoint di sini hanya untuk staf platform, bukan anggota sekolah. */
export async function platformRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/v1/platform/me',
    {
      onRequest: [requireStaff('read_only')],
      schema: {
        tags: tag,
        summary: 'Peran staf platform pengguna saat ini',
        response: { 200: z.object({ role: z.enum(['admin', 'read_only']) }), ...guarded },
      },
    },
    async (request) => ({ role: request.staffRole as 'admin' | 'read_only' }),
  );

  app.get(
    '/v1/platform/foundations',
    {
      onRequest: [requireStaff('read_only')],
      schema: {
        tags: tag,
        summary: 'Daftar yayasan beserta unit dan status langganan',
        querystring: z.object({
          q: z.string().max(100).optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        }),
        response: { 200: z.array(foundationSummary), ...guarded },
      },
    },
    async (request) => {
      const rows = await listFoundations(app.platformDb, request.query);
      return rows.map(serializeSummary);
    },
  );

  app.get(
    '/v1/platform/foundations/:id',
    {
      onRequest: [requireStaff('read_only')],
      schema: {
        tags: tag,
        summary: 'Detail yayasan: unit, invoice, pembayaran, dan modul aktif',
        params: z.object({ id: z.uuid() }),
        response: {
          200: z.object({
            summary: foundationSummary.optional(),
            invoices: z.array(
              z.object({
                id: z.uuid(),
                amount: z.number().int(),
                status: z.enum(['open', 'paid', 'expired', 'void']),
                provider: z.string(),
                kind: z.enum(['registration', 'renewal']),
                createdAt: iso,
                paidAt: iso.nullable(),
              }),
            ),
            payments: z.array(
              z.object({
                id: z.uuid(),
                invoiceId: z.uuid(),
                provider: z.string(),
                status: z.string(),
                amount: z.number().int(),
                createdAt: iso,
              }),
            ),
            modules: z.array(z.object({ schoolId: z.uuid(), moduleKey: z.string(), validUntil: iso })),
          }),
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const d = await foundationDetail(app.platformDb, request.params.id);
      return {
        summary: d.summary ? serializeSummary(d.summary) : undefined,
        invoices: d.invoices.map((i) => ({
          id: i.id,
          amount: i.amount,
          status: i.status,
          provider: i.provider,
          kind: i.registrationId ? ('registration' as const) : ('renewal' as const),
          createdAt: date(i.createdAt),
          paidAt: i.paidAt ? date(i.paidAt) : null,
        })),
        payments: d.payments.map((p) => ({
          id: p.id,
          invoiceId: p.invoiceId,
          provider: p.provider,
          status: p.status,
          amount: p.amount,
          createdAt: date(p.createdAt),
        })),
        modules: d.modules.map((m) => ({
          schoolId: m.schoolId,
          moduleKey: m.moduleKey,
          validUntil: date(m.validUntil),
        })),
      };
    },
  );

  for (const action of ['suspend', 'reactivate'] as const) {
    app.post(
      `/v1/platform/schools/:id/${action}`,
      {
        onRequest: [requireStaff('admin')],
        schema: {
          tags: tag,
          summary: action === 'suspend' ? 'Tangguhkan sekolah (oleh staf)' : 'Aktifkan kembali sekolah',
          description:
            'Dicatat di audit log beserta alasan. Penangguhan oleh staf tidak dilepas oleh pembayaran perpanjangan.',
          params: z.object({ id: z.uuid() }),
          body: reason,
          response: { 200: ok, 404: errorSchema, ...guarded },
        },
      },
      async (request) => {
        await setSchoolSuspended(
          app.platformDb,
          request.userId as string,
          request.params.id,
          action === 'suspend',
          request.body.reason,
        );
        return { ok: true as const };
      },
    );
  }

  app.get(
    '/v1/platform/registrations/pending',
    {
      onRequest: [requireStaff('read_only')],
      schema: {
        tags: tag,
        summary: 'Pendaftaran yang menunggu pembayaran',
        response: {
          200: z.array(
            z.object({
              id: z.uuid(),
              foundationName: z.string(),
              period: z.enum(['monthly', 'yearly']),
              units: z.number().int(),
              expiresAt: iso,
              createdAt: iso,
            }),
          ),
          ...guarded,
        },
      },
    },
    async () =>
      (await listPendingRegistrations(app.platformDb)).map((r) => ({
        id: r.id,
        foundationName: r.foundationName,
        period: r.period,
        units: r.units.length,
        expiresAt: date(r.expiresAt),
        createdAt: date(r.createdAt),
      })),
  );

  app.post(
    '/v1/platform/registrations/:id/complimentary',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Aktifkan pendaftaran tanpa pembayaran (mis. sekolah pilot)',
        description: 'Dicatat sebagai pembayaran "complimentary" senilai 0 dan di audit log beserta alasan.',
        params: z.object({ id: z.uuid() }),
        body: reason,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      await activateComplimentary(
        app.platformDb,
        request.userId as string,
        request.params.id,
        request.body.reason,
      );
      return { ok: true as const };
    },
  );

  app.get(
    '/v1/platform/audit',
    {
      onRequest: [requireStaff('read_only')],
      schema: {
        tags: tag,
        summary: 'Log audit terbaru lintas sekolah',
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(500).optional() }),
        response: {
          200: z.array(
            z.object({
              id: z.uuid(),
              schoolId: z.uuid().nullable(),
              actorId: z.string().nullable(),
              action: z.string(),
              entityType: z.string(),
              entityId: z.string().nullable(),
              details: z.record(z.string(), z.unknown()),
              createdAt: iso,
            }),
          ),
          ...guarded,
        },
      },
    },
    async (request) =>
      (await listAudit(app.platformDb, request.query)).map((a) => ({ ...a, createdAt: date(a.createdAt) })),
  );
}
