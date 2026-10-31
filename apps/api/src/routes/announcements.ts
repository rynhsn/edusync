import {
  admissionPeriod,
  and,
  announcement,
  asc,
  count,
  desc,
  entitlement,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  or,
  school,
  schoolProfile,
  type Tx,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { jakarta } from '../gate';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, guarded, idParams, ok, schoolHeader } from './helpers';

const tags = ['Announcements'];
const publicTags = ['Situs sekolah (publik)'];

const readGate = [requirePermission('announcement:read'), requireModule('announcements')];
const manageGate = [requirePermission('announcement:manage'), requireModule('announcements')];
const siteGate = [requirePermission('announcement:manage'), requireModule('website')];

const notFound = (what = 'Data') => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);

const CATEGORIES = ['news', 'agenda', 'notice'] as const;
const AUDIENCES = ['public', 'portal', 'staff', 'all'] as const;
const STATUSES = ['draft', 'published'] as const;

const MAX_BODY = 5000;
const EXCERPT_LENGTH = 200;
const SITE_HIGHLIGHTS = 6;

/** Teks biasa: tag HTML ditolak (bukan dibersihkan diam-diam) agar tak ada markup yang tampil di situs publik. */
const HTML_LIKE = /<\s*\/?\s*[a-z!?]/i;
const plainText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !HTML_LIKE.test(v), { message: 'Teks tidak boleh mengandung HTML.' });
const optionalPlain = (max: number) =>
  plainText(0, max)
    .nullish()
    .transform((v) => (v ? v : null));

const categoryEnum = z.enum(CATEGORIES);
const audienceEnum = z.enum(AUDIENCES);
const statusEnum = z.enum(STATUSES);

const announcementBody = z
  .object({
    title: plainText(1, 150),
    body: plainText(1, MAX_BODY).describe('Teks biasa (tanpa HTML), maks. 5000 karakter'),
    category: categoryEnum.default('news'),
    audience: audienceEnum.default('all'),
    eventDate: z.iso
      .date()
      .nullish()
      .transform((v) => v ?? null)
      .describe('Tanggal acara; wajib untuk kategori agenda'),
    pinned: z.boolean().default(false),
    status: statusEnum.default('draft'),
    expiresAt: z.iso
      .datetime({ offset: true })
      .nullish()
      .transform((v) => (v ? new Date(v) : null))
      .describe('Setelah waktu ini pengumuman tidak tampil lagi; kosong = tanpa batas'),
  })
  .refine((b) => b.category !== 'agenda' || b.eventDate !== null, {
    message: 'Agenda wajib punya tanggal acara.',
    path: ['eventDate'],
  });

const announcementSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  category: categoryEnum,
  audience: audienceEnum,
  eventDate: z.iso.date().nullable(),
  pinned: z.boolean(),
  status: statusEnum,
  publishedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  expired: z.boolean().describe('Sudah melewati `expiresAt`'),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type AnnouncementRow = typeof announcement.$inferSelect;
const view = (a: AnnouncementRow, now = new Date()) => ({
  id: a.id,
  title: a.title,
  body: a.body,
  category: a.category,
  audience: a.audience,
  eventDate: a.eventDate,
  pinned: a.pinned,
  status: a.status,
  publishedAt: a.publishedAt?.toISOString() ?? null,
  expiresAt: a.expiresAt?.toISOString() ?? null,
  expired: a.expiresAt !== null && a.expiresAt <= now,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});

/** Terbit dan belum kadaluarsa. */
const live = (now: Date) =>
  and(
    eq(announcement.status, 'published'),
    or(isNull(announcement.expiresAt), gt(announcement.expiresAt, now)),
  );

const excerptOf = (text: string) =>
  text.length <= EXCERPT_LENGTH ? text : `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…`;

/* ---------- Profil situs ---------- */

