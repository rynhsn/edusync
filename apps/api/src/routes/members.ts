import {
  and,
  assignRoles,
  auditLog,
  eq,
  inArray,
  member,
  memberRole,
  ne,
  role,
  rolePermission,
  type Tx,
  user,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';

const schoolHeader = z.object({ 'x-school-id': z.uuid().describe('Sekolah yang sedang dipakai') });
const roleKeys = z.array(z.string().min(1).max(60)).min(1).max(10);
const tag = ['Members'];
const guarded = { 401: errorSchema, 403: errorSchema };

const roleSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
});

const memberSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  status: z.enum(['active', 'disabled']),
  roles: z.array(z.string()),
});

/** Peran sekolah (kunci -> id, izin). Hanya peran milik sekolah di konteks tenant yang terlihat. */
export async function rolesByKey(tx: Tx, keys: string[]) {
  const rows = await tx.select().from(role).where(inArray(role.key, keys));
  if (rows.length !== new Set(keys).size)
    throw new HttpError(400, 'unknown_role', 'Ada peran yang tidak dikenal.');
  const perms = await tx
    .select({ roleId: rolePermission.roleId, permission: rolePermission.permission })
    .from(rolePermission)
    .where(
      inArray(
        rolePermission.roleId,
        rows.map((r) => r.id),
      ),
    );
  return rows.map((r) => ({
    ...r,
    permissions: perms.filter((p) => p.roleId === r.id).map((p) => p.permission),
  }));
}

/** Tidak boleh memberi peran yang izinnya melebihi izin pemberi (mencegah menaikkan diri atau orang lain). */
export function assertNoEscalation(ctx: TenantContext, roles: { name: string; permissions: string[] }[]) {
  for (const r of roles) {
    if (r.permissions.some((p) => !ctx.permissions.has(p))) {
      throw new HttpError(
        403,
        'forbidden',
        `Anda tidak dapat mengelola peran "${r.name}" karena izinnya melebihi izin Anda.`,
      );
    }
  }
}

/** Sekolah harus selalu punya minimal satu admin aktif selain `exceptMemberId`. */
async function assertAnotherAdmin(tx: Tx, exceptMemberId: string) {
  const rows = await tx
    .select({ id: member.id })
    .from(member)
    .innerJoin(memberRole, eq(memberRole.memberId, member.id))
    .innerJoin(role, eq(role.id, memberRole.roleId))
    .where(and(eq(role.key, 'school_admin'), eq(member.status, 'active'), ne(member.id, exceptMemberId)))
    .limit(1);
  if (rows.length === 0) {
    throw new HttpError(409, 'last_admin', 'Sekolah harus memiliki minimal satu admin sekolah yang aktif.');
  }
}

async function loadMember(tx: Tx, memberId: string) {
  const [m] = await tx.select().from(member).where(eq(member.id, memberId));
  if (!m) throw new HttpError(404, 'not_found', 'Anggota tidak ditemukan.');
  const held = await tx
    .select({ key: role.key })
    .from(memberRole)
    .innerJoin(role, eq(role.id, memberRole.roleId))
    .where(eq(memberRole.memberId, memberId));
  return { m, held: held.map((h) => h.key) };
}

