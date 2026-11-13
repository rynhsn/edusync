import { MAX_OBJECTIVES_PER_ASSESSMENT, type ObjectiveAggregation } from '@edusync/contracts';

/**
 * Logika murni layar "Ketercapaian Tujuan Pembelajaran (TP)" (tahap 3.3): pemilih TP pada penilaian, penerjemahan asal ambang,
 * ringkasan per TP, dan susunan isi permintaan keputusan guru. Tanpa React dan tanpa jaringan, supaya mudah diuji.
 */

export { MAX_OBJECTIVES_PER_ASSESSMENT };

/** TP ringkas seperti yang dikembalikan di penilaian dan di daftar TP mapel. */
export interface ObjectiveLite {
  id: string;
  code: string | null;
  description: string;
  active: boolean;
}

/** TP dikelompokkan per capaian pembelajaran (CP). */
export interface OutcomeGroup {
  outcomeId: string;
  /** Kode atau tulisan pendek CP; boleh kosong. */
  outcomeCode: string | null;
  phase: string;
  objectives: ObjectiveLite[];
}

/** Teks pendek sebuah TP: "kode · isi" atau isinya saja bila tanpa kode. */
export function objectiveLabel(o: Pick<ObjectiveLite, 'code' | 'description'>): string {
  return o.code ? `${o.code} · ${o.description}` : o.description;
}

const norm = (s: string) => s.trim().toLocaleLowerCase();

/**
 * TP yang boleh dipilih untuk penilaian baru: hanya yang aktif (versi lama tidak bisa ditambahkan). Disaring dengan kata kunci
 * (kode, isi, atau kode CP) dan CP yang kosong dibuang. Urutan CP dan TP dipertahankan.
 */
export function pickableGroups(groups: readonly OutcomeGroup[], query: string): OutcomeGroup[] {
  const q = norm(query);
  const out: OutcomeGroup[] = [];
  for (const g of groups) {
    const groupHit = q !== '' && norm(g.outcomeCode ?? '').includes(q);
    const objectives = g.objectives.filter(
      (o) =>
        o.active &&
        (q === '' || groupHit || norm(o.code ?? '').includes(q) || norm(o.description).includes(q)),
    );
    if (objectives.length > 0) out.push({ ...g, objectives });
  }
  return out;
}

/**
 * Memilih atau melepas sebuah TP. Melepas selalu boleh; menambah di atas batas ditolak (`limited` true, pilihan tetap) supaya
 * layar bisa menjelaskan batasnya sebelum server menolak.
 */
export function toggleObjective(
  ids: readonly string[],
  id: string,
  max: number = MAX_OBJECTIVES_PER_ASSESSMENT,
): { ids: string[]; limited: boolean } {
  if (ids.includes(id)) return { ids: ids.filter((x) => x !== id), limited: false };
  if (ids.length >= max) return { ids: [...ids], limited: true };
  return { ids: [...ids, id], limited: false };
}

/**
 * TP yang sedang terpilih, siap ditampilkan sebagai lencana: yang sudah terkait lebih dulu (termasuk versi lama), lalu yang baru
 * dipilih. `known` = semua TP yang diketahui layar (daftar mapel); id yang tak dikenal dilewati.
 */
export function selectedObjectives(
  ids: readonly string[],
  linked: readonly ObjectiveLite[],
  known: readonly ObjectiveLite[],
): ObjectiveLite[] {
  const byId = new Map<string, ObjectiveLite>();
  for (const o of known) byId.set(o.id, o);
  for (const o of linked) byId.set(o.id, o);
  return ids.map((id) => byId.get(id)).filter((o): o is ObjectiveLite => o !== undefined);
}

/** Apakah himpunan TP berubah dibanding yang tersimpan (urutan diabaikan). */
export function objectiveIdsChanged(before: readonly string[], after: readonly string[]): boolean {
  if (before.length !== after.length) return true;
  const set = new Set(before);
  return after.some((id) => !set.has(id));
}

/* ---------- Matriks ketercapaian ---------- */

/** Asal ambang pada satu sel; kunci terjemahan dibentuk dari nilainya (`oaScope_<scope>`). */
export const OBJECTIVE_SCOPES = [
  'objective_level_program',
  'objective_level',
  'objective_program',
  'objective',
  'subject_kkm',
  'school_kkm',
] as const;
export type ObjectiveScope = (typeof OBJECTIVE_SCOPES)[number];

/** Kunci terjemahan (namespace `grades`) untuk asal ambang; tak dikenal = null. */
export function scopeLabelKey(scope: string | null | undefined): `oaScope_${ObjectiveScope}` | null {
  return (OBJECTIVE_SCOPES as readonly string[]).includes(scope ?? '')
    ? (`oaScope_${scope as ObjectiveScope}` as const)
    : null;
}

export type CellStatus = 'achieved' | 'not_achieved' | 'undetermined';

