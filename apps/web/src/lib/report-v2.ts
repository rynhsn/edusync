/**
 * Logika murni rapor tahap 3.2 (tanpa React): mode rapor tingkat, kelengkapan deskripsi, deskripsi manual per mapel,
 * tanggapan orang tua/wali, dan tampilan bagian v2 pada pratinjau/PDF. Aturan batas mengikuti zod di apps/api.
 */

export const SECTION_NOTE_MAX = 1000;
export const NARRATIVE_MAX = 1000;
export const RESPONSE_TEXT_MAX = 1000;
export const RESPONSE_WINDOW_MIN_DAYS = 1;
export const RESPONSE_WINDOW_MAX_DAYS = 365;

export type ReportMode = 'numeric' | 'descriptive';

/* ---------- Mode rapor per tingkat ---------- */

/** Mode efektif: tidak diisi (null/undefined) berarti angka. */
export const reportModeOf = (mode: ReportMode | null | undefined): ReportMode => mode ?? 'numeric';

/** Saran otomatis: tingkat berfase A (kelas 1-2) disarankan deskriptif; yang lain tidak ada saran. */
export function suggestedReportMode(phase: string | null | undefined): ReportMode | null {
  return phase?.trim().toUpperCase() === 'A' ? 'descriptive' : null;
}

/** Fase sebuah tingkat menurut profil jenjang (kode tingkat sama); null bila profil tidak memuatnya. */
export function phaseOfLevel(
  levels: readonly { code: string; phase: string }[] | null | undefined,
  code: string,
): string | null {
  return levels?.find((l) => l.code === code)?.phase ?? null;
}

/**
 * Isian mode untuk permintaan ubah tingkat. Hanya dikirim bila berubah: kembali ke angka mengirim null (server
 * menyimpan null sebagai angka bawaan); tidak berubah tidak mengirim apa pun.
 */
export function reportModePatch(
  saved: ReportMode | null | undefined,
  draft: ReportMode,
): { reportMode?: ReportMode | null } {
  if (reportModeOf(saved) === draft) return {};
  return { reportMode: draft === 'numeric' ? null : draft };
}

/** Isian mode untuk tingkat baru: hanya dikirim bila deskriptif. */
export function reportModeForCreate(draft: ReportMode): { reportMode?: ReportMode } {
  return draft === 'descriptive' ? { reportMode: 'descriptive' } : {};
}

/* ---------- Kelengkapan deskripsi ---------- */

export interface CompletenessRow {
  subjectsGraded: number;
  subjectsTotal: number;
}

/** Jumlah mapel yang belum punya deskripsi (mode deskriptif) atau nilai akhir (mode angka). */
export const missingCount = (r: CompletenessRow) => Math.max(0, r.subjectsTotal - r.subjectsGraded);

/** Lengkap bila ada mapel dan semuanya terisi (sama dengan aturan finalisasi di server). */
export const isComplete = (r: CompletenessRow) => r.subjectsTotal > 0 && r.subjectsGraded >= r.subjectsTotal;

export const completeCount = (rows: readonly CompletenessRow[]) => rows.filter(isComplete).length;

/** Persentase kelengkapan 0..100 untuk batang kemajuan. */
export function completenessPercent(r: CompletenessRow): number {
  return r.subjectsTotal > 0 ? Math.min(100, (r.subjectsGraded / r.subjectsTotal) * 100) : 0;
}

/* ---------- Deskripsi manual per mapel ---------- */

export interface NarrativeRowLike {
  studentId: string;
  name: string;
  nis: string | null;
  manual: string | null;
}

/** Suntingan yang belum disimpan, dikunci menurut id siswa (bukan urutan baris, supaya aman terhadap penyaringan). */
export type NarrativeDrafts = Readonly<Record<string, string>>;

/** Teks yang tampil di isian: suntingan bila ada, selain itu teks manual tersimpan. */
export const narrativeValue = (row: NarrativeRowLike, drafts: NarrativeDrafts) =>
  drafts[row.studentId] ?? row.manual ?? '';

/** Item untuk PUT narratives: hanya baris yang berubah; teks kosong menjadi null (hapus suntingan). */
export function narrativeItems(
  rows: readonly NarrativeRowLike[],
  drafts: NarrativeDrafts,
): { studentId: string; text: string | null }[] {
  const items: { studentId: string; text: string | null }[] = [];
  for (const r of rows) {
    const draft = drafts[r.studentId];
    if (draft === undefined) continue;
    const next = draft.trim() === '' ? null : draft.trim();
    if (next === (r.manual?.trim() || null)) continue;
    items.push({ studentId: r.studentId, text: next });
  }
  return items;
}

/** Id siswa yang suntingannya melewati batas panjang (menahan tombol simpan). */
export function narrativesTooLong(drafts: NarrativeDrafts): string[] {
  return Object.entries(drafts)
    .filter(([, text]) => text.trim().length > NARRATIVE_MAX)
    .map(([id]) => id);
}

/** Sisa suntingan setelah simpan berhasil: buang yang sudah tersimpan, pertahankan yang lain. */
export function dropSaved(drafts: NarrativeDrafts, saved: readonly { studentId: string }[]): NarrativeDrafts {
  const gone = new Set(saved.map((s) => s.studentId));
  return Object.fromEntries(Object.entries(drafts).filter(([id]) => !gone.has(id)));
}

