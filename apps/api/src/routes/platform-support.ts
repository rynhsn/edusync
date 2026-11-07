import {
  and,
  desc,
  eq,
  foundation,
  ilike,
  isNull,
  or,
  platformStaff,
  school,
  sql,
  supportMessage,
  supportTicket,
  user,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Env } from '../env';
import { errorSchema, HttpError } from '../http-error';
import { requireStaff } from '../identity/guards';
import { makeLinks, patchAsStaff, platformUnreadCount, replyAsStaff, STATUSES } from '../support-lib';
import { categorySchema, prioritySchema, statusSchema } from './support';

const tag = ['Platform'];
const iso = z.iso.datetime();
const guarded = { 401: errorSchema, 403: errorSchema };
const idParam = z.object({ id: z.uuid() });

const row = z.object({
  id: z.uuid(),
  ticketNo: z.string(),
  subject: z.string(),
  origin: z.enum(['school', 'owner']),
  schoolName: z.string().nullable(),
  foundationName: z.string().nullable(),
  creatorName: z.string(),
  category: categorySchema,
  priority: prioritySchema,
  status: statusSchema,
  assignedStaffId: z.string().nullable(),
  assignedStaffName: z.string().nullable(),
  lastMessageAt: iso,
  lastMessageBySide: z.enum(['school', 'platform']),
  unread: z.boolean().describe('Ada aktivitas pelapor yang belum dibuka staf'),
  createdAt: iso,
});

const detail = row.extend({
  creatorEmail: z.string(),
  schoolId: z.uuid().nullable(),
  foundationId: z.uuid().nullable(),
  context: z.record(z.string(), z.unknown()),
  resolvedAt: iso.nullable(),
  closedAt: iso.nullable(),
  messages: z.array(
    z.object({
      id: z.uuid(),
      authorName: z.string(),
      authorSide: z.enum(['school', 'platform']),
      body: z.string(),
      internal: z.boolean(),
      createdAt: iso,
    }),
  ),
});

