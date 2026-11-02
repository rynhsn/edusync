import { buildTemplate, MAX_IMPORT_ROWS, parseSheet, type SheetRow, type SheetSpec } from './sheet';

export { cellToString, MAX_IMPORT_ROWS, normalizeHeader, toIsoDate } from './sheet';

export type StudentField =
  | 'name'
  | 'nis'
  | 'nisn'
  | 'nik'
  | 'gender'
  | 'birthPlace'
  | 'birthDate'
  | 'religion'
  | 'address'
  | 'phone'
  | 'email'
  | 'className'
  | 'g1Name'
  | 'g1Relation'
  | 'g1Phone'
  | 'g1Email'
  | 'g2Name'
  | 'g2Relation'
  | 'g2Phone'
  | 'g2Email';
export type ImportRow = SheetRow<StudentField>;

/** Judul kolom templat, urut. Ekspor memakai judul yang sama supaya hasilnya bisa diimpor ulang. */
export const STUDENT_HEADERS = [
  'Nama',
  'NIS',
  'NISN',
  'NIK',
  'Jenis Kelamin',
  'Tempat Lahir',
  'Tanggal Lahir',
  'Agama',
  'Alamat',
  'Telepon/WA',
  'Email',
  'Kelas',
  'Wali 1 Nama',
  'Wali 1 Hubungan',
  'Wali 1 Telepon/WA',
  'Wali 1 Email',
  'Wali 2 Nama',
  'Wali 2 Hubungan',
  'Wali 2 Telepon/WA',
  'Wali 2 Email',
];
/** Kolom (mulai 1) yang harus tetap teks: NIS, NISN, NIK, dan semua telepon (nol di depan tidak boleh hilang). */
export const STUDENT_TEXT_COLUMNS = [2, 3, 4, 10, 15, 19];
export const STUDENT_COLUMN_WIDTHS = [
  30, 14, 16, 20, 16, 18, 16, 14, 36, 18, 26, 14, 26, 14, 18, 26, 26, 14, 18, 26,
];

export const STUDENT_SPEC: SheetSpec<StudentField> = {
  fields: {
    name: ['nama', 'nama lengkap', 'nama siswa', 'name'],
    nis: ['nis', 'nomor induk siswa'],
    nisn: ['nisn'],
    nik: ['nik'],
    gender: ['jenis kelamin', 'jk', 'l/p', 'gender', 'kelamin'],
    birthPlace: ['tempat lahir', 'tmp lahir', 'birth place'],
    birthDate: ['tanggal lahir', 'tgl lahir', 'birth date', 'tanggal_lahir'],
    religion: ['agama', 'religion'],
    address: ['alamat', 'address'],
    phone: ['telepon/wa', 'telepon', 'no hp', 'hp', 'phone'],
    email: ['email', 'e-mail'],
    className: ['kelas', 'class'],
    g1Name: ['wali 1 nama', 'nama wali 1', 'wali 1'],
    g1Relation: ['wali 1 hubungan', 'hubungan wali 1'],
    g1Phone: ['wali 1 telepon/wa', 'wali 1 telepon', 'telepon wali 1'],
    g1Email: ['wali 1 email', 'email wali 1'],
    g2Name: ['wali 2 nama', 'nama wali 2', 'wali 2'],
    g2Relation: ['wali 2 hubungan', 'hubungan wali 2'],
    g2Phone: ['wali 2 telepon/wa', 'wali 2 telepon', 'telepon wali 2'],
    g2Email: ['wali 2 email', 'email wali 2'],
  },
  required: ['name', 'gender'],
  headers: STUDENT_HEADERS,
  textColumns: STUDENT_TEXT_COLUMNS,
  columnWidths: STUDENT_COLUMN_WIDTHS,
  sheetName: 'Siswa',
  help: [
    'Isi lembar "Siswa" mulai baris 2. Jangan mengubah judul kolom di baris 1.',
    'Nama dan Jenis Kelamin (L atau P) wajib. Kolom lain boleh kosong.',
    'Tanggal Lahir: tulis sebagai tanggal Excel, atau teks TTTT-BB-HH (mis. 2013-05-04).',
    'NIK harus 16 digit. Agama: Islam, Kristen, Katolik, Hindu, Buddha, Konghucu, atau Lainnya.',
    'Telepon/WA boleh ditulis 0812..., 62812..., atau +62 812...; disimpan sebagai angka berawalan 62.',
    'Kelas: harus sama dengan nama kelas pada tahun ajaran aktif. Kosongkan bila belum ditempatkan.',
    'Wali 1 menjadi wali utama. Hubungan: Ayah, Ibu, Wali, atau Lainnya (kosong: Wali 1 = Ayah, Wali 2 = Ibu).',
    'Bila ada isian wali, Nama wali wajib. Wali dengan nomor telepon yang sama (mis. kakak-adik) dipakai bersama.',
    'NIS dan NISN tidak boleh sama dengan siswa yang sudah ada atau baris lain dalam berkas.',
    `Maksimal ${MAX_IMPORT_ROWS} baris per berkas.`,
  ],
};

export const parseStudentSheet = (buffer: ArrayBuffer) => parseSheet(buffer, STUDENT_SPEC);
export const buildStudentTemplate = () => buildTemplate(STUDENT_SPEC);
