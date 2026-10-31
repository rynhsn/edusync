import { currentTimezone, sql } from '@edusync/db';

/**
 * Zona waktu sekolah sebagai literal SQL (`'Asia/Jakarta'`) untuk `at time zone ...`. Dipakai sebagai literal, bukan
 * parameter, agar ekspresi yang sama di SELECT dan GROUP BY tetap identik. Aman: nilainya zona IANA yang sudah divalidasi.
 */
export function zoneSql(tz: string = currentTimezone()) {
  return sql.raw(`'${tz.replace(/'/g, "''")}'`);
}
