import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { ADMISSION_STATUSES, type AdmissionStatus, canTransition } from '@edusync/contracts';
import {
  admissionPeriod,
  and,
  application,
  applicationStatusLog,
  count,
  eq,
  inArray,
  type Tx,
} from '@edusync/db';
import { z } from 'zod';
import type { TenantContext } from './identity/guards';

export const statusEnum = z.enum(ADMISSION_STATUSES);

/** Huruf dan angka tanpa karakter yang mudah tertukar (0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Kode pelacakan acak 10 karakter, ditampilkan berkelompok (XXXXX-XXXXX). Hanya tampil sekali. */
export function newTrackingCode(): string {
  const chars = Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

/** Bentuk baku kode: huruf besar dan angka saja (tanda hubung dan spasi diabaikan). */
export const canonicalCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const hashTrackingCode = (code: string) =>
  createHash('sha256').update(canonicalCode(code)).digest('hex');

/** Perbandingan hash waktu-konstan. */
export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export type TransitionFailure = 'not_found' | 'invalid_transition' | 'use_enroll' | 'quota_full';

/**
 * Ubah status satu pendaftar di dalam transaksi tenant: baris dikunci, peralihan diperiksa lewat `canTransition`,
 * kuota diperiksa untuk `accepted`, lalu log status ditulis. Mengembalikan kode kegagalan (tanpa melempar)
 * agar pemanggil massal bisa melanjutkan ke pendaftar berikutnya.
 */
export async function transitionApplication(
  tx: Tx,
  ctx: TenantContext,
  id: string,
  to: AdmissionStatus,
  note: string | null,
): Promise<{ failure: TransitionFailure } | { from: AdmissionStatus }> {
  const [app] = await tx.select().from(application).where(eq(application.id, id)).for('update');
  if (!app) return { failure: 'not_found' };
  if (to === 'enrolled') return { failure: 'use_enroll' };
  if (!canTransition(app.status, to)) return { failure: 'invalid_transition' };
  if (to === 'accepted') {
    // Kunci periode agar penerimaan serentak tidak melampaui kuota.
    const [period] = await tx
      .select({ quota: admissionPeriod.quota })
      .from(admissionPeriod)
      .where(eq(admissionPeriod.id, app.periodId))
      .for('update');
    if (period?.quota != null) {
      const used = await usedQuota(tx, app.periodId);
      if (used >= period.quota) return { failure: 'quota_full' };
    }
  }
  await tx
    .update(application)
    .set({
      status: to,
      ...(to === 'accepted' || to === 'rejected' ? { decisionNote: note } : {}),
    })
    .where(eq(application.id, id));
  await tx.insert(applicationStatusLog).values({
    schoolId: ctx.schoolId,
    applicationId: id,
    fromStatus: app.status,
    toStatus: to,
    note,
    actor: ctx.userId,
  });
  return { from: app.status };
}

/** Kuota terpakai periode: pendaftar berstatus diterima atau sudah daftar ulang. */
export async function usedQuota(tx: Tx, periodId: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(application)
    .where(and(eq(application.periodId, periodId), inArray(application.status, ['accepted', 'enrolled'])));
  return row?.n ?? 0;
}
