import type { Permission } from '@edusync/contracts';
import { eq, loadMemberAccess, school } from '@edusync/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { forbidden, HttpError, unauthorized } from '../http-error';
import { sessionFrom } from './session';

export interface TenantContext {
  userId: string;
  schoolId: string;
  memberId: string;
  roles: string[];
  permissions: Set<string>;
}

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    authUser?: { id: string; name: string; email: string };
    ctx?: TenantContext;
  }
}

const schoolIdHeader = z.uuid();

/** Wajib sudah masuk. Tidak butuh sekolah. */
export async function requireUser(request: FastifyRequest) {
  const s = await sessionFrom(request);
  if (!s) throw unauthorized();
  request.userId = s.user.id;
  request.authUser = { id: s.user.id, name: s.user.name, email: s.user.email };
}

/**
 * Wajib sudah masuk dan menjadi anggota aktif sekolah yang disebut header `x-school-id`.
 * Pencarian keanggotaan memakai pool platform karena konteks tenant belum ada pada titik ini;
 * hasilnya langsung mempersempit semua query berikutnya ke satu sekolah.
 */
export async function requireTenant(request: FastifyRequest) {
  await requireUser(request);
  const parsed = schoolIdHeader.safeParse(request.headers['x-school-id']);
  if (!parsed.success)
    throw new HttpError(400, 'school_required', 'Header x-school-id wajib berisi id sekolah.');
  const schoolId = parsed.data;
  const userId = request.userId as string;

  const db = request.server.platformDb;
  const [row] = await db.select({ status: school.status }).from(school).where(eq(school.id, schoolId));
  const access = row ? await loadMemberAccess(db, userId, schoolId) : null;
  // Sekolah yang tidak ada dan sekolah yang bukan milik pengguna dijawab sama agar id tidak bisa ditebak.
  if (!row || !access) throw forbidden('Anda bukan anggota sekolah ini.');
  if (row.status !== 'active')
    throw new HttpError(403, 'school_suspended', 'Sekolah ini sedang ditangguhkan.');

  request.ctx = {
    userId,
    schoolId,
    memberId: access.memberId,
    roles: access.roles,
    permissions: access.permissions,
  };
}

/** Pemeriksaan izin. Izin dihitung dari gabungan semua peran yang dipegang anggota. */
export function requirePermission(...needed: Permission[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    await requireTenant(request);
    const ctx = request.ctx as TenantContext;
    const missing = needed.filter((p) => !ctx.permissions.has(p));
    if (missing.length > 0) throw forbidden();
  };
}
