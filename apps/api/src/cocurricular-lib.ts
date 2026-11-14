import {
  and,
  cocurricularAssessment,
  cocurricularFacilitator,
  enrollment,
  eq,
  inArray,
  reportCard,
  type Tx,
  teacher,
} from '@edusync/db';
import { HttpError } from './http-error';
import type { TenantContext } from './identity/guards';
import { REPORT_FINAL_CODE } from './report-lock-lib';

/**
 * Penilaian kokurikuler (tahap 4.3): hak menilai kontekstual dan penjaga data yang sudah dinilai. Kokurikuler bukan mapel; semua
 * fungsi berjalan di dalam transaksi tenant pemanggilnya.
 */

/** Peran yang melihat penilaian semua rombel walau tidak punya `cocurricular:manage` (pola `reportClassScope`). */
const VIEW_WIDE_ROLES = ['principal', 'curriculum', 'operator'];

async function facilitatorRows(tx: Tx, ctx: TenantContext, programId: string) {
  const [mine] = await tx.select({ id: teacher.id }).from(teacher).where(eq(teacher.memberId, ctx.memberId));
  if (!mine) return [];
  return tx
    .select({ classId: cocurricularFacilitator.classId, role: cocurricularFacilitator.role })
    .from(cocurricularFacilitator)
    .where(
      and(eq(cocurricularFacilitator.programId, programId), eq(cocurricularFacilitator.teacherId, mine.id)),
    );
}

/**
 * Boleh menilai / menambah bukti: pengelola (`cocurricular:manage`), koordinator program (semua rombel), atau fasilitator rombel itu.
 * `classId` null (bukti tingkat program) hanya untuk pengelola dan koordinator.
 */
export async function canAssessCocurricular(
  tx: Tx,
  ctx: TenantContext,
  programId: string,
  classId: string | null,
): Promise<boolean> {
  if (ctx.permissions.has('cocurricular:manage')) return true;
  const rows = await facilitatorRows(tx, ctx, programId);
  return rows.some((r) => r.role === 'coordinator' || (classId !== null && r.classId === classId));
}

/**
 * Rombel yang boleh DILIHAT penilaiannya: null = semua (pengelola, kepala sekolah, kurikulum, operator, koordinator); selain itu
 * himpunan rombel tempat pengguna menjadi fasilitator (kosong untuk guru biasa).
 */
export async function viewableClasses(
  tx: Tx,
  ctx: TenantContext,
  programId: string,
): Promise<Set<string> | null> {
  if (ctx.permissions.has('cocurricular:manage') || ctx.roles.some((r) => VIEW_WIDE_ROLES.includes(r)))
    return null;
  const rows = await facilitatorRows(tx, ctx, programId);
  if (rows.some((r) => r.role === 'coordinator')) return null;
  return new Set(rows.flatMap((r) => (r.classId ? [r.classId] : [])));
}

/**
 * Tolak perubahan struktur (hapus program, lepas rombel, lepas butir) yang menyentuh penilaian. Bila salah satu penilaian yang
 * terdampak milik murid-semester yang rapornya sudah final: 409 `report_final`; selain itu 409 `cocurricular_assessed`.
 * `classIds` / `profileItemIds` menyempitkan cakupan (rombel lewat pendaftaran murid pada rombel itu); tanpa keduanya = seluruh program.
 */
export async function assertNotAssessed(
  tx: Tx,
  programId: string,
  scope: { classIds?: string[]; profileItemIds?: string[] } = {},
) {
  if (scope.classIds && scope.classIds.length === 0) return;
  if (scope.profileItemIds && scope.profileItemIds.length === 0) return;
  const conds = [eq(cocurricularAssessment.programId, programId)];
  if (scope.profileItemIds) conds.push(inArray(cocurricularAssessment.profileItemId, scope.profileItemIds));
  if (scope.classIds) {
    conds.push(
      inArray(
        cocurricularAssessment.studentId,
        tx
          .select({ id: enrollment.studentId })
          .from(enrollment)
          .where(inArray(enrollment.classId, scope.classIds)),
      ),
    );
  }
  const [hit] = await tx
    .select({ id: cocurricularAssessment.id })
    .from(cocurricularAssessment)
    .where(and(...conds))
    .limit(1);
  if (!hit) return;
  const [final] = await tx
    .select({ id: reportCard.id })
    .from(cocurricularAssessment)
    .innerJoin(
      reportCard,
      and(
        eq(reportCard.studentId, cocurricularAssessment.studentId),
        eq(reportCard.semesterId, cocurricularAssessment.semesterId),
        eq(reportCard.status, 'final'),
      ),
    )
    .where(and(...conds))
    .limit(1);
  if (final) {
    throw new HttpError(
      409,
      REPORT_FINAL_CODE,
      'Ada penilaian kokurikuler pada rapor yang sudah difinalkan. Buka kembali rapornya di menu Rapor lebih dulu.',
    );
  }
  throw new HttpError(
    409,
    'cocurricular_assessed',
    'Program, rombel, atau butir ini sudah punya penilaian kokurikuler. Bersihkan penilaiannya, atau tutup program (status Selesai) untuk menyimpan riwayat.',
  );
}
