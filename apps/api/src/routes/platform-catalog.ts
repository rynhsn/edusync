import { and, asc, auditLog, catalogItem, eq, planPreset, type Tx } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireStaff } from '../identity/guards';

const KINDS = ['module', 'tier'] as const;
const keySchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z][a-z0-9_]*$/, 'Huruf kecil, angka, dan garis bawah; diawali huruf.');

const itemSchema = z.object({
  kind: z.enum(['base', 'module', 'tier']),
  key: z.string(),
  name: z.string(),
  priceMonthly: z.number().int(),
  sort: z.number().int(),
  active: z.boolean(),
});
const itemBody = z.object({
  name: z.string().trim().min(1).max(80),
  priceMonthly: z.number().int().min(0).max(100_000_000),
  sort: z.number().int().min(0).max(1000),
});
const planSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  modules: z.array(z.string()),
  tier: z.string(),
  sort: z.number().int(),
  active: z.boolean(),
});
const planBody = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(200).default(''),
  modules: z.array(z.string().min(1).max(40)).max(40),
  tier: z.string().min(1).max(40),
  sort: z.number().int().min(0).max(1000),
});
const ok = z.object({ ok: z.literal(true) });
const tag = ['Platform'];
const guarded = { 401: errorSchema, 403: errorSchema };

/** Paket hanya boleh berisi modul dan tingkat yang ada di katalog. */
async function assertPlanContent(tx: Tx, modules: string[], tier: string) {
  const items = await tx.select().from(catalogItem);
  const known = (kind: string) => new Set(items.filter((i) => i.kind === kind).map((i) => i.key));
  const unknown = modules.filter((m) => !known('module').has(m));
  if (unknown.length > 0)
    throw new HttpError(400, 'invalid_selection', `Modul tidak ada di katalog: ${unknown.join(', ')}.`);
  if (!known('tier').has(tier))
    throw new HttpError(400, 'invalid_selection', 'Tingkat siswa tidak ada di katalog.');
}

