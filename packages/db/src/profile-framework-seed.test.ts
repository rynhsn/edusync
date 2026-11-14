import { asc, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb, refProfileFramework, refProfileFrameworkItem } from './index';

/** Seed migrasi 0106: delapan dimensi (resmi) dan lima topik Panca Cinta (sumber sekunder, tanpa pembagian bagian). */
const platformUrl = process.env.DATABASE_PLATFORM_URL;
if (!platformUrl) throw new Error('DATABASE_PLATFORM_URL wajib diisi');
const platform = createDb(platformUrl);

afterAll(async () => {
  await platform.pool.end();
});

describe('seed acuan kerangka profil', () => {
  it('dua kerangka: dimensi resmi untuk semua jenjang, Panca Cinta sekunder hanya madrasah', async () => {
    const rows = await platform.db.select().from(refProfileFramework).orderBy(asc(refProfileFramework.sort));
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.profil_lulusan_2025).toMatchObject({
      kind: 'dimension',
      verification: 'official',
      profileKeys: null,
    });
    expect(byKey.panca_cinta_2025).toMatchObject({
      kind: 'value',
      verification: 'secondary',
      profileKeys: ['mi', 'mts', 'ma', 'mak'],
    });
  });

  it('delapan dimensi dan lima topik; group_code Panca Cinta belum dipetakan (NULL)', async () => {
    const items = (key: string) =>
      platform.db
        .select()
        .from(refProfileFrameworkItem)
        .where(eq(refProfileFrameworkItem.frameworkKey, key))
        .orderBy(asc(refProfileFrameworkItem.sort));
    const dims = await items('profil_lulusan_2025');
    const love = await items('panca_cinta_2025');
    expect(dims).toHaveLength(8);
    expect(love).toHaveLength(5);
    expect(love.every((i) => i.groupCode === null)).toBe(true);
    for (const i of [...dims, ...love])
      expect([i.labelId, i.labelEn, i.labelSu].every((l) => l.length > 0)).toBe(true);
  });
});
