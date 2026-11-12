import { checkFlowItems, MAX_FLOW_ITEMS } from '@edusync/contracts';

/**
 * Logika murni perangkat ajar (CP/TP/ATP): susunan item ATP yang sedang diedit, geser urutan, pengubahan isian
 * menjadi isi permintaan, dan deteksi perubahan. Tanpa React dan tanpa jaringan supaya mudah diuji.
 */

export const MAX_QUANTITY = 9999;
export { MAX_FLOW_ITEMS };

/** Item ATP di editor: isian angka disimpan sebagai teks apa adanya dari kolom isian ('' = kosong). */
export interface DraftItem {
  objectiveId: string;
  weeks: string;
  periods: string;
  semesterId: string;
  note: string;
}

export interface ServerItem {
  objectiveId: string;
  weeks: number | null;
  periods: number | null;
  semesterId: string | null;
  note: string | null;
}

export interface RequestItem {
  objectiveId: string;
  weeks: number | null;
  periods: number | null;
  semesterId: string | null;
  note: string | null;
}

/** Item dari server (sudah berurut) menjadi isian editor. */
export function toDraftItems(items: readonly ServerItem[]): DraftItem[] {
  return items.map((i) => ({
    objectiveId: i.objectiveId,
    weeks: i.weeks === null ? '' : String(i.weeks),
    periods: i.periods === null ? '' : String(i.periods),
    semesterId: i.semesterId ?? '',
    note: i.note ?? '',
  }));
}

/** Teks isian menjadi angka: '' menjadi null, bilangan bulat 0..9999 menjadi angka, selain itu 'invalid'. */
export function parseQuantity(text: string): number | null | 'invalid' {
  const s = text.trim();
  if (s === '') return null;
  if (!/^\d{1,4}$/.test(s)) return 'invalid';
  const n = Number(s);
  return n <= MAX_QUANTITY ? n : 'invalid';
}

/** Menggeser item satu posisi (delta -1 naik, +1 turun). Di luar batas, daftar dikembalikan apa adanya. */
export function moveItem<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(to, 0, moved as T);
  return next;
}

export function removeItemAt<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, i) => i !== index);
}

/**
 * Menambah TP ke akhir daftar: yang sudah ada dilewati dan jumlahnya dibatasi MAX_FLOW_ITEMS.
 * `added` memuat yang benar-benar masuk dan `skipped` jumlah yang ditolak karena penuh.
 */
export function addObjectives(
  items: readonly DraftItem[],
  objectiveIds: readonly string[],
): { items: DraftItem[]; added: number; skipped: number } {
  const have = new Set(items.map((i) => i.objectiveId));
  const next = [...items];
  let added = 0;
  let skipped = 0;
  for (const id of objectiveIds) {
    if (have.has(id)) continue;
    if (next.length >= MAX_FLOW_ITEMS) {
      skipped++;
      continue;
    }
    have.add(id);
    next.push({ objectiveId: id, weeks: '', periods: '', semesterId: '', note: '' });
    added++;
  }
  return { items: next, added, skipped };
}

export type ItemsProblem =
  | { kind: 'quantity'; index: number; field: 'weeks' | 'periods' }
  | { kind: 'too_many' }
  | { kind: 'duplicate_entry' };

/** Isian editor menjadi isi permintaan; mengembalikan masalah pertama bila ada isian yang tidak sah. */
export function toRequestItems(
  drafts: readonly DraftItem[],
): { ok: true; items: RequestItem[] } | { ok: false; problem: ItemsProblem } {
  const problem = checkFlowItems(drafts);
  if (problem) return { ok: false, problem: { kind: problem } };
  const items: RequestItem[] = [];
  for (const [index, d] of drafts.entries()) {
    const weeks = parseQuantity(d.weeks);
    if (weeks === 'invalid') return { ok: false, problem: { kind: 'quantity', index, field: 'weeks' } };
    const periods = parseQuantity(d.periods);
    if (periods === 'invalid') return { ok: false, problem: { kind: 'quantity', index, field: 'periods' } };
    items.push({
      objectiveId: d.objectiveId,
      weeks,
      periods,
      semesterId: d.semesterId === '' ? null : d.semesterId,
      note: d.note.trim() === '' ? null : d.note.trim(),
    });
  }
  return { ok: true, items };
}

