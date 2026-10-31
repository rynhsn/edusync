import { type CatalogItem, DEFAULT_CATALOG } from '@edusync/contracts';
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
    .values(
      DEFAULT_CATALOG.map(({ requires, maxStudents, ...c }) => ({
        ...c,
        requires: [...(requires ?? [])],
        maxStudents: maxStudents ?? null,
      })),
    )
    .onConflictDoNothing();
}

/**
 * Katalog untuk menghitung harga. Pendaftaran baru hanya memakai item aktif; perpanjangan memakai
 * `includeInactive` supaya sekolah yang sudah berlangganan modul yang kemudian disembunyikan tetap bisa ditagih.
 */
export async function loadCatalog(db: Db, options: { includeInactive?: boolean } = {}) {
  const rows = await db
    .select()
    .from(catalogItem)
    .where(options.includeInactive ? undefined : sql`${catalogItem.active}`);
  return rows
    .map(
      (r): CatalogItem => ({
        kind: r.kind,
        key: r.key,
        name: r.name,
        priceMonthly: r.priceMonthly,
        sort: r.sort,
        requires: r.requires,
        maxStudents: r.maxStudents,
      }),
    )
    .sort((a, b) => a.sort - b.sort);
}
