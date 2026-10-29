import { ownedFoundations } from '@edusync/billing';
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
      tier: z.string(),
      modules: z.array(z.string()),
    }),
  ),
  invoices: z.array(
    z.object({
      id: z.uuid(),
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

export async function accountRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/v1/account',
    {
      onRequest: [requireUser],
      schema: {
        tags: ['Account'],
        summary: 'Langganan dan tagihan yayasan milik pengguna',
        description:
          'Untuk pemilik yayasan: status langganan, unit beserta modulnya, dan tagihan terbaru. ' +
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
            ? { ...f.subscription, currentPeriodEnd: f.subscription.currentPeriodEnd.toISOString() }
            : null,
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
}
