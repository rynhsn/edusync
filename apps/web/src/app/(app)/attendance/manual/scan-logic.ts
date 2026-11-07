import { formatAttendanceQr, hasAttendanceQrPrefix, parseAttendanceQr } from '@edusync/contracts';
import type { Direction, StorageLike } from './manual-logic';

/**
 * Logika murni pemindai QR absensi (cadangan kiosk RFID): penyaringan teks hasil pindai, debounce, antrean luring
 * di localStorage, daftar pindaian sesi, dan penerjemahan hasil API. Tanpa React dan tanpa kamera supaya mudah diuji.
 */

/** Pindaian payload yang sama diabaikan selama ini (kamera membaca QR yang sama berkali-kali per detik). */
export const DEBOUNCE_MS = 4000;
/** Pindaian lama di antrean luring ditolak server setelah 48 jam, jadi dibuang sebelum dikirim. */
export const MAX_QUEUE_AGE_MS = 47 * 3600_000;
export const MAX_SCAN_QUEUE = 500;
export const RECENT_MAX = 20;

export type PayloadCheck = { kind: 'ignore' } | { kind: 'invalid' } | { kind: 'ok'; payload: string };

/**
 * Saring teks hasil pindai. QR asing (tidak berawalan `ES1.`) diam-diam diabaikan; yang berawalan tetapi formatnya
 * salah (rusak, kepotong) ditandai tidak sah. Yang sah dinormalkan (huruf besar).
 */
export function classifyScan(text: string | null | undefined): PayloadCheck {
  if (!hasAttendanceQrPrefix(text)) return { kind: 'ignore' };
  const code = parseAttendanceQr(text);
  return code ? { kind: 'ok', payload: formatAttendanceQr(code) } : { kind: 'invalid' };
}

/**
 * Isian kode yang diketik atau ditempel orang. Menerima `ES1.<kode>` atau hanya kode 20 karakternya (spasi dan tanda
 * hubung diabaikan). Null bila tidak sah.
 */
export function manualInputToPayload(input: string): string | null {
  const compact = input.replace(/[\s-]+/g, '');
  if (!compact) return null;
  const code = parseAttendanceQr(hasAttendanceQrPrefix(compact) ? compact : formatAttendanceQr(compact));
  return code ? formatAttendanceQr(code) : null;
}

/**
 * Debounce per payload. Mengembalikan true bila payload ini boleh diproses sekarang (dan mencatat waktunya);
 * false bila payload yang sama baru saja diproses dalam `windowMs`. Entri kedaluwarsa dibersihkan.
 */
export function shouldHandle(
  seen: Map<string, number>,
  payload: string,
  now: number,
  windowMs: number = DEBOUNCE_MS,
): boolean {
  for (const [key, at] of seen) if (now - at >= windowMs) seen.delete(key);
  const last = seen.get(payload);
  if (last !== undefined && now - last < windowMs) return false;
  seen.set(payload, now);
  return true;
}

/** Lama pemberitahuan "bukan QR absensi" tampil. */
export const FOREIGN_NOTICE_MS = 3000;
/** Kode asing yang sama tidak memicu pemberitahuan lagi selama ini (kamera membacanya berkali-kali per detik). */
export const FOREIGN_COOLDOWN_MS = 10_000;

/**
 * Putuskan apakah pemberitahuan "bukan QR absensi" perlu ditampilkan untuk teks asing ini. Kode yang sama tidak
 * mengulang pemberitahuan dalam masa jeda; kode berbeda langsung diberitahukan. Teks kosong tidak diberitahukan.
 * Tidak pernah dihitung sebagai pindaian.
 */
export function shouldNotifyForeign(
  seen: Map<string, number>,
  text: string | null | undefined,
  now: number,
): boolean {
  const key = (text ?? '').trim().slice(0, 200);
  if (!key) return false;
  return shouldHandle(seen, key, now, FOREIGN_COOLDOWN_MS);
}

/* ---------------------------------------------------------------- antrean luring */

export interface ScanQueueItem {
  /** Kunci idempoten per pindaian; dikirim apa adanya ke API. */
  clientId: string;
  payload: string;
  direction: Direction;
  /** Jam pindai asli (ISO 8601 dengan zona). */
  at: string;
  /** Tetap catat pada hari libur (sudah dikonfirmasi pengguna). */
  force: boolean;
  /** Nama untuk ditampilkan, bila sempat diketahui (biasanya tidak: QR belum dikenali server). */
  label?: string;
}

export const scanQueueKey = (schoolId: string) => `edusync.scan-attendance.queue.${schoolId}`;
export const DIRECTION_KEY = 'edusync.scan-attendance.direction';

export function newClientId(now: number = Date.now(), random: () => number = Math.random): string {
  const r = Math.floor(random() * 36 ** 8)
    .toString(36)
    .padStart(8, '0');
  return `qr-${now.toString(36)}-${r}`;
}

