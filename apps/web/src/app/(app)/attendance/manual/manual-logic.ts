import { localParts } from '@edusync/contracts';
import { ApiError } from '../../../../lib/api';

/**
 * Logika murni untuk halaman Absen Datang & Pulang: penguraian jam, antrean luring di localStorage, pengelompokan
 * kirim ulang, penyusunan isi koreksi, dan penerjemahan hasil per entri. Tanpa React supaya mudah diuji.
 */

export type Direction = 'in' | 'out';
export type DailyStatus = 'present' | 'late' | 'excused' | 'sick' | 'absent';
export type ResultKind =
  | 'in'
  | 'out'
  | 'already_in'
  | 'already_out'
  | 'skipped_status'
  | 'not_found'
  | 'invalid_time';

/** Batas entri per permintaan di API. */
export const MAX_ENTRIES = 200;

const AWAY: readonly (DailyStatus | null)[] = ['excused', 'sick', 'absent'];
export const isAway = (status: DailyStatus | null) => AWAY.includes(status);

/**
 * Uraikan isian jam yang diketik orang menjadi `HH:MM` (24 jam), atau null bila tidak sah.
 * Menerima `7:05`, `07:05`, `07.05`, `0705`, dan `705`. Kosong menghasilkan null.
 */
export function parseHm(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(s) ?? /^(\d{1,2})(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Jam `HH:MM` menurut zona waktu sekolah dari sebuah instan ISO; '' bila kosong. */
export function hmOf(iso: string | null | undefined, timezone: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : localParts(d, timezone).time.slice(0, 5);
}

/**
 * Apakah galat ini kegagalan jaringan (permintaan tidak sampai), bukan jawaban server? Hanya kegagalan jaringan yang
 * boleh masuk antrean luring; galat dari server (403, 409, ...) harus ditampilkan, bukan diulang diam-diam.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiError) return false;
  if (error instanceof TypeError) return true;
  const msg = error instanceof Error ? error.message : '';
  return /network|failed to fetch|load failed|offline/i.test(msg);
}

/** Hasil penguraian isian jam opsional: '' berarti "sekarang" (server memakai jam server). */
export type TimeInput = { ok: true; at: string | null } | { ok: false };

export function readTimeInput(input: string): TimeInput {
  if (input.trim() === '') return { ok: true, at: null };
  const at = parseHm(input);
  return at ? { ok: true, at } : { ok: false };
}

/* ---------------------------------------------------------------- antrean luring */

export interface QueueItem {
  /** Kunci unik entri: sekolah tidak perlu karena antrean disimpan per sekolah. */
  id: string;
  date: string;
  direction: Direction;
  studentId: string;
  /** Nama untuk ditampilkan di spanduk dan baris. */
  name: string;
  /** Jam asli `HH:MM` saat dicatat, supaya kirim ulang yang terlambat tetap akurat. */
  at: string;
  /** Tetap catat pada hari libur (sudah dikonfirmasi pengguna). */
  force: boolean;
}

export const queueKey = (schoolId: string) => `edusync.manual-attendance.queue.${schoolId}`;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const isItem = (v: unknown): v is QueueItem => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.date === 'string' &&
    (o.direction === 'in' || o.direction === 'out') &&
    typeof o.studentId === 'string' &&
    typeof o.name === 'string' &&
    typeof o.at === 'string' &&
    typeof o.force === 'boolean'
  );
};

/** Baca antrean; isi rusak atau penyimpanan tak tersedia menghasilkan antrean kosong. */
export function loadQueue(storage: StorageLike | null | undefined, key: string): QueueItem[] {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isItem) : [];
  } catch {
    return [];
  }
}

/** Simpan antrean; gagal menulis (mode privat, penuh) tidak boleh merusak halaman. */
export function saveQueue(storage: StorageLike | null | undefined, key: string, queue: QueueItem[]): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(queue));
    return true;
  } catch {
    return false;
  }
}

export const itemId = (date: string, direction: Direction, studentId: string) =>
  `${date}|${direction}|${studentId}`;

/** Tambah entri ke antrean. Entri baru untuk siswa/tanggal/arah yang sama menggantikan yang lama (jam terbaru menang). */
export function enqueue(queue: QueueItem[], items: QueueItem[]): QueueItem[] {
  const ids = new Set(items.map((i) => i.id));
  return [...queue.filter((q) => !ids.has(q.id)), ...items];
}