export async function memberRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/v1/roles',
    {
      onRequest: [requirePermission('member:read')],
      schema: {
        tags: tag,
        summary: 'Daftar peran sekolah beserta izinnya',
        description: 'Izin: `member:read`.',
        headers: schoolHeader,
        response: { 200: z.array(roleSchema), ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const roles = await tx.select().from(role).orderBy(role.name);
        const perms = await tx.select().from(rolePermission);
        return roles.map((r) => ({
          id: r.id,
          key: r.key,
          name: r.name,
          isSystem: r.isSystem,
          permissions: perms
            .filter((p) => p.roleId === r.id)
            .map((p) => p.permission)
            .sort(),
        }));
      });
    },
  );

  app.get(
    '/v1/members',
    {
      onRequest: [requirePermission('member:read')],
      schema: {
        tags: tag,
        summary: 'Daftar anggota sekolah beserta perannya',
        description: 'Izin: `member:read`.',
        headers: schoolHeader,
        response: { 200: z.array(memberSchema), ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const members = await tx
          .select({
            id: member.id,
            userId: member.userId,
            status: member.status,
            name: user.name,
            email: user.email,
          })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .orderBy(user.name);
        const held = await tx
          .select({ memberId: memberRole.memberId, key: role.key })
          .from(memberRole)
          .innerJoin(role, eq(role.id, memberRole.roleId));
        return members.map((m) => ({
          ...m,
          roles: held
            .filter((h) => h.memberId === m.id)
            .map((h) => h.key)
            .sort(),
        }));
      });
    },
  );

  app.post(
    '/v1/members',
    {
      onRequest: [requirePermission('member:manage')],
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: tag,
        summary: 'Tambahkan akun yang sudah terdaftar sebagai anggota sekolah',
        description:
          'Izin: `member:manage`. Akun harus sudah mendaftar (undangan lewat email menyusul). Peran yang diberikan ' +
          'tidak boleh memiliki izin yang melebihi izin pemberi.',
        headers: schoolHeader,
        body: z.object({ email: z.email().max(254), roles: roleKeys }),
        response: { 201: memberSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const email = request.body.email.trim().toLowerCase();
      const created = await withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const roles = await rolesByKey(tx, request.body.roles);
        assertNoEscalation(ctx, roles);
        const [account] = await tx.select().from(user).where(eq(user.email, email));
        if (!account) {
          throw new HttpError(
            404,
            'account_not_found',
            'Belum ada akun dengan email itu. Minta orangnya mendaftar dulu.',
          );
        }
        const [row] = await tx
          .insert(member)
          .values({ userId: account.id, schoolId: ctx.schoolId })
          .onConflictDoNothing()
          .returning();
        if (!row) throw new HttpError(409, 'already_member', 'Orang ini sudah menjadi anggota sekolah.');
        await assignRoles(tx, row.id, ctx.schoolId, request.body.roles);
        await tx.insert(auditLog).values({
          schoolId: ctx.schoolId,
          actorId: ctx.userId,
          action: 'member.add',
          entityType: 'member',
          entityId: row.id,
          details: { userId: account.id, roles: request.body.roles, viaRoles: ctx.roles },
        });
        return {
          id: row.id,
          userId: account.id,
          name: account.name,
          email: account.email,
          status: row.status,
          roles: [...request.body.roles].sort(),
        };
      });
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/v1/members/:id/roles',
    {
      onRequest: [requirePermission('member:manage')],
      schema: {
        tags: tag,
        summary: 'Ganti seluruh peran seorang anggota',
        description:
          'Izin: `member:manage`. Izin anggota = gabungan semua perannya. Peran yang ditambah atau dicabut tidak boleh ' +
          'memiliki izin yang melebihi izin pemberi. Sekolah selalu harus punya minimal satu admin aktif.',
        headers: schoolHeader,
        params: z.object({ id: z.uuid() }),
        body: z.object({ roles: roleKeys }),
        response: { 200: memberSchema, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const { m, held } = await loadMember(tx, request.params.id);
        const next = [...new Set(request.body.roles)];
        const changed = [...next.filter((k) => !held.includes(k)), ...held.filter((k) => !next.includes(k))];
        const touched = changed.length > 0 ? await rolesByKey(tx, changed) : [];
        assertNoEscalation(ctx, touched);
        if (held.includes('school_admin') && !next.includes('school_admin')) {
          await assertAnotherAdmin(tx, m.id);
        }
        await tx.delete(memberRole).where(eq(memberRole.memberId, m.id));
        await assignRoles(tx, m.id, ctx.schoolId, next);
        await tx.insert(auditLog).values({
          schoolId: ctx.schoolId,
          actorId: ctx.userId,
          action: 'member.roles',
          entityType: 'member',
          entityId: m.id,
          details: { before: held, after: next, viaRoles: ctx.roles },
        });
        const [account] = await tx.select().from(user).where(eq(user.id, m.userId));
        return {
          id: m.id,
          userId: m.userId,
          name: account?.name ?? '',
          email: account?.email ?? '',
          status: m.status,
          roles: next.sort(),
        };
      });
    },
  );

  app.patch(
    '/v1/members/:id',
    {
      onRequest: [requirePermission('member:manage')],
      schema: {
        tags: tag,
        summary: 'Nonaktifkan atau aktifkan kembali anggota',
        description:
          'Izin: `member:manage`. Anggota nonaktif langsung kehilangan semua izin di sekolah ini. Tidak bisa ' +
          'menonaktifkan diri sendiri atau admin terakhir.',
        headers: schoolHeader,
        params: z.object({ id: z.uuid() }),
        body: z.object({ status: z.enum(['active', 'disabled']) }),
        response: { 200: memberSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const { m, held } = await loadMember(tx, request.params.id);
        if (request.body.status === 'disabled') {
          if (m.id === ctx.memberId) {
            throw new HttpError(409, 'self_disable', 'Anda tidak dapat menonaktifkan akun Anda sendiri.');
          }
          const roles = held.length > 0 ? await rolesByKey(tx, held) : [];
          assertNoEscalation(ctx, roles);
          if (held.includes('school_admin')) await assertAnotherAdmin(tx, m.id);
        }
        await tx.update(member).set({ status: request.body.status }).where(eq(member.id, m.id));
        await tx.insert(auditLog).values({
          schoolId: ctx.schoolId,
          actorId: ctx.userId,
          action: request.body.status === 'disabled' ? 'member.disable' : 'member.enable',
          entityType: 'member',
          entityId: m.id,
          details: { userId: m.userId, viaRoles: ctx.roles },
        });
        const [account] = await tx.select().from(user).where(eq(user.id, m.userId));
        return {
          id: m.id,
          userId: m.userId,
          name: account?.name ?? '',
          email: account?.email ?? '',
          status: request.body.status,
          roles: held.sort(),
        };
      });
    },
  );
}
