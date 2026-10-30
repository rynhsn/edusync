import {
  and,
  assignRoles,
  auditLog,
  entitlement,
  eq,
  gt,
  guardian,
  isNull,
  member,
  portalInvite,
  portalLink,
  school,
  student,
  studentGuardian,
  user,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Env } from '../env';
import { errorSchema, HttpError } from '../http-error';
import { hashPortalToken } from './portal';

const tag = ['Portal (publik)'];
const tokenParams = z.object({ token: z.string().min(20).max(100) });
const invalid = () => new HttpError(410, 'invitation_invalid', 'Undangan ini sudah tidak berlaku.');

/** Undangan portal tanpa login: pemegang token melihat info undangan lalu membuat akun. */
export async function portalPublicRoutes(instance: FastifyInstance, options: { env: Env }) {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  /**
   * Undangan yang masih berlaku menurut token, atau 410. Dibaca lewat pool platform karena konteks tenant belum ada
   * pada titik ini; seluruh penulisan setelahnya memakai pool tenant. Sekolah ditangguhkan dan sekolah tanpa modul
   * `parent_portal` diperlakukan sama seperti undangan tidak berlaku (410) atau modul nonaktif (403).
   */
  async function openInvite(token: string) {
    const [row] = await app.platformDb
      .select({
        id: portalInvite.id,
        schoolId: portalInvite.schoolId,
        kind: portalInvite.kind,
        guardianId: portalInvite.guardianId,
        studentId: portalInvite.studentId,
        email: portalInvite.email,
        expiresAt: portalInvite.expiresAt,
        usedAt: portalInvite.usedAt,
        schoolName: school.name,
        schoolSlug: school.slug,
        schoolStatus: school.status,
      })
      .from(portalInvite)
      .innerJoin(school, eq(school.id, portalInvite.schoolId))
      .where(eq(portalInvite.tokenHash, hashPortalToken(token)));
    if (!row || row.usedAt || row.expiresAt <= new Date() || row.schoolStatus !== 'active') throw invalid();
    const modules = await withTenant(app.tenantDb, [row.schoolId], (tx) =>
      tx
        .select({ key: entitlement.moduleKey })
        .from(entitlement)
        .where(and(eq(entitlement.moduleKey, 'parent_portal'), gt(entitlement.validUntil, new Date()))),
    );
    if (modules.length === 0) {
      throw new HttpError(403, 'module_disabled', 'Portal belum aktif untuk sekolah ini.');
    }
    const [target] = await withTenant(app.tenantDb, [row.schoolId], (tx) =>
      row.kind === 'guardian'
        ? tx
            .select({ name: guardian.name })
            .from(guardian)
            .where(eq(guardian.id, row.guardianId as string))
        : tx
            .select({ name: student.name })
            .from(student)
            .where(and(eq(student.id, row.studentId as string), isNull(student.deletedAt))),
    );
    if (!target) throw invalid();
    return { ...row, targetName: target.name };
  }

  app.get(
    '/v1/public/portal-invites/:token',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: tag,
        summary: 'Lihat undangan portal dari tautan',
        description:
          'Publik, hanya untuk pemegang token. Mengembalikan sekolah, jenis (wali/siswa), nama yang ditautkan, dan ' +
          'email yang dikunci undangan (null bila bebas), serta apakah email itu sudah punya akun. 410 ' +
          '`invitation_invalid` bila token salah, sudah dipakai, kedaluwarsa, dicabut, atau sekolah ditangguhkan; ' +
          '403 `module_disabled` bila portal tidak aktif.',
        params: tokenParams,
        response: {
          200: z.object({
            schoolName: z.string(),
            schoolSlug: z.string(),
            kind: z.enum(['guardian', 'student']),
            targetName: z.string(),
            email: z.string().nullable(),
            accountExists: z.boolean(),
            expiresAt: z.iso.datetime({ offset: true }),
          }),
          403: errorSchema,
          410: errorSchema,
        },
      },
    },
    async (request) => {
      const inv = await openInvite(request.params.token);
      let accountExists = false;
      if (inv.email) {
        const [u] = await app.platformDb.select({ id: user.id }).from(user).where(eq(user.email, inv.email));
        accountExists = !!u;
      }
      return {
        schoolName: inv.schoolName,
        schoolSlug: inv.schoolSlug,
        kind: inv.kind,
        targetName: inv.targetName,
        email: inv.email,
        accountExists,
        expiresAt: inv.expiresAt.toISOString(),
      };
    },
  );

  app.post(
    '/v1/public/portal-invites/:token/accept',
    {
      // Menerima undangan dengan email yang sudah punya akun menguji kata sandi, jadi batasnya ketat (kecuali tes).
      config: { rateLimit: { max: options.env.NODE_ENV === 'test' ? 1000 : 10, timeWindow: '1 minute' } },
      schema: {
        tags: tag,
        summary: 'Terima undangan portal dan buat akun',
        description:
          'Publik, hanya untuk pemegang token; sekali pakai. Membuat akun masuk baru (nama, email, kata sandi 12-128 ' +
          'karakter) lalu keanggotaan sekolah dengan peran `guardian`/`student` dan tautan portal ke wali/siswa ' +
          'undangan. Bila undangan mengunci email, `email` harus sama (400 `email_mismatch`). Bila email sudah punya ' +
          'akun, kata sandi akun itu dipakai untuk memastikan pemiliknya (401 `invalid_credentials` bila salah) dan ' +
          'akun yang sama ditautkan; 409 `already_member` bila akun itu sudah anggota sekolah ini, 409 ' +
          '`already_linked` bila target sudah punya akun. Setelah berhasil, masuk lewat halaman login sekolah. ' +
          '410 `invitation_invalid` bila token tidak berlaku.',
        params: tokenParams,
        body: z.object({
          name: z.string().trim().min(1).max(120).optional(),
          email: z.email().max(254),
          password: z.string().min(12).max(128),
        }),
        response: {
          201: z.object({
            schoolSlug: z.string(),
            kind: z.enum(['guardian', 'student']),
            email: z.string(),
          }),
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          409: errorSchema,
          410: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const inv = await openInvite(request.params.token);
      const email = request.body.email.trim().toLowerCase();
      if (inv.email && inv.email !== email) {
        throw new HttpError(400, 'email_mismatch', 'Undangan ini hanya untuk email yang diundang.');
      }
      const { password } = request.body;

      const [existing] = await app.platformDb.select({ id: user.id }).from(user).where(eq(user.email, email));
      let userId: string;
      let created = false;
      if (existing) {
        try {
          await app.auth.api.signInEmail({ body: { email, password } });
        } catch {
          throw new HttpError(401, 'invalid_credentials', 'Email atau kata sandi akun yang ada tidak cocok.');
        }
        userId = existing.id;
      } else {
        try {
          const res = await app.auth.api.signUpEmail({
            body: { name: request.body.name ?? inv.targetName, email, password },
          });
          userId = res.user.id;
          created = true;
        } catch {
          throw new HttpError(409, 'account_exists', 'Email ini sudah terdaftar. Coba lagi.');
        }
      }

      try {
        await withTenant(app.tenantDb, [inv.schoolId], async (tx) => {
          // Kunci baris undangan agar dua penerimaan bersamaan tidak keduanya berhasil.
          const [fresh] = await tx
            .select({ usedAt: portalInvite.usedAt })
            .from(portalInvite)
            .where(eq(portalInvite.id, inv.id))
            .for('update');
          if (!fresh || fresh.usedAt) throw invalid();

          const [dup] = await tx
            .select({ id: member.id })
            .from(member)
            .where(and(eq(member.userId, userId), eq(member.schoolId, inv.schoolId)));
          if (dup) throw new HttpError(409, 'already_member', 'Akun ini sudah menjadi anggota sekolah.');

          const [linked] = await tx
            .select({ id: portalLink.id })
            .from(portalLink)
            .where(
              inv.kind === 'guardian'
                ? eq(portalLink.guardianId, inv.guardianId as string)
                : eq(portalLink.studentId, inv.studentId as string),
            )
            .limit(1);
          if (linked) {
            throw new HttpError(409, 'already_linked', 'Target ini sudah punya akun portal.');
          }
          if (inv.kind === 'guardian') {
            const kids = await tx
              .select({ id: studentGuardian.studentId })
              .from(studentGuardian)
              .where(eq(studentGuardian.guardianId, inv.guardianId as string))
              .limit(1);
            if (kids.length === 0) throw invalid();
          }

          const [m] = await tx
            .insert(member)
            .values({ userId, schoolId: inv.schoolId })
            .returning({ id: member.id });
          await assignRoles(tx, m!.id, inv.schoolId, [inv.kind]);
          await tx.insert(portalLink).values({
            schoolId: inv.schoolId,
            memberId: m!.id,
            kind: inv.kind,
            guardianId: inv.kind === 'guardian' ? inv.guardianId : null,
            studentId: inv.kind === 'student' ? inv.studentId : null,
          });
          await tx.update(portalInvite).set({ usedAt: new Date() }).where(eq(portalInvite.id, inv.id));
          await tx.insert(auditLog).values({
            schoolId: inv.schoolId,
            actorId: userId,
            action: 'portal.invite.accept',
            entityType: 'portal_invite',
            entityId: inv.id,
            details: { kind: inv.kind, memberId: m!.id, newAccount: created },
          });
        });
      } catch (error) {
        // Akun yang baru dibuat untuk penerimaan yang gagal tidak boleh tertinggal.
        if (created) await app.platformDb.delete(user).where(eq(user.id, userId));
        throw error;
      }
      return reply.code(201).send({ schoolSlug: inv.schoolSlug, kind: inv.kind, email });
    },
  );
}
