import {
  admissionDocumentType,
  and,
  applicationDocument,
  asc,
  count,
  eq,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const tags = ['Admissions'];
const read = [requirePermission('admission:read'), requireModule('admissions')];
const manage = [requirePermission('admission:manage'), requireModule('admissions')];

/** Batas jenis dokumen per sekolah (sejalan dengan batas dokumen per pendaftaran). */
export const MAX_DOCUMENT_TYPES = 8;

/** Jenis dokumen bawaan untuk sekolah yang belum punya satu pun baris. */
export const DEFAULT_DOCUMENT_TYPES = [
  { key: 'kk', label: 'Kartu Keluarga', required: true, sort: 1 },
  { key: 'birth_certificate', label: 'Akta kelahiran', required: true, sort: 2 },
  { key: 'previous_certificate', label: 'Ijazah / SKL', required: false, sort: 3 },
  { key: 'photo', label: 'Pas foto', required: true, sort: 4 },
  { key: 'other', label: 'Lainnya', required: false, sort: 5 },
] as const;

/** Mengisi jenis dokumen bawaan bila sekolah belum punya baris sama sekali (aman dijalankan bersamaan). */
export async function ensureDefaultDocumentTypes(tx: Tx, schoolId: string) {
  const [n] = await tx.select({ n: count() }).from(admissionDocumentType);
  if ((n?.n ?? 0) > 0) return;
  await tx
    .insert(admissionDocumentType)
    .values(DEFAULT_DOCUMENT_TYPES.map((d) => ({ schoolId, ...d })))
    .onConflictDoNothing();
}

/** Jenis dokumen aktif sekolah ini, urut menurut `sort` (mengisi bawaan bila kosong). */
export async function activeDocumentTypes(tx: Tx, schoolId: string) {
  await ensureDefaultDocumentTypes(tx, schoolId);
  return tx
    .select({
      key: admissionDocumentType.key,
      label: admissionDocumentType.label,
      required: admissionDocumentType.required,
    })
    .from(admissionDocumentType)
    .where(eq(admissionDocumentType.active, true))
    .orderBy(asc(admissionDocumentType.sort), asc(admissionDocumentType.label));
}

const typeSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  label: z.string(),
  required: z.boolean(),
  active: z.boolean(),
  sort: z.number().int(),
  usedBy: z.number().int().describe('Jumlah dokumen pendaftar yang memakai jenis ini'),
});

const keyField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_-]{0,31}$/, 'Kunci: huruf kecil, angka, - atau _ (maks. 32 karakter)');

const typeBody = z.object({
  label: z.string().trim().min(1).max(60),
  required: z.boolean().default(false),
  active: z.boolean().default(true),
  sort: z.number().int().min(0).max(9999).default(0),
});

