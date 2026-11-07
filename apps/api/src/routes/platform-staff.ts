import { createHash, randomBytes } from 'node:crypto';
import { and, auditLog, desc, eq, gt, isNull, platformStaff, sql, staffInvitation, user } from '@edusync/db';
import { enqueue, QUEUES } from '@edusync/jobs';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Env } from '../env';
import { errorSchema, HttpError } from '../http-error';
import { requireStaff, requireUser } from '../identity/guards';

const INVITATION_DAYS = 7;
/** Batas pengundang: jumlah undangan baru + kirim ulang per jam. */
const INVITES_PER_HOUR = 20;
const tag = ['Platform'];
const iso = z.iso.datetime();
const roleSchema = z
  .enum(['admin', 'read_only'])
  .describe('`admin` boleh mengubah, `read_only` hanya melihat');
const guarded = { 401: errorSchema, 403: errorSchema };
const tokenParam = z.object({ token: z.string().min(20).max(100) });

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const invalid = () => new HttpError(410, 'invitation_invalid', 'Undangan ini sudah tidak berlaku.');
const ROLE_LABEL = { admin: 'Admin platform (boleh mengubah)', read_only: 'Hanya lihat' } as const;

/** `budi.santoso@x.id` menjadi `b***@x.id`: cukup untuk dikenali pemiliknya tanpa membuka alamat utuh. */
export function maskEmail(email: string) {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

/** Melempar 409 `last_admin` bila mencabut/menurunkan `targetId` membuat platform tanpa admin. */
export function assertAdminRemains(adminIds: string[], targetId: string) {
  if (!adminIds.some((id) => id !== targetId)) {
    throw new HttpError(409, 'last_admin', 'Platform harus punya sedikitnya satu admin.');
  }
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/** Isi email undangan staf platform (teks dan HTML). */
export function staffInvitationEmail(input: {
  inviter: string;
  role: 'admin' | 'read_only';
  link: string;
  days: number;
}) {
  const roleLabel = ROLE_LABEL[input.role];
  const text =
    `Halo,\n\n${input.inviter} mengundang Anda menjadi pengelola platform Edusync dengan peran ${roleLabel}.\n\n` +
    `Terima undangan (berlaku ${input.days} hari):\n${input.link}\n\n` +
    'Anda perlu masuk atau mendaftar dengan alamat email ini untuk menerimanya.\n' +
    'Bila Anda tidak merasa diundang, abaikan email ini.';
  const html =
    `<p>Halo,</p><p><strong>${escapeHtml(input.inviter)}</strong> mengundang Anda menjadi pengelola platform Edusync ` +
    `dengan peran <strong>${escapeHtml(roleLabel)}</strong>.</p>` +
    `<p><a href="${escapeHtml(input.link)}">Terima undangan</a> (berlaku ${input.days} hari)</p>` +
    `<p style="color:#555">Atau salin tautan ini ke peramban:<br>${escapeHtml(input.link)}</p>` +
    '<p style="color:#555">Anda perlu masuk atau mendaftar dengan alamat email ini untuk menerimanya. ' +
    'Bila Anda tidak merasa diundang, abaikan email ini.</p>';
  return { subject: 'Undangan menjadi pengelola platform Edusync', text, html };
}

const staffRow = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  createdAt: iso,
  lastSeenAt: iso.nullable().describe('Aktivitas sesi terakhir; kosong bila belum pernah masuk'),
  isSelf: z.boolean(),
});
const invitationRow = z.object({
  id: z.uuid(),
  email: z.string(),
  role: roleSchema,
  invitedByName: z.string().nullable(),
  createdAt: iso,
  expiresAt: iso,
  expired: z.boolean(),
});
const issued = z.object({
  id: z.uuid(),
  email: z.string(),
  role: roleSchema,
  expiresAt: iso,
  inviteUrl: z
    .string()
    .describe(
      'Tautan undangan. Hanya muncul di respons ini (sekali) agar admin bisa membagikannya manual bila email gagal.',
    ),
});

