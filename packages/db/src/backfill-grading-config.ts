import { createDb } from './client';
import { backfillSemesterGradingConfigs } from './grading-backfill';

/**
 * Backfill mandiri konfigurasi nilai beku (idempoten; tidak menimpa salinan yang ada).
 *
 *   pnpm --filter @edusync/db backfill:grading-config              # menulis
 *   pnpm --filter @edusync/db backfill:grading-config --dry-run    # hanya menghitung
 *
 * Memakai DATABASE_PLATFORM_URL (BYPASSRLS), atau DATABASE_OWNER_URL bila yang pertama kosong. Koneksi yang tunduk RLS
 * ditolak dengan galat jelas (bukan diam-diam nol baris).
 */
const url = process.env.DATABASE_PLATFORM_URL ?? process.env.DATABASE_OWNER_URL;
if (!url) throw new Error('DATABASE_PLATFORM_URL (atau DATABASE_OWNER_URL) wajib diisi');
const dryRun = process.argv.includes('--dry-run');

const { db, pool } = createDb(url);
try {
  const r = await backfillSemesterGradingConfigs(db, { dryRun });
  console.log(
    `${dryRun ? '[dry-run] ' : ''}Sekolah dibaca: ${r.schools}. Salinan beku ${dryRun ? 'akan dibuat' : 'dibuat'} (asal backfill): ${r.created} ` +
      `(rapor final ${r.byReason.final}, lewat dan bernilai ${r.byReason.pastGraded}); sudah ada: ${r.alreadyFrozen}.`,
  );
} finally {
  await pool.end();
}