/** Apakah isian editor berbeda dari yang tersimpan (urutan, anggota, atau isiannya)? */
export function itemsChanged(saved: readonly ServerItem[], drafts: readonly DraftItem[]): boolean {
  const a = toDraftItems(saved);
  if (a.length !== drafts.length) return true;
  return a.some((x, i) => {
    const y = drafts[i] as DraftItem;
    return (
      x.objectiveId !== y.objectiveId ||
      x.weeks.trim() !== y.weeks.trim() ||
      x.periods.trim() !== y.periods.trim() ||
      x.semesterId !== y.semesterId ||
      x.note.trim() !== y.note.trim()
    );
  });
}

/** Jumlah minggu dan JP seluruh item (isian kosong atau tak sah dihitung 0). */
export function totalsOf(drafts: readonly DraftItem[]): { weeks: number; periods: number } {
  let weeks = 0;
  let periods = 0;
  for (const d of drafts) {
    const w = parseQuantity(d.weeks);
    const p = parseQuantity(d.periods);
    if (typeof w === 'number') weeks += w;
    if (typeof p === 'number') periods += p;
  }
  return { weeks, periods };
}

/**
 * Susunan ulang TP satu CP: setelah satu TP digeser, semua TP diberi nomor urut 0..n-1. Hanya TP yang nomornya
 * berubah dikembalikan, supaya permintaan ke server seminimal mungkin.
 */
export function reorderObjectives<T extends { id: string; sortOrder: number }>(
  objectives: readonly T[],
  id: string,
  delta: -1 | 1,
): { id: string; sortOrder: number }[] {
  const index = objectives.findIndex((o) => o.id === id);
  const moved = moveItem(objectives, index, delta);
  return moved.flatMap((o, i) =>
    o.sortOrder === i && objectives[i]?.id === o.id ? [] : [{ id: o.id, sortOrder: i }],
  );
}

export interface WithPhase {
  phase: string;
}

/** Mengelompokkan menurut fase dengan urutan fase yang diberikan; fase kosong tidak dikembalikan. */
export function groupByPhase<T extends WithPhase>(
  rows: readonly T[],
  phases: readonly string[],
): { phase: string; rows: T[] }[] {
  return phases
    .map((phase) => ({ phase, rows: rows.filter((r) => r.phase === phase) }))
    .filter((g) => g.rows.length > 0);
}

export interface InactiveObjectivesIssue {
  /** Jumlah TP bermasalah bila terbaca dari pesan server. */
  count: number | null;
  /** Kode atau potongan teks TP yang bermasalah (maksimal 10 dari server). */
  items: string[];
  /** TP bermasalah lain yang tidak disebut satu per satu. */
  more: number;
}

/**
 * Daftar TP bermasalah dari pesan galat `inactive_objective` saat menerbitkan, mis.
 * "ATP memuat 3 TP yang sudah nonaktif atau diganti versi baru: 7.1, 7.2, dan 1 lainnya. Ganti item itu ...".
 * Pesan yang bentuknya lain menghasilkan daftar kosong (petunjuk umum tetap ditampilkan).
 */
export function parseInactiveObjectives(message: string): InactiveObjectivesIssue {
  const m = /memuat\s+(\d+)\s+TP[^:]*:\s*([\s\S]+?)\.\s*Ganti/i.exec(message);
  if (!m?.[1] || !m[2]) return { count: null, items: [], more: 0 };
  let list = m[2];
  let more = 0;
  const tail = /,\s*dan\s+(\d+)\s+lainnya$/i.exec(list);
  if (tail?.[1]) {
    more = Number(tail[1]);
    list = list.slice(0, tail.index);
  }
  return {
    count: Number(m[1]),
    items: list
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    more,
  };
}