const isScanItem = (v: unknown): v is ScanQueueItem => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.clientId === 'string' &&
    o.clientId.length > 0 &&
    o.clientId.length <= 64 &&
    typeof o.payload === 'string' &&
    (o.direction === 'in' || o.direction === 'out') &&
    typeof o.at === 'string' &&
    !Number.isNaN(Date.parse(o.at)) &&
    typeof o.force === 'boolean'
  );
};

/** Baca antrean; isi rusak atau penyimpanan tak tersedia menghasilkan antrean kosong. */
export function loadScanQueue(storage: StorageLike | null | undefined, key: string): ScanQueueItem[] {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isScanItem) : [];
  } catch {
    return [];
  }
}

/** Simpan antrean; gagal menulis (mode privat, penuh) tidak boleh merusak halaman. */
export function saveScanQueue(
  storage: StorageLike | null | undefined,
  key: string,
  queue: ScanQueueItem[],
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(queue));
    return true;
  } catch {
    return false;
  }
}

/** Tambah pindaian ke antrean (clientId yang sama tidak dobel). Melewati batas, yang tertua dibuang. */
export function enqueueScan(queue: ScanQueueItem[], item: ScanQueueItem): ScanQueueItem[] {
  const next = [...queue.filter((q) => q.clientId !== item.clientId), item];
  return next.length > MAX_SCAN_QUEUE ? next.slice(next.length - MAX_SCAN_QUEUE) : next;
}

export function dequeueScan(queue: ScanQueueItem[], clientIds: Iterable<string>): ScanQueueItem[] {
  const drop = new Set(clientIds);
  return queue.filter((q) => !drop.has(q.clientId));
}

/** Pisahkan pindaian yang masih bisa dikirim dari yang sudah terlalu lama (server menolak > 48 jam). */
export function splitExpired(queue: ScanQueueItem[], now: number = Date.now()) {
  const fresh: ScanQueueItem[] = [];
  const expired: ScanQueueItem[] = [];
  for (const item of queue) {
    (now - Date.parse(item.at) > MAX_QUEUE_AGE_MS ? expired : fresh).push(item);
  }
  return { fresh, expired };
}

/** Isi permintaan POST /v1/gate/scan untuk satu pindaian di antrean (jam asli + clientId tetap). */
export function scanBody(item: ScanQueueItem) {
  return {
    payload: item.payload,
    direction: item.direction,
    at: item.at,
    clientId: item.clientId,
    force: item.force,
  };
}

export function loadDirection(storage: StorageLike | null | undefined): Direction {
  try {
    return storage?.getItem(DIRECTION_KEY) === 'out' ? 'out' : 'in';
  } catch {
    return 'in';
  }
}

export function saveDirection(storage: StorageLike | null | undefined, direction: Direction): boolean {
  try {
    if (!storage) return false;
    storage.setItem(DIRECTION_KEY, direction);
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- hasil */

export type ScanKind =
  | 'in'
  | 'inLate'
  | 'out'
  | 'outNoCheckIn'
  | 'already_in'
  | 'already_out'
  | 'skipped_status'
  | 'invalid_time'
  | 'queued'
  | 'error';

export type Tone = 'success' | 'warn' | 'error';

export interface ScanApiResult {
  result: 'in' | 'out' | 'already_in' | 'already_out' | 'skipped_status' | 'invalid_time';
  late: boolean;
  warning: 'no_check_in' | null;
}

/** Kunci pesan (di `manualAttendance.scan.result`) untuk hasil API. */
export function resultKind(r: ScanApiResult): ScanKind {
  if (r.result === 'in') return r.late ? 'inLate' : 'in';
  if (r.result === 'out') return r.warning === 'no_check_in' ? 'outNoCheckIn' : 'out';
  return r.result;
}

export function toneOf(kind: ScanKind): Tone {
  switch (kind) {
    case 'in':
    case 'out':
      return 'success';
    case 'error':
      return 'error';
    default:
      return 'warn';
  }
}

export interface ScanEntry {
  id: string;
  /** Instan pindai (ISO). */
  at: string;
  kind: ScanKind;
  name: string | null;
  className: string | null;
  /** Jam yang tercatat/ditampilkan (HH:MM), kosong bila tidak berlaku. */
  time: string;
  direction: Direction;
  /** Kode galat API untuk kind `error`. */
  errorCode?: string | undefined;
}

/** Tambah ke daftar pindaian sesi: terbaru di depan, paling banyak `max`. */
export function pushRecent(list: ScanEntry[], entry: ScanEntry, max: number = RECENT_MAX): ScanEntry[] {
  return [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, max);
}

/** Ganti entri berdasarkan id (mis. "menunggu kirim" menjadi hasil sebenarnya). Tidak ada = tidak berubah. */
export function replaceRecent(list: ScanEntry[], id: string, entry: ScanEntry): ScanEntry[] {
  return list.map((e) => (e.id === id ? entry : e));
}
