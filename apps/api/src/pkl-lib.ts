import { createHash, randomBytes } from 'node:crypto';
import { PKL_PREDICATE_SETTINGS, type PklWeights, type PredicateSettings } from '@edusync/contracts';
import {
  and,
  eq,
  inArray,
  pklAspect,
  pklPeriod,
  pklPlacement,
  pklScore,
  pklSetting,
  type Tx,
  vocationalSetting,
} from '@edusync/db';
import { z } from 'zod';
import { HttpError } from './http-error';
import { assertStudentsReportNotFinal } from './report-lock-lib';

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

/**
 * Tolak (409 `report_final`) bila periode penempatan ini tertaut ke semester dan rapor murid itu pada semester tersebut sudah final.
 * Periode tanpa tautan tidak pernah ditolak (perilaku lama). Dipakai semua jalur yang mengubah nilai/nomor yang masuk rapor.
 */
export async function assertPlacementReportOpen(tx: Tx, placementId: string) {
  const [r] = await tx
    .select({ semesterId: pklPeriod.semesterId, studentId: pklPlacement.studentId })
    .from(pklPlacement)
    .innerJoin(pklPeriod, eq(pklPeriod.id, pklPlacement.periodId))
    .where(eq(pklPlacement.id, placementId));
  if (r?.semesterId) await assertStudentsReportNotFinal(tx, r.semesterId, [r.studentId]);
}

/** Bobot penilai sekolah:industri (dari vocational_setting); undefined bila belum diatur = rumus lama. */
export async function pklWeights(tx: Tx): Promise<PklWeights | undefined> {
  const [row] = await tx
    .select({ school: vocationalSetting.pklSchoolWeight, industry: vocationalSetting.pklIndustryWeight })
    .from(vocationalSetting);
  return row && row.school !== null && row.industry !== null
    ? { school: row.school, industry: row.industry }
    : undefined;
}

/** Simpan (upsert) nilai satu penilai; aspek harus milik sekolah ini. Ditolak 409 `report_final` bila nilai ini sudah masuk rapor final. */
export async function saveScores(
  tx: Tx,
  schoolId: string,
  placementId: string,
  assessor: 'school' | 'industry',
  records: z.infer<typeof scoreRecordsBody>['records'],
) {
  await assertPlacementReportOpen(tx, placementId);
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

/** Ambang predikat PKL sekolah (dari pkl_setting; bawaan 90/80/70 bila belum diatur). Dipanggil di dalam transaksi tenant. */
export async function pklThresholds(tx: Tx): Promise<PredicateSettings> {
  const [row] = await tx.select().from(pklSetting);
  return row
    ? { predicateA: row.thresholdA, predicateB: row.thresholdB, predicateC: row.thresholdC }
    : { ...PKL_PREDICATE_SETTINGS };
}
