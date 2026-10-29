import { DEFAULT_CATALOG } from '@edusync/contracts';
import { sql } from 'drizzle-orm';
import type { Db } from './client';
import { catalogItem } from './schema';

/**
 * Isi katalog awal bila belum ada. Baris yang sudah ada (mis. harga yang telah diubah operator)
 * tidak ditimpa, hanya item baru dari DEFAULT_CATALOG yang ditambahkan.
 */
export async function seedCatalog(db: Db) {
  await db
    .insert(catalogItem)
    .values(DEFAULT_CATALOG.map((c) => ({ ...c })))
    .onConflictDoNothing();
}

export async function loadCatalog(db: Db) {
  const rows = await db.select().from(catalogItem).where(sql`${catalogItem.active}`);
  return rows
    .map((r) => ({ kind: r.kind, key: r.key, name: r.name, priceMonthly: r.priceMonthly, sort: r.sort }))
    .sort((a, b) => a.sort - b.sort);
}
