import { formatRupiah } from '../../lib/money';
import type { BuildingKind, LiveEvent, LiveSnapshot, Pt, SkyPhase } from './types';

/** Fungsi murni untuk peta sekolah: tanpa DOM dan tanpa React supaya mudah diuji. */

/** Batas sosok: yang bergerak serentak dan yang berdiri di halaman. */
export const MAX_MOVING = 40;
export const MAX_IDLE = 30;
/** Jeda antar-kemunculan sosok baru dari antrean (milidetik). */
export const SPAWN_GAP_MIN = 300;
export const SPAWN_GAP_MAX = 700;
/** Peristiwa yang baru akan diputar lebih dari ini ke depan dianggap basi dan dilewati. */
export const MAX_QUEUE_HORIZON = 20_000;

// ---------------------------------------------------------------------------------------------------------------
// Langit

/** "HH:MM" (atau "HH:MM:SS", atau ISO) menjadi menit sejak tengah malam; null bila tidak terbaca. */
export function parseMinutes(time: string): number | null {
  const m = /(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Fase langit menurut jam sekolah: malam, pagi cerah, siang terang, sore jingga. */
export function skyPhase(time: string): SkyPhase {
  const mins = parseMinutes(time);
  if (mins === null) return 'noon';
  if (mins < 5 * 60 || mins >= 18 * 60 + 45) return 'night';
  if (mins < 10 * 60) return 'morning';
  if (mins < 15 * 60 + 30) return 'noon';
  return 'evening';
}

/**
 * Benda langit: matahari antara 05:30 dan 18:30, di luar itu bulan. `progress` 0..1 menunjukkan posisi di
 * busur (0 = ufuk kiri, 1 = ufuk kanan).
 */
export function celestial(time: string): { body: 'sun' | 'moon'; progress: number } {
  const mins = parseMinutes(time) ?? 12 * 60;
  const sunUp = 5 * 60 + 30;
  const sunDown = 18 * 60 + 30;
  if (mins >= sunUp && mins <= sunDown) return { body: 'sun', progress: (mins - sunUp) / (sunDown - sunUp) };
  // Malam: bulan terbit pukul 18:30 dan terbenam pukul 05:30 (11 jam).
  const sinceDusk = mins >= sunDown ? mins - sunDown : mins + 24 * 60 - sunDown;
  return { body: 'moon', progress: Math.min(1, sinceDusk / (11 * 60)) };
}

// ---------------------------------------------------------------------------------------------------------------
// Sosok

/** Jumlah sosok yang berdiri di halaman, sebanding dengan proporsi yang sudah hadir (maks `max`). */
export function idleFigureCount(arrived: number, total: number, max = MAX_IDLE): number {
  if (total <= 0 || arrived <= 0) return 0;
  const ratio = Math.min(1, arrived / total);
  return Math.max(1, Math.min(max, Math.round(ratio * max)));
}

/** Dari sosok yang berdiri, berapa yang berwarna "terlambat" (sebanding dengan porsi terlambat dari yang hadir). */
export function idleLateCount(idle: number, arrived: number, late: number): number {
  if (idle <= 0 || arrived <= 0 || late <= 0) return 0;
  return Math.max(1, Math.min(idle, Math.round((late / arrived) * idle)));
}

/** Tambahan keterlambatan antar-snapshot; dipakai untuk mewarnai sosok kedatangan berikutnya. */
export function lateDelta(prevLate: number | null | undefined, nextLate: number | null | undefined): number {
  if (prevLate == null || nextLate == null) return 0;
  return Math.max(0, nextLate - prevLate);
}

/** Generator acak deterministik (mulberry32) agar posisi sosok di halaman stabil dan teruji. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface YardRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Posisi berdiri di halaman: kisi 10x3 dengan sedikit goyang acak, lalu diacak deterministik supaya
 * memilih N pertama tetap tersebar merata. Urutan hasil stabil untuk seed yang sama.
 */
export function yardSlots(rect: YardRect, count = MAX_IDLE, seed = 7): Pt[] {
  const cols = 10;
  const rows = Math.max(1, Math.ceil(count / cols));
  const rand = seededRandom(seed);
  const cw = (rect.x1 - rect.x0) / cols;
  const rh = (rect.y1 - rect.y0) / rows;
  const slots: Pt[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = rect.x0 + cw * (c + 0.5) + (rand() - 0.5) * cw * 0.7;
      const y = rect.y0 + rh * (r + 0.5) + (rand() - 0.5) * rh * 0.6;
      slots.push([Math.round(x), Math.round(y)]);
    }
  }
  // Fisher-Yates deterministik.
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = slots[i] as Pt;
    slots[i] = slots[j] as Pt;
    slots[j] = tmp;
  }
  return slots.slice(0, count);
}

