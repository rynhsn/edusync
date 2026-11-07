import { z } from 'zod';

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
  'academicYear',
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
] as const;
export type CardField = (typeof CARD_FIELDS)[number];

/**
 * Kolom yang boleh menjadi isi kode QR / kode batang. `qrCode` = isi QR absensi cadangan kartu siswa
 * (`ES1.<kode acak>`), khusus kartu siswa dan hanya untuk elemen QR/kode batang, bukan elemen teks.
 */
export const CODE_FIELDS = ['nis', 'rfidCode', 'qrCode', 'participantNo'] as const;

/** Awalan isi QR absensi; pemindai mengabaikan QR lain yang tidak berawalan ini. */
export const ATTENDANCE_QR_PREFIX = 'ES1.';

/** Abjad Crockford base32 (tanpa I, L, O, U) dan panjang kode acak: 20 karakter x 5 bit = 100 bit. */
export const ATTENDANCE_QR_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ATTENDANCE_QR_CODE_LENGTH = 20;

const ATTENDANCE_QR_RE = /^ES1\.([0-9A-HJKMNP-TV-Z]{20})$/; // panjang = ATTENDANCE_QR_CODE_LENGTH

/** Isi QR yang dicetak untuk satu kode. */
export const formatAttendanceQr = (code: string): string => `${ATTENDANCE_QR_PREFIX}${code}`;

/**
 * Membaca teks hasil pindai. Mengembalikan kode acak (huruf besar) bila teks berformat `ES1.<20 karakter>`,
 * selain itu null. Spasi di tepi dan huruf kecil ditoleransi (input ketik manual).
 */
export function parseAttendanceQr(text: string | null | undefined): string | null {
  const m = ATTENDANCE_QR_RE.exec((text ?? '').trim().toUpperCase());
  return m?.[1] ?? null;
}

/** Apakah teks tampak seperti QR absensi (berawalan `ES1.`), terlepas dari kelengkapan isinya. */
export const hasAttendanceQrPrefix = (text: string | null | undefined): boolean =>
  (text ?? '').trim().toUpperCase().startsWith(ATTENDANCE_QR_PREFIX);
export type CodeField = (typeof CODE_FIELDS)[number];

export const CARD_FIELD_LABELS: Record<CardField, string> = {
  name: 'Nama',
  nis: 'NIS',
  nisn: 'NISN',
  className: 'Kelas',
  academicYear: 'Tahun ajaran',
  birthPlaceDate: 'Tempat, tanggal lahir',
  gender: 'Jenis kelamin',
  rfidCode: 'Kode kartu RFID',
  qrCode: 'QR absensi',
  schoolName: 'Nama sekolah',
  address: 'Alamat',
  examTitle: 'Judul ujian',
  typeName: 'Jenis ujian',
  participantNo: 'Nomor peserta',
  room: 'Ruang',
  date: 'Tanggal ujian',
  time: 'Jam ujian',
  subjectList: 'Jadwal mata pelajaran',
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

export const cardElementSchema = z.discriminatedUnion('type', [
  textElementSchema,
  fieldElementSchema,
  imageElementSchema,
  photoElementSchema,
  qrElementSchema,
  barcodeElementSchema,
  rectElementSchema,
  lineElementSchema,
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
  const bad = new Set<string>();
  for (const el of elements) {
    if ((el.type === 'field' || el.type === 'qr' || el.type === 'barcode') && !allowed.includes(el.field)) {
      bad.add(el.field);
    }
    // QR absensi hanya untuk gambar kode; sebagai teks akan membocorkan isinya di kartu.
    if (el.type === 'field' && el.field === 'qrCode') bad.add(el.field);
  }
  return [...bad];
}

/** Nilai kolom untuk satu kartu. Larik digabung per baris; nilai kosong menjadi string kosong. */
export type CardData = Partial<Record<CardField, string | readonly string[] | null | undefined>>;

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
      { type: 'photo', x: 4, y: 16, w: 20, h: 26, shape: 'rect', fit: 'cover' },
      { type: 'field', field: 'name', x: 28, y: 16, w: 54, h: 6, ...DEFAULT_TEXT, fontSize: 10, bold: true },
      { type: 'qr', field: 'qrCode', color: '#000000', x: 63, y: 24, w: 19, h: 19 },
      {
        type: 'text',
        text: 'Pindai untuk absen',
        x: 60,
        y: 43.5,
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
        y: 24,
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
        y: 30,
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
        y: 36,
        w: 33,
        h: 5,
        ...DEFAULT_TEXT,
        fontSize: 8,
      },
      {
        type: 'barcode',
        field: 'nis',
        format: 'code128',
        showText: false,
        color: '#000000',
        x: 28,
        y: 43,
        w: 30,
        h: 8,
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
  student: 'Kartu siswa bawaan',
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
