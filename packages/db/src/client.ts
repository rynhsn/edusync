import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  return { db: drizzle(pool, { schema }) as Db, pool };
}

/**
 * Jalankan `fn` dalam transaksi yang terikat pada sekolah-sekolah tertentu.
 * Kebijakan RLS membaca `app.school_ids`; tanpa konteks ini query tenant tidak mengembalikan baris.
 * `set_config(..., true)` berlaku hanya selama transaksi, jadi koneksi pool tidak membawa sisa konteks.
 */
export function withTenant<T>(db: Db, schoolIds: readonly string[], fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.school_ids', ${schoolIds.join(',')}, true)`);
    return fn(tx);
  });
}
