import { eq, type Tx, teacher, teachingAssignment } from '@edusync/db';
import { forbidden } from './http-error';
import type { TenantContext } from './identity/guards';

/**
 * Mata pelajaran yang boleh disentuh pengguna di modul ujian: `null` = semua (pengelola ujian, atau peran
 * baca-saja seperti kepala sekolah); selain itu hanya mapel yang diampu gurunya.
 */
export async function subjectScope(tx: Tx, ctx: TenantContext): Promise<string[] | null> {
  if (ctx.permissions.has('exam:manage') || !ctx.permissions.has('exam:author')) return null;
  const [me] = await tx.select({ id: teacher.id }).from(teacher).where(eq(teacher.memberId, ctx.memberId));
  if (!me) return [];
  const rows = await tx
    .selectDistinct({ id: teachingAssignment.subjectId })
    .from(teachingAssignment)
    .where(eq(teachingAssignment.teacherId, me.id));
  return rows.map((r) => r.id);
}

/** 403 bila pengguna tidak boleh menyentuh mapel ini. */
export async function guardSubject(tx: Tx, ctx: TenantContext, subjectId: string) {
  const scope = await subjectScope(tx, ctx);
  if (scope && !scope.includes(subjectId)) {
    throw forbidden('Anda hanya boleh mengelola ujian dan soal untuk mata pelajaran yang Anda ampu.');
  }
}