export async function platformStaffRoutes(instance: FastifyInstance, options: { env: Env }) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const db = app.platformDb;
  const base = options.env.WEB_URL.replace(/\/$/, '');
  const linkFor = (token: string) => `${base}/platform-invite/${token}`;

  /** Batas undangan per pengundang, dihitung dari audit log (undangan baru dan kirim ulang). */
  async function assertInviteQuota(actorId: string) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.actorId, actorId),
          sql`${auditLog.action} in ('staff.invite', 'staff.invite_resend')`,
          gt(auditLog.createdAt, new Date(Date.now() - 3_600_000)),
        ),
      );
    if ((row?.n ?? 0) >= INVITES_PER_HOUR) {
      throw new HttpError(429, 'rate_limited', 'Terlalu banyak undangan dalam satu jam. Coba lagi nanti.');
    }
  }

  app.get(
    '/v1/platform/staff',
    {
      onRequest: [requireStaff('read_only')],
      schema: {
        tags: tag,
        summary: 'Daftar pengelola platform dan undangan tertunda',
        description:
          'Staf platform (baca). Berisi semua staf beserta perannya dan undangan yang belum diterima atau dicabut. ' +
          'Tautan undangan tidak pernah ada di daftar ini.',
        response: {
          200: z.object({ staff: z.array(staffRow), invitations: z.array(invitationRow) }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const me = request.userId as string;
      const staff = await db
        .select({
          userId: platformStaff.userId,
          name: user.name,
          email: user.email,
          role: platformStaff.role,
          createdAt: platformStaff.createdAt,
          lastSeenAt: sql<Date | null>`(select max(s.updated_at) from session s where s.user_id = ${platformStaff.userId})`,
        })
        .from(platformStaff)
        .innerJoin(user, eq(user.id, platformStaff.userId))
        .orderBy(platformStaff.createdAt);
      const pending = await db
        .select({
          id: staffInvitation.id,
          email: staffInvitation.email,
          role: staffInvitation.role,
          invitedByName: user.name,
          createdAt: staffInvitation.createdAt,
          expiresAt: staffInvitation.expiresAt,
        })
        .from(staffInvitation)
        .leftJoin(user, eq(user.id, staffInvitation.invitedBy))
        .where(and(isNull(staffInvitation.acceptedAt), isNull(staffInvitation.revokedAt)))
        .orderBy(desc(staffInvitation.createdAt));
      const now = new Date();
      return {
        staff: staff.map((s) => ({
          userId: s.userId,
          name: s.name,
          email: s.email,
          role: s.role,
          createdAt: s.createdAt.toISOString(),
          lastSeenAt: s.lastSeenAt ? new Date(s.lastSeenAt).toISOString() : null,
          isSelf: s.userId === me,
        })),
        invitations: pending.map((p) => ({
          id: p.id,
          email: p.email,
          role: p.role,
          invitedByName: p.invitedByName,
          createdAt: p.createdAt.toISOString(),
          expiresAt: p.expiresAt.toISOString(),
          expired: p.expiresAt <= now,
        })),
      };
    },
  );

  app.post(
    '/v1/platform/staff/invitations',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Undang seseorang menjadi pengelola platform',
        description:
          `Staf platform (admin). Mengirim email berisi tautan yang berlaku ${INVITATION_DAYS} hari ke alamat itu. ` +
          'Orang yang diundang masuk atau mendaftar dengan email yang sama lalu menerima undangan. Respons memuat ' +
          '`inviteUrl` satu kali saja supaya admin bisa membagikannya manual bila email gagal; daftar tidak memuatnya. ' +
          `Maksimal ${INVITES_PER_HOUR} undangan (termasuk kirim ulang) per admin per jam. ` +
          'Galat: 409 `already_staff` (sudah staf), 409 `invitation_pending` (undangan tertunda masih berlaku; ' +
          'pakai kirim ulang), 429 `rate_limited`.',
        body: z.object({ email: z.email().max(254), role: roleSchema }),
        response: { 201: issued, 400: errorSchema, 409: errorSchema, 429: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const actorId = request.userId as string;
      const email = request.body.email.trim().toLowerCase();
      const { role } = request.body;
      await assertInviteQuota(actorId);
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + INVITATION_DAYS * 86_400_000);
      const inviterName = request.authUser?.name ?? 'Admin platform';

      const created = await db.transaction(async (tx) => {
        const [already] = await tx
          .select({ id: platformStaff.userId })
          .from(platformStaff)
          .innerJoin(user, eq(user.id, platformStaff.userId))
          .where(sql`lower(${user.email}) = ${email}`);
        if (already) throw new HttpError(409, 'already_staff', 'Orang ini sudah menjadi pengelola platform.');

        const [existing] = await tx
          .select({ id: staffInvitation.id, expiresAt: staffInvitation.expiresAt })
          .from(staffInvitation)
          .where(
            and(
              eq(staffInvitation.email, email),
              isNull(staffInvitation.acceptedAt),
              isNull(staffInvitation.revokedAt),
            ),
          )
          .for('update');
        if (existing) {
          if (existing.expiresAt > new Date()) {
            throw new HttpError(
              409,
              'invitation_pending',
              'Sudah ada undangan yang masih berlaku untuk email ini. Kirim ulang bila perlu.',
            );
          }
          // Undangan lama sudah kedaluwarsa: dicabut agar yang baru bisa dibuat.
          await tx
            .update(staffInvitation)
            .set({ revokedAt: new Date() })
            .where(eq(staffInvitation.id, existing.id));
        }

        const [row] = await tx
          .insert(staffInvitation)
          .values({ email, role, tokenHash: hashToken(token), invitedBy: actorId, expiresAt })
          .returning();
        await tx.insert(auditLog).values({
          actorId,
          action: 'staff.invite',
          entityType: 'staff_invitation',
          entityId: row!.id,
          details: { email, role },
        });
        await enqueue(tx, QUEUES.emailSend, {
          to: email,
          ...staffInvitationEmail({
            inviter: inviterName,
            role,
            link: linkFor(token),
            days: INVITATION_DAYS,
          }),
        });
        return row!;
      });
      return reply.code(201).send({
        id: created.id,
        email: created.email,
        role: created.role,
        expiresAt: created.expiresAt.toISOString(),
        inviteUrl: linkFor(token),
      });
    },
  );

  app.post(
    '/v1/platform/staff/invitations/:id/resend',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Kirim ulang undangan pengelola platform',
        description:
          `Staf platform (admin). Membuat tautan baru (berlaku ${INVITATION_DAYS} hari dari sekarang) dan mengirimnya ` +
          'lagi; tautan lama langsung tidak berlaku. Respons memuat `inviteUrl` baru satu kali. Dihitung dalam batas ' +
          `${INVITES_PER_HOUR} undangan per jam. Galat: 404 bila undangan tidak ada atau sudah diterima/dicabut.`,
        params: z.object({ id: z.uuid() }),
        response: { 200: issued, 404: errorSchema, 429: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const actorId = request.userId as string;
      await assertInviteQuota(actorId);
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + INVITATION_DAYS * 86_400_000);
      const inviterName = request.authUser?.name ?? 'Admin platform';

      const row = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(staffInvitation)
          .where(eq(staffInvitation.id, request.params.id))
          .for('update');
        if (!current || current.acceptedAt || current.revokedAt) {
          throw new HttpError(404, 'not_found', 'Undangan tidak ditemukan.');
        }
        await tx
          .update(staffInvitation)
          .set({ tokenHash: hashToken(token), expiresAt, invitedBy: actorId })
          .where(eq(staffInvitation.id, current.id));
        await tx.insert(auditLog).values({
          actorId,
          action: 'staff.invite_resend',
          entityType: 'staff_invitation',
          entityId: current.id,
          details: { email: current.email, role: current.role },
        });
        await enqueue(tx, QUEUES.emailSend, {
          to: current.email,
          ...staffInvitationEmail({
            inviter: inviterName,
            role: current.role,
            link: linkFor(token),
            days: INVITATION_DAYS,
          }),
        });
        return current;
      });
      return {
        id: row.id,
        email: row.email,
        role: row.role,
        expiresAt: expiresAt.toISOString(),
        inviteUrl: linkFor(token),
      };
    },
  );

  app.delete(
    '/v1/platform/staff/invitations/:id',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Cabut undangan pengelola platform',
        description:
          'Staf platform (admin). Tautan yang sudah dikirim langsung tidak berlaku. 404 bila tidak ada.',
        params: z.object({ id: z.uuid() }),
        response: { 200: z.object({ ok: z.literal(true) }), 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      await db.transaction(async (tx) => {
        const rows = await tx
          .update(staffInvitation)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(staffInvitation.id, request.params.id),
              isNull(staffInvitation.acceptedAt),
              isNull(staffInvitation.revokedAt),
            ),
          )
          .returning({ id: staffInvitation.id, email: staffInvitation.email });
        if (rows.length === 0) throw new HttpError(404, 'not_found', 'Undangan tidak ditemukan.');
        await tx.insert(auditLog).values({
          actorId: request.userId as string,
          action: 'staff.invite_revoke',
          entityType: 'staff_invitation',
          entityId: request.params.id,
          details: { email: rows[0]!.email },
        });
      });
      return { ok: true as const };
    },
  );

  /**
   * Kunci semua baris admin lalu pastikan sedikitnya satu admin tersisa bila `targetId` berhenti menjadi admin.
   * Penguncian membuat dua admin yang saling menurunkan secara bersamaan tidak bisa keduanya berhasil.
   */
  async function lockAndGuard(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    actorId: string,
    targetId: string,
    leavingAdmin: boolean,
  ) {
    if (targetId === actorId) {
      throw new HttpError(409, 'self_change', 'Anda tidak bisa mengubah atau menghapus peran Anda sendiri.');
    }
    const admins = await tx
      .select({ userId: platformStaff.userId })
      .from(platformStaff)
      .where(eq(platformStaff.role, 'admin'))
      .for('update');
    const [target] = await tx
      .select({ role: platformStaff.role })
      .from(platformStaff)
      .where(eq(platformStaff.userId, targetId))
      .for('update');
    if (!target) throw new HttpError(404, 'not_found', 'Pengelola tidak ditemukan.');
    if (!admins.some((a) => a.userId === actorId))
      throw new HttpError(403, 'forbidden', 'Anda tidak punya izin untuk tindakan ini.');
    if (leavingAdmin && target.role === 'admin')
      assertAdminRemains(
        admins.map((x) => x.userId),
        targetId,
      );
    return target;
  }

  app.patch(
    '/v1/platform/staff/:userId',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Ubah peran pengelola platform',
        description:
          'Staf platform (admin). Admin tidak bisa mengubah perannya sendiri (409 `self_change`) dan platform harus ' +
          'selalu punya sedikitnya satu admin (409 `last_admin`). 404 bila orang itu bukan staf.',
        params: z.object({ userId: z.string().min(1) }),
        body: z.object({ role: roleSchema }),
        response: {
          200: z.object({ ok: z.literal(true), role: roleSchema }),
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const actorId = request.userId as string;
      const { userId } = request.params;
      const { role } = request.body;
      await db.transaction(async (tx) => {
        const target = await lockAndGuard(tx, actorId, userId, role !== 'admin');
        if (target.role === role) return;
        await tx.update(platformStaff).set({ role }).where(eq(platformStaff.userId, userId));
        await tx.insert(auditLog).values({
          actorId,
          action: 'staff.role_change',
          entityType: 'platform_staff',
          entityId: userId,
          details: { from: target.role, to: role },
        });
      });
      return { ok: true as const, role };
    },
  );

  app.delete(
    '/v1/platform/staff/:userId',
    {
      onRequest: [requireStaff('admin')],
      schema: {
        tags: tag,
        summary: 'Hapus peran pengelola platform',
        description:
          'Staf platform (admin). Hanya mencabut peran staf; akun penggunanya tetap ada. Tidak bisa menghapus diri ' +
          'sendiri (409 `self_change`) atau admin terakhir (409 `last_admin`).',
        params: z.object({ userId: z.string().min(1) }),
        response: { 200: z.object({ ok: z.literal(true) }), 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const actorId = request.userId as string;
      const { userId } = request.params;
      await db.transaction(async (tx) => {
        const target = await lockAndGuard(tx, actorId, userId, true);
        await tx.delete(platformStaff).where(eq(platformStaff.userId, userId));
        await tx.insert(auditLog).values({
          actorId,
          action: 'staff.remove',
          entityType: 'platform_staff',
          entityId: userId,
          details: { role: target.role },
        });
      });
      return { ok: true as const };
    },
  );

  app.get(
    '/v1/platform/staff/invitations/by-token/:token',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: tag,
        summary: 'Lihat undangan pengelola platform dari tautan email',
        description:
          'Publik, hanya untuk pemegang tautan. Tautan yang tidak dikenal, kedaluwarsa, dicabut, atau sudah dipakai ' +
          'dijawab sama persis (`valid: false`) sehingga tidak bisa dipakai menebak undangan. Untuk undangan yang ' +
          'berlaku, `email` dikembalikan utuh agar formulir masuk/daftar bisa mengisinya; `emailMasked` untuk tampilan.',
        params: tokenParam,
        response: {
          200: z.object({
            valid: z.boolean(),
            email: z.string().nullable(),
            emailMasked: z.string().nullable(),
            role: roleSchema.nullable(),
            invitedByName: z.string().nullable(),
            expiresAt: iso.nullable(),
            accountExists: z.boolean(),
          }),
        },
      },
    },
    async (request) => {
      const none = {
        valid: false,
        email: null,
        emailMasked: null,
        role: null,
        invitedByName: null,
        expiresAt: null,
        accountExists: false,
      };
      const [row] = await db
        .select({
          email: staffInvitation.email,
          role: staffInvitation.role,
          expiresAt: staffInvitation.expiresAt,
          acceptedAt: staffInvitation.acceptedAt,
          revokedAt: staffInvitation.revokedAt,
          invitedByName: user.name,
        })
        .from(staffInvitation)
        .leftJoin(user, eq(user.id, staffInvitation.invitedBy))
        .where(eq(staffInvitation.tokenHash, hashToken(request.params.token)));
      if (!row || row.acceptedAt || row.revokedAt || row.expiresAt <= new Date()) return none;
      const [account] = await db
        .select({ id: user.id })
        .from(user)
        .where(sql`lower(${user.email}) = ${row.email}`);
      return {
        valid: true,
        email: row.email,
        emailMasked: maskEmail(row.email),
        role: row.role,
        invitedByName: row.invitedByName,
        expiresAt: row.expiresAt.toISOString(),
        accountExists: !!account,
      };
    },
  );

  app.post(
    '/v1/platform/staff/invitations/by-token/:token/accept',
    {
      onRequest: [requireUser],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: tag,
        summary: 'Terima undangan pengelola platform',
        description:
          'Harus masuk dengan akun yang emailnya sama persis (tanpa membedakan huruf besar/kecil) dengan email yang ' +
          'diundang; selain itu 403 `email_mismatch`. Sekali pakai: dua penerimaan bersamaan hanya satu yang berhasil, ' +
          'sisanya 410 `invitation_invalid`. Undangan yang tidak dikenal, kedaluwarsa, atau dicabut juga 410. ' +
          'Tanpa undangan yang sah, tidak ada jalan menjadi staf lewat endpoint ini.',
        params: tokenParam,
        response: { 200: z.object({ ok: z.literal(true), role: roleSchema }), 410: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const account = request.authUser as { id: string; email: string };
      const role = await db.transaction(async (tx) => {
        // Kunci baris undangan agar dua penerimaan bersamaan tidak keduanya berhasil.
        const [inv] = await tx
          .select()
          .from(staffInvitation)
          .where(eq(staffInvitation.tokenHash, hashToken(request.params.token)))
          .for('update');
        if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt <= new Date()) throw invalid();
        if (account.email.trim().toLowerCase() !== inv.email) {
          throw new HttpError(
            403,
            'email_mismatch',
            `Undangan ini untuk ${maskEmail(inv.email)}. Masuk dengan email tersebut.`,
          );
        }
        const [existing] = await tx
          .select({ role: platformStaff.role })
          .from(platformStaff)
          .where(eq(platformStaff.userId, account.id));
        // Sudah staf (mis. diundang lalu dijadikan staf lewat jalur lain): peran yang ada tidak diturunkan.
        const finalRole = existing?.role ?? inv.role;
        if (!existing) await tx.insert(platformStaff).values({ userId: account.id, role: inv.role });
        await tx
          .update(staffInvitation)
          .set({ acceptedAt: new Date(), acceptedBy: account.id })
          .where(eq(staffInvitation.id, inv.id));
        await tx.insert(auditLog).values({
          actorId: account.id,
          action: 'staff.invite_accept',
          entityType: 'staff_invitation',
          entityId: inv.id,
          details: { role: finalRole, invitedBy: inv.invitedBy },
        });
        return finalRole;
      });
      return { ok: true as const, role };
    },
  );
}
