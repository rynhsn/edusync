import { buildTemplate, MAX_IMPORT_ROWS, parseSheet, type SheetRow, type SheetSpec } from './sheet';

export type TeacherField =
  | 'name'
  | 'nip'
  | 'status'
  | 'nik'
  | 'gender'
  | 'birthPlace'
  | 'birthDate'
  | 'religion'
  | 'education'
  | 'phone'
  | 'email'
  | 'address';
export type TeacherImportRow = SheetRow<TeacherField>;

/** Judul kolom templat, urut. */
export const TEACHER_HEADERS = [
  'Nama',
  'NIP',
  'Status',
  'NIK',
  'Jenis Kelamin',
  'Tempat Lahir',
  'Tanggal Lahir',
  'Agama',
  'Pendidikan',
  'Telepon/WA',
  'Email',
  'Alamat',
];
/** Kolom (mulai 1) yang harus tetap teks: NIP, NIK, dan telepon (nol di depan tidak boleh hilang). */
export const TEACHER_TEXT_COLUMNS = [2, 4, 10];

export const TEACHER_SPEC: SheetSpec<TeacherField> = {
  fields: {
    name: ['nama', 'nama lengkap', 'nama guru', 'name'],
    nip: ['nip', 'nuptk', 'nomor induk pegawai'],
    status: ['status'],
    nik: ['nik'],
    gender: ['jenis kelamin', 'jk', 'l/p', 'gender', 'kelamin'],
    birthPlace: ['tempat lahir', 'tmp lahir', 'birth place'],
    birthDate: ['tanggal lahir', 'tgl lahir', 'birth date', 'tanggal_lahir'],
    religion: ['agama', 'religion'],
    education: ['pendidikan', 'pendidikan terakhir', 'education'],
    phone: ['telepon/wa', 'telepon', 'no hp', 'hp', 'wa', 'whatsapp', 'phone'],
    email: ['email', 'e-mail'],
    address: ['alamat', 'address'],
  },
  required: ['name'],
  headers: TEACHER_HEADERS,
  textColumns: TEACHER_TEXT_COLUMNS,
  columnWidths: [30, 24, 14, 20, 16, 18, 16, 14, 24, 18, 26, 36],
  sheetName: 'Guru',
  help: [
    'Isi lembar "Guru" mulai baris 2. Jangan mengubah judul kolom di baris 1.',
    'Nama wajib. Kolom lain boleh kosong.',
    'NIP boleh kosong, tetapi bila diisi tidak boleh sama dengan guru lain.',
    'NIK harus 16 digit dan tidak boleh sama dengan orang lain di sekolah ini. NIK, telepon, dan email dipakai untuk masuk dan pemulihan akun.',
    'Status: Aktif atau Nonaktif. Kosong dianggap Aktif.',
    'Jenis Kelamin: L atau P. Tanggal Lahir: tanggal Excel, atau teks TTTT-BB-HH (mis. 1985-05-04).',
    'Agama: Islam, Kristen, Katolik, Hindu, Buddha, Konghucu, atau Lainnya. Pendidikan: pendidikan terakhir (mis. S1 Pendidikan Matematika).',
    'Telepon/WA boleh ditulis 0812..., 62812..., atau +62 812...; disimpan sebagai angka berawalan 62.',
    `Maksimal ${MAX_IMPORT_ROWS} baris per berkas.`,
  ],
};

export const parseTeacherSheet = (buffer: ArrayBuffer) => parseSheet(buffer, TEACHER_SPEC);
export const buildTeacherTemplate = () => buildTemplate(TEACHER_SPEC);
