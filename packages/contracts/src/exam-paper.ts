import { z } from 'zod';

/**
 * Pengaturan lembar ujian cetak: kop, judul, blok keterangan di bawah kop, petunjuk umum, dan blok identitas siswa.
 * Disimpan per sekolah; ujian tertentu boleh punya salinan sendiri. Semua teks boleh memuat penampung `{nama}`
 * (lihat EXAM_PLACEHOLDERS) yang diisi dari data ujian saat dicetak.
 */
export const EXAM_PAPER_SIZES = ['A4', 'F4', 'Letter'] as const;

/** Penampung yang dikenali `renderExamTemplate`. */
export const EXAM_PLACEHOLDERS = [
  'examName',
  'examShort',
  'semester',
  'academicYear',
  'subject',
  'class',
  'day',
  'date',
  'dayDate',
  'time',
  'duration',
  'teacher',
  'school',
] as const;
export type ExamPlaceholder = (typeof EXAM_PLACEHOLDERS)[number];

const text = (max: number) => z.string().trim().max(max);

export const examPaperConfigSchema = z.object({
  paperSize: z.enum(EXAM_PAPER_SIZES),
  marginMm: z.number().int().min(8).max(30),
  fontSizePt: z.number().min(9).max(14),
  kop: z.object({
    enabled: z.boolean(),
    showLogo: z.boolean(),
    /** `identity` = nama, alamat, dan kontak diambil dari identitas sekolah; `custom` = baris buatan sendiri. */
    source: z.enum(['identity', 'custom']),
    /** Baris di atas nama sekolah (mis. nama yayasan atau instansi), dipakai pada kedua sumber. */
    preLines: z.array(text(120)).max(3),
    show: z.object({
      address: z.boolean(),
      phone: z.boolean(),
      fax: z.boolean(),
      email: z.boolean(),
      website: z.boolean(),
    }),
    customLines: z
      .array(z.object({ text: text(160), bold: z.boolean(), sizePt: z.number().min(8).max(20) }))
      .max(6),
  }),
  title: z.object({ enabled: z.boolean(), template: text(200) }),
  info: z.object({
    enabled: z.boolean(),
    columns: z.union([z.literal(1), z.literal(2)]),
    rows: z.array(z.object({ label: text(60), value: text(200) })).max(10),
  }),
  instructions: z.object({
    enabled: z.boolean(),
    title: text(60),
    items: z.array(text(400)).max(15),
  }),
  studentBlock: z.object({
    enabled: z.boolean(),
    fields: z.array(z.enum(['name', 'number', 'class'])).max(3),
  }),
  footer: text(200),
});
export type ExamPaperConfig = z.infer<typeof examPaperConfigSchema>;

export const DEFAULT_EXAM_PAPER: ExamPaperConfig = {
  paperSize: 'A4',
  marginMm: 15,
  fontSizePt: 11,
  kop: {
    enabled: true,
    showLogo: true,
    source: 'identity',
    preLines: [],
    show: { address: true, phone: true, fax: true, email: true, website: false },
    customLines: [],
  },
  title: { enabled: true, template: '{examName} {semester} TAHUN PELAJARAN {academicYear}' },
  info: {
    enabled: true,
    columns: 2,
    rows: [
      { label: 'Mata Pelajaran', value: '{subject}' },
      { label: 'Kelas', value: '{class}' },
      { label: 'Hari / Tanggal', value: '{dayDate}' },
      { label: 'Waktu', value: '{time}' },
    ],
  },
  instructions: {
    enabled: true,
    title: 'PETUNJUK UMUM',
    items: [
      'Berdoalah sebelum mengerjakan soal.',
      'Tulislah nama dan nomor peserta pada lembar jawaban.',
      'Periksa dan bacalah soal dengan teliti sebelum menjawab.',
      'Dahulukan soal yang dianggap mudah.',
      'Periksa kembali jawaban sebelum diserahkan kepada pengawas.',
    ],
  },
  studentBlock: { enabled: true, fields: ['name', 'number', 'class'] },
  footer: '',
};

/** Gabungkan konfigurasi tersimpan (boleh sebagian/usang) dengan bawaan; nilai tak valid kembali ke bawaan. */
export function resolveExamPaper(stored: unknown): ExamPaperConfig {
  const merged = mergeDeep(DEFAULT_EXAM_PAPER, stored);
  const parsed = examPaperConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_EXAM_PAPER;
}

function mergeDeep<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return base;
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over as T;
  if (typeof over !== 'object' || Array.isArray(over)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    if (k in out) out[k] = mergeDeep(out[k], v);
  }
  return out as T;
}

/** Isi penampung `{nama}`; yang tak dikenal atau kosong menjadi string kosong. Spasi ganda dirapikan. */
export function renderExamTemplate(template: string, vars: Partial<Record<ExamPlaceholder, string>>): string {
  return template
    .replace(/\{(\w+)\}/g, (_m, key: string) => vars[key as ExamPlaceholder] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/** "2026-12-08" -> { day: "Selasa", date: "8 Desember 2026" } (tanpa zona waktu: tanggal kalender murni). */
export function examDateParts(iso: string | null | undefined): { day: string; date: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return { day: '', date: '' };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return { day: DAYS_ID[dow] ?? '', date: `${d} ${MONTHS_ID[mo - 1] ?? ''} ${y}` };
}

/** "07:30" + 90 menit -> "07.30 - 09.00 WIB"; tanpa jam mulai -> "". */
export function examTimeRange(
  start: string | null | undefined,
  minutes: number | null | undefined,
  zone = 'WIB',
) {
  if (!start || !/^\d{2}:\d{2}$/.test(start)) return '';
  const fmt = (h: number, m: number) => `${String(h).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
  const [h = 0, m = 0] = start.split(':').map(Number);
  if (!minutes) return `${fmt(h, m)} ${zone}`;
  const end = h * 60 + m + minutes;
  return `${fmt(h, m)} - ${fmt(Math.floor(end / 60) % 24, end % 60)} ${zone}`;
}