/** Buang entri dengan id tertentu. */
export function dequeue(queue: QueueItem[], ids: Iterable<string>): QueueItem[] {
  const drop = new Set(ids);
  return queue.filter((q) => !drop.has(q.id));
}

export interface Batch {
  date: string;
  direction: Direction;
  force: boolean;
  items: QueueItem[];
}

/** Kelompokkan antrean per (tanggal, arah, force), paling banyak MAX_ENTRIES per permintaan, urutan masuk terjaga. */
export function toBatches(queue: QueueItem[]): Batch[] {
  const groups = new Map<string, Batch>();
  const out: Batch[] = [];
  for (const item of queue) {
    const key = `${item.date}|${item.direction}|${item.force}`;
    let batch = groups.get(key);
    if (!batch || batch.items.length >= MAX_ENTRIES) {
      batch = { date: item.date, direction: item.direction, force: item.force, items: [] };
      groups.set(key, batch);
      out.push(batch);
    }
    batch.items.push(item);
  }
  return out;
}

/** Isi permintaan POST /v1/gate/manual untuk satu kelompok; setiap entri membawa jam aslinya. */
export function batchBody(batch: Batch) {
  return {
    date: batch.date,
    direction: batch.direction,
    force: batch.force,
    entries: batch.items.map((i) => ({ studentId: i.studentId, at: i.at })),
  };
}

/* ---------------------------------------------------------------- tampilan baris */

export interface DailyRow {
  studentId: string;
  name: string;
  nis: string | null;
  className: string;
  status: DailyStatus | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  note: string | null;
}

/** Catatan yang belum dikonfirmasi server: sedang dikirim atau menunggu di antrean. */
export interface Pending {
  direction: Direction;
  at: string;
  queued: boolean;
}

export interface RowView {
  row: DailyRow;
  /** Jam datang/pulang yang ditampilkan (HH:MM), memperhitungkan catatan yang belum terkirim. */
  inAt: string;
  outAt: string;
  away: boolean;
  /** Sudah tercatat untuk arah yang sedang dipilih (termasuk yang belum terkirim). */
  done: boolean;
  pending: Pending | null;
}

/**
 * Gabungkan baris dari server dengan catatan yang belum terkonfirmasi (boleh lebih dari satu: datang dan pulang).
 * `pending` pada hasil adalah yang searah dengan `direction`, dipakai untuk lencana "menunggu kirim".
 */
export function viewRow(
  row: DailyRow,
  direction: Direction,
  timezone: string,
  pending: Pending | Pending[] | null,
): RowView {
  const list = pending === null ? [] : Array.isArray(pending) ? pending : [pending];
  let inAt = hmOf(row.checkInAt, timezone);
  let outAt = hmOf(row.checkOutAt, timezone);
  for (const p of list) {
    if (p.direction === 'in') inAt = p.at;
    else outAt = p.at;
  }
  const away = isAway(row.status);
  const done = direction === 'in' ? inAt !== '' : outAt !== '';
  return { row, inAt, outAt, away, done, pending: list.find((p) => p.direction === direction) ?? null };
}

/** Siswa yang masih bisa ditandai pada arah ini lewat satu ketukan atau pilihan massal. */
export const isMarkable = (v: RowView) => !v.done && !v.away && v.pending === null;

/**
 * Siswa yang dijangkau tombol "tandai semua": datang = belum tercatat datang dan bukan izin/sakit/alpa;
 * pulang = sudah datang tetapi belum pulang (sama dengan aturan /v1/gate/manual/mark-all).
 */
export function markAllCandidates(views: RowView[], direction: Direction): RowView[] {
  return views.filter((v) =>
    direction === 'in' ? isMarkable(v) : v.inAt !== '' && v.outAt === '' && !v.away && v.pending === null,
  );
}

export interface Counters {
  total: number;
  checkedIn: number;
  checkedOut: number;
  away: number;
  late: number;
  notYet: number;
}

export function countersOf(views: RowView[]): Counters {
  const c: Counters = { total: views.length, checkedIn: 0, checkedOut: 0, away: 0, late: 0, notYet: 0 };
  for (const v of views) {
    if (v.away) c.away += 1;
    else if (v.inAt) c.checkedIn += 1;
    else c.notYet += 1;
    if (v.outAt) c.checkedOut += 1;
    if (v.row.status === 'late' && !v.away) c.late += 1;
  }
  return c;
}

