import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from './client';
import { freezeSemesterGradingConfig } from './grading-freeze';
import { assessment, reportCard, school, semester } from './schema';

/**
 * Backfill konfigurasi nilai beku untuk data yang sudah ada (rancangan pembekuan konfigurasi nilai, bagian 4 dan keputusan K4).
 *
 * Semua tabel tenant ber-FORCE RLS, jadi backfill HARUS berjalan lewat koneksi yang melewati RLS (superuser atau BYPASSRLS,
 * mis. `edusync_platform`); koneksi yang tunduk RLS tidak melihat satu baris pun dan akan "berhasil" tanpa melakukan apa pun.
 * Karena itu `assertConnectionBypassesRls` dipanggil lebih dulu dan menggagalkan langkah ini dengan keras. Setiap kueri
 * memfilter `school_id` secara EKSPLISIT (bukan mengandalkan RLS), jadi koneksi bypass tidak mencampur sekolah.
 */

/** Gagal keras bila koneksi tunduk RLS (bukan superuser dan tanpa BYPASSRLS). */
export async function assertConnectionBypassesRls(db: Db): Promise<void> {
  const res = await db.execute(
    sql`select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
  );
  const r = res.rows[0] as { rolname: string; rolsuper: boolean; rolbypassrls: boolean } | undefined;
  if (!r || !(r.rolsuper || r.rolbypassrls)) {
    throw new Error(
      `Backfill konfigurasi nilai dibatalkan: koneksi database (peran "${r?.rolname ?? 'tidak dikenal'}") tunduk pada ` +
        'row level security (bukan superuser dan tanpa BYPASSRLS), sehingga tidak membaca sekolah mana pun. ' +
        'Pakai DATABASE_PLATFORM_URL (peran edusync_platform, BYPASSRLS) atau koneksi superuser, lalu jalankan ulang ' +
        '`pnpm --filter @edusync/db backfill:grading-config`.',
    );
  }
}

export interface BackfillOptions {
  /** Batasi ke sekolah tertentu (bawaan: semua sekolah). */
  schoolIds?: string[];
  /** true: hanya hitung, tidak menulis. */
  dryRun?: boolean;
}

export interface BackfillResult {
  schools: number;
  /** Baris salinan beku yang dibuat (atau yang akan dibuat pada dryRun). */
  created: number;
  /** Semester kandidat yang sudah punya salinan (dibiarkan apa adanya). */
  alreadyFrozen: number;
  /** Rincian `created` menurut alasan: punya rapor final, atau sudah lewat dan punya penilaian (K4). */
  byReason: { final: number; pastGraded: number };
}

/**
 * Bekukan konfigurasi (asal `backfill`) untuk setiap semester yang (a) punya rapor final, atau (b) nonaktif, `ends_on` sudah
 * lewat, dan punya penilaian atau baris rapor. Semester aktif tanpa rapor final dan semester mendatang tidak disentuh. Tiap
 * sekolah diproses di transaksinya sendiri dengan kunci penasihat yang sama dengan jalur runtime. Idempoten: yang sudah punya
 * salinan tidak ditimpa.
 */
export async function backfillSemesterGradingConfigs(
  db: Db,
  opts: BackfillOptions = {},
): Promise<BackfillResult> {
  await assertConnectionBypassesRls(db);
  const schools = await db
    .select({ id: school.id })
    .from(school)
    .where(opts.schoolIds ? inArray(school.id, opts.schoolIds) : undefined);
  const result: BackfillResult = {
    schools: schools.length,
    created: 0,
    alreadyFrozen: 0,
    byReason: { final: 0, pastGraded: 0 },
  };
  for (const { id: schoolId } of schools) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`grading-config:${schoolId}`}))`);
      const sems = await tx
        .select({
          id: semester.id,
          isActive: semester.isActive,
          past: sql<boolean>`${semester.endsOn} < current_date`,
        })
        .from(semester)
        .where(eq(semester.schoolId, schoolId));
      if (sems.length === 0) return;
      const finals = new Set(
        (
          await tx
            .selectDistinct({ id: reportCard.semesterId })
            .from(reportCard)
            .where(and(eq(reportCard.schoolId, schoolId), eq(reportCard.status, 'final')))
        ).map((r) => r.id),
      );
      const graded = new Set(
        (
          await tx
            .selectDistinct({ id: assessment.semesterId })
            .from(assessment)
            .where(eq(assessment.schoolId, schoolId))
        ).map((r) => r.id),
      );
      const reported = new Set(
        (
          await tx
            .selectDistinct({ id: reportCard.semesterId })
            .from(reportCard)
            .where(eq(reportCard.schoolId, schoolId))
        ).map((r) => r.id),
      );
      for (const s of sems) {
        const reason = finals.has(s.id)
          ? ('final' as const)
          : !s.isActive && s.past && (graded.has(s.id) || reported.has(s.id))
            ? ('pastGraded' as const)
            : null;
        if (!reason) continue;
        const wrote = opts.dryRun
          ? !(await alreadyHasCopy(tx, schoolId, s.id))
          : await freezeSemesterGradingConfig(tx, {
              schoolId,
              semesterId: s.id,
              origin: 'backfill',
              actorId: null,
              overwrite: false,
            });
        if (wrote) {
          result.created++;
          result.byReason[reason]++;
        } else {
          result.alreadyFrozen++;
        }
      }
    });
  }
  return result;
}

async function alreadyHasCopy(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  schoolId: string,
  semesterId: string,
) {
  const r = await tx.execute(
    sql`select 1 from semester_grading_config where school_id = ${schoolId} and semester_id = ${semesterId}`,
  );
  return r.rows.length > 0;
}
