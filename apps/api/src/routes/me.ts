import {
  and,
  entitlement,
  eq,
  gt,
  inArray,
  member,
  memberRole,
  role,
  rolePermission,
  school,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema } from '../http-error';
import { requireUser } from '../identity/guards';

const membershipSchema = z.object({
  schoolId: z.uuid(),
  schoolName: z.string(),
  schoolSlug: z.string(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()).describe('Gabungan izin dari semua peran di sekolah ini'),
  modules: z.array(z.string()).describe('Modul berbayar yang sedang aktif di sekolah ini'),
});

export async function meRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/v1/me',
    {
      onRequest: [requireUser],
      schema: {
        tags: ['Identity'],
        summary: 'Profil pengguna dan sekolah tempat ia menjadi anggota',
        description: 'Satu akun bisa menjadi anggota beberapa unit dengan peran berbeda di tiap unit.',
        response: {
          200: z.object({
            user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
            memberships: z.array(membershipSchema),
          }),
          401: errorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.userId as string;
      // Pool platform: daftar sekolah milik pengguna dibaca sebelum ada konteks tenant.
      const rows = await request.server.platformDb
        .select({
          schoolId: school.id,
          schoolName: school.name,
          schoolSlug: school.slug,
          roleKey: role.key,
          permission: rolePermission.permission,
        })
        .from(member)
        .innerJoin(school, eq(school.id, member.schoolId))
        .leftJoin(memberRole, eq(memberRole.memberId, member.id))
        .leftJoin(role, eq(role.id, memberRole.roleId))
        .leftJoin(rolePermission, eq(rolePermission.roleId, memberRole.roleId))
        .where(and(eq(member.userId, userId), eq(member.status, 'active')));

      const bySchool = new Map<string, z.infer<typeof membershipSchema>>();
      for (const r of rows) {
        const entry = bySchool.get(r.schoolId) ?? {
          schoolId: r.schoolId,
          schoolName: r.schoolName,
          schoolSlug: r.schoolSlug,
          roles: [],
          permissions: [],
          modules: [],
        };
        if (r.roleKey && !entry.roles.includes(r.roleKey)) entry.roles.push(r.roleKey);
        if (r.permission && !entry.permissions.includes(r.permission)) entry.permissions.push(r.permission);
        bySchool.set(r.schoolId, entry);
      }
      // Modul berbayar yang masih berlaku; menu modul yang tidak aktif disembunyikan di web.
      const ids = [...bySchool.keys()];
      if (ids.length > 0) {
        const active = await request.server.platformDb
          .select({ schoolId: entitlement.schoolId, moduleKey: entitlement.moduleKey })
          .from(entitlement)
          .where(and(inArray(entitlement.schoolId, ids), gt(entitlement.validUntil, new Date())));
        for (const a of active) bySchool.get(a.schoolId)?.modules.push(a.moduleKey);
      }
      const u = request.authUser;
      return {
        user: { id: userId, name: u?.name ?? '', email: u?.email ?? '' },
        memberships: [...bySchool.values()],
      };
    },
  );
}
