import { and, eq, foundationOwner, school, type supportMessage, type supportTicket } from '@edusync/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Env } from '../env';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, requireUser, type TenantContext } from '../identity/guards';
import {
  type Actor,
  CATEGORIES,
  closeAsReporter,
  createTicket,
  type Links,
  listScoped,
  makeLinks,
  PRIORITIES,
  readScoped,
  replyAsReporter,
  type Scope,
  STATUSES,
  SUPPORT_PERMISSION,
  unreadCountFor,
} from '../support-lib';

const iso = z.iso.datetime();
export const categorySchema = z.enum(CATEGORIES);
export const prioritySchema = z.enum(PRIORITIES);
export const statusSchema = z.enum(STATUSES);
const sideSchema = z.enum(['school', 'platform']);

export const ticketSummary = z.object({
  id: z.uuid(),
  ticketNo: z.string().describe('Kode manusiawi, mis. TKT-000123'),
  subject: z.string(),
  category: categorySchema,
  priority: prioritySchema,
  status: statusSchema,
  lastMessageAt: iso,
  lastMessageBySide: sideSchema,
  unread: z.boolean().describe('Ada balasan tim platform yang belum dibuka'),
  creatorName: z.string(),
  createdAt: iso,
});

const messageRow = z.object({
  id: z.uuid(),
  authorName: z.string(),
  authorSide: sideSchema,
  body: z.string(),
  createdAt: iso,
  mine: z.boolean().describe('Ditulis oleh pengguna yang sedang masuk'),
});

const ticketDetail = ticketSummary.extend({
  resolvedAt: iso.nullable(),
  closedAt: iso.nullable(),
  canReply: z.boolean().describe('false bila laporan sudah ditutup (buat laporan baru)'),
  messages: z.array(messageRow),
});

