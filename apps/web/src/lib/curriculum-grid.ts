import { totalPeriodsByLevel } from '@edusync/contracts';

/**
 * Logika murni grid alokasi jam pelajaran (JP) dan versi kurikulum. Tanpa React dan tanpa jaringan
 * supaya mudah diuji: urai isian, hitung baris yang berubah, dan jumlah JP.
 */

export const MAX_PERIODS = 9999;

/**
 * Isian JP satu mapel: teks apa adanya dari kolom isian ('' = kosong). `weekly` dan `yearly` intrakurikuler;
 * `cocurricular` JP kokurikuler tahunan; `weeks` durasi dalam minggu (PKL).
 */
export interface PeriodDraft {
  weekly: string;
  yearly: string;
  cocurricular: string;
  weeks: string;
}

export interface AllocationRow {
  subjectId: string;
  weeklyPeriods: number | null;
  yearlyPeriods: number | null;
  cocurricularYearlyPeriods?: number | null;
  weeks?: number | null;
  note: string | null;
}

export interface AllocationItem {
  levelCode: string;
  programId: string | null;
  subjectId: string;
  weeklyPeriods: number | null;
  yearlyPeriods: number | null;
  cocurricularYearlyPeriods: number | null;
  weeks: number | null;
  note: string | null;
}

/** Teks isian menjadi JP: '' menjadi null, bilangan bulat 0..9999 menjadi angka, selain itu 'invalid'. */
export function parsePeriods(text: string): number | null | 'invalid' {
  const s = text.trim();
  if (s === '') return null;
  if (!/^\d{1,4}$/.test(s)) return 'invalid';
  const n = Number(s);
  return n <= MAX_PERIODS ? n : 'invalid';
}

export function periodsToText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Isian yang efektif untuk satu mapel: suntingan bila ada, kalau tidak nilai tersimpan. */
export function effectiveDraft(
  saved: AllocationRow | undefined,
  edit: Partial<PeriodDraft> | undefined,
): PeriodDraft {
  return {
    weekly: edit?.weekly ?? periodsToText(saved?.weeklyPeriods),
    yearly: edit?.yearly ?? periodsToText(saved?.yearlyPeriods),
    cocurricular: edit?.cocurricular ?? periodsToText(saved?.cocurricularYearlyPeriods),
    weeks: edit?.weeks ?? periodsToText(saved?.weeks),
  };
}

export interface ChangedAllocations {
  items: AllocationItem[];
  /** Id mapel yang isiannya tidak valid (hasil `items` tidak memuatnya). */
  invalid: string[];
}

/**
 * Baris yang berubah dibanding data tersimpan, siap dikirim ke PUT. Semua isian kosong (JP, kokurikuler, minggu)
 * berarti baris dihapus (hanya dikirim bila sebelumnya ada). Catatan baris yang sudah ada dibawa supaya tidak
 * terhapus oleh PUT; keempat isian selalu dikirim dengan nilai efektifnya.
 */
export function diffAllocations(
  levelCode: string,
  programId: string | null,
  saved: readonly AllocationRow[],
  edits: Readonly<Record<string, Partial<PeriodDraft>>>,
): ChangedAllocations {
  const bySubject = new Map(saved.map((r) => [r.subjectId, r]));
  const items: AllocationItem[] = [];
  const invalid: string[] = [];
  for (const [subjectId, edit] of Object.entries(edits)) {
    const prev = bySubject.get(subjectId);
    const draft = effectiveDraft(prev, edit);
    const weekly = parsePeriods(draft.weekly);
    const yearly = parsePeriods(draft.yearly);
    const cocurricular = parsePeriods(draft.cocurricular);
    const weeks = parsePeriods(draft.weeks);
    if (weekly === 'invalid' || yearly === 'invalid' || cocurricular === 'invalid' || weeks === 'invalid') {
      invalid.push(subjectId);
      continue;
    }
    const before = {
      weekly: prev?.weeklyPeriods ?? null,
      yearly: prev?.yearlyPeriods ?? null,
      cocurricular: prev?.cocurricularYearlyPeriods ?? null,
      weeks: prev?.weeks ?? null,
    };
    if (
      weekly === before.weekly &&
      yearly === before.yearly &&
      cocurricular === before.cocurricular &&
      weeks === before.weeks
    ) {
      continue;
    }
    // Tidak ada baris tersimpan dan tetap kosong: tidak ada yang dihapus atau dibuat.
    if (!prev && weekly === null && yearly === null && cocurricular === null && weeks === null) continue;
    items.push({
      levelCode,
      programId,
      subjectId,
      weeklyPeriods: weekly,
      yearlyPeriods: yearly,
      cocurricularYearlyPeriods: cocurricular,
      weeks,
      note: prev?.note ?? null,
    });
  }
  return { items, invalid };
}

