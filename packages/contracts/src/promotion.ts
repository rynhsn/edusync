/**
 * Aturan murni kenaikan kelas dan rollover tahun ajaran. Tingkat berikutnya diturunkan dari daftar tingkat sekolah
 * (`school_level`): urutan memakai `sort`, tingkat terakhir = `sort` terbesar kecuali program menetapkan `final_level_code`. Tanpa akses database, supaya bisa diuji sendiri.
 */

export const PROMOTION_DECISIONS = ['promote', 'retain', 'graduate'] as const;
export type PromotionDecision = (typeof PROMOTION_DECISIONS)[number];

export interface PromotionLevel {
  code: string;
  sort: number;
}

/** Urutkan tingkat menurut `sort`, lalu kode (stabil bila `sort` kembar). */
export function sortLevels<T extends PromotionLevel>(levels: readonly T[]): T[] {
  return [...levels].sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
}

/** Tingkat pertama (sort terkecil), atau null bila daftar kosong. */
export function firstLevel(levels: readonly PromotionLevel[]): string | null {
  return sortLevels(levels)[0]?.code ?? null;
}

/**
 * Tingkat akhir kelas: `finalLevelCode` (mis. `program.final_level_code`) bila terisi dan dikenal di daftar tingkat;
 * bila tidak, tingkat dengan `sort` terbesar. Tingkat tak dikenal atau daftar kosong bukan tingkat akhir.
 * Dengan `finalLevelCode`, tingkat di atasnya (sort lebih besar) juga dianggap akhir, supaya kelas yang kebetulan lebih
 * tinggi dari tingkat akhir programnya tidak naik lagi.
 */
export function isFinalLevel(
  levels: readonly PromotionLevel[],
  code: string,
  finalLevelCode?: string | null,
): boolean {
  const current = levels.find((l) => l.code === code);
  if (!current) return false;
  const configured = finalLevelCode ? levels.find((l) => l.code === finalLevelCode) : undefined;
  if (configured) return current.sort >= configured.sort;
  return !levels.some((l) => l.sort > current.sort);
}

/** Kode tingkat berikutnya (sort terkecil yang lebih besar). Null bila tingkat akhir (lihat `isFinalLevel`) atau tak dikenal. */
export function nextLevel(
  levels: readonly PromotionLevel[],
  code: string,
  finalLevelCode?: string | null,
): string | null {
  const current = levels.find((l) => l.code === code);
  if (!current) return null;
  if (isFinalLevel(levels, code, finalLevelCode)) return null;
  return sortLevels(levels.filter((l) => l.sort > current.sort))[0]?.code ?? null;
}

const isDigit = (c: string) => c >= '0' && c <= '9';
const isLetter = (c: string) => /\p{L}/u.test(c);

/**
 * Nama kelas tahun berikutnya: bila nama diawali kode tingkat sumber, awalan itu diganti kode tingkat tujuan
 * ("7A" -> "8A", "X TKJ 1" -> "XI TKJ 1"). Awalan harus berdiri sendiri: "XI A" tidak dianggap berawalan "X".
 * Bila tidak cocok, nama tetap dan `warning` terisi.
 */
export function deriveTargetClassName(
  name: string,
  fromLevelCode: string,
  toLevelCode: string,
): { name: string; matched: boolean; warning: string | null } {
  if (fromLevelCode !== '' && name.startsWith(fromLevelCode)) {
    const rest = name.slice(fromLevelCode.length);
    const last = fromLevelCode[fromLevelCode.length - 1] ?? '';
    const next = rest[0] ?? '';
    const joined = next !== '' && ((isDigit(last) && isDigit(next)) || (isLetter(last) && isLetter(next)));
    if (!joined) return { name: `${toLevelCode}${rest}`, matched: true, warning: null };
  }
  return {
    name,
    matched: false,
    warning: `Nama kelas "${name}" tidak diawali tingkat "${fromLevelCode}", jadi nama tidak diubah. Periksa namanya di tahun tujuan.`,
  };
}

/** Geser tanggal `YYYY-MM-DD` sebanyak `years` tahun; 29 Februari menjadi 28 Februari bila tahun tujuan bukan kabisat. */
export function shiftDateByYears(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const ny = y + years;
  const leap = (ny % 4 === 0 && ny % 100 !== 0) || ny % 400 === 0;
  const day = m === 2 && d === 29 && !leap ? 28 : d;
  return `${String(ny).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
