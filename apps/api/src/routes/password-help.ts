import { createHash, randomBytes } from 'node:crypto';
import {
  and,
  auditLog,
  count,
  type Db,
  desc,
  eq,
  foundationOwner,
  gt,
  guardian,
  inArray,
  isNull,
  max,
  member,
  memberRole,
  or,
  passwordResetLink,
  passwordResetRequest,
  platformStaff,
  portalLink,
  role,
  rolePermission,
  school,
  session,
  sql,
  student,
  teacher,
  user,
  withTenant,
} from '@edusync/db';
import { enqueue, QUEUES } from '@edusync/jobs';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Env } from '../env';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';
import { schoolOrigin } from '../origins';
import { normalizePhone } from './guardians';
import { audit, guarded, idParams, ok, schoolHeader } from './helpers';

export const RESET_LINK_HOURS = 24;
const OPEN_STATUSES = ['new', 'in_progress'] as const;
const STATUSES = ['new', 'in_progress', 'done', 'rejected'] as const;
const iso = z.iso.datetime({ offset: true });
const tagAdmin = ['Reset sandi (admin)'];
const tagPublic = ['Reset sandi (publik)'];
const gate = [requirePermission('account:reset')];

export const hashResetToken = (token: string) => createHash('sha256').update(token).digest('hex');
const invalidLink = () => new HttpError(410, 'reset_link_invalid', 'Tautan ini sudah tidak berlaku.');

/** "budi@sekolah.sch.id" -> "bu***@sekolah.sch.id". */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

/** "6281234567890" -> "6281******90". */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  if (phone.length <= 6) return '***';
  return `${phone.slice(0, 4)}${'*'.repeat(phone.length - 6)}${phone.slice(-2)}`;
}

