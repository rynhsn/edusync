import {
  and,
  enrollment,
  eq,
  isNull,
  reportCard,
  type semester,
  student,
  type Tx,
  teacher,
} from '@edusync/db';
import { forbidden, HttpError } from './http-error';
import type { TenantContext } from './identity/guards';

/**
 * Otorisasi dan pencarian bersama untuk rute rapor (rapor, deskripsi manual, tanggapan). Dipindah dari `routes/report-card.ts`
 * tanpa mengubah aturannya supaya rute baru memakai satu sumber.
 */

export const reportNotFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);
export const reportNotAllowed = () =>
  forbidden('Anda hanya boleh mengakses rapor kelas yang Anda walikan, kecuali pemegang izin kelola rapor.');

export const isWide = (ctx: TenantContext) =>
  ctx.permissions.has('report_card:manage') || ctx.permissions.has('report_card:read_all');

export async function isHomeroom(tx: Tx, ctx: TenantContext, homeroomTeacherId: string | null) {
  if (!homeroomTeacherId) return false;
  const [t] = await tx
    .select({ memberId: teacher.memberId })
    .from(teacher)
    .where(eq(teacher.id, homeroomTeacherId));
  return t?.memberId === ctx.memberId;
}

/** Melihat rapor kelas: pemegang kelola, kepala sekolah, kurikulum, atau wali kelas itu. */
export async function canViewClass(tx: Tx, ctx: TenantContext, homeroomTeacherId: string | null) {
  return isWide(ctx) || (await isHomeroom(tx, ctx, homeroomTeacherId));
}

/** Mengubah catatan dan memfinalkan: pemegang kelola atau wali kelas itu. */
export async function canWriteClass(tx: Tx, ctx: TenantContext, homeroomTeacherId: string | null) {
  return ctx.permissions.has('report_card:manage') || (await isHomeroom(tx, ctx, homeroomTeacherId));
}

/** Kelas siswa itu pada tahun ajaran semester: rapor final mengikuti kelas saat difinalkan. */
export async function resolveReportStudent(tx: Tx, sem: typeof semester.$inferSelect, studentId: string) {
  const [stu] = await tx
    .select()
    .from(student)
    .where(and(eq(student.id, studentId), isNull(student.deletedAt)));
  if (!stu) throw reportNotFound('Siswa');
  const [row] = await tx
    .select()
    .from(reportCard)
    .where(and(eq(reportCard.semesterId, sem.id), eq(reportCard.studentId, studentId)));
  const [enr] = await tx
    .select({ classId: enrollment.classId })
    .from(enrollment)
    .where(and(eq(enrollment.studentId, studentId), eq(enrollment.academicYearId, sem.academicYearId)));
  const classId = row?.status === 'final' ? row.classId : (enr?.classId ?? row?.classId);
  if (!classId) throw reportNotFound('Siswa di kelas pada semester itu');
  return { stu, row: row ?? null, classId };
}
