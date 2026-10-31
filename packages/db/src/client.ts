import { AsyncLocalStorage } from 'node:async_hooks';
import { DEFAULT_TIMEZONE, normalizeTimezone } from '@edusync/contracts';
import { eq, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  return { db: drizzle(pool, { schema }) as Db, pool };
}

/** Zona waktu sekolah untuk transaksi tenant yang sedang berjalan (diisi `withTenant` bagi satu sekolah). */
const timezoneStore = new AsyncLocalStorage<string>();
const TZ_TTL_MS = 30_000;
const tzCache = new Map<string, { tz: string; at: number }>();

/** Zona waktu sekolah pada konteks tenant saat ini; Asia/Jakarta bila di luar konteks atau sekolah tak dikenal. */
export function currentTimezone(): string {
  return timezoneStore.getStore() ?? DEFAULT_TIMEZONE;
}

/** Buang cache zona (dipanggil setelah zona sebuah sekolah diubah). */
export function invalidateSchoolTimezone(schoolId: string) {
  tzCache.delete(schoolId);
}

/** Jalankan `fn` dengan zona waktu tertentu sebagai zona sekolah saat ini (untuk worker dan tes). */
export function runInTimezone<T>(tz: string | null | undefined, fn: () => T): T {
  return timezoneStore.run(normalizeTimezone(tz), fn);
}

async function timezoneOf(tx: Tx, schoolId: string): Promise<string> {
  const hit = tzCache.get(schoolId);
  if (hit && Date.now() - hit.at < TZ_TTL_MS) return hit.tz;
  const [row] = await tx
    .select({ tz: schema.school.timezone })
    .from(schema.school)
    .where(eq(schema.school.id, schoolId));
  const tz = normalizeTimezone(row?.tz);
  tzCache.set(schoolId, { tz, at: Date.now() });
  return tz;
}

/**
 * Jalankan `fn` dalam transaksi yang terikat pada sekolah-sekolah tertentu.
 * Kebijakan RLS membaca `app.school_ids`; tanpa konteks ini query tenant tidak mengembalikan baris.
 * `set_config(..., true)` berlaku hanya selama transaksi, jadi koneksi pool tidak membawa sisa konteks.
 * Untuk satu sekolah, zona waktunya tersedia lewat `currentTimezone()` selama `fn` berjalan.
 */
export function withTenant<T>(db: Db, schoolIds: readonly string[], fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.school_ids', ${schoolIds.join(',')}, true)`);
    const only = schoolIds.length === 1 ? schoolIds[0] : undefined;
    if (!only) return fn(tx);
    const tz = await timezoneOf(tx, only);
    return timezoneStore.run(tz, () => fn(tx));
  });
}
