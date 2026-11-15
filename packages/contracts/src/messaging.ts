import { z } from 'zod';

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

/** "Agustus 2026" dari periode TTTT-BB. */
export function formatMonthYearId(period: string): string {
  const d = new Date(`${period.slice(0, 7)}-01T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return period;
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/** Batas teks header dan footer pesan sekolah (karakter, masing-masing). */
export const MESSAGE_FRAME_MAX = 300;
/** Batas praktis panjang pesan akhir (header + isi + footer). */
export const MESSAGE_TOTAL_MAX = 4000;

/** Pengganti yang boleh dipakai di header/footer: hanya yang bernilai sama untuk semua pesan sekolah. */
export const FRAME_PLACEHOLDERS = ['school'] as const;

/** Pengganti di header/footer yang tidak diizinkan (mis. {{student}} yang kosong di header). */
export function unknownFramePlaceholders(text: string): string[] {
  return placeholdersIn(text).filter((p) => !(FRAME_PLACEHOLDERS as readonly string[]).includes(p));
}

/**
 * Pesan yang dikirim: header + "\n\n" + isi + "\n\n" + footer; bagian kosong dilewati. Dipakai worker saat kirim dan
 * pratinjau web. Bila hasil melebihi MESSAGE_TOTAL_MAX, pesan dikirim apa adanya (tanpa header/footer) agar tidak
 * ditolak atau terpotong.
 */
export function composeMessage(
  body: string,
  frame: { headerText?: string | null; footerText?: string | null; schoolName?: string | null },
): string {
  const part = (t: string | null | undefined) => renderTemplate(t ?? '', { school: frame.schoolName });
  const out = [part(frame.headerText), body, part(frame.footerText)].filter((s) => s !== '').join('\n\n');
  return out.length > MESSAGE_TOTAL_MAX ? body : out;
}

/* ---------- Pesan langsung ke wali/staf terpilih (tahap A, rilis 0.6.0) ---------- */

/** Pengganti yang boleh dipakai di pesan langsung. `{{teacher}}` hanya terisi untuk penerima staf. */
export const DIRECT_PLACEHOLDERS = ['guardian', 'student', 'class', 'school', 'date', 'teacher'] as const;
export type DirectPlaceholder = (typeof DIRECT_PLACEHOLDERS)[number];

/** Panjang isi pesan langsung dan judul internal batch. */
export const DIRECT_BODY_MAX = 1000;
export const DIRECT_TITLE_MAX = 120;
export const DIRECT_TEMPLATE_NAME_MAX = 60;
/** Batas id per larik pemilih penerima. */
export const SELECTION_ARRAY_MAX = 500;
/** Lebih dari ini wajib izin `message:broadcast` dan konfirmasi dengan mengetik jumlah penerima. */
export const BATCH_CONFIRM_THRESHOLD = 30;
/** Slot antrean per sekolah yang dicadangkan untuk pesan peristiwa otomatis. */
export const QUEUE_RESERVE = 100;
/** Batas harian bawaan, batas atas bawaan platform, dan batas untuk nomor yang baru dipakai. */
export const DEFAULT_DAILY_LIMIT = 200;
export const DEFAULT_DAILY_LIMIT_MAX = 500;
export const NEW_NUMBER_DAILY_LIMIT = 50;
export const NEW_NUMBER_DAYS = 7;

/** Prioritas antrean: makin kecil makin dulu. Pesan peristiwa otomatis dan `test` = 0. */
export const MESSAGE_PRIORITY = { event: 0, direct: 1, broadcast: 2 } as const;

/** Templat pesan langsung bawaan (bukan baris DB). Nama tampilnya diterjemahkan web lewat `key`. */
export const DIRECT_TEMPLATES: readonly { key: string; name: string; body: string }[] = [
  {
    key: 'parent_call',
    name: 'Pemanggilan orang tua',
    body:
      'Yth. Bapak/Ibu {{guardian}}, kami mohon kehadiran Bapak/Ibu di {{school}} terkait {{student}} ({{class}}). ' +
      'Mohon konfirmasi waktu kehadiran. Terima kasih.',
  },
  {
    key: 'info',
    name: 'Pemberitahuan umum',
    body: 'Yth. Bapak/Ibu {{guardian}}, kami sampaikan informasi dari {{school}} mengenai {{student}} ({{class}}): ',
  },
  {
    key: 'staff',
    name: 'Pemberitahuan staf',
    body: 'Yth. Bapak/Ibu {{teacher}}, berikut informasi dari {{school}} pada {{date}}: ',
  },
];

/** Pengganti di isi pesan langsung yang tidak dikenal. */
export function unknownDirectPlaceholders(body: string): string[] {
  return placeholdersIn(body).filter((p) => !(DIRECT_PLACEHOLDERS as readonly string[]).includes(p));
}

/** Deret 16 digit (pola NIK) tidak boleh dikirim lewat pesan bebas. */
export function hasSensitiveNumber(body: string): boolean {
  return /(?<!\d)\d{16}(?!\d)/.test(body.replace(/(?<=\d)[ .-](?=\d)/g, ''));
}

/** "A", "A dan B", "A, B dan C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} dan ${names[names.length - 1]}`;
}

/**
 * Pemilih penerima. Murid/rombel/tingkat/seluruh sekolah menuju wali (bawaan wali utama, jatuh ke wali lain bila
 * utama tak bernomor); `guardians` menuju wali tertentu; `teachers`/`allStaff` menuju staf aktif bernomor.
 */
export const recipientSelectionSchema = z.object({
  students: z.array(z.uuid()).max(SELECTION_ARRAY_MAX).optional(),
  classes: z.array(z.uuid()).max(SELECTION_ARRAY_MAX).optional(),
  gradeLevels: z.array(z.string().trim().min(1).max(30)).max(SELECTION_ARRAY_MAX).optional(),
  wholeSchool: z.literal(true).optional(),
  guardians: z.array(z.uuid()).max(SELECTION_ARRAY_MAX).optional(),
  teachers: z.array(z.uuid()).max(SELECTION_ARRAY_MAX).optional(),
  allStaff: z.literal(true).optional(),
  guardianScope: z.enum(['primary', 'all']).optional(),
});
export type RecipientSelection = z.infer<typeof recipientSelectionSchema>;

/** Pemilih kosong (tidak ada sasaran sama sekali). */
export function selectionIsEmpty(s: RecipientSelection): boolean {
  return !(
    s.students?.length ||
    s.classes?.length ||
    s.gradeLevels?.length ||
    s.wholeSchool ||
    s.guardians?.length ||
    s.teachers?.length ||
    s.allStaff
  );
}

/** Pemilih yang bukan daftar individu (rombel, tingkat, seluruh sekolah/staf) wajib izin siaran. */
export function selectionIsBroad(s: RecipientSelection): boolean {
  return Boolean(s.classes?.length || s.gradeLevels?.length || s.wholeSchool || s.allStaff);
}

export interface DirectRecipientVars {
  guardianName?: string | null;
  teacherName?: string | null;
  studentNames: readonly string[];
  classNames: readonly string[];
}

/** Isi pesan langsung untuk satu penerima; `date` sudah berformat (mis. "15 November 2026"). */
export function renderDirect(
  body: string,
  r: DirectRecipientVars,
  ctx: { school: string; date: string },
): string {
  return renderTemplate(body, {
    guardian: r.guardianName,
    teacher: r.teacherName,
    student: joinNames(r.studentNames),
    class: joinNames(r.classNames),
    school: ctx.school,
    date: ctx.date,
  });
}

/** Masalah pada isi pesan langsung (null = layak): pengganti tak dikenal, atau memuat deret 16 digit. */
export function directBodyIssue(
  body: string,
): { code: 'unknown_placeholder' | 'sensitive_content'; detail: string } | null {
  const unknown = unknownDirectPlaceholders(body);
  if (unknown.length > 0) {
    return { code: 'unknown_placeholder', detail: unknown.map((u) => `{{${u}}}`).join(', ') };
  }
  if (hasSensitiveNumber(body)) return { code: 'sensitive_content', detail: '16 digit' };
  return null;
}