/* ---------------------------------------------------------------- hasil per entri */

export interface ServerResult {
  studentId: string;
  name: string | null;
  result: ResultKind;
  at: string | null;
  status: DailyStatus | null;
  late: boolean;
  warning: 'no_check_in' | null;
}

/** Satu baris pesan untuk satu entri: kunci di `gate.manual.msg`, dan apakah ini peringatan. */
export function describeResult(r: ServerResult): { key: string; warn: boolean } {
  if (r.result === 'in') return { key: r.late ? 'inLate' : 'in', warn: false };
  if (r.result === 'out')
    return { key: r.warning === 'no_check_in' ? 'outNoCheckIn' : 'out', warn: r.warning !== null };
  return { key: r.result, warn: true };
}

export interface BatchLine {
  key: string;
  count: number;
  warn: boolean;
  /** Beberapa nama pertama untuk pesan yang butuh perhatian. */
  names: string[];
}

/** Ringkas hasil massal menjadi baris pesan per jenis, yang berhasil lebih dulu. */
export function summarizeResults(results: ServerResult[]): BatchLine[] {
  const order = [
    'in',
    'inLate',
    'out',
    'outNoCheckIn',
    'already_in',
    'already_out',
    'skipped_status',
    'invalid_time',
    'not_found',
  ];
  const map = new Map<string, BatchLine>();
  for (const r of results) {
    const d = describeResult(r);
    const line = map.get(d.key) ?? { key: d.key, count: 0, warn: d.warn, names: [] };
    line.count += 1;
    if (d.warn && r.name && line.names.length < 3) line.names.push(r.name);
    map.set(d.key, line);
  }
  return [...map.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

/* ---------------------------------------------------------------- koreksi satu siswa */

export interface CorrectionForm {
  checkIn: string;
  checkOut: string;
  /** '' = otomatis (ikuti jam). */
  status: DailyStatus | '';
  note: string;
}

export function initialCorrection(row: DailyRow, timezone: string): CorrectionForm {
  return {
    checkIn: hmOf(row.checkInAt, timezone),
    checkOut: hmOf(row.checkOutAt, timezone),
    status: isAway(row.status) ? (row.status as DailyStatus) : '',
    note: row.note ?? '',
  };
}

export type CorrectionBody = {
  date: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  status?: DailyStatus;
  note?: string | null;
};

/**
 * Susun isi PUT /v1/gate/daily/{studentId} hanya dari bidang yang berubah (tidak dikirim = tidak diubah,
 * null = dikosongkan). Mengembalikan galat bila jam tidak sah, atau null bila tidak ada yang berubah.
 */
export function buildCorrection(
  date: string,
  before: CorrectionForm,
  after: CorrectionForm,
): { ok: true; body: CorrectionBody } | { ok: false; error: 'invalid_time' | 'no_change' | 'order' } {
  const body: CorrectionBody = { date };
  let changed = false;

  const time = (b: string, a: string): { v?: string | null } | 'bad' => {
    if (a.trim() === b.trim()) return {};
    if (a.trim() === '') return { v: null };
    const p = parseHm(a);
    return p ? { v: p } : 'bad';
  };
  const cin = time(before.checkIn, after.checkIn);
  const cout = time(before.checkOut, after.checkOut);
  if (cin === 'bad' || cout === 'bad') return { ok: false, error: 'invalid_time' };
  if (cin.v !== undefined) {
    body.checkInAt = cin.v;
    changed = true;
  }
  if (cout.v !== undefined) {
    body.checkOutAt = cout.v;
    changed = true;
  }
  // Jam pulang tidak boleh sebelum jam datang (HH:MM sama panjang, jadi sah dibandingkan sebagai teks).
  const finalIn = parseHm(after.checkIn);
  const finalOut = parseHm(after.checkOut);
  if (finalIn && finalOut && finalOut < finalIn) return { ok: false, error: 'order' };

  if (after.status !== before.status && after.status !== '') {
    body.status = after.status;
    changed = true;
  }
  const noteBefore = before.note.trim();
  const noteAfter = after.note.trim();
  if (noteAfter !== noteBefore) {
    body.note = noteAfter === '' ? null : noteAfter;
    changed = true;
  }
  return changed ? { ok: true, body } : { ok: false, error: 'no_change' };
}