/** Pengaturan katalog: harga modul, tingkat siswa, dan paket siap pakai. Hanya staf platform. */
export async function platformCatalogRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const db = () => app.platformDb;

  app.get(
    '/v1/platform/catalog',
    {
      onRequest: [requireStaff('read_only')],
      schema: {
        tags: tag,
        summary: 'Katalog lengkap: modul, tingkat siswa, dan paket',
        description:
          'Staf platform. Termasuk item nonaktif. Item nonaktif tidak tampil di pendaftaran baru, tetapi sekolah yang ' +
          'sudah berlangganan tetap ditagih dengan harganya.',
        response: {
          200: z.object({ items: z.array(itemSchema), plans: z.array(planSchema) }),
          ...guarded,
        },
      },
    },
    async () => ({
      items: await db().select().from(catalogItem).orderBy(asc(catalogItem.sort)),
      plans: await db().select().from(planPreset).orderBy(asc(planPreset.sort)),
    }),
  );

  app.post(
    '/v1/platform/catalog/items',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Tambah modul atau tingkat siswa',
        description:
          'Staf platform (admin). Kunci modul baru baru berguna bila fiturnya ada di kode; di katalog ia hanya menjadi ' +
          'pilihan yang bisa dibeli.',
        body: itemBody.extend({ kind: z.enum(KINDS), key: keySchema }),
        response: { 201: itemSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const staffId = request.userId as string;
      const created = await db().transaction(async (tx) => {
        const [row] = await tx.insert(catalogItem).values(request.body).onConflictDoNothing().returning();
        if (!row) throw new HttpError(409, 'conflict', 'Kunci itu sudah ada di katalog.');
        await tx.insert(auditLog).values({
          actorId: staffId,
          action: 'catalog.item.create',
          entityType: 'catalog_item',
          entityId: `${row.kind}:${row.key}`,
          details: request.body,
        });
        return row;
      });
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/platform/catalog/items/:kind/:key',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Ubah harga, nama, urutan, atau status sebuah item katalog',
        description:
          'Staf platform (admin). Harga baru berlaku untuk pendaftaran dan tagihan perpanjangan berikutnya; invoice yang ' +
          'sudah dibuat tidak berubah. Modul inti (`base`) tidak boleh dinonaktifkan.',
        params: z.object({ kind: z.enum(['base', 'module', 'tier']), key: z.string() }),
        body: itemBody.extend({ active: z.boolean() }),
        response: { 200: itemSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const { kind, key } = request.params;
      if (kind === 'base' && !request.body.active) {
        throw new HttpError(409, 'conflict', 'Modul inti tidak dapat dinonaktifkan.');
      }
      const staffId = request.userId as string;
      return db().transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(catalogItem)
          .where(and(eq(catalogItem.kind, kind), eq(catalogItem.key, key)));
        if (!before) throw new HttpError(404, 'not_found', 'Item katalog tidak ditemukan.');
        const [row] = await tx
          .update(catalogItem)
          .set(request.body)
          .where(and(eq(catalogItem.kind, kind), eq(catalogItem.key, key)))
          .returning();
        await tx.insert(auditLog).values({
          actorId: staffId,
          action: 'catalog.item.update',
          entityType: 'catalog_item',
          entityId: `${kind}:${key}`,
          details: {
            before: { name: before.name, priceMonthly: before.priceMonthly, active: before.active },
            after: request.body,
          },
        });
        return row!;
      });
    },
  );

  app.post(
    '/v1/platform/catalog/plans',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Buat paket',
        description:
          'Staf platform (admin). Paket adalah pilihan cepat di halaman daftar; harganya tetap dihitung dari katalog.',
        body: planBody.extend({ key: keySchema }),
        response: { 201: planSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const staffId = request.userId as string;
      const created = await db().transaction(async (tx) => {
        await assertPlanContent(tx, request.body.modules, request.body.tier);
        const [row] = await tx.insert(planPreset).values(request.body).onConflictDoNothing().returning();
        if (!row) throw new HttpError(409, 'conflict', 'Kunci paket itu sudah ada.');
        await tx.insert(auditLog).values({
          actorId: staffId,
          action: 'catalog.plan.create',
          entityType: 'plan_preset',
          entityId: row.key,
          details: request.body,
        });
        return row;
      });
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/platform/catalog/plans/:key',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Ubah paket',
        description: 'Staf platform (admin). Paket nonaktif tidak tampil di halaman daftar.',
        params: z.object({ key: z.string() }),
        body: planBody.extend({ active: z.boolean() }),
        response: { 200: planSchema, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const staffId = request.userId as string;
      return db().transaction(async (tx) => {
        await assertPlanContent(tx, request.body.modules, request.body.tier);
        const [row] = await tx
          .update(planPreset)
          .set(request.body)
          .where(eq(planPreset.key, request.params.key))
          .returning();
        if (!row) throw new HttpError(404, 'not_found', 'Paket tidak ditemukan.');
        await tx.insert(auditLog).values({
          actorId: staffId,
          action: 'catalog.plan.update',
          entityType: 'plan_preset',
          entityId: row.key,
          details: request.body,
        });
        return row;
      });
    },
  );

  app.delete(
    '/v1/platform/catalog/plans/:key',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Hapus paket',
        description:
          'Staf platform (admin). Paket hanya pilihan cepat, jadi menghapusnya tidak mengubah langganan siapa pun.',
        params: z.object({ key: z.string() }),
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const staffId = request.userId as string;
      await db().transaction(async (tx) => {
        const rows = await tx
          .delete(planPreset)
          .where(eq(planPreset.key, request.params.key))
          .returning({ key: planPreset.key });
        if (rows.length === 0) throw new HttpError(404, 'not_found', 'Paket tidak ditemukan.');
        await tx.insert(auditLog).values({
          actorId: staffId,
          action: 'catalog.plan.delete',
          entityType: 'plan_preset',
          entityId: request.params.key,
          details: {},
        });
      });
      return { ok: true as const };
    },
  );
}
