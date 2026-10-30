/**
 * Notifikasi WhatsApp ke wali murid: daftar peristiwa, templat bawaan, pengganti ({{nama}}) per peristiwa,
 * pengisi templat, dan normalisasi nomor telepon. API, worker, dan web memakai definisi yang sama.
 */
export const EVENT_KEYS = [
  'arrival',
  'departure',
  'absent',
  'skipped_class',
  'payment',
  'overdue',
  'report_card',
] as const;

export type EventKey = (typeof EVENT_KEYS)[number];

export function isEventKey(value: string): value is EventKey {
  return (EVENT_KEYS as readonly string[]).includes(value);
}

/** Semua pengganti yang dikenal sistem. */
export const PLACEHOLDERS = [
  'student',
  'class',
  'school',
  'time',
  'date',
  'subject',
  'amount',
  'receipt',
  'title',
  'due',
  'semester',
] as const;

export type Placeholder = (typeof PLACEHOLDERS)[number];

/**
 * Pengganti yang diisi pemicu untuk tiap peristiwa (juga acuan bagi penjadwal worker).
 * - arrival/departure: tap kiosk; `time` = jam tap (HH:MM, Asia/Jakarta), `date` = tanggal tap.
 * - absent: penjadwal "belum tiba"; `date` = hari ini.
 * - skipped_class: absen per jam pelajaran; `time` = rentang jam pelajaran (mis. 08:00-08:45).
 * - payment: `amount` berformat "Rp 250.000", `title` = judul tagihan digabung, `date` = tanggal bayar.
 * - overdue: `amount` = sisa tagihan, `title` = judul tagihan, `due` = jatuh tempo.
 * - report_card: `semester` = nama semester.
 */
export const EVENT_PLACEHOLDERS: Readonly<Record<EventKey, readonly Placeholder[]>> = {
  arrival: ['student', 'class', 'school', 'time', 'date'],
  departure: ['student', 'class', 'school', 'time', 'date'],
  absent: ['student', 'class', 'school', 'date'],
  skipped_class: ['student', 'class', 'school', 'subject', 'date', 'time'],
  payment: ['student', 'school', 'amount', 'receipt', 'title', 'date'],
  overdue: ['student', 'school', 'amount', 'title', 'due'],
  report_card: ['student', 'class', 'school', 'semester'],
};

export const DEFAULT_TEMPLATES: Readonly<Record<EventKey, string>> = {
  arrival:
    'Yth. Bapak/Ibu, {{student}} ({{class}}) telah tiba di {{school}} pada pukul {{time}}. Terima kasih.',
  departure:
    'Yth. Bapak/Ibu, {{student}} ({{class}}) telah meninggalkan {{school}} pada pukul {{time}}. Terima kasih.',
  absent:
    'Yth. Bapak/Ibu, hingga saat ini {{student}} ({{class}}) belum tercatat hadir di {{school}} pada {{date}}. ' +
    'Mohon konfirmasi bila berhalangan hadir.',
  skipped_class:
    'Yth. Bapak/Ibu, {{student}} ({{class}}) tercatat hadir di {{school}} tetapi tidak mengikuti pelajaran ' +
    '{{subject}} pada {{date}} ({{time}}). Mohon perhatiannya.',
  payment:
    'Yth. Bapak/Ibu, pembayaran {{title}} untuk {{student}} sebesar {{amount}} telah kami terima ' +
    '(kwitansi {{receipt}}, {{date}}). Terima kasih. {{school}}',
  overdue:
    'Yth. Bapak/Ibu, tagihan {{title}} untuk {{student}} sebesar {{amount}} telah jatuh tempo pada {{due}}. ' +
    'Mohon segera diselesaikan. Terima kasih. {{school}}',
  report_card:
    'Yth. Bapak/Ibu, rapor {{student}} ({{class}}) semester {{semester}} telah terbit. ' +
    'Silakan menghubungi {{school}} untuk pengambilan rapor.',
};

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

/** Nama pengganti yang dipakai sebuah templat (tanpa duplikat). */
export function placeholdersIn(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER_RE)].map((m) => m[1] as string))];
}

/** Pengganti di templat yang tidak dikenal untuk peristiwa itu. */
export function unknownPlaceholders(eventKey: EventKey, body: string): string[] {
  const allowed = EVENT_PLACEHOLDERS[eventKey] as readonly string[];
  return placeholdersIn(body).filter((p) => !allowed.includes(p));
}

/** Isi templat. Pengganti tak dikenal atau tanpa nilai dibiarkan kosong; nilai di-trim. */
export function renderTemplate(
  body: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return body
    .replace(PLACEHOLDER_RE, (_, name: string) => {
      const value = Object.hasOwn(vars, name) ? vars[name] : undefined;
      return value === null || value === undefined ? '' : String(value).trim();
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,;:!?])/g, '$1')
    .trim();
}

/**
 * Normalisasi nomor telepon ke bentuk digit berawalan kode negara Indonesia. 08xx menjadi 628xx; +62/62 tetap;
 * hasil harus 10 sampai 15 digit. Selain itu null.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (!/^\d+$/.test(s)) return null;
  if (s.startsWith('0')) s = `62${s.slice(1)}`;
  else if (!s.startsWith('62')) return null;
  return s.length >= 10 && s.length <= 15 ? s : null;
}

/** "Rp 250.000" untuk pengganti {{amount}}. */
export function formatRupiah(amount: number): string {
  return `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(amount)}`;
}

/** "30 Oktober 2026" dari tanggal TTTT-BB-HH, untuk pengganti {{date}} dan {{due}}. */
export function formatDateId(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}
