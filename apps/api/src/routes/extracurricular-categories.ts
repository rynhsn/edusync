import {
  and,
  asc,
  count,
  eq,
  extracurricular,
  extracurricularCategory,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Extracurricular'];

/** Ikon yang boleh dipilih (dipetakan ke ikon lucide di web) dan nada warna dari kit tampilan. */
export const CATEGORY_ICONS = [
  'trophy',
  'palette',
  'book',
  'flask',
  'tent',
  'sparkles',
  'music',
  'laptop',
  'globe',
  'heart',
] as const;
export const CATEGORY_TONES = ['teal', 'sky', 'violet', 'amber', 'rose', 'emerald', 'slate'] as const;

/** Kategori bawaan untuk sekolah yang belum punya satu pun baris. */
export const DEFAULT_CATEGORIES = [
  { key: 'sport', label: 'Olahraga', icon: 'trophy', tone: 'emerald', sort: 1 },
  { key: 'art', label: 'Seni', icon: 'palette', tone: 'rose', sort: 2 },
  { key: 'religion', label: 'Keagamaan', icon: 'book', tone: 'teal', sort: 3 },
  { key: 'science', label: 'Sains', icon: 'flask', tone: 'sky', sort: 4 },
  { key: 'scout', label: 'Pramuka', icon: 'tent', tone: 'amber', sort: 5 },
  { key: 'other', label: 'Lainnya', icon: 'sparkles', tone: 'slate', sort: 6 },
] as const;

/** Mengisi kategori bawaan bila sekolah belum punya baris sama sekali (aman dijalankan bersamaan). */
export async function ensureDefaultCategories(tx: Tx, schoolId: string) {
  const [n] = await tx.select({ n: count() }).from(extracurricularCategory);
  if ((n?.n ?? 0) > 0) return;
  await tx
    .insert(extracurricularCategory)
    .values(DEFAULT_CATEGORIES.map((c) => ({ schoolId, ...c })))
    .onConflictDoNothing();
}

/** Pastikan kategori ada dan aktif di sekolah ini; selain itu 400 `invalid_reference`. */
export async function assertCategoryUsable(tx: Tx, schoolId: string, key: string) {
  await ensureDefaultCategories(tx, schoolId);
  const [row] = await tx
    .select({ active: extracurricularCategory.active })
    .from(extracurricularCategory)
    .where(eq(extracurricularCategory.key, key));
  if (!row || !row.active) {
    throw new HttpError(
      400,
      'invalid_reference',
      'Kategori ekstrakurikuler tidak ditemukan atau tidak aktif.',
    );
  }
}

const categorySchema = z.object({
  id: z.uuid(),
  key: z.string(),
  label: z.string(),
  icon: z.enum(CATEGORY_ICONS),
  tone: z.enum(CATEGORY_TONES),
  sort: z.number().int(),
  active: z.boolean(),
  usedBy: z.number().int().describe('Jumlah ekstrakurikuler yang memakai kategori ini'),
});

const keyField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_-]{0,31}$/, 'Kunci: huruf kecil, angka, - atau _ (maks. 32 karakter)');

