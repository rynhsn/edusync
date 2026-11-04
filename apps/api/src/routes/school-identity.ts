import { eq, school, schoolFile, schoolIdentity, type Tx, withTenant } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, requireTenant, type TenantContext } from '../identity/guards';
import { audit, guarded, ok, schoolHeader } from './helpers';

const MAX_LOGO_BYTES = 512 * 1024;
const LOGO_TYPES = {
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
} as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const identityBody = z.object({
  officialName: optionalText(200),
  street: optionalText(300),
  village: optionalText(100),
  district: optionalText(100),
  city: optionalText(100),
  province: optionalText(100),
  postalCode: optionalText(10),
  phone: optionalText(30),
  fax: optionalText(30),
  email: z
    .union([z.literal(''), z.email().max(254)])
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null)),
  website: z
    .union([z.literal(''), z.url({ protocol: /^https?$/ }).max(300)])
    .nullish()
    .transform((v) => v || null),
});

const identitySchema = z.object({
  name: z.string().describe('Nama unit di sistem (`school.name`)'),
  officialName: z.string().nullable().describe('Nama pada kop; kosong = pakai `name`'),
  logoUrl: z
    .string()
    .nullable()
    .describe('Jalur gambar logo (publik, tidak bisa ditebak), null bila belum ada'),
  street: z.string().nullable(),
  village: z.string().nullable(),
  district: z.string().nullable(),
  city: z.string().nullable(),
  province: z.string().nullable(),
  postalCode: z.string().nullable(),
  phone: z.string().nullable(),
  fax: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
});

type IdentityRow = typeof schoolIdentity.$inferSelect;

export const logoPath = (fileId: string | null | undefined) =>
  fileId ? `/v1/public/school-files/${fileId}` : null;

