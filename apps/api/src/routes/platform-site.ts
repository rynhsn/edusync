import {
  checkSiteAsset,
  DEFAULT_SITE_CONTENT,
  isSiteAssetKey,
  resolveSiteContent,
  SITE_ASSET_KEYS,
  SITE_ASSET_MIMES,
  SITE_ASSET_SLOTS,
  SITE_CONTENT_KEY,
  type SiteAssetKey,
  siteContentSchema,
} from '@edusync/contracts';
import { auditLog, eq, platformSetting, siteAsset, sql } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireStaff } from '../identity/guards';

const tag = ['Platform'];
const publicTag = ['Site'];

/** Batas badan permintaan unggah: 2 MB gambar menjadi sekitar 2,8 MB base64. */
const UPLOAD_BODY_LIMIT = 3 * 1024 * 1024;

const assetView = z.object({
  key: z.enum(SITE_ASSET_KEYS),
  mime: z.string(),
  size: z.number().int(),
  updatedAt: z.string().describe('ISO 8601'),
  updatedBy: z.string().nullable(),
  url: z
    .string()
    .describe('Alamat publik gambar (relatif terhadap API), memuat versi agar cache ikut berganti'),
});

const slotView = z.object({
  key: z.enum(SITE_ASSET_KEYS),
  mimes: z.array(z.enum(SITE_ASSET_MIMES)),
  maxBytes: z.number().int(),
  size: z.string().describe('Ukuran piksel yang disarankan'),
});

const adminView = z.object({
  content: siteContentSchema,
  defaults: siteContentSchema.describe('Isi bawaan (sama dengan teks halaman utama sebelum disunting)'),
  customized: z.boolean().describe('false = belum pernah disimpan, halaman utama memakai isi bawaan'),
  assets: z.array(assetView),
  slots: z.array(slotView).describe('Aturan tiap slot gambar: jenis berkas dan ukuran maksimal'),
});

const publicView = z.object({
  content: siteContentSchema,
  assets: z
    .record(z.string(), z.object({ url: z.string(), mime: z.string() }))
    .describe('Gambar yang sudah diunggah, per slot. Slot yang tidak ada memakai gambar bawaan aplikasi'),
});

const keyParams = z.object({ key: z.enum(SITE_ASSET_KEYS) });

const assetUrl = (key: string, updatedAt: Date) => `/v1/public/site-assets/${key}?v=${updatedAt.getTime()}`;

/**
 * Ikon, gambar, dan isi halaman utama Edusync yang diatur staf platform tanpa mengubah kode. Isi teks disimpan di
 * `platform_setting` (kunci `site`), gambar di tabel `site_asset`. Endpoint publik hanya membaca.
 */