const categoryBody = z.object({
  label: z.string().trim().min(1).max(50),
  icon: z.enum(CATEGORY_ICONS).default('trophy'),
  tone: z.enum(CATEGORY_TONES).default('teal'),
  sort: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

const readGate = [requirePermission('extracurricular:read'), requireModule('extracurricular')];
const manageGate = [requirePermission('extracurricular:manage'), requireModule('extracurricular')];

/** Kategori ekstrakurikuler yang dikelola sekolah (ikon dan nada warna). Modul `extracurricular`. */
export async function extracurricularCategoryRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  async function views(tx: Tx, onlyId?: string) {
    const rows = await tx
      .select()
      .from(extracurricularCategory)
      .where(onlyId ? eq(extracurricularCategory.id, onlyId) : undefined)
      .orderBy(asc(extracurricularCategory.sort), asc(extracurricularCategory.label));
    const used = await tx
      .select({ key: extracurricular.category, n: count() })
      .from(extracurricular)
      .groupBy(extracurricular.category);
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      label: r.label,
      icon: r.icon as (typeof CATEGORY_ICONS)[number],
      tone: r.tone as (typeof CATEGORY_TONES)[number],
      sort: r.sort,
      active: r.active,
      usedBy: used.find((u) => u.key === r.key)?.n ?? 0,
    }));
  }

  async function loadOrThrow(tx: Tx, id: string) {
    const [row] = await tx.select().from(extracurricularCategory).where(eq(extracurricularCategory.id, id));
    if (!row) throw new HttpError(404, 'not_found', 'Kategori tidak ditemukan.');
    return row;
  }

  app.get(
    '/v1/extracurricular-categories',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Daftar kategori ekstrakurikuler',
        description:
          'Izin: `extracurricular:read`; modul `extracurricular`. Urut menurut `sort`. Sekolah yang belum punya ' +
          'kategori diisi kategori bawaan (olahraga, seni, keagamaan, sains, pramuka, lainnya) saat pertama dibuka. ' +
          '`usedBy` = jumlah ekskul yang memakai kategori itu.',
        headers: schoolHeader,
        response: { 200: z.array(categorySchema), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        await ensureDefaultCategories(tx, (request.ctx as TenantContext).schoolId);
        return views(tx);
      }),
  );

  app.post(
    '/v1/extracurricular-categories',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Tambah kategori ekstrakurikuler',
        description:
          'Izin: `extracurricular:manage`; modul `extracurricular`. `key` unik di sekolah (409 `conflict`) dan tidak ' +
          'bisa diubah sesudahnya. `icon` dari daftar tetap, `tone` dari nada kit tampilan.',
        headers: schoolHeader,
        body: categoryBody.extend({ key: keyField }),
        response: { 201: categorySchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await conflictAs409('Kunci kategori itu sudah ada.', () =>
        tenant(request, async (tx) => {
          await ensureDefaultCategories(tx, ctx.schoolId);
          const [row] = await tx
            .insert(extracurricularCategory)
            .values({ schoolId: ctx.schoolId, ...request.body })
            .returning({ id: extracurricularCategory.id });
          await audit(tx, ctx, 'extracurricular_category.create', 'extracurricular_category', row!.id, {
            key: request.body.key,
          });
          return (await views(tx, row!.id))[0]!;
        }),
      );
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/extracurricular-categories/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Ubah kategori ekstrakurikuler',
        description:
          'Izin: `extracurricular:manage`; modul `extracurricular`. Mengganti nama, ikon, nada, urutan, dan status ' +
          'aktif. `key` tidak bisa diubah. Kategori nonaktif tidak bisa dipilih untuk ekskul baru.',
        headers: schoolHeader,
        params: idParams,
        body: categoryBody,
        response: { 200: categorySchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const row = await loadOrThrow(tx, request.params.id);
        await tx
          .update(extracurricularCategory)
          .set(request.body)
          .where(and(eq(extracurricularCategory.id, row.id)));
        await audit(tx, ctx, 'extracurricular_category.update', 'extracurricular_category', row.id, {
          key: row.key,
          active: request.body.active,
        });
        return (await views(tx, row.id))[0]!;
      });
    },
  );

  app.delete(
    '/v1/extracurricular-categories/:id',
    {
      onRequest: manageGate,
      schema: {
        tags: tag,
        summary: 'Hapus kategori ekstrakurikuler',
        description:
          'Izin: `extracurricular:manage`; modul `extracurricular`. Ditolak 409 `in_use` bila masih dipakai ' +
          'ekstrakurikuler; nonaktifkan lewat ubah.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const row = await loadOrThrow(tx, request.params.id);
        const [used] = await tx
          .select({ n: count() })
          .from(extracurricular)
          .where(eq(extracurricular.category, row.key));
        if ((used?.n ?? 0) > 0) {
          throw new HttpError(409, 'in_use', 'Kategori ini masih dipakai ekstrakurikuler; nonaktifkan saja.');
        }
        await tx.delete(extracurricularCategory).where(eq(extracurricularCategory.id, row.id));
        await audit(tx, ctx, 'extracurricular_category.delete', 'extracurricular_category', row.id, {
          key: row.key,
        });
        return { ok: true as const };
      });
    },
  );
}
