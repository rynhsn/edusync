import { classRoom, eq, semester, subject, type Tx, teacher, teachingAssignment } from '@edusync/db';
import { forbidden, HttpError } from './http-error';
import type { TenantContext } from './identity/guards';

/**
 * Hak akses penilaian per pasangan (kelas, mapel), dipakai rute penilaian dan rute pendampingan/remedial supaya aturannya satu.
 * Pemegang `grade:configure` dan `grade:read_all` (kepala sekolah, kurikulum) melihat semua; guru hanya pasangan yang ia ampu.
 */

/** Pemegang `grade:configure`, kepala sekolah, dan kurikulum melihat semua kelas dan mapel. */
export const isWide = (ctx: TenantContext) =>
  ctx.permissions.has('grade:configure') || ctx.permissions.has('grade:read_all');

/** Pasangan (kelas, mapel) yang diampu pengguna ini (guru dengan `teacher.memberId` = anggota ini). */
export function myAssignments(tx: Tx, ctx: TenantContext) {
  return tx
    .select({ classId: teachingAssignment.classId, subjectId: teachingAssignment.subjectId })
    .from(teachingAssignment)
    .innerJoin(teacher, eq(teacher.id, teachingAssignment.teacherId))
    .where(eq(teacher.memberId, ctx.memberId));
}

export type Assignment = Awaited<ReturnType<typeof myAssignments>>[number];

export const teaches = (mine: Assignment[], classId: string, subjectId: string) =>
  mine.some((a) => a.classId === classId && a.subjectId === subjectId);

/** Boleh membaca nilai kelas+mapel itu. */
export async function canReadPair(tx: Tx, ctx: TenantContext, classId: string, subjectId: string) {
  if (isWide(ctx)) return true;
  return teaches(await myAssignments(tx, ctx), classId, subjectId);
}

/** Boleh mengelola penilaian dan skor kelas+mapel itu: pemegang configure, atau guru pengampu dengan `grade:input`. */
export async function canInputPair(tx: Tx, ctx: TenantContext, classId: string, subjectId: string) {
  if (ctx.permissions.has('grade:configure')) return true;
  if (!ctx.permissions.has('grade:input')) return false;
  return teaches(await myAssignments(tx, ctx), classId, subjectId);
}

export async function myTeacherId(tx: Tx, ctx: TenantContext) {
  const [mine] = await tx.select({ id: teacher.id }).from(teacher).where(eq(teacher.memberId, ctx.memberId));
  return mine?.id ?? null;
}

export const notAllowed = () =>
  forbidden('Anda hanya boleh mengakses penilaian untuk kelas dan mata pelajaran yang Anda ampu.');

/** Semester, kelas, dan mapel milik sekolah ini; semester dan kelas satu tahun ajaran (400 `invalid_reference`). */
export async function requirePairRefs(
  tx: Tx,
  refs: { semesterId: string; classId: string; subjectId: string },
) {
  const invalid = (message: string) => new HttpError(400, 'invalid_reference', message);
  const [sem] = await tx.select().from(semester).where(eq(semester.id, refs.semesterId));
  if (!sem) throw invalid('Semester tidak ditemukan.');
  const [cls] = await tx.select().from(classRoom).where(eq(classRoom.id, refs.classId));
  if (!cls) throw invalid('Kelas tidak ditemukan.');
  if (cls.academicYearId !== sem.academicYearId) {
    throw invalid('Semester dan kelas harus berada pada tahun ajaran yang sama.');
  }
  const [sub] = await tx.select({ id: subject.id }).from(subject).where(eq(subject.id, refs.subjectId));
  if (!sub) throw invalid('Mata pelajaran tidak ditemukan.');
}