export async function platformSiteRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const db = app.platformDb;

  const loadContent = async () => {
    const [row] = await db.select().from(platformSetting).where(eq(platformSetting.key, SITE_CONTENT_KEY));
    return { content: resolveSiteContent(row?.value), customized: Boolean(row) };
  };

  const loadAssets = () =>
    db
      .select({
        key: siteAsset.key,
        mime: siteAsset.mime,
        size: siteAsset.size,
        updatedAt: siteAsset.updatedAt,
        updatedBy: siteAsset.updatedBy,
      })
      .from(siteAsset);

  const adminState = async () => {
    const [{ content, customized }, assets] = await Promise.all([loadContent(), loadAssets()]);
    return {
      content,
      defaults: DEFAULT_SITE_CONTENT,
      customized,
      assets: assets
        .filter((a): a is typeof a & { key: SiteAssetKey } => isSiteAssetKey(a.key))
        .map((a) => ({ ...a, updatedAt: a.updatedAt.toISOString(), url: assetUrl(a.key, a.updatedAt) })),
      slots: SITE_ASSET_KEYS.map((key) => ({
        key,
        ...SITE_ASSET_SLOTS[key],
        mimes: [...SITE_ASSET_SLOTS[key].mimes],
      })),
    };
  };

  app.get(
    '/v1/platform/site',
    {
      onRequest: [requireStaff('read_only')],
      schema: {
        tags: tag,
        summary: 'Pengaturan situs Edusync (isi dan gambar)',
        description:
          'Staf platform (baca). Isi teks halaman utama per bahasa (id, en, su), daftar fitur, kontak, tautan sosial, ' +
          'saklar bagian, serta gambar yang sudah diunggah (ikon, logo, hero, OG). `customized` = false berarti belum ' +
          'pernah disimpan sehingga halaman utama memakai isi bawaan. `slots` memuat aturan tiap slot gambar.',
        response: { 200: adminView, 401: errorSchema, 403: errorSchema },
      },
    },
    async () => adminState(),
  );

  app.put(
    '/v1/platform/site',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Simpan isi situs Edusync',
        description:
          'Staf platform (admin). Mengganti seluruh isi teks. Judul hero, label tombol, dan nama merek wajib; ikon fitur ' +
          'dari daftar tertutup, maksimal 12 fitur; tautan sosial http(s). Data tidak valid: 400 `validation`. ' +
          'Halaman utama memuat ulang isi dalam sekitar satu menit (cache). Tercatat di audit `site.content_update`.',
        body: siteContentSchema,
        response: { 200: adminView, 400: errorSchema, 401: errorSchema, 403: errorSchema },
      },
    },
    async (request) => {
      const staffId = request.userId as string;
      const value = request.body as unknown as Record<string, unknown>;
      await db
        .insert(platformSetting)
        .values({ key: SITE_CONTENT_KEY, value, updatedBy: staffId })
        .onConflictDoUpdate({
          target: platformSetting.key,
          set: { value, updatedBy: staffId, updatedAt: sql`now()` },
        });
      await db.insert(auditLog).values({
        actorId: staffId,
        action: 'site.content_update',
        entityType: 'platform_setting',
        entityId: SITE_CONTENT_KEY,
        details: { brandName: request.body.brandName, sections: request.body.sections },
      });
      return adminState();
    },
  );

  app.delete(
    '/v1/platform/site',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Kembalikan isi situs ke bawaan',
        description:
          'Staf platform (admin). Menghapus isi teks tersimpan sehingga halaman utama kembali ke teks bawaan. Gambar ' +
          'yang sudah diunggah tidak ikut dihapus (hapus per slot). Tidak error bila memang belum pernah disimpan.',
        response: { 200: adminView, 401: errorSchema, 403: errorSchema },
      },
    },
    async (request) => {
      const staffId = request.userId as string;
      await db.delete(platformSetting).where(eq(platformSetting.key, SITE_CONTENT_KEY));
      await db.insert(auditLog).values({
        actorId: staffId,
        action: 'site.content_reset',
        entityType: 'platform_setting',
        entityId: SITE_CONTENT_KEY,
      });
      return adminState();
    },
  );

  app.put(
    '/v1/platform/site/assets/:key',
    {
      onRequest: [requireStaff('admin')],
      bodyLimit: UPLOAD_BODY_LIMIT,
      schema: {
        tags: tag,
        summary: 'Unggah gambar situs (ikon, logo, hero, OG)',
        description:
          'Staf platform (admin). `key` salah satu dari favicon, app_icon, logo, logo_dark, hero, og_image. Gambar PNG, ' +
          'JPEG, WebP, ICO, atau SVG (sesuai slot) dikirim sebagai base64 di `data` tanpa awalan `data:`. Maksimal 2 MB, ' +
          'favicon dan app_icon 256 KB. Isi diperiksa terhadap `mime` (400 `validation` bila tidak cocok atau terlalu besar). ' +
          'SVG yang memuat skrip, penanganan peristiwa (`onload=`), `foreignObject`, atau `javascript:` ditolak: 400 ' +
          '`svg_unsafe`. Gambar lama pada slot yang sama diganti. Tercatat di audit `site.asset_upload`.',
        params: keyParams,
        body: z.object({
          mime: z.enum(SITE_ASSET_MIMES),
          data: z.string().min(1).max(3_000_000).describe('Isi berkas dalam base64'),
        }),
        response: { 200: assetView, 400: errorSchema, 401: errorSchema, 403: errorSchema },
      },
    },
    async (request) => {
      const staffId = request.userId as string;
      const { key } = request.params;
      const bytes = Buffer.from(request.body.data, 'base64');
      const problem = checkSiteAsset(key, request.body.mime, bytes);
      if (problem === 'svg_unsafe') {
        throw new HttpError(400, 'svg_unsafe', 'SVG memuat skrip atau elemen berbahaya sehingga ditolak.');
      }
      if (problem) {
        const slot = SITE_ASSET_SLOTS[key];
        throw new HttpError(
          400,
          'validation',
          `Gambar tidak valid: jenis harus ${slot.mimes.join(', ')}, ukuran maksimal ${Math.round(slot.maxBytes / 1024)} KB, dan isi harus cocok dengan jenisnya.`,
        );
      }
      const now = new Date();
      await db
        .insert(siteAsset)
        .values({
          key,
          mime: request.body.mime,
          size: bytes.length,
          data: bytes,
          updatedBy: staffId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: siteAsset.key,
          set: {
            mime: request.body.mime,
            size: bytes.length,
            data: bytes,
            updatedBy: staffId,
            updatedAt: now,
          },
        });
      await db.insert(auditLog).values({
        actorId: staffId,
        action: 'site.asset_upload',
        entityType: 'site_asset',
        entityId: key,
        details: { mime: request.body.mime, size: bytes.length },
      });
      return {
        key,
        mime: request.body.mime,
        size: bytes.length,
        updatedAt: now.toISOString(),
        updatedBy: staffId,
        url: assetUrl(key, now),
      };
    },
  );

  app.delete(
    '/v1/platform/site/assets/:key',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Hapus gambar situs (kembali ke gambar bawaan)',
        description:
          'Staf platform (admin). Menghapus gambar pada slot; situs kembali memakai gambar bawaan aplikasi. Tidak error ' +
          'bila slot memang kosong. Tercatat di audit `site.asset_delete`.',
        params: keyParams,
        response: { 200: z.object({ ok: z.literal(true) }), 401: errorSchema, 403: errorSchema },
      },
    },
    async (request) => {
      const { key } = request.params;
      const removed = await db
        .delete(siteAsset)
        .where(eq(siteAsset.key, key))
        .returning({ key: siteAsset.key });
      if (removed.length > 0) {
        await db.insert(auditLog).values({
          actorId: request.userId as string,
          action: 'site.asset_delete',
          entityType: 'site_asset',
          entityId: key,
        });
      }
      return { ok: true as const };
    },
  );

  app.get(
    '/v1/public/site',
    {
      config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
      schema: {
        tags: publicTag,
        summary: 'Isi dan gambar situs Edusync (publik)',
        description:
          'Tanpa login. Isi halaman utama Edusync (teks tiga bahasa, fitur, kontak, tautan sosial, saklar bagian) dan ' +
          'alamat gambar yang sudah diunggah staf platform. Bila belum pernah diatur, isinya sama dengan teks bawaan. ' +
          'Dipakai halaman utama dan metadata di sisi server (cache sekitar satu menit).',
        response: { 200: publicView },
      },
    },
    async (_request, reply) => {
      const [{ content }, assets] = await Promise.all([loadContent(), loadAssets()]);
      reply.header('cache-control', 'public, max-age=30, stale-while-revalidate=120');
      return {
        content,
        assets: Object.fromEntries(
          assets
            .filter((a) => isSiteAssetKey(a.key))
            .map((a) => [a.key, { url: assetUrl(a.key, a.updatedAt), mime: a.mime }]),
        ),
      };
    },
  );

  app.get(
    '/v1/public/site-assets/:key',
    {
      config: { rateLimit: { max: 600, timeWindow: '1 minute' } },
      schema: {
        tags: publicTag,
        summary: 'Gambar situs Edusync (publik)',
        description:
          'Tanpa login. Gambar pada slot (favicon, app_icon, logo, logo_dark, hero, og_image). 404 `not_found` bila ' +
          'slot kosong (pakai gambar bawaan). Mendukung `ETag` dan `If-None-Match` (304); di-cache singkat supaya ' +
          'penggantian gambar cepat terlihat.',
        params: z.object({ key: z.string().max(40) }),
        response: { 200: z.any().describe('Isi gambar'), 304: z.any(), 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { key } = request.params;
      const [row] = isSiteAssetKey(key)
        ? await db.select().from(siteAsset).where(eq(siteAsset.key, key))
        : [];
      if (!row) throw new HttpError(404, 'not_found', 'Gambar belum diatur.');
      const etag = `"${row.updatedAt.getTime().toString(36)}-${row.size}"`;
      reply
        .header('etag', etag)
        .header('cache-control', 'public, max-age=300, must-revalidate')
        .header('cross-origin-resource-policy', 'cross-origin')
        .header('x-content-type-options', 'nosniff');
      if (request.headers['if-none-match'] === etag) return reply.code(304).send();
      return reply
        .header('content-type', row.mime)
        .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
        .send(row.data);
    },
  );
}
