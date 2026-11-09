import { buildTemplate, MAX_IMPORT_ROWS, parseSheet, type SheetRow, type SheetSpec } from './sheet';

export type TeacherField =
  | 'name'
  | 'nip'
  | 'nuptk'
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
  'NUPTK',
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
/** Kolom (mulai 1) yang harus tetap teks: NIP, NUPTK, NIK, dan telepon (nol di depan tidak boleh hilang). */
export const TEACHER_TEXT_COLUMNS = [2, 3, 5, 11];

export const TEACHER_SPEC: SheetSpec<TeacherField> = {
  fields: {
    name: ['nama', 'nama lengkap', 'nama guru', 'name'],
    nip: ['nip', 'nomor induk pegawai'],
    nuptk: ['nuptk', 'nomor unik pendidik'],
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
  columnWidths: [30, 24, 20, 14, 20, 16, 18, 16, 14, 24, 18, 26, 36],
  sheetName: 'Guru',
  help: [
    'Isi lembar "Guru" mulai baris 2. Jangan mengubah judul kolom di baris 1.',
    'Nama wajib. Kolom lain boleh kosong.',
    'NIP boleh kosong, tetapi bila diisi tidak boleh sama dengan guru lain.',
    'NUPTK (16 digit) boleh kosong, mis. untuk guru honorer yang belum punya; bila diisi tidak boleh sama dengan guru lain.',
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