/** Alamat satu baris dari bagian-bagiannya, mis. "Jl. Merdeka 1, Cibiru, Bandung, Jawa Barat 40615". */
export function composeAddress(i: Partial<IdentityRow> | undefined): string | null {
  if (!i) return null;
  const region = [i.city, [i.province, i.postalCode].filter(Boolean).join(' ')].filter(Boolean);
  const parts = [i.street, i.village, i.district ? `Kec. ${i.district}` : null, ...region].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export async function readIdentity(tx: Tx, schoolId: string) {
  const [sch] = await tx.select({ name: school.name }).from(school).where(eq(school.id, schoolId));
  const [row] = await tx.select().from(schoolIdentity).where(eq(schoolIdentity.schoolId, schoolId));
  return {
    name: sch?.name ?? '',
    officialName: row?.officialName ?? null,
    logoUrl: logoPath(row?.logoFileId),
    street: row?.street ?? null,
    village: row?.village ?? null,
    district: row?.district ?? null,
    city: row?.city ?? null,
    province: row?.province ?? null,
    postalCode: row?.postalCode ?? null,
    phone: row?.phone ?? null,
    fax: row?.fax ?? null,
    email: row?.email ?? null,
    website: row?.website ?? null,
  };
}

const tags = ['School'];

/** Identitas sekolah: logo, alamat lengkap, dan kontak. Dipakai kop ujian/surat dan, bila dipilih, situs publik. */
export async function schoolIdentityRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  app.get(
    '/v1/school/identity',
    {
      onRequest: [requireTenant],
      schema: {
        tags,
        summary: 'Identitas sekolah',
        description:
          'Izin: anggota aktif sekolah. Nama resmi, logo, alamat lengkap, telepon, fax, email, dan situs web. ' +
          'Bila belum diisi, semua kolom null dan `name` tetap nama unit.',
        headers: schoolHeader,
        response: { 200: identitySchema, ...guarded },
      },
    },
    async (request) => tenant(request, (tx) => readIdentity(tx, (request.ctx as TenantContext).schoolId)),
  );

  app.put(
    '/v1/school/identity',
    {
      onRequest: [requirePermission('school:manage')],
      schema: {
        tags,
        summary: 'Simpan identitas sekolah',
        description:
          'Izin: `school:manage`. Mengganti seluruh teks identitas; logo diubah lewat endpoint terpisah dan tidak ' +
          'tersentuh. `email` harus valid, `website` harus http(s) (400 `validation`).',
        headers: schoolHeader,
        body: identityBody,
        response: { 200: identitySchema, 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const values = { ...request.body, updatedAt: new Date() };
        await tx
          .insert(schoolIdentity)
          .values({ schoolId: ctx.schoolId, ...values })
          .onConflictDoUpdate({ target: schoolIdentity.schoolId, set: values });
        await audit(tx, ctx, 'school.identity_update', 'school', ctx.schoolId, request.body);
        return readIdentity(tx, ctx.schoolId);
      });
    },
  );

  app.post(
    '/v1/school/identity/logo',
    {
      onRequest: [requirePermission('school:manage')],
      bodyLimit: 1024 * 1024,
      schema: {
        tags,
        summary: 'Unggah logo sekolah',
        description:
          'Izin: `school:manage`. Gambar PNG, JPEG, atau WebP sampai 512 KB, dikirim sebagai base64 di `data` ' +
          '(tanpa awalan `data:`). Isi berkas diperiksa terhadap `mime` (400 `validation` bila tidak cocok atau ' +
          'terlalu besar). SVG ditolak. Logo lama diganti.',
        headers: schoolHeader,
        body: z.object({
          mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
          data: z.string().min(1).max(800_000),
        }),
        response: { 200: identitySchema, 400: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const bytes = Buffer.from(request.body.data, 'base64');
      const magic = LOGO_TYPES[request.body.mime];
      if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES || !magic.every((b, i) => bytes[i] === b)) {
        throw new HttpError(400, 'validation', 'Logo harus PNG, JPEG, atau WebP berukuran maksimal 512 KB.');
      }
      return tenant(request, async (tx) => {
        const [old] = await tx
          .select({ id: schoolIdentity.logoFileId })
          .from(schoolIdentity)
          .where(eq(schoolIdentity.schoolId, ctx.schoolId));
        const [file] = await tx
          .insert(schoolFile)
          .values({
            schoolId: ctx.schoolId,
            kind: 'logo',
            mime: request.body.mime,
            size: bytes.length,
            data: bytes,
          })
          .returning({ id: schoolFile.id });
        const values = { logoFileId: file!.id, updatedAt: new Date() };
        await tx
          .insert(schoolIdentity)
          .values({ schoolId: ctx.schoolId, ...values })
          .onConflictDoUpdate({ target: schoolIdentity.schoolId, set: values });
        if (old?.id) await tx.delete(schoolFile).where(eq(schoolFile.id, old.id));
        await audit(tx, ctx, 'school.logo_upload', 'school_file', file!.id, { size: bytes.length });
        return readIdentity(tx, ctx.schoolId);
      });
    },
  );

  app.delete(
    '/v1/school/identity/logo',
    {
      onRequest: [requirePermission('school:manage')],
      schema: {
        tags,
        summary: 'Hapus logo sekolah',
        description: 'Izin: `school:manage`. Tidak error bila logo memang belum ada.',
        headers: schoolHeader,
        response: { 200: ok, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const [row] = await tx
          .select({ id: schoolIdentity.logoFileId })
          .from(schoolIdentity)
          .where(eq(schoolIdentity.schoolId, ctx.schoolId));
        if (!row?.id) return;
        await tx.delete(schoolFile).where(eq(schoolFile.id, row.id)); // FK set null mengosongkan kolom logo
        await audit(tx, ctx, 'school.logo_delete', 'school_file', row.id);
      });
      return { ok: true as const };
    },
  );

  app.get(
    '/v1/public/school-files/:id',
    {
      config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
      schema: {
        tags: ['Site'],
        summary: 'Gambar logo sekolah dan gambar soal (publik)',
        description:
          'Tanpa login. Logo dan gambar soal; alamatnya memuat UUID sehingga tidak bisa ditebak. ' +
          '404 `not_found` bila tidak ada. Isi di-cache karena berkas tidak pernah diubah (logo baru = berkas baru).',
        params: z.object({ id: z.uuid() }),
        response: { 200: z.any().describe('Isi gambar (PNG, JPEG, atau WebP)'), 404: errorSchema },
      },
    },
    async (request, reply) => {
      const [file] = await request.server.platformDb
        .select({ mime: schoolFile.mime, data: schoolFile.data, kind: schoolFile.kind })
        .from(schoolFile)
        .where(eq(schoolFile.id, request.params.id));
      if (!file) throw new HttpError(404, 'not_found', 'Berkas tidak ditemukan.');
      return reply
        .header('content-type', file.mime)
        .header('cache-control', 'public, max-age=31536000, immutable')
        .header('cross-origin-resource-policy', 'cross-origin')
        .send(file.data);
    },
  );
}
