import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb, refSubject } from './index';

/** Seed migrasi 0119: kombinasi kurikulum/grup yang sebelumnya kosong. Nama dan kode saja, tanpa JP. */
const platformUrl = process.env.DATABASE_PLATFORM_URL;
if (!platformUrl) throw new Error('DATABASE_PLATFORM_URL wajib diisi');
const platform = createDb(platformUrl);

afterAll(async () => {
  await platform.pool.end();
});

const REQUESTED: [string, string][] = [
  ['k13', 'sd'],
  ['k13', 'sma'],
  ['k13', 'smk'],
  ['kma', 'smk'],
  ['merdeka', 'sd'],
];

describe('seed acuan 0119', () => {
  it.each(REQUESTED)('%s/%s berisi mapel dengan kode unik', async (cur, level) => {
    const rows = await platform.db
      .select()
      .from(refSubject)
      .where(and(eq(refSubject.curriculumKey, cur), eq(refSubject.levelGroup, level)));
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.code)).size).toBe(rows.length);
  });

  it('kma/smk sama dengan kma/sma (lima mapel PAI/Arab)', async () => {
    const codes = async (level: string) =>
      (
        await platform.db
          .select()
          .from(refSubject)
          .where(and(eq(refSubject.curriculumKey, 'kma'), eq(refSubject.levelGroup, level)))
      )
        .sort((a, b) => a.sort - b.sort)
        .map((r) => [r.code, r.name]);
    expect(await codes('smk')).toEqual(await codes('sma'));
    expect(await codes('smk')).toHaveLength(5);
  });

  it('tidak ada duplikat kode per (kurikulum, grup) di seluruh acuan', async () => {
    const rows = await platform.db.select().from(refSubject);
    const keys = rows.map((r) => `${r.curriculumKey}/${r.levelGroup}/${r.code}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
