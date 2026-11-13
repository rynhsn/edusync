import { auditLog, type Tx } from '@edusync/db';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import type { TenantContext } from '../identity/guards';

export const schoolHeader = z.object({ 'x-school-id': z.uuid().describe('Sekolah yang sedang dipakai') });
export const guarded = { 401: errorSchema, 403: errorSchema };
export const idParams = z.object({ id: z.uuid() });
export const ok = z.object({ ok: z.literal(true) });

/**
 * Penanda remedial (tahap 3.5), SPARSE: hanya ada bila siswa punya percobaan remedial pada mapel itu. Dipakai rekap nilai dan
 * nilai portal; bentuk respons sekolah tanpa percobaan tidak berubah.
 */
export const remedialMarkSchema = z
  .object({
    attempts: z.number().int().describe('Jumlah percobaan remedial siswa pada mapel ini (semua penilaian)'),
    effectiveSource: z
      .enum(['original', 'remedial'])
      .describe(
        '`remedial` = ada nilai efektif yang berbeda dari skor asli menurut kebijakan remedial sekolah; `original` = skor asli dipakai (mis. kebijakan hanya mencatat)',
      ),
  })
  .optional()
  .describe(
    'Penanda remedial; ada hanya bila ada percobaan. Skor asli tidak pernah ditimpa; nilai akhir memakai nilai efektif menurut kebijakan sekolah.',
  );

/** Pelanggaran unique (kode Postgres 23505), termasuk yang dibungkus oleh driver/ORM. */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/** Pelanggaran foreign key (23503, atau 23001 untuk ON DELETE RESTRICT): data masih dipakai tabel lain atau rujukan tidak ada. */
export function isForeignKeyViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  const codes = ['23503', '23001'];
  return codes.includes(e?.code ?? '') || codes.includes(e?.cause?.code ?? '');
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
