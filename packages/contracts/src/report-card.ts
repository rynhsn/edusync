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

/* ---------- Narasi rapor dari tujuan pembelajaran (fase 3, tahap 3.4) ---------- */

/** Jumlah TP per sisi (tinggi/rendah) pada narasi otomatis bila sekolah belum mengaturnya. */
export const DEFAULT_NARRATIVE_MAX_ITEMS = 2;
/** Batas atas yang boleh diatur sekolah (sama dengan CHECK `report_setting_narrative_items_ck`). */
export const NARRATIVE_MAX_ITEMS_LIMIT = 5;
/** Penanda tempat teks TP dalam templat kalimat. */
export const NARRATIVE_TP_PLACEHOLDER = '{tp}';
export const NARRATIVE_TEMPLATE_MAX_LENGTH = 300;
/** Templat bawaan (satu zona bahasa: disimpan per sekolah, bukan per bahasa antarmuka). */
export const DEFAULT_NARRATIVE_HIGH_TEMPLATE = 'Menunjukkan penguasaan yang baik dalam {tp}.';
export const DEFAULT_NARRATIVE_LOW_TEMPLATE = 'Perlu bimbingan dalam {tp}.';

/** Templat sah: memuat `{tp}` dan tidak lebih dari 300 karakter. */
export function isValidNarrativeTemplate(template: string): boolean {
  return template.includes(NARRATIVE_TP_PLACEHOLDER) && template.length <= NARRATIVE_TEMPLATE_MAX_LENGTH;
}

export interface NarrativeSettings {
  /** 1..5; bawaan 2. */
  narrativeMaxItems: number;
  /** null = templat bawaan. */
  narrativeHighTemplate: string | null;
  narrativeLowTemplate: string | null;
}

/** TP yang punya status efektif (hitung atau keputusan guru) bagi satu murid pada satu mapel. */
export interface NarrativeCandidate {
  id: string;
  code: string | null;
  /** Teks TP (`learning_objective.description`). */
  text: string;
  achieved: boolean;
  /** Persen ketercapaian; null untuk keputusan guru tanpa angka. */
  percent: number | null;
  /** `learning_flow_item.sort_order` pada ATP terbit tahun itu; null bila TP tidak ada di ATP. */
  atpOrder: number | null;
  /** `learning_objective.sort_order`. */
  sortOrder: number;
}

export interface NarrativeObjectiveRef {
  id: string;
  code: string | null;
  text: string;
}

export interface ObjectiveNarrative {
  /** Deskripsi capaian otomatis (kalimat tinggi lalu kalimat rendah). */
  text: string;
  /** Jumlah TP berstatus (kandidat) dan yang tercapai. */
  assessed: number;
  achieved: number;
  high: NarrativeObjectiveRef[];
  low: NarrativeObjectiveRef[];
}

const cmpNullLast = (a: number | null, b: number | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b;
const cmpStrNullLast = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;

/** Pemecah seri: urutan ATP, lalu urutan TP, lalu kode, lalu id (supaya deterministik). */
function tieBreak(a: NarrativeCandidate, b: NarrativeCandidate): number {
  return (
    cmpNullLast(a.atpOrder, b.atpOrder) ||
    a.sortOrder - b.sortOrder ||
    cmpStrNullLast(a.code, b.code) ||
    cmpStrNullLast(a.id, b.id)
  );
}

function joinList(items: readonly string[]): string {
  if (items.length <= 2) return items.join(' dan ');
  return `${items.slice(0, -1).join(', ')}, dan ${items[items.length - 1]}`;
}

/** Teks TP untuk disisipkan ke kalimat: spasi dirapikan dan titik penutup dibuang agar tidak ganda. */
function inline(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '');
}

const ref = (c: NarrativeCandidate): NarrativeObjectiveRef => ({ id: c.id, code: c.code, text: c.text });

/**
 * Narasi otomatis satu murid pada satu mapel dari ketercapaian TP-nya (rancangan 3.4). Murni.
 *
 * `high` = TP tercapai urut persen menurun; `low` = TP belum tercapai urut persen menaik; persen kosong (keputusan guru tanpa
 * angka) diurutkan sesudah yang berangka; seri dipecah urutan ATP, urutan TP, lalu kode. Paling banyak `narrativeMaxItems` per
 * sisi. Tiap sisi menjadi satu kalimat dari templat sekolah (atau bawaan) dengan `{tp}` diganti daftar TP; sisi kosong tidak
 * menghasilkan kalimat, jadi bila semua tercapai kalimat "perlu bimbingan" hilang (K6).
 *
 * Mengembalikan null bila tidak ada kandidat sama sekali: pemanggil kembali ke deskripsi menurut predikat (v1 persis).
 */
export function buildObjectiveNarrative(
  candidates: readonly NarrativeCandidate[],
  settings: Partial<NarrativeSettings> = {},
): ObjectiveNarrative | null {
  if (candidates.length === 0) return null;
  const max = Math.min(
    NARRATIVE_MAX_ITEMS_LIMIT,
    Math.max(1, settings.narrativeMaxItems ?? DEFAULT_NARRATIVE_MAX_ITEMS),
  );
  const achieved = candidates.filter((c) => c.achieved);
  const notAchieved = candidates.filter((c) => !c.achieved);
  // Persen menurun (kosong terakhir): bandingkan negatifnya.
  const neg = (c: NarrativeCandidate) => (c.percent === null ? null : -c.percent);
  const high = [...achieved].sort((a, b) => cmpNullLast(neg(a), neg(b)) || tieBreak(a, b)).slice(0, max);
  const low = [...notAchieved]
    .sort((a, b) => cmpNullLast(a.percent, b.percent) || tieBreak(a, b))
    .slice(0, max);
  const sentence = (template: string, list: readonly NarrativeCandidate[]) =>
    template.split(NARRATIVE_TP_PLACEHOLDER).join(joinList(list.map((c) => inline(c.text))));
  const parts: string[] = [];
  if (high.length > 0) {
    parts.push(sentence(settings.narrativeHighTemplate ?? DEFAULT_NARRATIVE_HIGH_TEMPLATE, high));
  }
  if (low.length > 0) {
    parts.push(sentence(settings.narrativeLowTemplate ?? DEFAULT_NARRATIVE_LOW_TEMPLATE, low));
  }
  return {
    text: parts.join(' '),
    assessed: candidates.length,
    achieved: achieved.length,
    high: high.map(ref),
    low: low.map(ref),
  };
}