/** "Budi Santoso" -> "Bu*** Sa***": hanya cukup untuk dikenali pemiliknya. */
export function maskName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${[...w].slice(0, 2).join('')}***`)
    .join(' ');
}

/** Yang disimpan dari isian identitas: NIK (16 digit) hanya dalam bentuk tersamar, tidak pernah utuh. */
export function storableIdentifier(raw: string | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  const digits = value.replace(/[\s.-]/g, '');
  if (/^\d{16}$/.test(digits)) return `${digits.slice(0, 4)}${'*'.repeat(10)}${digits.slice(-2)}`;
  return value.slice(0, 120);
}

type Block = { status: number; code: string; message: string };

interface TargetInfo {
  userId: string;
  memberId: string;
  name: string;
  email: string;
  phone: string | null;
  roles: string[];
  lastLoginAt: Date | null;
}

/**
 * Menilai apakah sebuah akun boleh direset admin sekolah ini. Dibaca lewat pool platform karena keanggotaan di
 * sekolah lain, staf platform, dan pemilik yayasan tidak terlihat dari konteks tenant. Akun yang berhak mengelola
 * (admin sekolah, atau peran yang memegang member:manage / role:manage / account:reset) tidak pernah direset lewat
 * jalur ini, sehingga tidak ada kenaikan hak lewat reset sandi.
 */
export async function evaluateTarget(
  db: Db,
  schoolId: string,
  userId: string,
  actorId: string | null,
): Promise<{ info: TargetInfo | null; block: Block | null }> {
  const [u] = await db
    .select({ id: user.id, name: user.name, email: user.email, phone: user.phone })
    .from(user)
    .where(eq(user.id, userId));
  const memberships = await db
    .select({ id: member.id, schoolId: member.schoolId, status: member.status })
    .from(member)
    .where(eq(member.userId, userId));
  const here = memberships.find((m) => m.schoolId === schoolId);
  if (!u || !here) {
    return {
      info: null,
      block: { status: 404, code: 'not_found', message: 'Akun ini bukan anggota sekolah ini.' },
    };
  }
  const rows = await db
    .select({ key: role.key, permission: rolePermission.permission })
    .from(memberRole)
    .innerJoin(role, eq(role.id, memberRole.roleId))
    .leftJoin(rolePermission, eq(rolePermission.roleId, role.id))
    .where(eq(memberRole.memberId, here.id));
  const roles = [...new Set(rows.map((r) => r.key))];
  const perms = new Set(rows.map((r) => r.permission));
  const [staff] = await db
    .select({ userId: platformStaff.userId })
    .from(platformStaff)
    .where(eq(platformStaff.userId, userId));
  const [owner] = await db
    .select({ userId: foundationOwner.userId })
    .from(foundationOwner)
    .where(eq(foundationOwner.userId, userId))
    .limit(1);
  const [login] = await db
    .select({ at: max(session.createdAt) })
    .from(session)
    .where(eq(session.userId, userId));
  const info: TargetInfo = {
    userId,
    memberId: here.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    roles,
    lastLoginAt: login?.at ?? null,
  };

  const privileged =
    roles.includes('school_admin') ||
    perms.has('role:manage') ||
    perms.has('member:manage') ||
    perms.has('account:reset');
  let block: Block | null = null;
  if (staff || owner || privileged) {
    block = {
      status: 403,
      code: 'protected_account',
      message: 'Akun pengelola tidak dapat direset lewat jalur ini. Gunakan pemulihan akun biasa.',
    };
  } else if (memberships.some((m) => m.schoolId !== schoolId)) {
    block = {
      status: 409,
      code: 'multi_school_account',
      message:
        'Akun ini terdaftar di lebih dari satu sekolah, jadi tidak dapat direset oleh satu sekolah saja.',
    };
  } else if (userId === actorId) {
    block = { status: 409, code: 'self_reset', message: 'Anda tidak dapat mereset akun Anda sendiri.' };
  } else if (here.status !== 'active') {
    block = { status: 409, code: 'member_disabled', message: 'Anggota ini sedang dinonaktifkan.' };
  }
  return { info, block };
}

/** Pencocokan terbaik-usaha pelapor ke akun sekolah ini; hanya petunjuk untuk admin, tidak pernah dibuka ke pelapor. */
async function matchUser(
  db: Db,
  schoolId: string,
  input: { identifier: string; name: string; phone: string },
): Promise<string | null> {
  const ids = (rows: { userId: string }[]) => [...new Set(rows.map((r) => r.userId))];
  const members = () =>
    db.select({ userId: user.id }).from(member).innerJoin(user, eq(user.id, member.userId));
  const lower = <T extends object>(col: T) => sql`lower(${col})`;
  const steps: (() => Promise<string[]>)[] = [];
  const raw = input.identifier.trim();

  if (raw.includes('@')) {
    steps.push(async () =>
      ids(
        await db
          .select({ userId: user.id })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .where(and(eq(member.schoolId, schoolId), eq(lower(user.email), raw.toLowerCase()))),
      ),
    );
  } else if (raw) {
    const digits = raw.replace(/[\s.-]/g, '');
    steps.push(async () => {
      const viaStudent = await db
        .select({ userId: member.userId })
        .from(portalLink)
        .innerJoin(member, eq(member.id, portalLink.memberId))
        .innerJoin(student, eq(student.id, portalLink.studentId))
        .where(
          and(
            eq(portalLink.schoolId, schoolId),
            or(eq(student.nis, raw), eq(student.nisn, digits), eq(student.nik, digits)),
          ),
        );
      const viaTeacher = await db
        .select({ userId: member.userId })
        .from(teacher)
        .innerJoin(member, eq(member.id, teacher.memberId))
        .where(and(eq(teacher.schoolId, schoolId), eq(teacher.nip, raw)));
      return ids([...viaStudent, ...viaTeacher]);
    });
  }

  steps.push(async () => {
    const direct = await members().where(and(eq(member.schoolId, schoolId), eq(user.phone, input.phone)));
    const viaGuardian = await db
      .select({ userId: member.userId })
      .from(portalLink)
      .innerJoin(member, eq(member.id, portalLink.memberId))
      .innerJoin(guardian, eq(guardian.id, portalLink.guardianId))
      .where(and(eq(portalLink.schoolId, schoolId), eq(guardian.phone, input.phone)));
    return ids([...direct, ...viaGuardian]);
  });

  steps.push(async () => {
    const name = input.name.trim().toLowerCase();
    const direct = await members().where(and(eq(member.schoolId, schoolId), eq(lower(user.name), name)));
    const viaGuardian = await db
      .select({ userId: member.userId })
      .from(portalLink)
      .innerJoin(member, eq(member.id, portalLink.memberId))
      .innerJoin(guardian, eq(guardian.id, portalLink.guardianId))
      .where(and(eq(portalLink.schoolId, schoolId), eq(lower(guardian.name), name)));
    const viaTeacher = await db
      .select({ userId: member.userId })
      .from(teacher)
      .innerJoin(member, eq(member.id, teacher.memberId))
      .where(and(eq(teacher.schoolId, schoolId), eq(lower(teacher.name), name)));
    return ids([...direct, ...viaGuardian, ...viaTeacher]);
  });

  for (const step of steps) {
    const found = await step();
    if (found.length === 1) return found[0] ?? null;
  }
  return null;
}

type LinkState = 'active' | 'used' | 'revoked' | 'expired';
const linkState = (l: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date }): LinkState =>
  l.usedAt ? 'used' : l.revokedAt ? 'revoked' : l.expiresAt <= new Date() ? 'expired' : 'active';

const matchedSchema = z.object({
  userId: z.string(),
  name: z.string(),
  emailMasked: z.string(),
  phoneMasked: z.string().nullable(),
  roles: z.array(z.string()),
  lastLoginAt: iso.nullable(),
  resettable: z.boolean(),
  blockedCode: z.string().nullable(),
});

const linkSummarySchema = z.object({
  id: z.uuid(),
  state: z.enum(['active', 'used', 'revoked', 'expired']),
  expiresAt: iso,
  channelSent: z.enum(['email', 'whatsapp']).nullable(),
  createdAt: iso,
});

const requestSchema = z.object({
  id: z.uuid(),
  status: z.enum(STATUSES),
  claimedName: z.string(),
  claimedInfo: z.string().nullable(),
  contactPhone: z.string(),
  identifierGiven: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: iso,
  handledAt: iso.nullable(),
  matched: matchedSchema.nullable(),
  links: z.array(linkSummarySchema),
});

const createdLinkSchema = z.object({
  id: z.uuid(),
  url: z.string().describe('Tautan reset lengkap; hanya ditampilkan sekali saat dibuat'),
  token: z.string().describe('Token mentah; dibutuhkan lagi untuk mengirim tautan lewat /send'),
  expiresAt: iso,
  user: z.object({
    userId: z.string(),
    name: z.string(),
    emailMasked: z.string(),
    phoneMasked: z.string().nullable(),
  }),
  contactPhone: z.string().nullable().describe('Nomor kontak pelapor (bila dari laporan) atau nomor akun'),
  whatsappUrl: z
    .string()
    .nullable()
    .describe('Tautan wa.me berisi pesan siap kirim, atau null bila tak ada nomor'),
});

export async function passwordHelpRoutes(instance: FastifyInstance, options: { env: Env }) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const scheme = new URL(options.env.AUTH_URL).protocol as 'http:' | 'https:';

  /* ---------- Publik: laporan dari pelapor ---------- */

  async function slugFromHost(rawHost: string | undefined): Promise<string | null> {
    const host = (rawHost ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
    if (!host) return null;
    const suffix = `.${options.env.APP_DOMAIN.toLowerCase()}`;
    if (host.endsWith(suffix)) return host.slice(0, -suffix.length) || null;
    return app.hosts.resolve(host.replace(/:\d+$/, ''));
  }

  app.post(
    '/v1/public/password-help',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
      schema: {
        tags: tagPublic,
        summary: 'Lapor lupa kata sandi ke admin sekolah',
        description:
          'Publik, tanpa login. Untuk orang yang tidak dapat menerima email maupun OTP WhatsApp. Sekolah ditentukan ' +
          'dari `slug` atau dari host. Selalu menjawab 202 yang sama, baik akun cocok, tidak cocok, sekolah tidak ' +
          'dikenal, laporan ganda, maupun jebakan bot (honeypot `website` terisi), sehingga keberadaan akun tidak ' +
          'bisa ditebak. Satu laporan terbuka per nomor per sekolah per 24 jam; nomor yang melapor terlalu sering ' +
          'diabaikan diam-diam. Batas 5 laporan per jam per IP (429). NIK pada `identifier` hanya disimpan tersamar.',
        body: z.object({
          slug: z.string().trim().min(1).max(63).optional(),
          claimedName: z.string().trim().min(2).max(120),
          claimedInfo: z.string().trim().max(500).optional(),
          contactPhone: z.string().trim().min(5).max(30),
          identifier: z.string().trim().max(120).optional(),
          website: z.string().max(200).optional().describe('Jebakan bot: harus kosong'),
        }),
        response: { 202: z.object({ ok: z.literal(true) }), 400: errorSchema, 429: errorSchema },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const neutral = () => reply.code(202).send({ ok: true as const });
      const phone = normalizePhone(body.contactPhone);
      if (!phone) throw new HttpError(400, 'invalid_phone', 'Nomor telepon tidak valid.');
      if (body.website) return neutral();

      const db = request.server.platformDb;
      const slug =
        body.slug ??
        (await slugFromHost(
          (request.headers['x-forwarded-host'] as string | undefined) ?? request.headers.host,
        ));
      if (!slug) return neutral();
      const [target] = await db
        .select({ id: school.id, status: school.status })
        .from(school)
        .where(eq(school.slug, slug));
      if (target?.status !== 'active') return neutral();

      const since24 = new Date(Date.now() - 86_400_000);
      const [open] = await db
        .select({ id: passwordResetRequest.id })
        .from(passwordResetRequest)
        .where(
          and(
            eq(passwordResetRequest.schoolId, target.id),
            eq(passwordResetRequest.contactPhone, phone),
            inArray(passwordResetRequest.status, [...OPEN_STATUSES]),
            gt(passwordResetRequest.createdAt, since24),
          ),
        )
        .limit(1);
      if (open) return neutral();
      // Satu nomor tidak boleh membanjiri banyak sekolah: paling banyak 5 laporan per jam di seluruh platform.
      const [recent] = await db
        .select({ n: count() })
        .from(passwordResetRequest)
        .where(
          and(
            eq(passwordResetRequest.contactPhone, phone),
            gt(passwordResetRequest.createdAt, new Date(Date.now() - 3_600_000)),
          ),
        );
      if ((recent?.n ?? 0) >= 5) return neutral();

      const matchedUserId = await matchUser(db, target.id, {
        identifier: body.identifier ?? '',
        name: body.claimedName,
        phone,
      });
      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(passwordResetRequest)
          .values({
            schoolId: target.id,
            identifierGiven: storableIdentifier(body.identifier),
            claimedName: body.claimedName,
            claimedInfo: body.claimedInfo || null,
            contactPhone: phone,
            matchedUserId,
          })
          .returning({ id: passwordResetRequest.id });
        await tx.insert(auditLog).values({
          schoolId: target.id,
          actorId: null,
          action: 'password_help.request',
          entityType: 'password_reset_request',
          entityId: row?.id ?? null,
          details: { matched: matchedUserId !== null },
        });
      });
      return neutral();
    },
  );

  /* ---------- Admin: daftar dan penanganan laporan ---------- */

  app.get(
    '/v1/password-help/requests',
    {
      onRequest: gate,
      schema: {
        tags: tagAdmin,
        summary: 'Daftar laporan lupa kata sandi',
        description:
          'Izin: `account:reset`. Terbaru dulu, paling banyak 200. `matched` adalah petunjuk pencocokan otomatis ' +
          '(email dan nomor tersamar, peran, login terakhir); admin wajib memastikan identitas pelapor sendiri.',
        headers: schoolHeader,
        querystring: z.object({ status: z.enum(STATUSES).optional() }),
        response: {
          200: z.object({
            items: z.array(requestSchema),
            counts: z.object({
              new: z.number(),
              in_progress: z.number(),
              done: z.number(),
              rejected: z.number(),
            }),
          }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const platform = request.server.platformDb;
      const { rows, links, grouped } = await withTenant(
        request.server.tenantDb,
        [ctx.schoolId],
        async (tx) => {
          const rows = await tx
            .select()
            .from(passwordResetRequest)
            .where(request.query.status ? eq(passwordResetRequest.status, request.query.status) : undefined)
            .orderBy(desc(passwordResetRequest.createdAt))
            .limit(200);
          const links = rows.length
            ? await tx
                .select()
                .from(passwordResetLink)
                .where(
                  inArray(
                    passwordResetLink.requestId,
                    rows.map((r) => r.id),
                  ),
                )
                .orderBy(desc(passwordResetLink.createdAt))
            : [];
          const grouped = await tx
            .select({ status: passwordResetRequest.status, n: count() })
            .from(passwordResetRequest)
            .groupBy(passwordResetRequest.status);
          return { rows, links, grouped };
        },
      );

      const matchedIds = [...new Set(rows.map((r) => r.matchedUserId).filter((v): v is string => !!v))];
      const evaluated = new Map<string, Awaited<ReturnType<typeof evaluateTarget>>>();
      for (const uid of matchedIds)
        evaluated.set(uid, await evaluateTarget(platform, ctx.schoolId, uid, ctx.userId));

      const counts = { new: 0, in_progress: 0, done: 0, rejected: 0 };
      for (const g of grouped) counts[g.status] = g.n;
      return {
        counts,
        items: rows.map((r) => {
          const ev = r.matchedUserId ? evaluated.get(r.matchedUserId) : undefined;
          return {
            id: r.id,
            status: r.status,
            claimedName: r.claimedName,
            claimedInfo: r.claimedInfo,
            contactPhone: r.contactPhone,
            identifierGiven: r.identifierGiven,
            note: r.note,
            createdAt: r.createdAt.toISOString(),
            handledAt: r.handledAt?.toISOString() ?? null,
            matched: ev?.info
              ? {
                  userId: ev.info.userId,
                  name: ev.info.name,
                  emailMasked: maskEmail(ev.info.email),
                  phoneMasked: maskPhone(ev.info.phone),
                  roles: ev.info.roles,
                  lastLoginAt: ev.info.lastLoginAt?.toISOString() ?? null,
                  resettable: ev.block === null,
                  blockedCode: ev.block?.code ?? null,
                }
              : null,
            links: links
              .filter((l) => l.requestId === r.id)
              .slice(0, 3)
              .map((l) => ({
                id: l.id,
                state: linkState(l),
                expiresAt: l.expiresAt.toISOString(),
                channelSent: l.channelSent,
                createdAt: l.createdAt.toISOString(),
              })),
          };
        }),
      };
    },
  );

  app.patch(
    '/v1/password-help/requests/:id',
    {
      onRequest: gate,
      schema: {
        tags: tagAdmin,
        summary: 'Ubah status atau catatan laporan',
        description:
          'Izin: `account:reset`. Status `rejected` menolak laporan (tautan aktif untuk laporan itu ikut dicabut). ' +
          'Catatan paling banyak 500 karakter. Ditulis ke audit. 404 `not_found`.',
        headers: schoolHeader,
        params: idParams,
        body: z
          .object({
            status: z.enum(STATUSES).optional(),
            note: z.string().trim().max(500).nullable().optional(),
          })
          .refine((b) => b.status !== undefined || b.note !== undefined, {
            message: 'Tidak ada yang diubah.',
          }),
        response: {
          200: z.object({ id: z.uuid(), status: z.enum(STATUSES), note: z.string().nullable() }),
          400: errorSchema,
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const [row] = await tx
          .update(passwordResetRequest)
          .set({
            ...(request.body.status ? { status: request.body.status } : {}),
            ...(request.body.note !== undefined ? { note: request.body.note || null } : {}),
            handledBy: ctx.userId,
            handledAt: new Date(),
          })
          .where(eq(passwordResetRequest.id, request.params.id))
          .returning();
        if (!row) throw new HttpError(404, 'not_found', 'Laporan tidak ditemukan.');
        if (request.body.status === 'rejected') {
          await tx
            .update(passwordResetLink)
            .set({ revokedAt: new Date() })
            .where(
              and(
                eq(passwordResetLink.requestId, row.id),
                isNull(passwordResetLink.usedAt),
                isNull(passwordResetLink.revokedAt),
              ),
            );
        }
        await audit(tx, ctx, 'password_help.update', 'password_reset_request', row.id, {
          status: request.body.status ?? null,
          noteChanged: request.body.note !== undefined,
        });
        return { id: row.id, status: row.status, note: row.note };
      });
    },
  );

  /* ---------- Admin: membuat, mengirim, dan mencabut tautan ---------- */

  const linkUrl = (slug: string, token: string) =>
    `${schoolOrigin(scheme, options.env.APP_DOMAIN, slug)}/reset/${token}`;

  const waText = (schoolName: string, url: string) =>
    `Halo, ini tautan dari admin ${schoolName} untuk mengatur ulang kata sandi Edusync Anda: ${url}\n\n` +
    `Berlaku ${RESET_LINK_HOURS} jam dan hanya bisa dipakai sekali. Jangan bagikan tautan ini kepada siapa pun.`;

  const waUrl = (phone: string | null, text: string) =>
    `https://wa.me/${phone ?? ''}?text=${encodeURIComponent(text)}`;

  async function createLink(
    server: FastifyInstance,
    ctx: TenantContext,
    input: { userId: string; requestId: string | null },
  ) {
    const platform = server.platformDb;
    const { info, block } = await evaluateTarget(platform, ctx.schoolId, input.userId, ctx.userId);
    if (block || !info) {
      const b = block as Block;
      throw new HttpError(b.status, b.code, b.message);
    }
    const [target] = await platform
      .select({ slug: school.slug, name: school.name })
      .from(school)
      .where(eq(school.id, ctx.schoolId));
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + RESET_LINK_HOURS * 3_600_000);
    const link = await withTenant(server.tenantDb, [ctx.schoolId], async (tx) => {
      let contactPhone: string | null = info.phone;
      if (input.requestId) {
        const [req] = await tx
          .select({ id: passwordResetRequest.id, phone: passwordResetRequest.contactPhone })
          .from(passwordResetRequest)
          .where(eq(passwordResetRequest.id, input.requestId));
        if (!req) throw new HttpError(404, 'not_found', 'Laporan tidak ditemukan.');
        contactPhone = req.phone;
      }
      // Membuat tautan baru mencabut tautan lama yang belum dipakai untuk akun yang sama.
      const revoked = await tx
        .update(passwordResetLink)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(passwordResetLink.userId, info.userId),
            isNull(passwordResetLink.usedAt),
            isNull(passwordResetLink.revokedAt),
          ),
        )
        .returning({ id: passwordResetLink.id });
      const [row] = await tx
        .insert(passwordResetLink)
        .values({
          schoolId: ctx.schoolId,
          requestId: input.requestId,
          userId: info.userId,
          tokenHash: hashResetToken(token),
          createdBy: ctx.userId,
          expiresAt,
        })
        .returning();
      if (input.requestId) {
        await tx
          .update(passwordResetRequest)
          .set({ status: 'in_progress', handledBy: ctx.userId, handledAt: new Date() })
          .where(and(eq(passwordResetRequest.id, input.requestId), eq(passwordResetRequest.status, 'new')));
      }
      await audit(tx, ctx, 'password_help.link_create', 'password_reset_link', row?.id as string, {
        targetUserId: info.userId,
        requestId: input.requestId,
        revokedOlder: revoked.length,
      });
      return { row: row as NonNullable<typeof row>, contactPhone };
    });
    const url = linkUrl(target?.slug ?? '', token);
    return {
      id: link.row.id,
      url,
      token,
      expiresAt: expiresAt.toISOString(),
      user: {
        userId: info.userId,
        name: info.name,
        emailMasked: maskEmail(info.email),
        phoneMasked: maskPhone(info.phone),
      },
      contactPhone: link.contactPhone,
      whatsappUrl: waUrl(link.contactPhone, waText(target?.name ?? 'sekolah', url)),
    };
  }

  const linkRate = { rateLimit: { max: 30, timeWindow: '1 minute' } };

  app.post(
    '/v1/password-help/requests/:id/link',
    {
      onRequest: gate,
      config: linkRate,
      schema: {
        tags: tagAdmin,
        summary: 'Buat tautan reset dari sebuah laporan',
        description:
          'Izin: `account:reset`. Akun sasaran: `userId` (anggota sekolah ini) atau akun yang dicocokkan otomatis. ' +
          `Tautan berlaku ${RESET_LINK_HOURS} jam, sekali pakai, terikat ke akun itu; tautan lama yang belum dipakai ` +
          'untuk akun yang sama dicabut. Tautan hanya ditampilkan sekali. Tidak boleh untuk akun yang punya ' +
          'keanggotaan di sekolah lain (409 `multi_school_account`), staf platform, pemilik yayasan, admin sekolah atau ' +
          'peran pengelola (403 `protected_account`), akun sendiri (409 `self_reset`), anggota nonaktif (409 ' +
          '`member_disabled`), atau laporan tanpa akun cocok (409 `no_match`). Ditulis ke audit tanpa token.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({ userId: z.string().min(1).max(100).optional() }),
        response: { 201: createdLinkSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const [req] = await withTenant(request.server.tenantDb, [ctx.schoolId], (tx) =>
        tx
          .select({ matchedUserId: passwordResetRequest.matchedUserId, status: passwordResetRequest.status })
          .from(passwordResetRequest)
          .where(eq(passwordResetRequest.id, request.params.id)),
      );
      if (!req) throw new HttpError(404, 'not_found', 'Laporan tidak ditemukan.');
      if (req.status === 'rejected') {
        throw new HttpError(409, 'conflict', 'Laporan ini sudah ditolak.');
      }
      const userId = request.body.userId ?? req.matchedUserId;
      if (!userId)
        throw new HttpError(409, 'no_match', 'Belum ada akun yang cocok. Pilih akun secara manual.');
      const created = await createLink(request.server, ctx, { userId, requestId: request.params.id });
      return reply.code(201).send(created);
    },
  );

  app.post(
    '/v1/password-help/links',
    {
      onRequest: gate,
      config: linkRate,
      schema: {
        tags: tagAdmin,
        summary: 'Buat tautan reset langsung untuk sebuah akun',
        description:
          'Izin: `account:reset`. Seperti tautan dari laporan tetapi tanpa laporan (mis. dari daftar anggota). ' +
          'Aturan pengaman dan masa berlaku sama. 404 `not_found` bila bukan anggota sekolah ini.',
        headers: schoolHeader,
        body: z.object({ userId: z.string().min(1).max(100) }),
        response: { 201: createdLinkSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const created = await createLink(request.server, ctx, { userId: request.body.userId, requestId: null });
      return reply.code(201).send(created);
    },
  );

  async function activeLink(server: FastifyInstance, ctx: TenantContext, id: string) {
    const [row] = await withTenant(server.tenantDb, [ctx.schoolId], (tx) =>
      tx.select().from(passwordResetLink).where(eq(passwordResetLink.id, id)),
    );
    if (!row) throw new HttpError(404, 'not_found', 'Tautan tidak ditemukan.');
    return row;
  }

  app.post(
    '/v1/password-help/links/:id/send',
    {
      onRequest: gate,
      config: linkRate,
      schema: {
        tags: tagAdmin,
        summary: 'Kirim tautan reset lewat email atau siapkan WhatsApp',
        description:
          'Izin: `account:reset`. Server tidak menyimpan token, jadi `token` dari saat tautan dibuat harus dikirim ' +
          'ulang dan harus cocok. `email` memasukkan email ke antrean pengiriman ke alamat akun. `whatsapp` ' +
          'mengembalikan tautan `wa.me` berisi pesan siap kirim untuk dibuka admin sendiri (tidak bergantung pada ' +
          'penyedia WhatsApp). 410 `reset_link_invalid` bila tautan sudah dipakai, dicabut, atau kedaluwarsa; 400 ' +
          '`validation` bila token tidak cocok. Ditulis ke audit tanpa token.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          channel: z.enum(['email', 'whatsapp']),
          token: z.string().min(20).max(100),
          phone: z.string().max(30).optional(),
        }),
        response: {
          200: z.object({
            channel: z.enum(['email', 'whatsapp']),
            sentTo: z.string().nullable(),
            whatsappUrl: z.string().nullable(),
          }),
          400: errorSchema,
          404: errorSchema,
          410: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const link = await activeLink(request.server, ctx, request.params.id);
      if (link.tokenHash !== hashResetToken(request.body.token)) {
        throw new HttpError(400, 'validation', 'Token tidak cocok dengan tautan ini.');
      }
      if (linkState(link) !== 'active') throw invalidLink();
      const platform = request.server.platformDb;
      const { info, block } = await evaluateTarget(platform, ctx.schoolId, link.userId, ctx.userId);
      if (!info || block) throw invalidLink();
      const [target] = await platform
        .select({ slug: school.slug, name: school.name })
        .from(school)
        .where(eq(school.id, ctx.schoolId));
      const url = linkUrl(target?.slug ?? '', request.body.token);
      const channel = request.body.channel;

      let phone: string | null = null;
      if (channel === 'whatsapp') {
        const given = request.body.phone ? normalizePhone(request.body.phone) : null;
        if (request.body.phone && !given)
          throw new HttpError(400, 'invalid_phone', 'Nomor telepon tidak valid.');
        const [req] = link.requestId
          ? await withTenant(request.server.tenantDb, [ctx.schoolId], (tx) =>
              tx
                .select({ phone: passwordResetRequest.contactPhone })
                .from(passwordResetRequest)
                .where(eq(passwordResetRequest.id, link.requestId as string)),
            )
          : [];
        phone = given ?? req?.phone ?? info.phone;
      }

      await withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        if (channel === 'email') {
          await enqueue(
            tx,
            QUEUES.emailSend,
            {
              to: info.email,
              subject: `Atur ulang kata sandi Edusync - ${target?.name ?? 'sekolah'}`,
              text:
                `Halo ${info.name},\n\nAdmin ${target?.name ?? 'sekolah'} membuatkan tautan untuk mengatur ulang kata sandi Anda:\n${url}\n\n` +
                `Berlaku ${RESET_LINK_HOURS} jam dan hanya bisa dipakai sekali. Jangan bagikan tautan ini kepada siapa pun.\n` +
                'Bila Anda tidak merasa meminta ini, abaikan email ini dan beri tahu admin sekolah.',
            },
            { schoolId: ctx.schoolId },
          );
        }
        await tx
          .update(passwordResetLink)
          .set({ channelSent: channel })
          .where(eq(passwordResetLink.id, link.id));
        await audit(tx, ctx, 'password_help.link_send', 'password_reset_link', link.id, { channel });
      });
      return {
        channel,
        sentTo: channel === 'email' ? maskEmail(info.email) : null,
        whatsappUrl: channel === 'whatsapp' ? waUrl(phone, waText(target?.name ?? 'sekolah', url)) : null,
      };
    },
  );

  app.delete(
    '/v1/password-help/links/:id',
    {
      onRequest: gate,
      schema: {
        tags: tagAdmin,
        summary: 'Cabut tautan reset',
        description:
          'Izin: `account:reset`. Tautan yang belum dipakai langsung tidak berlaku. 404 `not_found` bila tak ada atau ' +
          'sudah dipakai/dicabut. Ditulis ke audit.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const rows = await tx
          .update(passwordResetLink)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(passwordResetLink.id, request.params.id),
              isNull(passwordResetLink.usedAt),
              isNull(passwordResetLink.revokedAt),
            ),
          )
          .returning({ id: passwordResetLink.id });
        if (rows.length === 0) throw new HttpError(404, 'not_found', 'Tautan tidak ditemukan.');
        await audit(tx, ctx, 'password_help.link_revoke', 'password_reset_link', request.params.id);
      });
      return { ok: true as const };
    },
  );

  /* ---------- Publik: memakai tautan ---------- */

  const tokenParams = z.object({ token: z.string().min(20).max(100) });

  async function openLink(token: string) {
    const db = app.platformDb;
    const [row] = await db
      .select({
        id: passwordResetLink.id,
        schoolId: passwordResetLink.schoolId,
        requestId: passwordResetLink.requestId,
        userId: passwordResetLink.userId,
        expiresAt: passwordResetLink.expiresAt,
        usedAt: passwordResetLink.usedAt,
        revokedAt: passwordResetLink.revokedAt,
        schoolName: school.name,
        schoolStatus: school.status,
        accountName: user.name,
      })
      .from(passwordResetLink)
      .innerJoin(school, eq(school.id, passwordResetLink.schoolId))
      .innerJoin(user, eq(user.id, passwordResetLink.userId))
      .where(eq(passwordResetLink.tokenHash, hashResetToken(token)));
    if (!row || linkState(row) !== 'active' || row.schoolStatus !== 'active') throw invalidLink();
    // Hak akun bisa berubah sejak tautan dibuat (mis. dijadikan admin atau pindah ke sekolah lain).
    const { block } = await evaluateTarget(db, row.schoolId, row.userId, null);
    if (block) throw invalidLink();
    return row;
  }

  app.get(
    '/v1/public/reset-links/:token',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: tagPublic,
        summary: 'Periksa tautan reset kata sandi',
        description:
          'Publik, hanya untuk pemegang token. Mengembalikan nama sekolah dan nama akun tersamar. 410 ' +
          '`reset_link_invalid` bila token salah, sudah dipakai, dicabut, kedaluwarsa, atau sekolah ditangguhkan.',
        params: tokenParams,
        response: {
          200: z.object({ schoolName: z.string(), accountName: z.string(), expiresAt: iso }),
          410: errorSchema,
        },
      },
    },
    async (request) => {
      const row = await openLink(request.params.token);
      return {
        schoolName: row.schoolName,
        accountName: maskName(row.accountName),
        expiresAt: row.expiresAt.toISOString(),
      };
    },
  );

  app.post(
    '/v1/public/reset-links/:token',
    {
      config: { rateLimit: { max: options.env.NODE_ENV === 'test' ? 1000 : 10, timeWindow: '1 minute' } },
      schema: {
        tags: tagPublic,
        summary: 'Atur kata sandi baru lewat tautan reset',
        description:
          'Publik, hanya untuk pemegang token; sekali pakai. Kata sandi 12-128 karakter. Mengganti kata sandi akun ' +
          'dengan mekanisme hash Better Auth, menandai tautan terpakai, dan mengeluarkan SEMUA sesi akun. Ditulis ke ' +
          'audit tanpa token. 410 `reset_link_invalid` bila token tidak berlaku.',
        params: tokenParams,
        body: z.object({ password: z.string().min(12).max(128) }),
        response: { 200: ok, 410: errorSchema },
      },
    },
    async (request) => {
      const row = await openLink(request.params.token);
      const db = request.server.platformDb;
      // Habiskan tautan lebih dulu secara atomik: dua pemakaian bersamaan tidak keduanya berhasil.
      const claimed = await db
        .update(passwordResetLink)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordResetLink.id, row.id),
            isNull(passwordResetLink.usedAt),
            isNull(passwordResetLink.revokedAt),
            gt(passwordResetLink.expiresAt, new Date()),
          ),
        )
        .returning({ id: passwordResetLink.id });
      if (claimed.length === 0) throw invalidLink();

      try {
        const authCtx = await request.server.auth.$context;
        const hashed = await authCtx.password.hash(request.body.password);
        await authCtx.internalAdapter.deleteUserSessions(row.userId);
        const credential = await authCtx.internalAdapter.findCredentialAccount(row.userId);
        if (credential) await authCtx.internalAdapter.updatePassword(row.userId, hashed);
        else {
          await authCtx.internalAdapter.createAccount({
            userId: row.userId,
            providerId: 'credential',
            accountId: row.userId,
            password: hashed,
          });
        }
      } catch (error) {
        await db.update(passwordResetLink).set({ usedAt: null }).where(eq(passwordResetLink.id, row.id));
        throw error;
      }

      await db.transaction(async (tx) => {
        if (row.requestId) {
          await tx
            .update(passwordResetRequest)
            .set({ status: 'done', handledAt: new Date() })
            .where(
              and(
                eq(passwordResetRequest.id, row.requestId),
                inArray(passwordResetRequest.status, [...OPEN_STATUSES]),
              ),
            );
        }
        await tx.insert(auditLog).values({
          schoolId: row.schoolId,
          actorId: row.userId,
          action: 'password_help.link_used',
          entityType: 'password_reset_link',
          entityId: row.id,
          details: { sessionsRevoked: true },
        });
      });
      return { ok: true as const };
    },
  );
}
