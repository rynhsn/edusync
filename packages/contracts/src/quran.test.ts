import { describe, expect, it } from 'vitest';
import {
  ayahIndex,
  coverage,
  fromIndex,
  JUZ_START,
  juzProgress,
  nextAyah,
  rangeAyahCount,
  SURAHS,
  TOTAL_AYAHS,
  validRange,
} from './quran';

const range = (surahFrom: number, ayahFrom: number, surahTo: number, ayahTo: number) => ({
  surahFrom,
  ayahFrom,
  surahTo,
  ayahTo,
});
const byNumber = (n: number) => SURAHS[n - 1]!;

describe('data surah', () => {
  it('114 surah berurutan dan 6236 ayat', () => {
    expect(SURAHS).toHaveLength(114);
    expect(SURAHS.map((s) => s.number)).toEqual(Array.from({ length: 114 }, (_, i) => i + 1));
    expect(SURAHS.reduce((a, s) => a + s.ayahCount, 0)).toBe(6236);
    expect(TOTAL_AYAHS).toBe(6236);
  });

  it('jumlah ayat surah yang dikenal', () => {
    const known: Record<number, number> = {
      1: 7,
      2: 286,
      3: 200,
      4: 176,
      5: 120,
      36: 83,
      67: 30,
      78: 40,
      112: 4,
      114: 6,
    };
    for (const [n, count] of Object.entries(known)) expect(byNumber(Number(n)).ayahCount).toBe(count);
    expect(byNumber(2).name).toBe('Al-Baqarah');
    expect(byNumber(1).name).toBe('Al-Fatihah');
    expect(byNumber(36).arabic).toBe('يس');
    expect(SURAHS.every((s) => s.name.length > 0 && s.arabic.length > 0)).toBe(true);
  });

  it('juz awal surah menaik dan sesuai titik awal juz', () => {
    expect(JUZ_START).toHaveLength(30);
    expect(byNumber(1).juz).toBe(1);
    expect(byNumber(2).juz).toBe(1);
    expect(byNumber(3).juz).toBe(3);
    expect(byNumber(36).juz).toBe(22);
    expect(byNumber(67).juz).toBe(29);
    expect(byNumber(78).juz).toBe(30);
    expect(byNumber(114).juz).toBe(30);
    for (let i = 1; i < SURAHS.length; i++) {
      expect(SURAHS[i]!.juz).toBeGreaterThanOrEqual(SURAHS[i - 1]!.juz);
    }
  });
});

describe('indeks dan rentang', () => {
  it('ayahIndex dan fromIndex saling berbalik', () => {
    expect(ayahIndex(1, 1)).toBe(1);
    expect(ayahIndex(2, 1)).toBe(8);
    expect(ayahIndex(114, 6)).toBe(6236);
    expect(fromIndex(1)).toEqual({ surah: 1, ayah: 1 });
    expect(fromIndex(8)).toEqual({ surah: 2, ayah: 1 });
    expect(fromIndex(6236)).toEqual({ surah: 114, ayah: 6 });
    for (let i = 1; i <= 6236; i += 37) {
      const { surah, ayah } = fromIndex(i);
      expect(ayahIndex(surah, ayah)).toBe(i);
    }
    expect(() => ayahIndex(1, 8)).toThrow();
    expect(() => fromIndex(0)).toThrow();
    expect(() => fromIndex(6237)).toThrow();
  });

  it('validRange memeriksa keberadaan dan urutan', () => {
    expect(validRange(1, 1, 1, 7)).toBe(true);
    expect(validRange(1, 1, 2, 5)).toBe(true);
    expect(validRange(1, 8, 1, 8)).toBe(false);
    expect(validRange(115, 1, 115, 1)).toBe(false);
    expect(validRange(0, 1, 1, 1)).toBe(false);
    expect(validRange(2, 5, 2, 4)).toBe(false);
    expect(validRange(3, 1, 2, 5)).toBe(false);
    expect(validRange(1, 1.5, 1, 3)).toBe(false);
  });

  it('rangeAyahCount', () => {
    expect(rangeAyahCount(1, 1, 1, 7)).toBe(7);
    expect(rangeAyahCount(1, 1, 2, 286)).toBe(293);
    expect(rangeAyahCount(114, 6, 114, 6)).toBe(1);
    expect(rangeAyahCount(1, 1, 114, 6)).toBe(6236);
    expect(() => rangeAyahCount(2, 5, 2, 4)).toThrow();
  });

  it('nextAyah melompat antar surah dan berhenti di akhir', () => {
    expect(nextAyah(1, 7)).toEqual({ surah: 2, ayah: 1 });
    expect(nextAyah(2, 3)).toEqual({ surah: 2, ayah: 4 });
    expect(nextAyah(114, 6)).toBeNull();
  });
});

describe('cakupan', () => {
  it('rentang tumpang tindih tidak menggandakan', () => {
    const c = coverage([range(2, 1, 2, 10), range(2, 5, 2, 20), range(2, 20, 2, 20), range(1, 1, 1, 7)]);
    expect(c.ayahs).toBe(27);
    expect(c.percent).toBe(0.43);
    expect(c.perSurah).toEqual([
      { surah: 1, ayahs: 7, complete: true },
      { surah: 2, ayahs: 20, complete: false },
    ]);
  });

  it('rentang lintas surah dan tak sah dilewati', () => {
    const c = coverage([range(1, 5, 2, 2), range(2, 9, 2, 4)]);
    expect(c.ayahs).toBe(5);
    expect(c.perSurah).toEqual([
      { surah: 1, ayahs: 3, complete: false },
      { surah: 2, ayahs: 2, complete: false },
    ]);
    expect(coverage([]).ayahs).toBe(0);
    expect(coverage([]).percent).toBe(0);
  });

  it('seluruh mushaf = 100 persen dan 30 juz', () => {
    const c = coverage([range(1, 1, 114, 6)]);
    expect(c.ayahs).toBe(6236);
    expect(c.percent).toBe(100);
    expect(c.perSurah).toHaveLength(114);
    expect(c.perSurah.every((s) => s.complete)).toBe(true);
    expect(juzProgress([range(1, 1, 114, 6)]).count).toBe(30);
  });

  it('juz tuntas hanya bila semua ayatnya tercakup', () => {
    // Juz 30 = 78:1 sampai 114:6; juz 29 hampir penuh (kurang satu ayat).
    expect(juzProgress([range(78, 1, 114, 6)])).toEqual({ complete: [30], count: 1 });
    expect(juzProgress([range(67, 1, 77, 49)]).count).toBe(0);
    expect(juzProgress([range(67, 1, 77, 50)])).toEqual({ complete: [29], count: 1 });
    // Juz 1 = 1:1 sampai 2:141 digabung dari dua rentang.
    expect(juzProgress([range(1, 1, 1, 7), range(2, 1, 2, 141)]).complete).toEqual([1]);
    expect(juzProgress([range(1, 1, 1, 7), range(2, 1, 2, 140)]).count).toBe(0);
  });
});