export interface PeriodSums {
  /** JP mingguan intrakurikuler. */
  weekly: number;
  /** JP tahunan intrakurikuler. */
  yearly: number;
  /** JP kokurikuler tahunan. */
  cocurricular: number;
  /** Jumlah minggu (PKL). */
  weeks: number;
  /** Mapel yang punya sedikitnya satu isian. */
  filled: number;
}

/** Jumlah JP setelah suntingan diterapkan, intrakurikuler dan kokurikuler terpisah (isian tidak valid dihitung 0). */
export function sumPeriods(
  saved: readonly AllocationRow[],
  edits: Readonly<Record<string, Partial<PeriodDraft>>>,
  subjectIds: readonly string[],
): PeriodSums {
  const bySubject = new Map(saved.map((r) => [r.subjectId, r]));
  const rows = subjectIds.map((id) => {
    const d = effectiveDraft(bySubject.get(id), edits[id]);
    const num = (text: string) => {
      const n = parsePeriods(text);
      return typeof n === 'number' ? n : null;
    };
    return {
      levelCode: '',
      weeklyPeriods: num(d.weekly),
      yearlyPeriods: num(d.yearly),
      cocurricularYearlyPeriods: num(d.cocurricular),
      weeks: num(d.weeks),
    };
  });
  const total = totalPeriodsByLevel(rows)[0];
  return {
    weekly: total?.weeklyPeriods ?? 0,
    yearly: total?.yearlyPeriods ?? 0,
    cocurricular: total?.cocurricularYearlyPeriods ?? 0,
    weeks: total?.weeks ?? 0,
    filled: rows.filter(
      (r) =>
        r.weeklyPeriods !== null ||
        r.yearlyPeriods !== null ||
        r.cocurricularYearlyPeriods !== null ||
        r.weeks !== null,
    ).length,
  };
}

/* ---------- Versi kurikulum ---------- */

export interface VersionRow {
  levelCode: string;
  curriculumKey: string;
  effectiveFrom: string | null;
  note: string | null;
}

export interface VersionDraft {
  curriculumKey: string;
  effectiveFrom: string;
}

export interface VersionItem {
  levelCode: string;
  curriculumKey: string | null;
  effectiveFrom: string | null;
  note: string | null;
}

/** Baris versi yang berubah. Kurikulum dikosongkan berarti versi tingkat itu dihapus (bila sebelumnya ada). */
export function diffVersions(
  saved: readonly VersionRow[],
  edits: Readonly<Record<string, Partial<VersionDraft>>>,
): VersionItem[] {
  const byLevel = new Map(saved.map((v) => [v.levelCode, v]));
  const items: VersionItem[] = [];
  for (const [levelCode, edit] of Object.entries(edits)) {
    const prev = byLevel.get(levelCode);
    const key = edit.curriculumKey ?? prev?.curriculumKey ?? '';
    const date = edit.effectiveFrom ?? prev?.effectiveFrom ?? '';
    if (key === '') {
      if (prev) items.push({ levelCode, curriculumKey: null, effectiveFrom: null, note: null });
      continue;
    }
    if (prev && prev.curriculumKey === key && (prev.effectiveFrom ?? '') === date) continue;
    items.push({
      levelCode,
      curriculumKey: key,
      effectiveFrom: date === '' ? null : date,
      note: prev?.note ?? null,
    });
  }
  return items;
}