/** Penyaringan baris: kata kunci (nama atau NIS) dan "hanya yang belum ada deskripsi manual". */
export function filterNarrativeRows<T extends NarrativeRowLike>(
  rows: readonly T[],
  filter: { query?: string; onlyMissing?: boolean },
  drafts: NarrativeDrafts = {},
): T[] {
  const q = filter.query?.trim().toLowerCase() ?? '';
  return rows.filter((r) => {
    if (q && !`${r.name} ${r.nis ?? ''}`.toLowerCase().includes(q)) return false;
    if (filter.onlyMissing && narrativeValue(r, drafts).trim() !== '') return false;
    return true;
  });
}

/* ---------- Tanggapan orang tua/wali ---------- */

export interface ResponseLike {
  id: string;
  guardianId: string;
  text: string;
  recordedByKind: 'guardian' | 'staff';
  outdated: boolean;
}

export interface GuardianLike {
  id: string;
  name: string;
  relation: string;
}

export interface GuardianResponseRow<R extends ResponseLike> {
  guardian: GuardianLike;
  response: R | null;
  /** Staf tidak boleh menimpa tanggapan yang ditulis wali sendiri lewat portal. */
  staffCanCopy: boolean;
}

/** Satukan wali dan tanggapannya dengan kunci id wali (satu tanggapan per wali). */
export function guardianResponseRows<R extends ResponseLike>(
  guardians: readonly GuardianLike[],
  responses: readonly R[],
): GuardianResponseRow<R>[] {
  const byGuardian = new Map(responses.map((r) => [r.guardianId, r]));
  return guardians.map((guardian) => {
    const response = byGuardian.get(guardian.id) ?? null;
    return { guardian, response, staffCanCopy: response?.recordedByKind !== 'guardian' };
  });
}

export interface ResponseWindowLike {
  final: boolean;
  open: boolean;
  closesAt: string | null;
}

export type ResponseWindowState =
  | { kind: 'not_final' }
  | { kind: 'open'; closesAt: string | null }
  | { kind: 'closed'; closesAt: string | null };

/** Keadaan jendela tanggapan. `open` dari server dipakai, tetapi batas waktu yang sudah lewat di jam peramban juga menutup. */
export function responseWindowState(w: ResponseWindowLike, now: number = Date.now()): ResponseWindowState {
  if (!w.final) return { kind: 'not_final' };
  const expired = w.closesAt !== null && Date.parse(w.closesAt) < now;
  if (!w.open || expired) return { kind: 'closed', closesAt: w.closesAt };
  return { kind: 'open', closesAt: w.closesAt };
}

/** Teks tanggapan sah: tidak kosong dan paling banyak 1.000 karakter. */
export function responseTextIssue(text: string): 'required' | 'tooLong' | null {
  const v = text.trim();
  if (v === '') return 'required';
  return v.length > RESPONSE_TEXT_MAX ? 'tooLong' : null;
}

/** Lama jendela (hari) dari isian: '' = tanpa batas (null), bilangan bulat 1-365, selain itu 'invalid'. */
export function parseWindowDays(text: string): number | null | 'invalid' {
  const s = text.trim();
  if (s === '') return null;
  if (!/^\d{1,3}$/.test(s)) return 'invalid';
  const n = Number(s);
  return n >= RESPONSE_WINDOW_MIN_DAYS && n <= RESPONSE_WINDOW_MAX_DAYS ? n : 'invalid';
}

/* ---------- Tampilan bagian v2 pada pratinjau dan PDF ---------- */

export interface ReportDisplayOptions {
  /** Pengaturan "tampilkan kokurikuler di PDF"; tidak diketahui (portal) = tampil bila ada isinya. */
  showCocurricular?: boolean;
  /** Pengaturan "tampilkan kotak tanggapan"; tidak diketahui (portal) = tampil bila ada tanggapan. */
  showGuardianResponse?: boolean;
}

export interface ReportV2Source {
  reportMode?: 'descriptive';
  cocurricularNote?: string | null;
  developmentNote?: string | null;
  rank?: unknown;
  guardianResponses?: readonly { guardianName: string; text: string; outdated: boolean }[];
  subjects: readonly { belowKkm?: boolean }[];
}

const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

/**
 * Apa yang digambar untuk sebuah dokumen. Dokumen v1 (tanpa bagian v2, tanpa bendera) menghasilkan tata letak v1
 * persis: angka dan peringkat tampil, tanpa bagian tambahan.
 */
export function reportView(doc: ReportV2Source, options: ReportDisplayOptions = {}) {
  const descriptive = doc.reportMode === 'descriptive';
  const cocurricular = clean(doc.cocurricularNote);
  const development = clean(doc.developmentNote);
  const responses = doc.guardianResponses ?? [];
  const showResponseBox =
    options.showGuardianResponse === true ||
    (options.showGuardianResponse === undefined && responses.length > 0);
  return {
    descriptive,
    showNumbers: !descriptive,
    showRank: !descriptive && !!doc.rank,
    showBelowKkmNote: !descriptive && doc.subjects.some((s) => s.belowKkm),
    cocurricular: { show: options.showCocurricular === true || cocurricular !== null, text: cocurricular },
    development: { show: descriptive || development !== null, text: development },
    responseBox: { show: showResponseBox, items: responses },
  };
}

/** Tanggal kalender lokal (YYYY-MM-DD) dari waktu ISO, untuk ditampilkan lewat `formatCalendarDate`. */
export function localDateOf(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
