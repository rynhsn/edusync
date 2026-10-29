import { auditLog, type Tx } from '@edusync/db';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import type { TenantContext } from '../identity/guards';

export const schoolHeader = z.object({ 'x-school-id': z.uuid().describe('Sekolah yang sedang dipakai') });
export const guarded = { 401: errorSchema, 403: errorSchema };
export const idParams = z.object({ id: z.uuid() });
export const ok = z.object({ ok: z.literal(true) });

/** Pelanggaran unique (kode Postgres 23505), termasuk yang dibungkus oleh driver/ORM. */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/** Pelanggaran foreign key (23503): data masih dipakai tabel lain atau rujukan tidak ada. */
export function isForeignKeyViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === '23503' || e?.cause?.code === '23503';
}

/** Jalankan operasi tulis; unique yang bentrok menjadi 409 dengan pesan yang diberikan. */
export async function conflictAs409<T>(message: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, 'conflict', message);
    throw error;
  }
}

/**
 * Operasi tulis di dalam transaksi tenant yang gagal oleh pelanggaran unique akan membatalkan transaksi,
 * jadi bungkus seluruh `withTenant`, bukan satu statement di dalamnya.
 */
export function audit(
  tx: Tx,
  ctx: TenantContext,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {},
) {
  return tx.insert(auditLog).values({
    schoolId: ctx.schoolId,
    actorId: ctx.userId,
    action,
    entityType,
    entityId,
    details: { ...details, viaRoles: ctx.roles },
  });
}