const profileBody = z.object({
  tagline: optionalPlain(160),
  about: optionalPlain(4000),
  vision: optionalPlain(1000),
  mission: optionalPlain(2000),
  address: optionalPlain(400),
  phone: optionalPlain(30),
  email: z
    .union([z.literal(''), z.email().max(254)])
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null)),
  whatsapp: optionalPlain(30),
  mapUrl: z
    .union([z.literal(''), z.url({ protocol: /^https?$/ }).max(500)])
    .nullish()
    .transform((v) => (v ? v : null)),
  accentColor: z
    .union([z.literal(''), z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Warna harus berformat #RRGGBB.')])
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null)),
  published: z.boolean().default(false),
});

const profileFields = z.object({
  tagline: z.string().nullable(),
  about: z.string().nullable(),
  vision: z.string().nullable(),
  mission: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  whatsapp: z.string().nullable(),
  mapUrl: z.string().nullable(),
  accentColor: z.string().nullable(),
});
const profileSchema = profileFields.extend({
  published: z.boolean(),
  updatedAt: z.string().nullable(),
});

type ProfileRow = typeof schoolProfile.$inferSelect;
const profileView = (p: ProfileRow | undefined) => ({
  tagline: p?.tagline ?? null,
  about: p?.about ?? null,
  vision: p?.vision ?? null,
  mission: p?.mission ?? null,
  address: p?.address ?? null,
  phone: p?.phone ?? null,
  email: p?.email ?? null,
  whatsapp: p?.whatsapp ?? null,
  mapUrl: p?.mapUrl ?? null,
  accentColor: p?.accentColor ?? null,
});

/* ---------- Publik ---------- */

const slugParams = z.object({ slug: z.string().trim().min(1).max(80) });
const publicItem = z.object({
  id: z.uuid(),
  title: z.string(),
  excerpt: z.string(),
  category: categoryEnum,
  eventDate: z.iso.date().nullable(),
  pinned: z.boolean(),
  publishedAt: z.string().nullable(),
});
const publicDetail = publicItem.omit({ excerpt: true }).extend({ body: z.string() });
const publicRow = (a: AnnouncementRow) => ({
  id: a.id,
  title: a.title,
  excerpt: excerptOf(a.body),
  category: a.category,
  eventDate: a.eventDate,
  pinned: a.pinned,
  publishedAt: a.publishedAt?.toISOString() ?? null,
});

const PUBLIC_AUDIENCES = ['public', 'all'] as const;
const pinnedFirst = [desc(announcement.pinned), desc(announcement.publishedAt), desc(announcement.createdAt)];

/**
 * Sekolah aktif yang modul `website`-nya berlaku dan profil situsnya terbit; selain itu 404 seragam (tidak
 * membocorkan apakah sekolah ada). `hasAnnouncements`/`hasAdmissions` menandai modul pelengkap.
 */
async function resolveSite(app: FastifyInstance, rawSlug: string) {
  const [row] = await app.platformDb
    .select({ id: school.id, name: school.name, slug: school.slug, status: school.status })
    .from(school)
    .where(eq(school.slug, rawSlug.toLowerCase()));
  if (!row || row.status !== 'active') throw notFound();
  return withTenant(app.tenantDb, [row.id], async (tx) => {
    const mods = await tx
      .select({ key: entitlement.moduleKey })
      .from(entitlement)
      .where(
        and(
          inArray(entitlement.moduleKey, ['website', 'announcements', 'admissions']),
          gt(entitlement.validUntil, new Date()),
        ),
      );
    const keys = new Set(mods.map((m) => m.key));
    if (!keys.has('website')) throw notFound();
    const [profile] = await tx.select().from(schoolProfile).where(eq(schoolProfile.schoolId, row.id));
    if (!profile?.published) throw notFound();
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      profile,
      hasAnnouncements: keys.has('announcements'),
      hasAdmissions: keys.has('admissions'),
    };
  });
}