const listQuery = z.object({
  status: statusSchema.optional(),
  category: categorySchema.optional(),
  priority: prioritySchema.optional(),
  schoolId: z.uuid().optional(),
  assignee: z.string().min(1).max(100).optional().describe('id staf, `me`, atau `none` (belum ditugaskan)'),
  unread: z.enum(['true']).optional().describe('Hanya yang ada aktivitas pelapor belum dibuka'),
  q: z.string().trim().max(100).optional().describe('Cari pada judul atau kode laporan'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function platformSupportRoutes(instance: FastifyInstance, options: { env: Env }) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const db = app.platformDb;
  const links = makeLinks(options.env);

  const assignee = db
    .select({ id: user.id, name: user.name })
    .from(platformStaff)
    .innerJoin(user, eq(user.id, platformStaff.userId))
    .as('assignee');

  const baseSelect = () =>
    db
      .select({
        t: supportTicket,
        schoolName: school.name,
        foundationName: foundation.name,
        assignedStaffName: assignee.name,
      })
      .from(supportTicket)
      .leftJoin(school, eq(school.id, supportTicket.schoolId))
      .leftJoin(foundation, eq(foundation.id, supportTicket.foundationId))
      .leftJoin(assignee, eq(assignee.id, supportTicket.assignedStaffId));

  type Joined = Awaited<ReturnType<typeof baseSelect>>[number];

  const toRow = (r: Joined) => ({
    id: r.t.id,
    ticketNo: r.t.ticketNo,
    subject: r.t.subject,
    origin: r.t.origin,
    // Laporan sekolah: yayasan diturunkan dari konteks bila kolomnya kosong.
    schoolName: r.schoolName,
    foundationName: r.foundationName ?? ((r.t.context.foundationName as string | null | undefined) || null),
    creatorName: r.t.creatorName,
    category: r.t.category,
    priority: r.t.priority,
    status: r.t.status,
    assignedStaffId: r.t.assignedStaffId,
    assignedStaffName: r.assignedStaffName,
    lastMessageAt: r.t.lastMessageAt.toISOString(),
    lastMessageBySide: r.t.lastMessageBySide,
    unread: r.t.platformUnread,
    createdAt: r.t.createdAt.toISOString(),
  });

  async function loadDetail(id: string) {
    const [r] = await baseSelect().where(eq(supportTicket.id, id));
    if (!r) throw new HttpError(404, 'not_found', 'Laporan tidak ditemukan.');
    const messages = await db
      .select()
      .from(supportMessage)
      .where(eq(supportMessage.ticketId, id))
      .orderBy(supportMessage.createdAt, supportMessage.id);
    return {
      ...toRow(r),
      creatorEmail: r.t.creatorEmail,
      schoolId: r.t.schoolId,
      foundationId: r.t.foundationId,
      context: r.t.context,
      resolvedAt: r.t.resolvedAt?.toISOString() ?? null,
      closedAt: r.t.closedAt?.toISOString() ?? null,
      messages: messages.map((m) => ({
        id: m.id,
        authorName: m.authorName,
        authorSide: m.authorSide,
        body: m.body,
        internal: m.internal,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  app.get(
    '/v1/platform/support/tickets',
    {
      onRequest: [requireStaff('read_only')],
      schema: {
        tags: tag,
        summary: 'Daftar laporan dari sekolah dan pemilik',
        description:
          'Staf platform (baca). Urut aktivitas terbaru (balasan publik; catatan internal tidak menggeser urutan). ' +
          'Filter: `status`, `category`, `priority`, `schoolId`, `assignee` (id staf, `me`, `none`), `unread`, dan `q` ' +
          '(judul atau kode). `counts` menghitung semua laporan per status tanpa memedulikan filter.',
        querystring: listQuery,
        response: {
          200: z.object({
            tickets: z.array(row),
            counts: z.object({
              open: z.number().int(),
              in_progress: z.number().int(),
              waiting_reporter: z.number().int(),
              resolved: z.number().int(),
              closed: z.number().int(),
            }),
            total: z.number().int().describe('Jumlah laporan yang cocok dengan filter (sebelum limit)'),
          }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const f = request.query;
      const me = request.userId as string;
      const q = f.q ? `%${likeEscape(f.q)}%` : null;
      const where = and(
        f.status ? eq(supportTicket.status, f.status) : undefined,
        f.category ? eq(supportTicket.category, f.category) : undefined,
        f.priority ? eq(supportTicket.priority, f.priority) : undefined,
        f.schoolId ? eq(supportTicket.schoolId, f.schoolId) : undefined,
        f.assignee === 'none'
          ? isNull(supportTicket.assignedStaffId)
          : f.assignee
            ? eq(supportTicket.assignedStaffId, f.assignee === 'me' ? me : f.assignee)
            : undefined,
        f.unread ? eq(supportTicket.platformUnread, true) : undefined,
        q ? or(ilike(supportTicket.subject, q), ilike(supportTicket.ticketNo, q)) : undefined,
      );
      const [rows, [total], statusRows] = await Promise.all([
        baseSelect().where(where).orderBy(desc(supportTicket.lastMessageAt)).limit(f.limit).offset(f.offset),
        db.select({ n: sql<number>`count(*)::int` }).from(supportTicket).where(where),
        db
          .select({ status: supportTicket.status, n: sql<number>`count(*)::int` })
          .from(supportTicket)
          .groupBy(supportTicket.status),
      ]);
      const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<
        (typeof STATUSES)[number],
        number
      >;
      for (const s of statusRows) counts[s.status] = s.n;
      return { tickets: rows.map(toRow), counts, total: total?.n ?? 0 };
    },
  );

  app.get(
    '/v1/platform/support/unread-count',
    {
      onRequest: [requireStaff('read_only')],
      schema: {
        tags: tag,
        summary: 'Jumlah laporan dengan aktivitas pelapor yang belum dibuka',
        description:
          'Staf platform (baca). Dipakai lencana menu Laporan di konsol; web memanggilnya berkala.',
        response: { 200: z.object({ count: z.number().int() }), ...guarded },
      },
    },
    async () => ({ count: await platformUnreadCount(db) }),
  );

  app.get(
    '/v1/platform/support/tickets/:id',
    {
      onRequest: [requireStaff('read_only')],
      schema: {
        tags: tag,
        summary: 'Percakapan lengkap satu laporan',
        description:
          'Staf platform (baca). Termasuk catatan internal dan konteks otomatis (sekolah, paket, peran, halaman, peramban). ' +
          'Membuka laporan menandai aktivitas pelapor sebagai terbaca untuk semua staf. 404 bila tidak ada.',
        params: idParam,
        response: { 200: detail, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const { id } = request.params;
      await db
        .update(supportTicket)
        .set({ platformUnread: false })
        .where(and(eq(supportTicket.id, id), eq(supportTicket.platformUnread, true)));
      return loadDetail(id);
    },
  );

  const actorOf = (request: { userId?: string; authUser?: { name: string } }) => ({
    id: request.userId as string,
    name: request.authUser?.name ?? 'Tim Edusync',
  });

  app.post(
    '/v1/platform/support/tickets/:id/messages',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Balas laporan atau tambah catatan internal',
        description:
          'Staf platform (admin). `internal: false` (bawaan) adalah balasan publik: pelapor diberi tahu lewat menu dan ' +
          'email (pembuat laporan dan anggota sekolah lain yang berhak, maksimal 5 penerima), dan laporan berstatus ' +
          'terbuka menjadi diproses. Laporan ditutup tidak bisa dibalas publik (409 `ticket_closed`). ' +
          '`internal: true` adalah catatan khusus staf: tidak tampil ke sekolah dan tidak mengirim email atau lencana.',
        params: idParam,
        body: z.object({ body: z.string().trim().min(1).max(5000), internal: z.boolean().default(false) }),
        response: { 201: detail, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      await db.transaction((tx) =>
        replyAsStaff(tx, links, id, actorOf(request), request.body.body, request.body.internal),
      );
      return reply.code(201).send(await loadDetail(id));
    },
  );

  app.patch(
    '/v1/platform/support/tickets/:id',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Ubah status, prioritas, kategori, atau petugas laporan',
        description:
          'Staf platform (admin). Semua bidang opsional; `assignedStaffId: null` melepas penugasan (petugas harus staf ' +
          'platform, 400 `invalid_assignee`). Mengubah status ke `resolved` atau `closed` memberi tahu pembuat laporan ' +
          'lewat menu dan email. Setiap perubahan dicatat di audit (`support.update`).',
        params: idParam,
        body: z.object({
          status: statusSchema.optional(),
          priority: prioritySchema.optional(),
          category: categorySchema.optional(),
          assignedStaffId: z.string().min(1).max(100).nullable().optional(),
        }),
        response: { 200: detail, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const { id } = request.params;
      const body = request.body;
      await db.transaction((tx) =>
        patchAsStaff(tx, links, id, actorOf(request), {
          ...(body.status ? { status: body.status } : {}),
          ...(body.priority ? { priority: body.priority } : {}),
          ...(body.category ? { category: body.category } : {}),
          ...(body.assignedStaffId !== undefined ? { assignedStaffId: body.assignedStaffId } : {}),
        }),
      );
      return loadDetail(id);
    },
  );
}
