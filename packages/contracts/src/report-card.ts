/**
 * Logika rapor murni (tanpa database) yang dipakai API dan UI: deskripsi capaian bawaan, rata-rata nilai akhir,
 * dan peringkat kelas. Rumus nilai akhir dan predikat ada di `grading.ts`.
 */
import type { Predicate } from './grading';

/** Deskripsi capaian per predikat. */
export interface PredicateDescriptions {
  descA: string;
  descB: string;
  descC: string;
  descD: string;
}

/** Nilai bawaan deskripsi capaian; sama dengan nilai bawaan kolom di tabel `report_setting`. */
export const DEFAULT_PREDICATE_DESCRIPTIONS: PredicateDescriptions = {
  descA: 'Menunjukkan penguasaan yang sangat baik pada seluruh capaian pembelajaran.',
  descB: 'Menunjukkan penguasaan yang baik pada sebagian besar capaian pembelajaran.',
  descC:
    'Menunjukkan penguasaan yang cukup pada capaian pembelajaran; perlu peningkatan pada beberapa bagian.',
  descD: 'Perlu bimbingan lebih lanjut untuk mencapai capaian pembelajaran.',
};

/** Deskripsi capaian untuk satu predikat. */
export function descriptionOf(predicate: Predicate, d: PredicateDescriptions): string {
  return { A: d.descA, B: d.descB, C: d.descC, D: d.descD }[predicate];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Rata-rata nilai akhir mapel (dibulatkan 2 desimal); mapel tanpa nilai diabaikan. `null` bila tak ada nilai. */
export function averageOfFinals(finals: readonly (number | null)[]): number | null {
  const filled = finals.filter((f): f is number => f !== null);
  if (filled.length === 0) return null;
  return round2(filled.reduce((a, b) => a + b, 0) / filled.length);
}

export interface RankEntry {
  id: string;
  average: number | null;
}

/**
 * Peringkat kelas menurut rata-rata nilai akhir (tertinggi = 1). Rata-rata sama berbagi peringkat dan peringkat
 * berikutnya melompat (1, 2, 2, 4). Siswa tanpa rata-rata tidak berperingkat. `of` = jumlah siswa berperingkat.
 */
export function rankPositions(entries: readonly RankEntry[]): Map<string, { position: number; of: number }> {
  const ranked = entries
    .filter((e): e is { id: string; average: number } => e.average !== null)
    .sort((a, b) => b.average - a.average);
  const result = new Map<string, { position: number; of: number }>();
  ranked.forEach((e, i) => {
    const prev = ranked[i - 1];
    const position = prev && prev.average === e.average ? result.get(prev.id)!.position : i + 1;
    result.set(e.id, { position, of: ranked.length });
  });
  return result;
}
