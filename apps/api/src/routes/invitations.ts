import { createHash, randomBytes } from 'node:crypto';
import {
  and,
  assignRoles,
  auditLog,
  desc,
  eq,
  invitation,
  isNull,
  member,
  school,
  user,
  withTenant,
} from '@edusync/db';
import { enqueue, QUEUES } from '@edusync/jobs';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Env } from '../env';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, requireUser, type TenantContext } from '../identity/guards';
import { schoolOrigin } from '../origins';
import { assertNoEscalation, rolesByKey } from './members';

const INVITATION_DAYS = 7;
const schoolHeader = z.object({ 'x-school-id': z.uuid().describe('Sekolah yang sedang dipakai') });
const roleKeys = z.array(z.string().min(1).max(60)).min(1).max(10);
const iso = z.iso.datetime();
const tag = ['Invitations'];
const guarded = { 401: errorSchema, 403: errorSchema };

const invitationSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  roles: z.array(z.string()),
  expiresAt: iso,
  expired: z.boolean(),
});

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const invalid = () => new HttpError(410, 'invitation_invalid', 'Undangan ini sudah tidak berlaku.');

export async function invitationRoutes(instance: FastifyInstance, options: { env: Env }) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const scheme = new URL(options.env.AUTH_URL).protocol as 'http:' | 'https:';

  app.get(
    '/v1/invitations',
    {
      onRequest: [requirePermission('member:read')],
      schema: {
        tags: tag,
        summary: 'Undangan yang belum diterima',
        description: 'Izin: `member:read`. Undangan yang sudah diterima atau dicabut tidak ditampilkan.',
        headers: schoolHeader,
        response: { 200: z.array(invitationSchema), ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const rows = await withTenant(request.server.tenantDb, [ctx.schoolId], (tx) =>
        tx
          .select()
          .from(invitation)
          .where(and(isNull(invitation.acceptedAt), isNull(invitation.revokedAt)))
          .orderBy(desc(invitation.createdAt)),
      );
      const now = new Date();
      return rows.map((r) => ({
        id: r.id,
        email: r.email,
        roles: r.roles,
        expiresAt: r.expiresAt.toISOString(),
        expired: r.expiresAt <= now,
      }));
    },
  );

  app.post(
    '/v1/invitations',
    {
      onRequest: [requirePermission('member:manage')],
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: tag,
        summary: 'Undang seseorang lewat email',
        description:
          `Izin: \`member:manage\`. Mengirim tautan yang berlaku ${INVITATION_DAYS} hari. Orang yang belum punya akun ` +
          'membuatnya saat menerima. Mengundang email yang sama lagi mencabut undangan lama dan mengirim ulang. ' +
          'Peran yang diberikan tidak boleh memiliki izin yang melebihi izin pengundang.',
        headers: schoolHeader,
        body: z.object({ email: z.email().max(254), roles: roleKeys }),
        response: { 201: invitationSchema, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const email = request.body.email.trim().toLowerCase();
      const roleList = [...new Set(request.body.roles)];
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + INVITATION_DAYS * 86_400_000);

      const [target] = await request.server.platformDb
        .select({ slug: school.slug, name: school.name })
        .from(school)
        .where(eq(school.id, ctx.schoolId));
      const inviter = request.authUser;

      const created = await withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        assertNoEscalation(ctx, await rolesByKey(tx, roleList));

        const [account] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email));
        if (account) {
          const [existing] = await tx
            .select({ id: member.id })
            .from(member)
            .where(eq(member.userId, account.id));
          if (existing)
            throw new HttpError(409, 'already_member', 'Orang ini sudah menjadi anggota sekolah.');
        }

        await tx
          .update(invitation)
          .set({ revokedAt: new Date() })
          .where(
            and(eq(invitation.email, email), isNull(invitation.acceptedAt), isNull(invitation.revokedAt)),
          );
        const [row] = await tx
          .insert(invitation)
          .values({
            schoolId: ctx.schoolId,
            email,
            roles: roleList,
            tokenHash: hashToken(token),
            invitedBy: ctx.userId,
            expiresAt,
          })
          .returning();
        await tx.insert(auditLog).values({
          schoolId: ctx.schoolId,
          actorId: ctx.userId,
          action: 'invitation.create',
          entityType: 'invitation',
          entityId: row!.id,
          details: { email, roles: roleList, viaRoles: ctx.roles },
        });
        const link = `${schoolOrigin(scheme, options.env.APP_DOMAIN, target?.slug ?? '')}/invite/${token}`;
        await enqueue(
          tx,
          QUEUES.emailSend,
          {
            to: email,
            subject: `Undangan bergabung di ${target?.name ?? 'Edusync'}`,
            text:
              `Halo,\n\n${inviter?.name ?? 'Admin sekolah'} mengundang Anda bergabung di ${target?.name ?? 'sekolah'} pada Edusync.\n\n` +
              `Terima undangan (berlaku ${INVITATION_DAYS} hari):\n${link}\n\n` +
              'Bila Anda tidak merasa diundang, abaikan email ini.',
          },
          { schoolId: ctx.schoolId },
        );
        return row!;
      });
      return reply.code(201).send({
        id: created.id,
        email: created.email,
        roles: created.roles,
        expiresAt: created.expiresAt.toISOString(),
        expired: false,
      });
    },
  );

  app.delete(
    '/v1/invitations/:id',
    {
      onRequest: [requirePermission('member:manage')],
      schema: {
        tags: tag,
        summary: 'Cabut undangan',
        description: 'Izin: `member:manage`. Tautan yang sudah dikirim langsung tidak berlaku.',
        headers: schoolHeader,
        params: z.object({ id: z.uuid() }),
        response: { 200: z.object({ ok: z.literal(true) }), 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const rows = await tx
          .update(invitation)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(invitation.id, request.params.id),
              isNull(invitation.acceptedAt),
              isNull(invitation.revokedAt),
            ),
          )
          .returning({ id: invitation.id });
        if (rows.length === 0) throw new HttpError(404, 'not_found', 'Undangan tidak ditemukan.');
        await tx.insert(auditLog).values({
          schoolId: ctx.schoolId,
          actorId: ctx.userId,
          action: 'invitation.revoke',
          entityType: 'invitation',
          entityId: request.params.id,
          details: { viaRoles: ctx.roles },
        });
      });
      return { ok: true as const };
    },
  );

  /** Undangan yang masih berlaku menurut token, atau lempar 410. Dibaca lewat pool platform (belum ada konteks tenant). */
  async function openInvitation(token: string) {
    const [row] = await app.platformDb
      .select({
        id: invitation.id,
        schoolId: invitation.schoolId,
        email: invitation.email,
        roles: invitation.roles,
        invitedBy: invitation.invitedBy,
        expiresAt: invitation.expiresAt,
        acceptedAt: invitation.acceptedAt,
        revokedAt: invitation.revokedAt,
        schoolName: school.name,
        schoolSlug: school.slug,
      })
      .from(invitation)
      .innerJoin(school, eq(school.id, invitation.schoolId))
      .where(eq(invitation.tokenHash, hashToken(token)));
    if (!row || row.acceptedAt || row.revokedAt || row.expiresAt <= new Date()) throw invalid();
    return row;
  }

  app.get(
    '/v1/invitations/by-token/:token',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: tag,
        summary: 'Lihat undangan dari tautan email',
        description:
          'Publik, hanya untuk pemegang token. Mengembalikan sekolah, email yang diundang, dan apakah akunnya sudah ada.',
        params: z.object({ token: z.string().min(20).max(100) }),
        response: {
          200: z.object({
            schoolName: z.string(),
            schoolSlug: z.string(),
            email: z.string(),
            roles: z.array(z.string()),
            accountExists: z.boolean(),
          }),
          410: errorSchema,
        },
      },
    },
    async (request) => {
      const inv = await openInvitation(request.params.token);
      const [account] = await app.platformDb
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, inv.email));
      return {
        schoolName: inv.schoolName,
        schoolSlug: inv.schoolSlug,
        email: inv.email,
        roles: inv.roles,
        accountExists: !!account,
      };
    },
  );

  app.post(
    '/v1/invitations/by-token/:token/accept',
    {
      onRequest: [requireUser],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: tag,
        summary: 'Terima undangan',
        description:
          'Harus masuk dengan akun yang emailnya sama dengan email yang diundang. Orang itu menjadi anggota ' +
          'dengan peran yang tercantum; anggota nonaktif diaktifkan kembali.',
        params: z.object({ token: z.string().min(20).max(100) }),
        response: {
          200: z.object({ schoolSlug: z.string() }),
          ...guarded,
          410: errorSchema,
        },
      },
    },
    async (request) => {
      const inv = await openInvitation(request.params.token);
      const account = request.authUser as { id: string; email: string };
      if (account.email.toLowerCase() !== inv.email) {
        throw new HttpError(
          403,
          'invitation_wrong_account',
          'Undangan ini untuk email lain. Masuk dengan email yang diundang.',
        );
      }
      await app.platformDb.transaction(async (tx) => {
        // Kunci baris undangan agar dua penerimaan bersamaan tidak keduanya berhasil.
        const [fresh] = await tx
          .select({ acceptedAt: invitation.acceptedAt, revokedAt: invitation.revokedAt })
          .from(invitation)
          .where(eq(invitation.id, inv.id))
          .for('update');
        if (!fresh || fresh.acceptedAt || fresh.revokedAt) throw invalid();

        const [existing] = await tx
          .select({ id: member.id })
          .from(member)
          .where(and(eq(member.userId, account.id), eq(member.schoolId, inv.schoolId)));
        let memberId = existing?.id;
        if (memberId) {
          await tx.update(member).set({ status: 'active' }).where(eq(member.id, memberId));
        } else {
          const [row] = await tx
            .insert(member)
            .values({ userId: account.id, schoolId: inv.schoolId })
            .returning();
          memberId = row!.id;
        }
        await assignRoles(tx, memberId, inv.schoolId, inv.roles);
        await tx.update(invitation).set({ acceptedAt: new Date() }).where(eq(invitation.id, inv.id));
        await tx.insert(auditLog).values({
          schoolId: inv.schoolId,
          actorId: account.id,
          action: 'invitation.accept',
          entityType: 'invitation',
          entityId: inv.id,
          details: { roles: inv.roles, invitedBy: inv.invitedBy },
        });
      });
      return { schoolSlug: inv.schoolSlug };
    },
  );
}