/** Pengumuman dan situs sekolah: manajemen, umpan dasbor staf, profil situs, dan halaman publik tanpa login. */
export async function announcementRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  /** Nilai kolom turunan status: `publishedAt` otomatis saat terbit, dihapus saat kembali draf. */
  const stateColumns = (next: 'draft' | 'published', prev: AnnouncementRow | undefined) => {
    if (next === 'draft') return { status: next, publishedAt: null };
    return { status: next, publishedAt: prev?.status === 'published' ? prev.publishedAt : new Date() };
  };

  /* ---------- Admin ---------- */

  app.get(
    '/v1/announcements',
    {
      onRequest: readGate,
      schema: {
        tags,
        summary: 'Daftar pengumuman dan agenda',
        description:
          'Izin: `announcement:read`; modul `announcements`. Saringan `status`, `category`, `audience`. ' +
          'Urutan: yang disematkan dulu, lalu terbaru.',
        headers: schoolHeader,
        querystring: z.object({
          status: statusEnum.optional(),
          category: categoryEnum.optional(),
          audience: audienceEnum.optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: {
          200: z.object({ items: z.array(announcementSchema), total: z.number().int() }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const { status, category, audience, limit, offset } = request.query;
      return tenant(request, async (tx) => {
        const where = and(
          status ? eq(announcement.status, status) : undefined,
          category ? eq(announcement.category, category) : undefined,
          audience ? eq(announcement.audience, audience) : undefined,
        );
        const [total] = await tx.select({ n: count() }).from(announcement).where(where);
        const rows = await tx
          .select()
          .from(announcement)
          .where(where)
          .orderBy(desc(announcement.pinned), desc(announcement.createdAt))
          .limit(limit)
          .offset(offset);
        const now = new Date();
        return { total: total?.n ?? 0, items: rows.map((r) => view(r, now)) };
      });
    },
  );

  app.get(
    '/v1/announcements/feed',
    {
      onRequest: readGate,
      schema: {
        tags,
        summary: 'Umpan pengumuman untuk dasbor staf',
        description:
          'Izin: `announcement:read`; modul `announcements`. Hanya yang terbit, belum kadaluarsa, dan audiens ' +
          '`staff` atau `all`. Disematkan dulu, lalu terbaru.',
        headers: schoolHeader,
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }),
        response: { 200: z.object({ items: z.array(announcementSchema) }), ...guarded },
      },
    },
    async (request) => {
      const now = new Date();
      return tenant(request, async (tx) => {
        const rows = await tx
          .select()
          .from(announcement)
          .where(and(live(now), inArray(announcement.audience, ['staff', 'all'])))
          .orderBy(...pinnedFirst)
          .limit(request.query.limit);
        return { items: rows.map((r) => view(r, now)) };
      });
    },
  );

  app.get(
    '/v1/announcements/:id',
    {
      onRequest: readGate,
      schema: {
        tags,
        summary: 'Detail pengumuman',
        description: 'Izin: `announcement:read`; modul `announcements`. 404 `not_found` bila tidak ada.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: announcementSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [row] = await tx.select().from(announcement).where(eq(announcement.id, request.params.id));
        if (!row) throw notFound('Pengumuman');
        return view(row);
      }),
  );

  app.post(
    '/v1/announcements',
    {
      onRequest: manageGate,
      schema: {
        tags,
        summary: 'Buat pengumuman',
        description:
          'Izin: `announcement:manage`; modul `announcements`. `body` teks biasa (HTML ditolak 400 `validation`). ' +
          'Agenda wajib `eventDate`. Status `published` mengisi `publishedAt` otomatis. Ditulis ke audit.',
        headers: schoolHeader,
        body: announcementBody,
        response: { 201: announcementSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      const row = await tenant(request, async (tx) => {
        const [created] = await tx
          .insert(announcement)
          .values({
            schoolId: ctx.schoolId,
            title: b.title,
            body: b.body,
            category: b.category,
            audience: b.audience,
            eventDate: b.category === 'agenda' ? b.eventDate : null,
            pinned: b.pinned,
            expiresAt: b.expiresAt,
            createdBy: ctx.userId,
            ...stateColumns(b.status, undefined),
          })
          .returning();
        await audit(tx, ctx, 'announcement.create', 'announcement', created!.id, {
          title: b.title,
          status: b.status,
        });
        return created!;
      });
      return reply.code(201).send(view(row));
    },
  );

  app.put(
    '/v1/announcements/:id',
    {
      onRequest: manageGate,
      schema: {
        tags,
        summary: 'Ubah pengumuman',
        description:
          'Izin: `announcement:manage`; modul `announcements`. Mengganti seluruh isi. `publishedAt` tetap bila ' +
          'sudah terbit; berubah ke terbit mengisinya, kembali ke draf mengosongkannya. 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        body: announcementBody,
        response: { 200: announcementSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return tenant(request, async (tx) => {
        const [prev] = await tx.select().from(announcement).where(eq(announcement.id, request.params.id));
        if (!prev) throw notFound('Pengumuman');
        const [updated] = await tx
          .update(announcement)
          .set({
            title: b.title,
            body: b.body,
            category: b.category,
            audience: b.audience,
            eventDate: b.category === 'agenda' ? b.eventDate : null,
            pinned: b.pinned,
            expiresAt: b.expiresAt,
            updatedAt: new Date(),
            ...stateColumns(b.status, prev),
          })
          .where(eq(announcement.id, prev.id))
          .returning();
        await audit(tx, ctx, 'announcement.update', 'announcement', prev.id, { title: b.title });
        return view(updated!);
      });
    },
  );

  for (const action of ['publish', 'unpublish'] as const) {
    const publishing = action === 'publish';
    app.post(
      `/v1/announcements/:id/${action}`,
      {
        onRequest: manageGate,
        schema: {
          tags,
          summary: publishing ? 'Terbitkan pengumuman' : 'Tarik pengumuman ke draf',
          description: `Izin: \`announcement:manage\`; modul \`announcements\`. ${
            publishing
              ? 'Mengisi `publishedAt` bila sebelumnya draf; sudah terbit tidak mengubah apa pun.'
              : 'Mengembalikan ke draf dan mengosongkan `publishedAt`; sudah draf tidak mengubah apa pun.'
          } 404 \`not_found\`. Ditulis ke audit.`,
          headers: schoolHeader,
          params: idParams,
          response: { 200: announcementSchema, 404: errorSchema, ...guarded },
        },
      },
      async (request) => {
        const ctx = request.ctx as TenantContext;
        return tenant(request, async (tx) => {
          const [prev] = await tx.select().from(announcement).where(eq(announcement.id, request.params.id));
          if (!prev) throw notFound('Pengumuman');
          const next = publishing ? 'published' : 'draft';
          if (prev.status === next) return view(prev);
          const [updated] = await tx
            .update(announcement)
            .set({ updatedAt: new Date(), ...stateColumns(next, prev) })
            .where(eq(announcement.id, prev.id))
            .returning();
          await audit(tx, ctx, `announcement.${action}`, 'announcement', prev.id, { title: prev.title });
          return view(updated!);
        });
      },
    );
  }

  app.delete(
    '/v1/announcements/:id',
    {
      onRequest: manageGate,
      schema: {
        tags,
        summary: 'Hapus pengumuman',
        description: 'Izin: `announcement:manage`; modul `announcements`. 404 `not_found`. Ditulis ke audit.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const [gone] = await tx
          .delete(announcement)
          .where(eq(announcement.id, request.params.id))
          .returning({ id: announcement.id, title: announcement.title });
        if (!gone) throw notFound('Pengumuman');
        await audit(tx, ctx, 'announcement.delete', 'announcement', gone.id, { title: gone.title });
        return { ok: true as const };
      });
    },
  );

  /* ---------- Profil situs ---------- */

  app.get(
    '/v1/site/profile',
    {
      onRequest: siteGate,
      schema: {
        tags: ['Site'],
        summary: 'Profil situs sekolah',
        description:
          'Izin: `announcement:manage`; modul `website`. Bila belum pernah disimpan, semua kolom kosong dan ' +
          '`published` = false.',
        headers: schoolHeader,
        response: { 200: profileSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [p] = await tx.select().from(schoolProfile);
        return {
          ...profileView(p),
          published: p?.published ?? false,
          updatedAt: p?.updatedAt.toISOString() ?? null,
        };
      }),
  );

  app.put(
    '/v1/site/profile',
    {
      onRequest: siteGate,
      schema: {
        tags: ['Site'],
        summary: 'Simpan profil situs sekolah',
        description:
          'Izin: `announcement:manage`; modul `website`. Mengganti seluruh profil. `accentColor` berformat ' +
          '#RRGGBB, `mapUrl` harus http(s), teks tanpa HTML (400 `validation`). `published` = false menyembunyikan ' +
          'situs publik (404). Ditulis ke audit.',
        headers: schoolHeader,
        body: profileBody,
        response: { 200: profileSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { published, ...fields } = request.body;
      return tenant(request, async (tx) => {
        const now = new Date();
        const values = { ...fields, published, updatedAt: now };
        const [p] = await tx
          .insert(schoolProfile)
          .values({ schoolId: ctx.schoolId, ...values })
          .onConflictDoUpdate({ target: schoolProfile.schoolId, set: values })
          .returning();
        await audit(tx, ctx, 'site.profile.save', 'school_profile', ctx.schoolId, { published });
        return { ...profileView(p), published: p!.published, updatedAt: p!.updatedAt.toISOString() };
      });
    },
  );

  /* ---------- Publik ---------- */

  const publicConfig = { rateLimit: { max: 120, timeWindow: '1 minute' } };

  app.get(
    '/v1/public/site/:slug',
    {
      config: publicConfig,
      schema: {
        tags: publicTags,
        summary: 'Beranda situs sekolah (publik)',
        description:
          'Tanpa login. Profil, nama sekolah, jenjang yang sedang dibuka SPMB (kosong bila modul SPMB tidak aktif), ' +
          `${SITE_HIGHLIGHTS} berita/pemberitahuan publik terbaru, dan agenda mendatang (tanggal acara hari ini menurut zona waktu sekolah ` +
          'atau setelahnya). Pengumuman hanya yang terbit, belum kadaluarsa, dan audiens `public`/`all`; kosong ' +
          'bila modul `announcements` tidak aktif. 404 `not_found` seragam untuk sekolah yang tidak ada, ' +
          'ditangguhkan, tanpa modul `website`, atau profilnya belum terbit.',
        params: slugParams,
        response: {
          200: z.object({
            school: z.object({ name: z.string(), slug: z.string() }),
            profile: profileFields,
            admission: z.object({ enabled: z.boolean(), openLevels: z.array(z.string()) }),
            announcements: z.array(publicItem),
            agenda: z.array(publicItem),
          }),
          404: errorSchema,
          429: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const site = await resolveSite(request.server, request.params.slug);
      const now = new Date();
      const data = await withTenant(request.server.tenantDb, [site.id], async (tx) => {
        const today = jakarta(now).date;
        let openLevels: string[] = [];
        if (site.hasAdmissions) {
          const periods = await tx
            .select({ level: admissionPeriod.level })
            .from(admissionPeriod)
            .where(
              and(
                eq(admissionPeriod.active, true),
                lte(admissionPeriod.opensOn, today),
                gte(admissionPeriod.closesOn, today),
              ),
            )
            .orderBy(asc(admissionPeriod.level));
          openLevels = [...new Set(periods.map((p) => p.level))];
        }
        if (!site.hasAnnouncements) return { openLevels, news: [], agenda: [] };
        const audience = and(live(now), inArray(announcement.audience, [...PUBLIC_AUDIENCES]));
        const news = await tx
          .select()
          .from(announcement)
          .where(and(audience, inArray(announcement.category, ['news', 'notice'])))
          .orderBy(...pinnedFirst)
          .limit(SITE_HIGHLIGHTS);
        const agenda = await tx
          .select()
          .from(announcement)
          .where(and(audience, eq(announcement.category, 'agenda'), gte(announcement.eventDate, today)))
          .orderBy(asc(announcement.eventDate), asc(announcement.createdAt))
          .limit(SITE_HIGHLIGHTS);
        return { openLevels, news, agenda };
      });
      reply.header('cache-control', 'public, max-age=60');
      return {
        school: { name: site.name, slug: site.slug },
        profile: profileView(site.profile),
        admission: { enabled: site.hasAdmissions, openLevels: data.openLevels },
        announcements: data.news.map(publicRow),
        agenda: data.agenda.map(publicRow),
      };
    },
  );

  app.get(
    '/v1/public/site/:slug/announcements',
    {
      config: publicConfig,
      schema: {
        tags: publicTags,
        summary: 'Daftar pengumuman situs (publik)',
        description:
          'Tanpa login. Hanya yang terbit, belum kadaluarsa, dan audiens `public`/`all`. Saringan `category`. ' +
          'Disematkan dulu, lalu terbaru. Modul `announcements` tidak aktif: daftar kosong. 404 `not_found` ' +
          'seragam seperti beranda situs.',
        params: slugParams,
        querystring: z.object({
          category: categoryEnum.optional(),
          limit: z.coerce.number().int().min(1).max(50).default(12),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: {
          200: z.object({ items: z.array(publicItem), total: z.number().int() }),
          404: errorSchema,
          429: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const site = await resolveSite(request.server, request.params.slug);
      if (!site.hasAnnouncements) return { items: [], total: 0 };
      const { category, limit, offset } = request.query;
      const now = new Date();
      const data = await withTenant(request.server.tenantDb, [site.id], async (tx) => {
        const where = and(
          live(now),
          inArray(announcement.audience, [...PUBLIC_AUDIENCES]),
          category ? eq(announcement.category, category) : undefined,
        );
        const [total] = await tx.select({ n: count() }).from(announcement).where(where);
        const rows = await tx
          .select()
          .from(announcement)
          .where(where)
          .orderBy(...pinnedFirst)
          .limit(limit)
          .offset(offset);
        return { total: total?.n ?? 0, items: rows.map(publicRow) };
      });
      reply.header('cache-control', 'public, max-age=60');
      return data;
    },
  );

  app.get(
    '/v1/public/site/:slug/announcements/:id',
    {
      config: publicConfig,
      schema: {
        tags: publicTags,
        summary: 'Detail pengumuman situs (publik)',
        description:
          'Tanpa login. 404 `not_found` seragam bila sekolah/situs tidak tersedia, atau pengumuman tidak ada, ' +
          'masih draf, kadaluarsa, atau bukan untuk audiens publik.',
        params: slugParams.extend({ id: z.uuid() }),
        response: { 200: publicDetail, 404: errorSchema, 429: errorSchema },
      },
    },
    async (request, reply) => {
      const site = await resolveSite(request.server, request.params.slug);
      if (!site.hasAnnouncements) throw notFound();
      const row = await withTenant(request.server.tenantDb, [site.id], async (tx) => {
        const [a] = await tx
          .select()
          .from(announcement)
          .where(
            and(
              eq(announcement.id, request.params.id),
              live(new Date()),
              inArray(announcement.audience, [...PUBLIC_AUDIENCES]),
            ),
          );
        return a;
      });
      if (!row) throw notFound();
      reply.header('cache-control', 'public, max-age=60');
      const { excerpt: _excerpt, ...rest } = publicRow(row);
      return { ...rest, body: row.body };
    },
  );
}
