import { buildTemplate, MAX_IMPORT_ROWS, parseSheet, type SheetRow, type SheetSpec } from './sheet';

export { cellToString, MAX_IMPORT_ROWS, normalizeHeader, toIsoDate } from './sheet';

export type StudentField = 'name' | 'nis' | 'nisn' | 'gender' | 'birthDate' | 'className';
export type ImportRow = SheetRow<StudentField>;

export const STUDENT_SPEC: SheetSpec<StudentField> = {
  fields: {
    name: ['nama', 'nama lengkap', 'nama siswa', 'name'],
    nis: ['nis', 'nomor induk siswa'],
    nisn: ['nisn'],
    gender: ['jenis kelamin', 'jk', 'l/p', 'gender', 'kelamin'],
    birthDate: ['tanggal lahir', 'tgl lahir', 'birth date', 'tanggal_lahir'],
    className: ['kelas', 'class'],
  },
  required: ['name', 'gender'],
  headers: ['Nama', 'NIS', 'NISN', 'Jenis Kelamin', 'Tanggal Lahir', 'Kelas'],
  // NIS dan NISN sering berawalan nol; simpan sebagai teks agar tidak terpotong.
  textColumns: [2, 3],
  columnWidths: [30, 14, 16, 16, 16, 14],
  sheetName: 'Siswa',
  help: [
    'Isi lembar "Siswa" mulai baris 2. Jangan mengubah judul kolom di baris 1.',
    'Nama dan Jenis Kelamin (L atau P) wajib. Kolom lain boleh kosong.',
    'Tanggal Lahir: tulis sebagai tanggal Excel, atau teks TTTT-BB-HH (mis. 2013-05-04).',
    'Kelas: harus sama dengan nama kelas pada tahun ajaran aktif. Kosongkan bila belum ditempatkan.',
    'NIS dan NISN tidak boleh sama dengan siswa yang sudah ada atau baris lain dalam berkas.',
    `Maksimal ${MAX_IMPORT_ROWS} baris per berkas.`,
  ],
};

export const parseStudentSheet = (buffer: ArrayBuffer) => parseSheet(buffer, STUDENT_SPEC);
export const buildStudentTemplate = () => buildTemplate(STUDENT_SPEC);
