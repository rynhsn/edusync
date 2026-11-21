import { z } from 'zod';
import { examDateParts } from './exam-paper';

/**
 * Tata letak kartu cetak (kartu siswa dan kartu peserta ujian). Semua koordinat dan ukuran dalam milimeter dari
 * pojok kiri atas kartu. Skema ini dipakai bersama oleh API (validasi saat simpan) dan web (editor + cetak PDF).
 */

export const CARD_KINDS = ['student', 'exam'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/** Kolom yang bisa diikat pada kartu siswa. */
export const STUDENT_CARD_FIELDS = [
  'name',
  'nis',
  'nisn',
  'className',
  'academicYear',
  'birthPlaceDate',
  'gender',
  'rfidCode',
  'qrCode',
  'schoolName',
  'address',
] as const;

/** Kolom yang bisa diikat pada kartu peserta ujian. */
export const EXAM_CARD_FIELDS = [
  'name',
  'nis',
  'className',
  'examTitle',
  'typeName',
  'participantNo',
  'room',
  'date',
  'time',
  'subjectList',
  'schoolName',
  'address',
  'academicYear',
  'principalName',
  'cityDate',
] as const;

/** Gabungan semua kolom terikat (tanpa duplikat). */
export const CARD_FIELDS = [
  'name',
  'nis',
  'nisn',
  'className',
  'academicYear',
  'birthPlaceDate',
  'gender',
  'rfidCode',
  'qrCode',
  'schoolName',
  'address',
  'examTitle',
  'typeName',
  'participantNo',
  'room',
  'date',
  'time',
  'subjectList',
  'principalName',
  'cityDate',
] as const;
export type CardField = (typeof CARD_FIELDS)[number];

/**
 * Kolom yang boleh menjadi isi kode QR / kode batang. `qrCode` = kode identitas siswa (`ES1.<kode acak>`), satu
 * kode per siswa untuk semua fitur; khusus kartu siswa dan hanya untuk elemen QR/kode batang, bukan elemen teks.
 */
export const CODE_FIELDS = ['nis', 'rfidCode', 'qrCode', 'participantNo'] as const;

/**
 * Penanda versi format isi QR identitas (bukan jenis objek); pemindai mengabaikan QR lain yang tidak berawalan ini.
 * Kode hanya MENGIDENTIFIKASI siswa; menu tempat kode dipindai yang menentukan tindakannya.
 */
export const IDENTITY_CODE_PREFIX = 'ES1.';

/** Abjad Crockford base32 (tanpa I, L, O, U) dan panjang kode acak: 20 karakter x 5 bit = 100 bit. */
export const IDENTITY_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const IDENTITY_CODE_LENGTH = 20;

const IDENTITY_CODE_RE = /^ES1\.([0-9A-HJKMNP-TV-Z]{20})$/; // panjang = IDENTITY_CODE_LENGTH

/** Isi QR yang dicetak untuk satu kode. */
export const formatIdentityPayload = (code: string): string => `${IDENTITY_CODE_PREFIX}${code}`;

/**
 * Membaca teks hasil pindai. Mengembalikan kode acak (huruf besar) bila teks berformat `ES1.<20 karakter>`,
 * selain itu null. Spasi di tepi dan huruf kecil ditoleransi (input ketik manual).
 */
export function parseIdentityPayload(text: string | null | undefined): string | null {
  const m = IDENTITY_CODE_RE.exec((text ?? '').trim().toUpperCase());
  return m?.[1] ?? null;
}

/** Apakah teks tampak seperti QR identitas siswa (berawalan `ES1.`), terlepas dari kelengkapan isinya. */
export const hasIdentityPrefix = (text: string | null | undefined): boolean =>
  (text ?? '').trim().toUpperCase().startsWith(IDENTITY_CODE_PREFIX);
export type CodeField = (typeof CODE_FIELDS)[number];

/**
 * Kolom yang boleh menjadi isi QR / kode batang per jenis kartu: kartu siswa hanya `qrCode`, kartu ujian hanya
 * `participantNo`. NIS dan kode RFID tidak boleh menjadi isi kode (tetap bisa tampil sebagai teks).
 */
export function codeFieldsFor(kind: CardKind): readonly CodeField[] {
  return kind === 'student' ? ['qrCode'] : ['participantNo'];
}

export const CARD_FIELD_LABELS: Record<CardField, string> = {
  name: 'Nama',
  nis: 'NIS',
  nisn: 'NISN',
  className: 'Kelas',
  academicYear: 'Tahun ajaran',
  birthPlaceDate: 'Tempat, tanggal lahir',
  gender: 'Jenis kelamin',
  rfidCode: 'Kode kartu RFID',
  qrCode: 'QR identitas murid',
  schoolName: 'Nama sekolah',
  address: 'Alamat',
  examTitle: 'Judul ujian',
  typeName: 'Jenis ujian',
  participantNo: 'Nomor peserta',
  room: 'Ruang',
  date: 'Tanggal ujian',
  time: 'Jam ujian',
  subjectList: 'Jadwal mata pelajaran',
  principalName: 'Nama kepala sekolah',
  cityDate: 'Kota dan tanggal cetak',
};

export function cardFieldsFor(kind: CardKind): readonly CardField[] {
  return kind === 'student' ? STUDENT_CARD_FIELDS : EXAM_CARD_FIELDS;
}

export const MAX_CARD_ELEMENTS = 60;
export const MIN_CARD_MM = 20;
export const MAX_CARD_MM = 300;

const mm = z.number().min(0).max(MAX_CARD_MM);
const posMm = z.number().gt(0).max(MAX_CARD_MM);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Warna harus #RRGGBB.');
const align = z.enum(['left', 'center', 'right']);
const fontSize = z.number().min(4).max(40);

const box = {
  /** Penanda unik elemen untuk editor (opsional). */
  id: z.string().min(1).max(40).optional(),
  x: mm,
  y: mm,
  w: posMm,
  h: posMm,
  rotation: z.number().min(-360).max(360).optional(),
};

const textStyle = {
  fontSize: fontSize.default(9),
  bold: z.boolean().default(false),
  align: align.default('left'),
  color: color.default('#111111'),
};

export const textElementSchema = z.object({
  type: z.literal('text'),
  ...box,
  text: z.string().min(1).max(200),
  ...textStyle,
});

export const fieldElementSchema = z.object({
  type: z.literal('field'),
  ...box,
  field: z.enum(CARD_FIELDS),
  /** Awalan statis sebelum nilai, mis. "NIS: ". */
  prefix: z.string().max(40).optional(),
  /** Lebar maksimum teks (mm) sebelum dibungkus/diperkecil; kosong = lebar kotak `w`. */
  maxWidth: posMm.optional(),
  ...textStyle,
});

export const imageElementSchema = z.object({
  type: z.literal('image'),
  ...box,
  /** Berkas gambar tetap (`school_file`), mis. logo. */
  fileId: z.uuid(),
  fit: z.enum(['contain', 'cover']).default('contain'),
});

export const photoElementSchema = z.object({
  type: z.literal('photo'),
  ...box,
  shape: z.enum(['rect', 'circle']).default('rect'),
  fit: z.literal('cover').default('cover'),
});

export const qrElementSchema = z.object({
  type: z.literal('qr'),
  ...box,
  field: z.enum(CODE_FIELDS),
  color: color.default('#000000'),
});

export const barcodeElementSchema = z.object({
  type: z.literal('barcode'),
  ...box,
  field: z.enum(CODE_FIELDS),
  /** Kode batang Code 128. */
  format: z.literal('code128').default('code128'),
  showText: z.boolean().default(false),
  color: color.default('#000000'),
});

export const rectElementSchema = z.object({
  type: z.literal('rect'),
  ...box,
  fill: color.nullable().default(null),
  borderColor: color.nullable().default(null),
  borderWidth: z.number().min(0).max(5).default(0),
  radius: z.number().min(0).max(50).default(0),
});

export const lineElementSchema = z.object({
  type: z.literal('line'),
  ...box,
  // Garis horizontal bila h = 0 dan vertikal bila w = 0; karena itu salah satunya boleh nol.
  w: mm,
  h: mm,
  color: color.default('#111111'),
  thickness: z.number().min(0.1).max(5).default(0.3),
});

/**
 * Tabel jadwal ujian (Hari/Tanggal, Waktu, Mata Pelajaran) dari jadwal ujian kelas siswa; hanya untuk kartu ujian.
 * Hari yang sama digabung menjadi satu sel. Ukuran huruf diperkecil otomatis bila baris tidak muat di tinggi kotak.
 */
export const SCHEDULE_COLUMNS = ['no', 'dayDate', 'day', 'date', 'time', 'subject'] as const;
export type ScheduleColumn = (typeof SCHEDULE_COLUMNS)[number];

/** Judul bawaan tiap kolom tabel jadwal; sekolah dapat menggantinya per elemen (`headers`). */
export const SCHEDULE_COLUMN_LABELS: Record<ScheduleColumn, string> = {
  no: 'No',
  dayDate: 'Hari, Tanggal',
  day: 'Hari',
  date: 'Tanggal',
  time: 'Waktu',
  subject: 'Mata Pelajaran',
};

/** Susunan kolom bawaan: seperti tanda peserta pada umumnya. */
export const DEFAULT_SCHEDULE_COLUMNS: ScheduleColumn[] = ['dayDate', 'time', 'subject'];

export const scheduleElementSchema = z.object({
  type: z.literal('schedule'),
  ...box,
  fontSize: fontSize.default(8),
  color: color.default('#111111'),
  headerFill: color.default('#f1f5f9'),
  borderColor: color.default('#111111'),
  borderWidth: z.number().min(0.1).max(2).default(0.2),
  /** Kolom yang tampil, berurutan; tiap kolom hanya boleh sekali. Bawaan: Hari, Tanggal | Waktu | Mata Pelajaran. */
  columns: z
    .array(z.enum(SCHEDULE_COLUMNS))
    .min(1)
    .max(SCHEDULE_COLUMNS.length)
    .refine((cols) => new Set(cols).size === cols.length, 'Kolom tidak boleh ganda.')
    .default(DEFAULT_SCHEDULE_COLUMNS),
  /** Judul kolom pengganti (urutan sama dengan `columns`); kosong atau tidak diisi = judul bawaan. */
  headers: z.array(z.string().max(30)).max(SCHEDULE_COLUMNS.length).optional(),
  /** Gabungkan sel hari/tanggal yang sama menjadi satu sel (rowspan). */
  mergeDays: z.boolean().default(true),
  showHeader: z.boolean().default(true),
});

export const cardElementSchema = z.discriminatedUnion('type', [
  textElementSchema,
  fieldElementSchema,
  imageElementSchema,
  photoElementSchema,
  qrElementSchema,
  barcodeElementSchema,
  rectElementSchema,
  lineElementSchema,
  scheduleElementSchema,
]);

export type CardElement = z.infer<typeof cardElementSchema>;
export type CardElementInput = z.input<typeof cardElementSchema>;

const EPS = 0.01;

export const cardLayoutSchema = z
  .object({
    widthMm: z.number().int().min(MIN_CARD_MM).max(MAX_CARD_MM),
    heightMm: z.number().int().min(MIN_CARD_MM).max(MAX_CARD_MM),
    elements: z.array(cardElementSchema).max(MAX_CARD_ELEMENTS),
  })
  .superRefine((layout, ctx) => {
    layout.elements.forEach((el, i) => {
      if (el.x + el.w > layout.widthMm + EPS || el.y + el.h > layout.heightMm + EPS) {
        ctx.addIssue({
          code: 'custom',
          path: ['elements', i],
          message: 'Elemen melewati batas kartu.',
        });
      }
    });
  });

export type CardLayout = z.infer<typeof cardLayoutSchema>;
export type CardLayoutInput = z.input<typeof cardLayoutSchema>;

/** Kolom terikat yang tidak berlaku untuk jenis kartu; daftar kosong = layout sah untuk jenis itu. */
export function invalidFieldsForKind(kind: CardKind, elements: readonly CardElement[]): string[] {
  const allowed = cardFieldsFor(kind) as readonly string[];
  const codeAllowed = codeFieldsFor(kind) as readonly string[];
  const bad = new Set<string>();
  for (const el of elements) {
    if ((el.type === 'field' || el.type === 'qr' || el.type === 'barcode') && !allowed.includes(el.field)) {
      bad.add(el.field);
    } else if ((el.type === 'qr' || el.type === 'barcode') && !codeAllowed.includes(el.field)) {
      // NIS dan kode kartu RFID hanya boleh tampil sebagai teks, tidak sebagai isi QR / kode batang.
      bad.add(`${el.field} (isi ${el.type === 'qr' ? 'QR' : 'kode batang'})`);
    }
    if (el.type === 'schedule' && kind !== 'exam') bad.add('schedule');
    // QR identitas hanya untuk gambar kode; sebagai teks akan membocorkan isinya di kartu.
    if (el.type === 'field' && el.field === 'qrCode') bad.add(el.field);
  }
  return [...bad];
}

/** Nilai kolom untuk satu kartu. Larik digabung per baris; nilai kosong menjadi string kosong. */
export type CardData = Partial<Record<CardField, string | readonly string[] | null | undefined>> & {
  /** Jadwal ujian kelas siswa untuk elemen tabel jadwal (kartu ujian). */
  schedule?: readonly ExamScheduleLine[] | null;
};

/** Satu baris jadwal ujian pada kartu. */
export interface ExamScheduleLine {
  subject: string;
  /** Tanggal kalender `YYYY-MM-DD`; kosong bila ujian belum dijadwalkan. */
  date: string | null;
  /** "07.30 - 09.00 WIB" atau kosong. */
  time: string;
}

const MONTHS_LONG = [
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

/** "2025-06-04" -> "Kamis, 04 Juni 2025"; tanpa tanggal -> "Belum dijadwalkan". */
export function scheduleDayLabel(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return 'Belum dijadwalkan';
  const { day } = examDateParts(iso);
  return `${day}, ${m[3]} ${MONTHS_LONG[Number(m[2]) - 1] ?? ''} ${m[1]}`;
}

export interface ScheduleDayGroup {
  label: string;
  rows: { time: string; subject: string }[];
}

/** Kelompokkan jadwal per tanggal (urut tanggal, lalu jam, lalu mata pelajaran); tanpa tanggal ditaruh di akhir. */
export function groupScheduleByDay(lines: readonly ExamScheduleLine[]): ScheduleDayGroup[] {
  const sorted = [...lines].sort(
    (a, b) =>
      (a.date ?? '9999').localeCompare(b.date ?? '9999') ||
      a.time.localeCompare(b.time) ||
      a.subject.localeCompare(b.subject),
  );
  const groups: ScheduleDayGroup[] = [];
  for (const l of sorted) {
    const label = scheduleDayLabel(l.date);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push({ time: l.time, subject: l.subject });
    else groups.push({ label, rows: [{ time: l.time, subject: l.subject }] });
  }
  return groups;
}

/** "2025-06-04" -> "04 Juni 2025"; tanpa tanggal -> "". */
function scheduleDateOnly(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]} ${MONTHS_LONG[Number(m[2]) - 1] ?? ''} ${m[1]}` : '';
}

export interface ScheduleTableRow {
  /** Teks tiap kolom; `null` = sel ini sudah tercakup sel di atasnya (rowspan). */
  cells: (string | null)[];
  /** Jumlah baris yang dicakup tiap sel (1 = tidak digabung). */
  spans: number[];
}

export interface ScheduleTable {
  columns: ScheduleColumn[];
  headers: string[];
  rows: ScheduleTableRow[];
}

/**
 * Susun tabel jadwal dari baris jadwal ujian menurut pilihan elemen (kolom, judul, penggabungan hari). Murni, dipakai
 * bersama pratinjau editor dan PDF supaya tampilannya sama. Kolom hari/tanggal digabung per tanggal bila `mergeDays`.
 */
export function buildScheduleTable(
  lines: readonly ExamScheduleLine[],
  opts: {
    columns?: readonly ScheduleColumn[];
    headers?: readonly string[] | undefined;
    mergeDays?: boolean;
  } = {},
): ScheduleTable {
  const columns = [...(opts.columns?.length ? opts.columns : DEFAULT_SCHEDULE_COLUMNS)];
  const headers = columns.map((c, i) => opts.headers?.[i]?.trim() || SCHEDULE_COLUMN_LABELS[c]);
  const merge = opts.mergeDays ?? true;
  const sorted = [...lines].sort(
    (a, b) =>
      (a.date ?? '9999').localeCompare(b.date ?? '9999') ||
      a.time.localeCompare(b.time) ||
      a.subject.localeCompare(b.subject),
  );
  const dayColumns: ScheduleColumn[] = ['dayDate', 'day', 'date'];
  const rows: ScheduleTableRow[] = sorted.map((l, i) => {
    const parts = examDateParts(l.date);
    const text: Record<ScheduleColumn, string> = {
      no: String(i + 1),
      dayDate: scheduleDayLabel(l.date),
      day: parts.day || 'Belum dijadwalkan',
      date: scheduleDateOnly(l.date),
      time: l.time,
      subject: l.subject,
    };
    return { cells: columns.map((c) => text[c]), spans: columns.map(() => 1) };
  });
  if (merge) {
    columns.forEach((c, ci) => {
      if (!dayColumns.includes(c)) return;
      let start = 0;
      for (let r = 1; r <= rows.length; r++) {
        const same = r < rows.length && sorted[r]?.date === sorted[start]?.date;
        if (same) continue;
        const span = r - start;
        if (span > 1) {
          (rows[start] as ScheduleTableRow).spans[ci] = span;
          for (let k = start + 1; k < r; k++) (rows[k] as ScheduleTableRow).cells[ci] = null;
        }
        start = r;
      }
    });
  }
  return { columns, headers, rows };
}

const PT_TO_MM = 25.4 / 72;
const SCHEDULE_ROW_FACTOR = 1.9;

/**
 * Ukuran huruf (pt) tabel jadwal supaya semua baris (plus satu baris judul) muat di tinggi `heightMm`; tidak melebihi
 * `fontSize` dan tidak kurang dari 4. Dipakai bersama pratinjau dan PDF agar tampilannya sama.
 */
export function fitScheduleFont(rowCount: number, heightMm: number, fontSize: number): number {
  const lines = Math.max(1, rowCount) + 1;
  const fit = heightMm / (lines * PT_TO_MM * SCHEDULE_ROW_FACTOR);
  return Math.max(4, Math.min(fontSize, Math.floor(fit * 10) / 10));
}

/** Tinggi satu baris tabel jadwal (mm) untuk ukuran huruf tertentu. */
export function scheduleRowHeightMm(fontSize: number): number {
  return fontSize * PT_TO_MM * SCHEDULE_ROW_FACTOR;
}

const GENDER_LABEL: Record<string, string> = { L: 'Laki-laki', P: 'Perempuan' };

/** Nilai teks yang tampil untuk kolom terikat. Murni; tidak pernah melempar. */
export function resolveFieldValue(field: CardField, data: CardData): string {
  const raw = data[field];
  if (raw === null || raw === undefined) return '';
  const text = (Array.isArray(raw) ? raw.join('\n') : String(raw)).trim();
  if (field === 'gender') return GENDER_LABEL[text.toUpperCase()] ?? text;
  return text;
}

const DEFAULT_TEXT = { bold: false, align: 'left', color: '#111111' } as const;

/** Kartu siswa bawaan, CR80 86 x 54 mm. */
export function defaultStudentCardLayout(): CardLayout {
  return {
    widthMm: 86,
    heightMm: 54,
    elements: [
      {
        type: 'rect',
        x: 0,
        y: 0,
        w: 86,
        h: 12,
        fill: '#1d4ed8',
        borderColor: null,
        borderWidth: 0,
        radius: 0,
      },
      {
        type: 'field',
        field: 'schoolName',
        x: 3,
        y: 3.5,
        w: 80,
        h: 6,
        fontSize: 10,
        bold: true,
        align: 'center',
        color: '#ffffff',
      },
      { type: 'photo', x: 4, y: 17, w: 21, h: 28, shape: 'rect', fit: 'cover' },
      { type: 'field', field: 'name', x: 28, y: 17, w: 54, h: 6, ...DEFAULT_TEXT, fontSize: 10, bold: true },
      { type: 'qr', field: 'qrCode', color: '#000000', x: 63, y: 25, w: 19, h: 19 },
      {
        type: 'text',
        text: 'Kode identitas murid',
        x: 60,
        y: 44.5,
        w: 25,
        h: 4,
        ...DEFAULT_TEXT,
        fontSize: 4,
        align: 'center',
      },
      {
        type: 'field',
        field: 'nis',
        prefix: 'NIS: ',
        x: 28,
        y: 26,
        w: 33,
        h: 5,
        ...DEFAULT_TEXT,
        fontSize: 8,
      },
      {
        type: 'field',
        field: 'className',
        prefix: 'Kelas: ',
        x: 28,
        y: 33,
        w: 33,
        h: 5,
        ...DEFAULT_TEXT,
        fontSize: 8,
      },
      {
        type: 'field',
        field: 'academicYear',
        prefix: 'TA: ',
        x: 28,
        y: 40,
        w: 33,
        h: 5,
        ...DEFAULT_TEXT,
        fontSize: 8,
      },
    ],
  };
}

/** Kartu peserta ujian bawaan, 100 x 60 mm. */
export function defaultExamCardLayout(): CardLayout {
  const line = (
    field: 'name' | 'nis' | 'className' | 'participantNo' | 'room',
    prefix: string,
    y: number,
  ): CardElement => ({
    type: 'field',
    field,
    prefix,
    x: 4,
    y,
    w: 66,
    h: 5,
    ...DEFAULT_TEXT,
    fontSize: 8,
  });
  return {
    widthMm: 100,
    heightMm: 60,
    elements: [
      {
        type: 'rect',
        x: 0,
        y: 0,
        w: 100,
        h: 14,
        fill: '#0f766e',
        borderColor: null,
        borderWidth: 0,
        radius: 0,
      },
      {
        type: 'text',
        text: 'KARTU PESERTA',
        x: 3,
        y: 2,
        w: 94,
        h: 5,
        fontSize: 10,
        bold: true,
        align: 'center',
        color: '#ffffff',
      },
      {
        type: 'field',
        field: 'examTitle',
        x: 3,
        y: 8,
        w: 94,
        h: 5,
        fontSize: 8,
        bold: false,
        align: 'center',
        color: '#ffffff',
      },
      line('participantNo', 'No. Peserta: ', 17),
      line('name', 'Nama: ', 23),
      line('nis', 'NIS: ', 29),
      line('className', 'Kelas: ', 35),
      line('room', 'Ruang: ', 41),
      {
        type: 'field',
        field: 'date',
        prefix: 'Tanggal: ',
        x: 4,
        y: 47,
        w: 66,
        h: 5,
        ...DEFAULT_TEXT,
        fontSize: 8,
      },
      { type: 'qr', field: 'participantNo', color: '#000000', x: 74, y: 18, w: 22, h: 22 },
      { type: 'photo', x: 74, y: 42, w: 14, h: 14, shape: 'rect', fit: 'cover' },
    ],
  };
}

export function defaultCardLayout(kind: CardKind): CardLayout {
  return kind === 'student' ? defaultStudentCardLayout() : defaultExamCardLayout();
}

/** Nama templat bawaan yang ditawarkan ke sekolah. */
export const DEFAULT_CARD_TEMPLATE_NAME: Record<CardKind, string> = {
  student: 'Kartu murid bawaan',
  exam: 'Kartu peserta ujian bawaan',
};

/**
 * Aturan nomor peserta ujian: `<singkatan jenis>-<yy>-<urutan 3 digit>`, mis. "ASTS-26-007". `yy` = dua digit
 * tahun mulai tahun ajaran, urutan = posisi siswa di kelasnya (diurut nama lalu id) pada tahun ajaran itu.
 * Stabil untuk siswa + jenis ujian + semester selama susunan kelas tidak berubah.
 */
export function formatParticipantNo(typeShort: string, academicYearStart: string, seq: number): string {
  const yy = /^(\d{4})/.exec(academicYearStart)?.[1]?.slice(2) ?? '00';
  const short = typeShort.trim().toUpperCase().replace(/\s+/g, '') || 'UJN';
  return `${short}-${yy}-${String(seq).padStart(3, '0')}`;
}
