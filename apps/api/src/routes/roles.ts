import { randomUUID } from 'node:crypto';
import { PERMISSIONS, slugify } from '@edusync/contracts';
import { and, auditLog, eq, memberRole, role, rolePermission, withTenant } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';

const schoolHeader = z.object({ 'x-school-id': z.uuid().describe('Sekolah yang sedang dipakai') });
const tag = ['Roles'];
const guarded = { 401: errorSchema, 403: errorSchema };

const roleSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
});

const body = z.object({
  name: z.string().trim().min(2).max(40),
  permissions: z.array(z.enum(PERMISSIONS)).min(1).max(PERMISSIONS.length),
});

/** Admin sekolah selalu memegang semua izin; perannya tidak boleh diubah supaya sekolah tidak terkunci. */
const LOCKED_KEY = 'school_admin';

export async function roleRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/v1/roles',
    {
      onRequest: [requirePermission('role:manage')],
      schema: {
        tags: tag,
        summary: 'Buat peran kustom',
        description:
          'Izin: `role:manage`. Hanya izin yang dimiliki pembuat yang boleh dimasukkan (tidak ada kenaikan izin). ' +
          'Peran kustom dapat diberikan ke anggota seperti peran bawaan.',
        headers: schoolHeader,
        body,
        response: { 201: roleSchema, 400: errorSchema, 403: errorSchema, 401: errorSchema },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const permissions = [...new Set(request.body.permissions)];
      const missing = permissions.filter((p) => !ctx.permissions.has(p));
      if (missing.length > 0) {
        throw new HttpError(403, 'forbidden', 'Anda tidak dapat memberi izin yang tidak Anda miliki.');
      }
      const created = await withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const base = `custom-${slugify(request.body.name) || 'peran'}`.slice(0, 50);
        const [clash] = await tx.select({ id: role.id }).from(role).where(eq(role.key, base));
        const key = clash ? `${base}-${randomUUID().slice(0, 4)}` : base;
        const [row] = await tx
          .insert(role)
          .values({ schoolId: ctx.schoolId, key, name: request.body.name, isSystem: false })
          .returning();
        await tx
          .insert(rolePermission)
          .values(permissions.map((permission) => ({ roleId: row!.id, schoolId: ctx.schoolId, permission })));
        await tx.insert(auditLog).values({
          schoolId: ctx.schoolId,
          actorId: ctx.userId,
          action: 'role.create',
          entityType: 'role',
          entityId: row!.id,
          details: { name: row!.name, permissions, viaRoles: ctx.roles },
        });
        return row!;
      });
      return reply.code(201).send({
        id: created.id,
        key: created.key,
        name: created.name,
        isSystem: false,
        permissions: permissions.sort(),
      });
    },
  );

  app.put(
    '/v1/roles/:id',
    {
      onRequest: [requirePermission('role:manage')],
      schema: {
        tags: tag,
        summary: 'Ubah izin (dan nama) sebuah peran',
        description:
          'Izin: `role:manage`. Berlaku segera untuk semua pemegang peran. Izin yang ditambah atau dicabut harus ' +
          'termasuk izin pengubah. Nama hanya bisa diubah pada peran kustom. Peran Admin sekolah tidak bisa diubah.',
        headers: schoolHeader,
        params: z.object({ id: z.uuid() }),
        body,
        response: { 200: roleSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const next: string[] = [...new Set(request.body.permissions)];
      return withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const [r] = await tx.select().from(role).where(eq(role.id, request.params.id));
        if (!r) throw new HttpError(404, 'not_found', 'Peran tidak ditemukan.');
        if (r.key === LOCKED_KEY) {
          throw new HttpError(409, 'role_locked', 'Peran Admin sekolah tidak dapat diubah.');
        }
        const current = (
          await tx
            .select({ permission: rolePermission.permission })
            .from(rolePermission)
            .where(eq(rolePermission.roleId, r.id))
        ).map((p) => p.permission);
        const changed = [
          ...next.filter((p) => !current.includes(p)),
          ...current.filter((p) => !next.includes(p)),
        ];
        if (changed.some((p) => !ctx.permissions.has(p))) {
          throw new HttpError(403, 'forbidden', 'Anda tidak dapat mengubah izin yang tidak Anda miliki.');
        }
        const name = r.isSystem ? r.name : request.body.name;
        await tx.update(role).set({ name }).where(eq(role.id, r.id));
        await tx.delete(rolePermission).where(eq(rolePermission.roleId, r.id));
        await tx
          .insert(rolePermission)
          .values(next.map((permission) => ({ roleId: r.id, schoolId: ctx.schoolId, permission })));
        await tx.insert(auditLog).values({
          schoolId: ctx.schoolId,
          actorId: ctx.userId,
          action: 'role.update',
          entityType: 'role',
          entityId: r.id,
          details: { name, before: current.sort(), after: [...next].sort(), viaRoles: ctx.roles },
        });
        return { id: r.id, key: r.key, name, isSystem: r.isSystem, permissions: [...next].sort() };
      });
    },
  );

  app.delete(
    '/v1/roles/:id',
    {
      onRequest: [requirePermission('role:manage')],
      schema: {
        tags: tag,
        summary: 'Hapus peran kustom',
        description:
          'Izin: `role:manage`. Hanya peran kustom yang tidak sedang dipegang siapa pun. Peran bawaan tidak bisa dihapus.',
        headers: schoolHeader,
        params: z.object({ id: z.uuid() }),
        response: { 200: z.object({ ok: z.literal(true) }), 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const [r] = await tx.select().from(role).where(eq(role.id, request.params.id));
        if (!r) throw new HttpError(404, 'not_found', 'Peran tidak ditemukan.');
        if (r.isSystem) throw new HttpError(409, 'role_system', 'Peran bawaan tidak dapat dihapus.');
        const [held] = await tx
          .select({ memberId: memberRole.memberId })
          .from(memberRole)
          .where(eq(memberRole.roleId, r.id))
          .limit(1);
        if (held) {
          throw new HttpError(
            409,
            'role_in_use',
            'Peran ini masih dipegang anggota. Lepaskan dulu dari mereka.',
          );
        }
        await tx.delete(rolePermission).where(eq(rolePermission.roleId, r.id));
        await tx.delete(role).where(and(eq(role.id, r.id), eq(role.isSystem, false)));
        await tx.insert(auditLog).values({
          schoolId: ctx.schoolId,
          actorId: ctx.userId,
          action: 'role.delete',
          entityType: 'role',
          entityId: r.id,
          details: { name: r.name, viaRoles: ctx.roles },
        });
      });
      return { ok: true as const };
    },
  );
}
