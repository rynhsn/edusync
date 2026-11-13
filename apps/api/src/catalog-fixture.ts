import { DEFAULT_CATALOG } from '@edusync/contracts';
import { and, catalogItem, type Db, eq } from '@edusync/db';

/**
 * Pembantu uji: harga katalog di database bisa diubah operator lewat konsol platform, padahal beberapa tes
 * mengasumsikan harga bawaan (DEFAULT_CATALOG). Fungsi ini menyimpan nilai katalog yang ada untuk item bawaan,
 * menyetelnya ke nilai bawaan, dan mengembalikan fungsi pemulih yang mengembalikan nilai semula persis.
 * Panggil pemulih di afterAll (juga bila beforeAll gagal) supaya data katalog tidak berubah permanen.
 */
export async function pinDefaultCatalog(db: Db): Promise<() => Promise<void>> {
  const saved = await db.select().from(catalogItem);
  const restore = async () => {
    for (const row of saved) {
      await db
        .update(catalogItem)
        .set({
          priceMonthly: row.priceMonthly,
          active: row.active,
          requires: row.requires,
          maxStudents: row.maxStudents,
        })
        .where(and(eq(catalogItem.kind, row.kind), eq(catalogItem.key, row.key)));
    }
  };
  try {
    for (const c of DEFAULT_CATALOG) {
      await db
        .update(catalogItem)
        .set({
          priceMonthly: c.priceMonthly,
          active: true,
          requires: [...(c.requires ?? [])],
          maxStudents: c.maxStudents ?? null,
        })
        .where(and(eq(catalogItem.kind, c.kind), eq(catalogItem.key, c.key)));
    }
  } catch (err) {
    await restore();
    throw err;
  }
  return restore;
}