/** Jenis dokumen yang diminta saat pendaftaran SPMB, dikelola tiap sekolah. Modul `admissions`. */
export async function admissionDocumentTypeRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  async function views(tx: Tx, onlyId?: string) {
    const rows = await tx
      .select()
      .from(admissionDocumentType)
      .where(onlyId ? eq(admissionDocumentType.id, onlyId) : undefined)
      .orderBy(asc(admissionDocumentType.sort), asc(admissionDocumentType.label));
    const used = await tx
      .select({ key: applicationDocument.kind, n: count() })
      .from(applicationDocument)
      .groupBy(applicationDocument.kind);
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      label: r.label,
      required: r.required,
      active: r.active,
      sort: r.sort,
      usedBy: used.find((u) => u.key === r.key)?.n ?? 0,
    }));
  }

  async function loadOrThrow(tx: Tx, id: string) {
    const [row] = await tx.select().from(admissionDocumentType).where(eq(admissionDocumentType.id, id));
    if (!row) throw new HttpError(404, 'not_found', 'Jenis dokumen tidak ditemukan.');
    return row;
  }

  app.get(
    '/v1/admissions/document-types',
    {
      onRequest: read,
      schema: {
        tags,
        summary: 'Daftar jenis dokumen pendaftaran',
        description:
          'Izin: `admission:read`; modul `admissions`. Termasuk yang nonaktif, urut menurut `sort`. Sekolah yang ' +
          'belum punya jenis dokumen diisi bawaan (KK, akta kelahiran, ijazah/SKL, pas foto, lainnya) saat pertama ' +
          'dibuka. `usedBy` = jumlah dokumen pendaftar yang memakai jenis itu.',
        headers: schoolHeader,
        response: { 200: z.array(typeSchema), ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        await ensureDefaultDocumentTypes(tx, (request.ctx as TenantContext).schoolId);
        return views(tx);
      }),
  );

  app.post(
    '/v1/admissions/document-types',
    {
      onRequest: manage,
      schema: {
        tags,
        summary: 'Tambah jenis dokumen pendaftaran',
        description:
          'Izin: `admission:manage`; modul `admissions`. `key` unik di sekolah (409 `conflict`) dan tidak bisa ' +
          `diubah sesudahnya. Maksimal ${MAX_DOCUMENT_TYPES} jenis per sekolah (400 \`limit_reached\`). ` +
          '`required` = pendaftar wajib mengunggahnya sebelum mengirim.',
        headers: schoolHeader,
        body: typeBody.extend({ key: keyField }),
        response: { 201: typeSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await conflictAs409('Kunci jenis dokumen itu sudah ada.', () =>
        tenant(request, async (tx) => {
          await ensureDefaultDocumentTypes(tx, ctx.schoolId);
          const [n] = await tx.select({ n: count() }).from(admissionDocumentType);
          if ((n?.n ?? 0) >= MAX_DOCUMENT_TYPES) {
            throw new HttpError(
              400,
              'limit_reached',
              `Maksimal ${MAX_DOCUMENT_TYPES} jenis dokumen per sekolah.`,
            );
          }
          const [row] = await tx
            .insert(admissionDocumentType)
            .values({ schoolId: ctx.schoolId, ...request.body })
            .returning({ id: admissionDocumentType.id });
          await audit(tx, ctx, 'admission.document_type.create', 'admission_document_type', row!.id, {
            key: request.body.key,
            required: request.body.required,
          });
          return (await views(tx, row!.id))[0]!;
        }),
      );
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/admissions/document-types/:id',
    {
      onRequest: manage,
      schema: {
        tags,
        summary: 'Ubah jenis dokumen pendaftaran',
        description:
          'Izin: `admission:manage`; modul `admissions`. Mengganti nama, status wajib, urutan, dan status aktif. ' +
          '`key` tidak bisa diubah. Jenis nonaktif tidak muncul di formulir pendaftaran dan tidak lagi diwajibkan.',
        headers: schoolHeader,
        params: idParams,
        body: typeBody,
        response: { 200: typeSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const row = await loadOrThrow(tx, request.params.id);
        await tx
          .update(admissionDocumentType)
          .set(request.body)
          .where(and(eq(admissionDocumentType.id, row.id)));
        await audit(tx, ctx, 'admission.document_type.update', 'admission_document_type', row.id, {
          key: row.key,
          required: request.body.required,
          active: request.body.active,
        });
        return (await views(tx, row.id))[0]!;
      });
    },
  );

  app.delete(
    '/v1/admissions/document-types/:id',
    {
      onRequest: manage,
      schema: {
        tags,
        summary: 'Hapus jenis dokumen pendaftaran',
        description:
          'Izin: `admission:manage`; modul `admissions`. Ditolak 409 `in_use` bila sudah ada dokumen pendaftar ' +
          'dengan jenis itu; nonaktifkan lewat ubah.',
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
          .from(applicationDocument)
          .where(eq(applicationDocument.kind, row.key));
        if ((used?.n ?? 0) > 0) {
          throw new HttpError(409, 'in_use', 'Jenis dokumen ini sudah dipakai pendaftar; nonaktifkan saja.');
        }
        await tx.delete(admissionDocumentType).where(eq(admissionDocumentType.id, row.id));
        await audit(tx, ctx, 'admission.document_type.delete', 'admission_document_type', row.id, {
          key: row.key,
        });
        return { ok: true as const };
      });
    },
  );
}
