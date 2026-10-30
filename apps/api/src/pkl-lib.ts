import { createHash, randomBytes } from 'node:crypto';
import { and, eq, inArray, pklAspect, pklScore, type Tx } from '@edusync/db';
import { z } from 'zod';
import { HttpError } from './http-error';

/** Token tautan pembimbing industri: 32 byte acak, base64url (43 karakter). */
export function newAccessToken() {
  return randomBytes(32).toString('base64url');
}

/** Hash SHA-256 (hex) dari token; hanya hash ini yang disimpan. */
export function hashAccessToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

/** Tambah (atau kurangi) hari pada tanggal ISO YYYY-MM-DD. */
export function addDays(iso: string, days: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Tautan pembimbing industri masih boleh menulis sampai 14 hari setelah periode berakhir; penempatan batal tidak. */
export const LINK_GRACE_DAYS = 14;
export function linkCanWrite(endsOn: string, status: string, today: string) {
  return status !== 'cancelled' && today <= addDays(endsOn, LINK_GRACE_DAYS);
}

/** Toleransi tanggal jurnal di luar rentang periode (hari). */
export const JOURNAL_TOLERANCE_DAYS = 7;

/** Tanggal jurnal: tidak boleh di masa depan dan harus dalam periode (± toleransi). */
export function assertJournalDate(date: string, period: { startsOn: string; endsOn: string }, today: string) {
  if (date > today) throw new HttpError(400, 'date_in_future', 'Tanggal jurnal tidak boleh di masa depan.');
  if (
    date < addDays(period.startsOn, -JOURNAL_TOLERANCE_DAYS) ||
    date > addDays(period.endsOn, JOURNAL_TOLERANCE_DAYS)
  ) {
    throw new HttpError(400, 'date_out_of_period', 'Tanggal jurnal berada di luar periode PKL.');
  }
}

export const scoreRecordsBody = z.object({
  records: z
    .array(
      z.object({
        aspectId: z.uuid(),
        value: z.number().int().min(0).max(100),
        note: z
          .string()
          .trim()
          .max(500)
          .nullish()
          .transform((v) => (v ? v : null)),
      }),
    )
    .min(1)
    .max(50),
});

/** Simpan (upsert) nilai satu penilai; aspek harus milik sekolah ini. */
export async function saveScores(
  tx: Tx,
  schoolId: string,
  placementId: string,
  assessor: 'school' | 'industry',
  records: z.infer<typeof scoreRecordsBody>['records'],
) {
  const aspectIds = [...new Set(records.map((r) => r.aspectId))];
  const found = await tx.select({ id: pklAspect.id }).from(pklAspect).where(inArray(pklAspect.id, aspectIds));
  if (found.length !== aspectIds.length) {
    throw new HttpError(400, 'invalid_reference', 'Aspek penilaian tidak ditemukan.');
  }
  // Bila aspek yang sama muncul dua kali, yang terakhir berlaku.
  const last = new Map(records.map((r) => [r.aspectId, r]));
  for (const r of last.values()) {
    await tx
      .insert(pklScore)
      .values({ schoolId, placementId, aspectId: r.aspectId, assessor, value: r.value, note: r.note })
      .onConflictDoUpdate({
        target: [pklScore.placementId, pklScore.aspectId, pklScore.assessor],
        set: { value: r.value, note: r.note, updatedAt: new Date() },
      });
  }
}

/** Semua aspek sekolah (urut) dan semua nilai satu penempatan. */
export async function loadSheet(tx: Tx, placementId: string) {
  const aspects = await tx.select().from(pklAspect).orderBy(pklAspect.sort, pklAspect.name);
  const scores = await tx
    .select()
    .from(pklScore)
    .where(and(eq(pklScore.placementId, placementId)));
  return { aspects, scores };
}
