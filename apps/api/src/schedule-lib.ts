import { and, eq, gte, lte, scheduleEntry, semester, sql, type Tx } from '@edusync/db';

/** Benar bila sel jadwal itu berlaku pada tanggal tersebut (sel tahunan selalu berlaku). */
export async function entryAppliesOn(tx: Tx, entry: { semesterId: string | null }, dateYmd: string) {
  if (!entry.semesterId) return true;
  const [s] = await tx
    .select({ id: semester.id })
    .from(semester)
    .where(
      and(eq(semester.id, entry.semesterId), lte(semester.startsOn, dateYmd), gte(semester.endsOn, dateYmd)),
    );
  return Boolean(s);
}

/**
 * Syarat SQL: sel jadwal yang berlaku pada tanggal itu.
 *
 * Sel tahunan (`semester_id` kosong) berlaku sepanjang tahun ajaran; sel semester hanya berlaku bila tanggalnya jatuh
 * di dalam rentang semester itu (`starts_on` s.d. `ends_on`). Pakai pada setiap kueri yang membaca `schedule_entry`
 * untuk satu tanggal tertentu (absensi jam pelajaran, jam berjalan di dasbor, laporan jam belum diisi).
 */
export function scheduleAppliesOn(dateYmd: string) {
  return sql`(${scheduleEntry.semesterId} is null or ${scheduleEntry.semesterId} in (select s.id from semester s where s.starts_on <= ${dateYmd}::date and s.ends_on >= ${dateYmd}::date))`;
}
