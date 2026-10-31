import { and, count, eq, finPayment, finPaymentMethod, inArray, type Tx, withTenant } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { listPaymentMethods } from '../finance-lib';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Finance'];
const MODULE = 'finance';

const readGate = [requirePermission('finance:read'), requireModule(MODULE)];
const manageGate = [requirePermission('finance:manage'), requireModule(MODULE)];

const methodSchema = z.object({
  id: z.uuid(),
  key: z.string().describe('Kunci unik per sekolah (slug dari label saat dibuat; tidak berubah)'),
  label: z.string(),
  active: z.boolean().describe('Hanya metode aktif yang bisa dipakai kasir'),
  sort: z.number().int(),
  paymentCount: z.number().int().describe('Jumlah kwitansi yang memakai metode ini'),
});

const label = z.string().trim().min(1).max(40);

/** Slug kunci dari label: huruf kecil tanpa diakritik, a-z0-9 dan tanda hubung, maksimum 40 karakter. */
export function methodKeyFromLabel(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36)
    .replace(/-+$/g, '');
  return slug || 'metode';
}

/** Metode pembayaran yang dikelola sekolah. Modul `finance`. */
export async function financePaymentMethodRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  async function views(tx: Tx, schoolId: string) {
    const rows = await listPaymentMethods(tx, schoolId);
    const counts = await tx
      .select({ method: finPayment.method, n: count() })
      .from(finPayment)
      .groupBy(finPayment.method);
    const used = new Map(counts.map((c) => [c.method, c.n]));
    return rows.map((r) => ({ ...r, paymentCount: used.get(r.key) ?? 0 }));
  }

  app.get(
    '/v1/finance/payment-methods',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar metode pembayaran',
        description:
          'Izin: `finance:read`; modul `finance`. Semua metode sekolah (aktif dan nonaktif) urut `sort`, beserta jumlah ' +
          'kwitansi yang memakainya. Sekolah yang belum punya metode otomatis diisi Tunai, Transfer, dan Lainnya. Kasir ' +
          'hanya menampilkan yang `active`; riwayat lama tetap memakai label dari daftar ini.',
        headers: schoolHeader,
        response: { 200: z.object({ items: z.array(methodSchema) }), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => ({ items: await views(tx, (request.ctx as TenantContext).schoolId) })),
  );

  app.post(
    '/v1/finance/payment-methods',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Tambah metode pembayaran',
        description:
          'Izin: `finance:manage`; modul `finance`. `key` dibuat otomatis dari `label` (slug; diberi akhiran -2, -3, ... ' +
          'bila bentrok) dan tidak berubah setelahnya. Metode baru ditaruh di urutan terakhir dan aktif.',
        headers: schoolHeader,
        body: z.object({ label, active: z.boolean().default(true) }),
        response: { 201: methodSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      const created = await conflictAs409('Metode pembayaran itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const existing = await listPaymentMethods(tx, ctx.schoolId);
          if (existing.some((m) => m.label.toLowerCase() === b.label.toLowerCase())) {
            throw new HttpError(409, 'conflict', 'Metode pembayaran itu sudah ada.');
          }
          const taken = new Set(existing.map((m) => m.key));
          const base = methodKeyFromLabel(b.label);
          let key = base;
          for (let i = 2; taken.has(key); i++) key = `${base.slice(0, 36)}-${i}`;
          const sort = existing.reduce((a, m) => Math.max(a, m.sort), -1) + 1;
          const [row] = await tx
            .insert(finPaymentMethod)
            .values({ schoolId: ctx.schoolId, key, label: b.label, active: b.active, sort })
            .returning({ id: finPaymentMethod.id });
          await audit(tx, ctx, 'finance.payment_method_create', 'fin_payment_method', row!.id, {
            key,
            label: b.label,
          });
          return (await views(tx, ctx.schoolId)).find((v) => v.id === row!.id)!;
        }),
      );
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/finance/payment-methods/order',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Atur urutan metode pembayaran',
        description:
          'Izin: `finance:manage`; modul `finance`. `ids` harus memuat SEMUA metode sekolah tepat satu kali, sesuai urutan ' +
          'baru. Galat: 400 `invalid_reference` bila daftar tidak lengkap atau memuat id asing.',
        headers: schoolHeader,
        body: z.object({ ids: z.array(z.uuid()).min(1).max(100) }),
        response: { 200: z.object({ items: z.array(methodSchema) }), 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { ids } = request.body;
      return tenant(request, async (tx) => {
        const existing = await listPaymentMethods(tx, ctx.schoolId);
        const have = new Set(existing.map((m) => m.id));
        if (new Set(ids).size !== ids.length || ids.length !== have.size || ids.some((i) => !have.has(i))) {
          throw new HttpError(
            400,
            'invalid_reference',
            'Daftar urutan harus memuat semua metode tepat sekali.',
          );
        }
        for (const [index, id] of ids.entries()) {
          await tx.update(finPaymentMethod).set({ sort: index }).where(eq(finPaymentMethod.id, id));
        }
        await audit(tx, ctx, 'finance.payment_method_reorder', 'fin_payment_method', ctx.schoolId, { ids });
        return { items: await views(tx, ctx.schoolId) };
      });
    },
  );

  app.patch(
    '/v1/finance/payment-methods/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah metode pembayaran',
        description:
          'Izin: `finance:manage`; modul `finance`. Ubah `label` dan/atau `active`. `key` tetap. Galat: 404 `not_found`, ' +
          '409 `conflict` (label kembar), 409 `last_active` (tidak boleh menonaktifkan metode aktif terakhir).',
        headers: schoolHeader,
        params: idParams,
        body: z
          .object({ label: label.optional(), active: z.boolean().optional() })
          .refine((v) => v.label !== undefined || v.active !== undefined, {
            message: 'Tidak ada yang diubah.',
          }),
        response: { 200: methodSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return conflictAs409('Metode pembayaran itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const all = await listPaymentMethods(tx, ctx.schoolId);
          const current = all.find((m) => m.id === request.params.id);
          if (!current) throw new HttpError(404, 'not_found', 'Metode pembayaran tidak ditemukan.');
          if (
            b.label !== undefined &&
            all.some((m) => m.id !== current.id && m.label.toLowerCase() === b.label!.toLowerCase())
          ) {
            throw new HttpError(409, 'conflict', 'Metode pembayaran itu sudah ada.');
          }
          if (b.active === false && current.active && all.filter((m) => m.active).length === 1) {
            throw new HttpError(409, 'last_active', 'Minimal satu metode pembayaran harus tetap aktif.');
          }
          await tx
            .update(finPaymentMethod)
            .set({
              ...(b.label !== undefined ? { label: b.label } : {}),
              ...(b.active !== undefined ? { active: b.active } : {}),
            })
            .where(and(eq(finPaymentMethod.id, current.id)));
          await audit(tx, ctx, 'finance.payment_method_update', 'fin_payment_method', current.id, {
            key: current.key,
            ...b,
          });
          return (await views(tx, ctx.schoolId)).find((v) => v.id === current.id)!;
        }),
      );
    },
  );

  app.delete(
    '/v1/finance/payment-methods/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus metode pembayaran',
        description:
          'Izin: `finance:manage`; modul `finance`. Ditolak 409 `in_use` bila sudah dipakai kwitansi (nonaktifkan saja), ' +
          '409 `last_active` bila ini satu-satunya metode aktif; 404 `not_found` bila tak ada.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const all = await views(tx, ctx.schoolId);
        const current = all.find((m) => m.id === request.params.id);
        if (!current) throw new HttpError(404, 'not_found', 'Metode pembayaran tidak ditemukan.');
        if (current.paymentCount > 0) {
          throw new HttpError(
            409,
            'in_use',
            'Metode ini sudah dipakai kwitansi; nonaktifkan saja agar riwayat tetap terbaca.',
          );
        }
        if (current.active && all.filter((m) => m.active).length === 1) {
          throw new HttpError(409, 'last_active', 'Minimal satu metode pembayaran harus tetap aktif.');
        }
        await tx.delete(finPaymentMethod).where(inArray(finPaymentMethod.id, [current.id]));
        await audit(tx, ctx, 'finance.payment_method_delete', 'fin_payment_method', current.id, {
          key: current.key,
          label: current.label,
        });
        return { ok: true as const };
      });
    },
  );
}
