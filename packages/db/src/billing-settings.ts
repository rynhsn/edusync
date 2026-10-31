import {
  BILLING_SETTINGS_KEY,
  type BillingSettings,
  DEFAULT_BILLING_SETTINGS,
  parseBillingSettings,
} from '@edusync/contracts';
import { eq } from 'drizzle-orm';
import type { Db } from './client';
import { platformSetting } from './schema';

const TTL_MS = 5000;
let cache = new WeakMap<object, { at: number; value: BillingSettings }>();

/**
 * Parameter penagihan dari pengaturan platform. Hasil disimpan singkat (5 detik) per koneksi supaya siklus
 * penagihan dan pendaftaran tidak membaca database berulang; `invalidateBillingSettings` dipanggil setelah diubah.
 */
export async function loadBillingSettings(db: Db): Promise<BillingSettings> {
  const hit = cache.get(db);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const [row] = await db.select().from(platformSetting).where(eq(platformSetting.key, BILLING_SETTINGS_KEY));
  const value = row ? parseBillingSettings(row.value) : { ...DEFAULT_BILLING_SETTINGS };
  cache.set(db, { at: Date.now(), value });
  return value;
}

/** Buang cache bacaan (dipakai setelah pengaturan diubah dan oleh tes). */
export function invalidateBillingSettings() {
  cache = new WeakMap();
}