// ---------------------------------------------------------------------------------------------------------------
// Antrean animasi

export interface PlannedEvent {
  event: LiveEvent;
  /** Waktu mulai (ms, pada skala jam yang sama dengan `nowMs`). */
  startAt: number;
}

/**
 * Menjadwalkan peristiwa baru dengan jeda 300-700 ms antar sosok supaya tidak menumpuk. Peristiwa yang
 * melebihi kapasitas (sosok serentak termasuk antrean) atau jatuh terlalu jauh ke depan diabaikan halus.
 */
export function planArrivals(
  events: LiveEvent[],
  opts: {
    nowMs: number;
    nextFreeAt: number;
    active: number;
    pending: number;
    max?: number;
    rand?: () => number;
  },
): { items: PlannedEvent[]; nextFreeAt: number; dropped: number } {
  const max = opts.max ?? MAX_MOVING;
  const rand = opts.rand ?? Math.random;
  const room = Math.max(0, max - opts.active - opts.pending);
  const items: PlannedEvent[] = [];
  let cursor = Math.max(opts.nowMs, opts.nextFreeAt);
  let dropped = 0;
  for (const event of events) {
    if (items.length >= room || cursor - opts.nowMs > MAX_QUEUE_HORIZON) {
      dropped++;
      continue;
    }
    items.push({ event, startAt: cursor });
    cursor += SPAWN_GAP_MIN + rand() * (SPAWN_GAP_MAX - SPAWN_GAP_MIN);
  }
  return { items, nextFreeAt: items.length > 0 ? cursor : opts.nextFreeAt, dropped };
}

/**
 * Kunci animasi untuk rute poligaris: offset tiap titik menurut jarak tempuh dan lama total.
 * Gerak selalu dengan kecepatan tetap (`speed` satuan peta per detik).
 */
export function routeTiming(points: Pt[], speed: number): { offsets: number[]; duration: number } {
  const dists: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Pt;
    const b = points[i] as Pt;
    dists.push((dists[i - 1] as number) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = dists[dists.length - 1] as number;
  if (total === 0) return { offsets: dists.map(() => 0), duration: 0 };
  return { offsets: dists.map((d) => d / total), duration: Math.round((total / speed) * 1000) };
}

/** Gabungkan peristiwa baru ke daftar aktivitas: tanpa duplikat, terbaru dahulu, maks `max`. */
export function mergeActivity(prev: LiveEvent[], incoming: LiveEvent[], max = 8): LiveEvent[] {
  const byId = new Map<string, LiveEvent>();
  for (const e of [...incoming, ...prev]) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, max);
}

// ---------------------------------------------------------------------------------------------------------------
// Jendela dan lonceng

/** Jumlah jendela gedung kelas yang menyala: satu per kelas yang sedang berlangsung. */
export function litWindowCount(running: number, totalWindows: number, closed: boolean): number {
  if (closed) return 0;
  return Math.max(0, Math.min(totalWindows, running));
}

/** Nomor jam yang baru dimulai bila berubah dari snapshot sebelumnya; null bila tidak ada perubahan berarti. */
export function periodStarted(
  prev: number | null | undefined,
  next: number | null | undefined,
): number | null {
  if (prev === undefined) return null; // pemuatan pertama: belum ada pembanding
  if (next == null || next === prev) return null;
  return next;
}

// ---------------------------------------------------------------------------------------------------------------
// Uang

/** Rupiah ringkas untuk lencana sempit: "Rp 750", "Rp 750 rb", "Rp 12,5 jt", "Rp 3,2 M". */
export function compactRupiah(n: number): string {
  const v = Math.round(Math.abs(n));
  const sign = n < 0 ? '-' : '';
  const dec = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');
  if (v < 1_000) return `${sign}Rp ${v}`;
  if (v < 1_000_000) return `${sign}Rp ${dec(v / 1_000)} rb`;
  if (v < 1_000_000_000) return `${sign}Rp ${dec(v / 1_000_000)} jt`;
  return `${sign}Rp ${dec(v / 1_000_000_000)} M`;
}

// ---------------------------------------------------------------------------------------------------------------
// Ringkasan lencana dan teks aksesibel

/** Satu baris ringkasan: kunci terjemahan di namespace `schoolMap` beserta nilainya. */
export interface SummaryLine {
  key: string;
  values: Record<string, string | number>;
}