export interface CellLike {
  percent: number | null;
  achieved: boolean | null;
  source: 'computed' | 'override' | null;
  note?: string | null;
}

/** Status tampilan sebuah sel: tercapai, belum tercapai, atau belum dapat ditentukan (tanpa skor dan tanpa keputusan guru). */
export function cellStatus(cell: Pick<CellLike, 'achieved'>): CellStatus {
  if (cell.achieved === true) return 'achieved';
  if (cell.achieved === false) return 'not_achieved';
  return 'undetermined';
}

/** Persen untuk layar: satu desimal paling banyak, pemisah mengikuti bahasa; null = "-". */
export function formatPercent(percent: number | null | undefined, locale: string): string {
  if (percent === null || percent === undefined) return '-';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(percent)}%`;
}

/** Berapa persen murid yang sudah berstatus dan tercapai; null bila belum ada yang berstatus. */
export function achievementRate(summary: { assessed: number; achieved: number }): number | null {
  if (summary.assessed <= 0) return null;
  return Math.round((summary.achieved / summary.assessed) * 100);
}

/** Banyaknya murid yang belum berstatus pada sebuah TP. */
export function pendingCount(summary: { assessed: number }, studentCount: number): number {
  return Math.max(0, studentCount - summary.assessed);
}

/** Apakah mapel ini sudah punya TP yang dikaitkan ke penilaian (sumatif maupun formatif). */
export function hasLinkedObjectives(
  objectives: readonly { assessmentCount: number; formativeCount: number }[],
): boolean {
  return objectives.some((o) => o.assessmentCount + o.formativeCount > 0);
}

/** TP yang hanya terkait penilaian formatif: tidak menentukan ketercapaian untuk rapor. */
export function isFeedbackOnly(o: { assessmentCount: number; formativeCount: number }): boolean {
  return o.assessmentCount === 0 && o.formativeCount > 0;
}

/* ---------- Keputusan guru ---------- */

export type Decision = 'achieved' | 'not_achieved' | 'follow';
export const DECISIONS: readonly Decision[] = ['achieved', 'not_achieved', 'follow'];

export const MAX_NOTE_LENGTH = 500;

/** Pilihan awal dialog: keputusan guru yang ada, atau "ikuti hitungan" bila status berasal dari skor. */
export function decisionOf(cell: Pick<CellLike, 'achieved' | 'source'>): Decision {
  if (cell.source === 'override' && cell.achieved === true) return 'achieved';
  if (cell.source === 'override' && cell.achieved === false) return 'not_achieved';
  return 'follow';
}

export interface OverrideRecord {
  studentId: string;
  objectiveId: string;
  achieved?: boolean;
  note?: string;
}

/**
 * Isi satu baris keputusan guru untuk PUT. Server mengganti seluruh keputusan sebelumnya pada (murid, TP) itu:
 * - "Tercapai"/"Belum tercapai" -> `achieved` true/false;
 * - "Ikuti hitungan" -> tanpa `achieved` (catatan boleh tetap ada);
 * - tanpa `achieved` dan tanpa catatan -> baris kosong = server menghapus keputusan.
 * Catatan dipangkas dan dibatasi panjangnya.
 */
export function buildOverrideRecord(
  studentId: string,
  objectiveId: string,
  decision: Decision,
  note: string,
): OverrideRecord {
  const text = note.trim().slice(0, MAX_NOTE_LENGTH);
  return {
    studentId,
    objectiveId,
    ...(decision === 'follow' ? {} : { achieved: decision === 'achieved' }),
    ...(text === '' ? {} : { note: text }),
  };
}

/** Apakah pilihan dialog tidak berbeda dari keadaan sekarang (tombol simpan dinonaktifkan). */
export function overrideUnchanged(
  cell: Pick<CellLike, 'achieved' | 'source' | 'note'>,
  decision: Decision,
  note: string,
): boolean {
  return decisionOf(cell) === decision && (cell.note ?? '').trim() === note.trim();
}

/** Apakah baris itu menghapus keputusan guru (tanpa status dan tanpa catatan). */
export function isClearingRecord(r: OverrideRecord): boolean {
  return r.achieved === undefined && r.note === undefined;
}

/* ---------- Cara menghitung ketercapaian dari beberapa penilaian ---------- */

export const AGGREGATION_KEYS: readonly ObjectiveAggregation[] = ['mean', 'latest', 'max'];

/** Aturan dari API; tanpa nilai (bawaan sekolah) = rata-rata. */
export function aggregationOrDefault(v: ObjectiveAggregation | null | undefined): ObjectiveAggregation {
  return v ?? 'mean';
}

/** Aturan dikirim hanya bila berubah, supaya menyimpan KKM saja tidak ikut menyentuhnya. */
export function aggregationChange(
  saved: ObjectiveAggregation | null | undefined,
  picked: ObjectiveAggregation,
): { objectiveAggregation?: ObjectiveAggregation } {
  return picked !== aggregationOrDefault(saved) ? { objectiveAggregation: picked } : {};
}
