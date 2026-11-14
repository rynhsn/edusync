import { and, asc, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb, refCurriculum, refSubject } from './index';

/** Seed migrasi 0109: lima nama PAI/Arab `kma` untuk MI (sd) dan MA (sma), sama dengan MTs (smp); tanpa JP dan tanpa mapel keagamaan MA. */
const platformUrl = process.env.DATABASE_PLATFORM_URL;
if (!platformUrl) throw new Error('DATABASE_PLATFORM_URL wajib diisi');
const platform = createDb(platformUrl);

afterAll(async () => {
  await platform.pool.end();
});

const FIVE = ['AQH', 'AKH', 'FQH', 'SKI', 'BAR'];

describe('seed acuan kma untuk MI dan MA', () => {
  it('sd dan sma memuat tepat lima nama yang sama dengan smp; smp tetap 13 baris', async () => {
    const rows = (level: string) =>
      platform.db
        .select()
        .from(refSubject)
        .where(and(eq(refSubject.curriculumKey, 'kma'), eq(refSubject.levelGroup, level)))
        .orderBy(asc(refSubject.sort));
    const [sd, smp, sma] = await Promise.all([rows('sd'), rows('smp'), rows('sma')]);
    expect(sd.map((r) => r.code)).toEqual(FIVE);
    expect(sma.map((r) => r.code)).toEqual(FIVE);
    expect(smp).toHaveLength(13);
    const names = (r: typeof smp) => r.slice(0, 5).map((x) => [x.code, x.name]);
    expect(names(sd)).toEqual(names(smp));
    expect(names(sma)).toEqual(names(smp));
  });

  it('deskripsi kma menyebut JP dan mapel MA mengikuti KMA 1503/2025 dan diisi sendiri', async () => {
    const [kma] = await platform.db.select().from(refCurriculum).where(eq(refCurriculum.key, 'kma'));
    expect(kma?.description).toContain('KMA 1503/2025');
  });
});