const listQuery = z.object({
  status: statusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParam = z.object({ id: z.uuid() });
const replyBody = z.object({ body: z.string().trim().min(1).max(5000) });
const baseCreate = z.object({
  subject: z.string().trim().min(3).max(150),
  category: categorySchema,
  priority: prioritySchema.default('normal'),
  body: z.string().trim().min(3).max(5000),
  page: z
    .string()
    .max(300)
    .optional()
    .describe('Jalur halaman tempat pelapor berada (dikirim otomatis oleh web)'),
});
const ownerCreate = baseCreate.extend({
  foundationId: z.uuid(),
  schoolId: z.uuid().optional().describe('Unit yang berkaitan (opsional, harus milik yayasan itu)'),
});
const guarded = { 401: errorSchema, 403: errorSchema };

type TicketRow = typeof supportTicket.$inferSelect;
type MessageRow = typeof supportMessage.$inferSelect;

export const toSummary = (t: TicketRow) => ({
  id: t.id,
  ticketNo: t.ticketNo,
  subject: t.subject,
  category: t.category,
  priority: t.priority,
  status: t.status,
  lastMessageAt: t.lastMessageAt.toISOString(),
  lastMessageBySide: t.lastMessageBySide,
  unread: t.schoolUnread,
  creatorName: t.creatorName,
  createdAt: t.createdAt.toISOString(),
});

const toDetail = (t: TicketRow, messages: MessageRow[], userId: string) => ({
  ...toSummary(t),
  resolvedAt: t.resolvedAt?.toISOString() ?? null,
  closedAt: t.closedAt?.toISOString() ?? null,
  canReply: t.status !== 'closed',
  messages: messages.map((m) => ({
    id: m.id,
    authorName: m.authorName,
    authorSide: m.authorSide,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    mine: m.authorUserId === userId,
  })),
});

const actorOf = (request: FastifyRequest): Actor => request.authUser as Actor;

interface ReporterConfig {
  base: string;
  tag: string[];
  gate: unknown[];
  /** Awal deskripsi OpenAPI (mis. "Izin: `school:manage`. "). */
  prefix: string;
  scopeOf: (request: FastifyRequest) => Promise<Scope>;
  links: Links;
}

/** Rute pembacaan dan balasan yang sama untuk panel sekolah dan portal pemilik; hanya cakupannya berbeda. */
function registerReporterRoutes(instance: FastifyInstance, cfg: ReporterConfig) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const db = app.platformDb;
  const onRequest = cfg.gate as never;

  app.get(
    `${cfg.base}/tickets`,
    {
      onRequest,
      schema: {
        tags: cfg.tag,
        summary: 'Daftar laporan ke tim platform',
        description: `${cfg.prefix}Laporan milik sekolah/yayasan sendiri, urut aktivitas terbaru. Filter \`status\` opsional.`,
        querystring: listQuery,
        response: { 200: z.object({ tickets: z.array(ticketSummary) }), ...guarded },
      },
    },
    async (request) => {
      const scope = await cfg.scopeOf(request);
      const rows = await db.transaction((tx) => listScoped(tx, scope, request.query));
      return { tickets: rows.map(toSummary) };
    },
  );

  app.get(
    `${cfg.base}/tickets/:id`,
    {
      onRequest,
      schema: {
        tags: cfg.tag,
        summary: 'Percakapan satu laporan',
        description: `${cfg.prefix}Percakapan tanpa catatan internal staf. Membuka laporan menandai balasan platform sebagai terbaca. 404 bila bukan milik sekolah/yayasan ini.`,
        params: idParam,
        response: { 200: ticketDetail, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const scope = await cfg.scopeOf(request);
      const { ticket, messages } = await db.transaction((tx) => readScoped(tx, scope, request.params.id));
      return toDetail(ticket, messages, actorOf(request).id);
    },
  );

  app.post(
    `${cfg.base}/tickets/:id/messages`,
    {
      onRequest,
      schema: {
        tags: cfg.tag,
        summary: 'Balas laporan',
        description:
          `${cfg.prefix}Membalas laporan. Balasan pada laporan berstatus selesai membukanya kembali; laporan yang sudah ` +
          'ditutup tidak bisa dibalas (409 `ticket_closed`, buat laporan baru). Tim platform diberi tahu lewat menu dan email.',
        params: idParam,
        body: replyBody,
        response: { 201: ticketDetail, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const scope = await cfg.scopeOf(request);
      const actor = actorOf(request);
      await db.transaction((tx) =>
        replyAsReporter(tx, cfg.links, scope, request.params.id, actor, request.body.body),
      );
      const { ticket, messages } = await db.transaction((tx) => readScoped(tx, scope, request.params.id));
      return reply.code(201).send(toDetail(ticket, messages, actor.id));
    },
  );

  app.post(
    `${cfg.base}/tickets/:id/close`,
    {
      onRequest,
      schema: {
        tags: cfg.tag,
        summary: 'Tutup laporan',
        description: `${cfg.prefix}Pelapor menutup atau mengonfirmasi laporan sudah selesai. Laporan yang ditutup tidak bisa dibalas lagi.`,
        params: idParam,
        response: { 200: ticketSummary, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const scope = await cfg.scopeOf(request);
      const t = await db.transaction((tx) => closeAsReporter(tx, scope, request.params.id));
      return toSummary(t);
    },
  );

  app.get(
    `${cfg.base}/unread-count`,
    {
      onRequest,
      schema: {
        tags: cfg.tag,
        summary: 'Jumlah laporan dengan balasan platform yang belum dibuka',
        description: `${cfg.prefix}Dipakai lencana menu Laporan; web memanggilnya berkala.`,
        response: { 200: z.object({ count: z.number().int() }), ...guarded },
      },
    },
    async (request) => {
      const scope = await cfg.scopeOf(request);
      return { count: await db.transaction((tx) => unreadCountFor(tx, scope)) };
    },
  );
}

export async function supportRoutes(instance: FastifyInstance, options: { env: Env }) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const db = app.platformDb;
  const links = makeLinks(options.env);
  const tenantGate = [requirePermission(SUPPORT_PERMISSION)];
  const ctxOf = (request: FastifyRequest) => request.ctx as TenantContext;

  /* ----- Panel sekolah (x-school-id) ----- */

  registerReporterRoutes(instance, {
    base: '/v1/support',
    tag: ['Support'],
    gate: tenantGate,
    prefix: `Izin: \`${SUPPORT_PERMISSION}\`. `,
    scopeOf: async (request) => ({ origin: 'school', schoolId: ctxOf(request).schoolId }),
    links,
  });

  app.post(
    '/v1/support/tickets',
    {
      onRequest: tenantGate,
      schema: {
        tags: ['Support'],
        summary: 'Buat laporan ke tim platform',
        description:
          `Izin: \`${SUPPORT_PERMISSION}\`. Admin sekolah melaporkan masalah ke tim Edusync. Informasi sekolah ` +
          '(nama, paket, peran), halaman, dan peramban dikirim otomatis sebagai konteks. Admin platform diberi tahu lewat ' +
          'email dan menu konsol. Maksimal 10 laporan per pengguna per jam (429 `rate_limited`). Tanpa lampiran pada versi ini.',
        body: baseCreate,
        response: { 201: ticketDetail, 429: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = ctxOf(request);
      const actor = actorOf(request);
      const b = request.body;
      const ticket = await db.transaction((tx) =>
        createTicket(tx, links, {
          scope: { origin: 'school', schoolId: ctx.schoolId },
          schoolId: ctx.schoolId,
          actor,
          subject: b.subject,
          category: b.category,
          priority: b.priority,
          body: b.body,
          page: b.page ?? null,
          userAgent: request.headers['user-agent'] ?? null,
          roles: ctx.roles,
        }),
      );
      const { ticket: t, messages } = await db.transaction((tx) =>
        readScoped(tx, { origin: 'school', schoolId: ctx.schoolId }, ticket.id),
      );
      return reply.code(201).send(toDetail(t, messages, actor.id));
    },
  );

  /* ----- Portal pemilik yayasan (tanpa sekolah) ----- */

  const ownedIds = async (userId: string) =>
    (
      await db
        .select({ id: foundationOwner.foundationId })
        .from(foundationOwner)
        .where(eq(foundationOwner.userId, userId))
    ).map((r) => r.id);

  registerReporterRoutes(instance, {
    base: '/v1/account/support',
    tag: ['Support'],
    gate: [requireUser],
    prefix: 'Pemilik yayasan. ',
    scopeOf: async (request) => ({ origin: 'owner', foundationIds: await ownedIds(actorOf(request).id) }),
    links,
  });

  app.post(
    '/v1/account/support/tickets',
    {
      onRequest: [requireUser],
      schema: {
        tags: ['Support'],
        summary: 'Buat laporan dari portal pemilik',
        description:
          'Pemilik yayasan melaporkan masalah ke tim Edusync atas nama yayasannya (opsional merujuk satu unit). ' +
          '404 `not_found` bila yayasan/unit bukan miliknya. Maksimal 10 laporan per pengguna per jam.',
        body: ownerCreate,
        response: { 201: ticketDetail, 404: errorSchema, 429: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const actor = actorOf(request);
      const b = request.body;
      const owned = await ownedIds(actor.id);
      if (!owned.includes(b.foundationId)) throw new HttpError(404, 'not_found', 'Yayasan tidak ditemukan.');
      if (b.schoolId) {
        const [s] = await db
          .select({ id: school.id })
          .from(school)
          .where(and(eq(school.id, b.schoolId), eq(school.foundationId, b.foundationId)));
        if (!s) throw new HttpError(404, 'not_found', 'Unit tidak ditemukan.');
      }
      const scope: Scope = { origin: 'owner', foundationIds: owned };
      const ticket = await db.transaction((tx) =>
        createTicket(tx, links, {
          scope,
          foundationId: b.foundationId,
          schoolId: b.schoolId ?? null,
          actor,
          subject: b.subject,
          category: b.category,
          priority: b.priority,
          body: b.body,
          page: b.page ?? null,
          userAgent: request.headers['user-agent'] ?? null,
          roles: ['owner'],
        }),
      );
      const { ticket: t, messages } = await db.transaction((tx) => readScoped(tx, scope, ticket.id));
      return reply.code(201).send(toDetail(t, messages, actor.id));
    },
  );
}
