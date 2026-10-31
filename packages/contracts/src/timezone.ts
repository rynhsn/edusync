/**
 * Zona waktu sekolah: fungsi murni (tanpa database) yang dipakai API, worker, dan web. Semua tanggal berupa teks
 * TTTT-BB-HH dan jam berupa HH:MM menurut zona IANA sekolah. Zona yang tidak dikenal jatuh ke Asia/Jakarta.
 */

export const DEFAULT_TIMEZONE = 'Asia/Jakarta';

/** Pilihan zona waktu di pengaturan sekolah: tiga zona Indonesia lebih dulu, lalu beberapa zona lain. */
export const TIMEZONE_OPTIONS = [
  { value: 'Asia/Jakarta', abbr: 'WIB' },
  { value: 'Asia/Makassar', abbr: 'WITA' },
  { value: 'Asia/Jayapura', abbr: 'WIT' },
  { value: 'Asia/Kuala_Lumpur', abbr: 'MYT' },
  { value: 'Asia/Singapore', abbr: 'SGT' },
  { value: 'Asia/Riyadh', abbr: 'AST' },
  { value: 'Asia/Dubai', abbr: 'GST' },
  { value: 'Australia/Perth', abbr: 'AWST' },
  { value: 'UTC', abbr: 'UTC' },
] as const;

/** Apakah `tz` zona IANA yang dikenal runtime? */
export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Zona yang aman dipakai: `tz` bila valid, selain itu Asia/Jakarta. */
export function normalizeTimezone(tz?: string | null): string {
  return isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE;
}

/** Singkatan zona untuk tampilan (WIB, WITA, WIT, ...); zona lain ditampilkan apa adanya. */
export function timezoneAbbr(tz: string): string {
  return TIMEZONE_OPTIONS.find((o) => o.value === tz)?.abbr ?? tz;
}

export interface LocalParts {
  /** TTTT-BB-HH */
  date: string;
  /** HH:MM (24 jam) */
  time: string;
  /** 1 = Senin ... 7 = Minggu */
  weekday: number;
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Tanggal, jam, dan hari-dalam-pekan sebuah instan menurut zona `tz`. */
export function localParts(at: Date, tz?: string | null): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeTimezone(tz),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
    weekday: WEEKDAY[get('weekday')] ?? 1,
  };
}

/** Tanggal hari ini (TTTT-BB-HH) menurut zona `tz`. */
export function todayIn(tz?: string | null, now: Date = new Date()): string {
  return localParts(now, tz).date;
}

/** Jam sekarang (HH:MM) menurut zona `tz`. */
export function timeIn(tz?: string | null, now: Date = new Date()): string {
  return localParts(now, tz).time;
}

/** Selisih zona terhadap UTC (ms) pada instan tertentu: positif di timur Greenwich. */
function offsetMs(at: Date, tz: string): number {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const n = (type: string) => Number(p.find((x) => x.type === type)?.value ?? 0);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Instan (UTC) saat tanggal TTTT-BB-HH dimulai (00:00) di zona `tz`. */
export function startOfDayIn(date: string, tz?: string | null): Date {
  const zone = normalizeTimezone(tz);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, 0, 0, 0);
  let guess = wall - offsetMs(new Date(wall), zone);
  guess = wall - offsetMs(new Date(guess), zone); // koreksi bila offset berubah di antara dua titik
  return new Date(guess);
}

/** Instan (UTC) saat tanggal TTTT-BB-HH berakhir (awal hari berikutnya) di zona `tz`. */
export function endOfDayIn(date: string, tz?: string | null): Date {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return startOfDayIn(next.toISOString().slice(0, 10), tz);
}

/** Pukul jam dinding `date` + `time` (HH:MM) di zona `tz` sebagai instan UTC. */
export function zonedTimeToDate(date: string, time: string, tz?: string | null): Date {
  const zone = normalizeTimezone(tz);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const wall = Date.UTC(y, m - 1, d, hh, mm, 0);
  let guess = wall - offsetMs(new Date(wall), zone);
  guess = wall - offsetMs(new Date(guess), zone);
  return new Date(guess);
}

/** 1 = Senin ... 7 = Minggu untuk tanggal TTTT-BB-HH (tidak bergantung zona). */
export function weekdayOfDate(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}