export interface BuildingInfo {
  /** Angka utama di lencana. */
  primary: string;
  /** Perlu perhatian (mis. tunggakan lewat tempo, pesan gagal): lencana diberi penanda. */
  attention: boolean;
  /** Sorotan positif (mis. Anda piket hari ini). */
  accent?: boolean;
  lines: SummaryLine[];
}

export type BuildingInfos = Record<BuildingKind, BuildingInfo | null>;

/**
 * Ringkasan per bangunan dari snapshot. null berarti bangunan tidak aktif (modul mati atau tanpa izin):
 * tampil redup tanpa lencana.
 */
export function describeBuildings(
  snap: LiveSnapshot | null | undefined,
  extra: { onDuty?: boolean | null; canOpenTeachers?: boolean } = {},
): BuildingInfos {
  const att = snap?.attendance ?? null;
  const les = snap?.lessons ?? null;
  const fin = snap?.finance ?? null;
  const msg = snap?.messaging ?? null;
  const eks = snap?.extracurricular ?? null;
  const closed = Boolean(snap?.closed);

  const gate: BuildingInfo | null = att
    ? {
        primary: closed ? '-' : `${att.present + att.late}/${att.total}`,
        attention: false,
        lines: closed
          ? []
          : [
              { key: 'gateMain', values: { present: att.present + att.late, total: att.total } },
              ...(att.late > 0 ? [{ key: 'gateLate', values: { late: att.late } }] : []),
              ...(att.notYet > 0 ? [{ key: 'gateNotYet', values: { notYet: att.notYet } }] : []),
            ],
      }
    : null;

  const classes: BuildingInfo | null = les
    ? {
        primary: String(les.running.length),
        attention: les.unfilled > 0,
        lines: [
          { key: 'classesMain', values: { running: les.running.length } },
          ...(les.unfilled > 0 ? [{ key: 'classesUnfilled', values: { unfilled: les.unfilled } }] : []),
        ],
      }
    : null;

  const dutyKnown = extra.onDuty !== undefined && extra.onDuty !== null;
  const teachers: BuildingInfo | null = !dutyKnown
    ? extra.canOpenTeachers
      ? { primary: '', attention: false, lines: [{ key: 'teachersLink', values: {} }] }
      : null
    : {
        primary: '',
        attention: false,
        accent: Boolean(extra.onDuty),
        lines: [{ key: extra.onDuty ? 'teachersOnDuty' : 'teachersOffDuty', values: {} }],
      };

  const office: BuildingInfo | null = fin
    ? {
        primary: compactRupiah(fin.outstanding),
        attention: fin.overdueOutstanding > 0,
        lines: [
          { key: 'officeMain', values: { amount: formatRupiah(fin.outstanding) } },
          ...(fin.overdueOutstanding > 0
            ? [{ key: 'officeOverdue', values: { amount: formatRupiah(fin.overdueOutstanding) } }]
            : []),
        ],
      }
    : null;

  const field: BuildingInfo | null = eks
    ? {
        primary: String(eks.sessionsToday),
        attention: false,
        lines: [{ key: 'fieldMain', values: { count: eks.sessionsToday } }],
      }
    : null;

  const mail: BuildingInfo | null = msg
    ? {
        primary: String(msg.queued),
        attention: msg.failed24h > 0,
        lines: [
          { key: 'mailMain', values: { queued: msg.queued } },
          ...(msg.failed24h > 0 ? [{ key: 'mailFailed', values: { failed: msg.failed24h } }] : []),
        ],
      }
    : null;

  return { gate, classes, teachers, office, field, mail };
}

/** Bagian-bagian ringkasan peta secara keseluruhan (untuk aria-label). Penerjemah menyambungnya. */
export function mapSummaryParts(snap: LiveSnapshot | null | undefined): SummaryLine[] {
  if (!snap) return [{ key: 'summaryNone', values: {} }];
  const parts: SummaryLine[] = [];
  if (snap.closed) {
    parts.push({ key: 'summaryClosed', values: { title: snap.closed.title } });
    return parts;
  }
  if (snap.attendance) {
    const { present, late, total } = snap.attendance;
    parts.push({ key: 'summaryAttendance', values: { present: present + late, total, late } });
  }
  if (snap.lessons) parts.push({ key: 'summaryLessons', values: { running: snap.lessons.running.length } });
  if (parts.length === 0) parts.push({ key: 'summaryNone', values: {} });
  return parts;
}
