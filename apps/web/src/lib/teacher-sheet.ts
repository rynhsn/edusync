import { buildTemplate, MAX_IMPORT_ROWS, parseSheet, type SheetRow, type SheetSpec } from './sheet';

export type TeacherField = 'name' | 'nip' | 'status';
export type TeacherImportRow = SheetRow<TeacherField>;

export const TEACHER_SPEC: SheetSpec<TeacherField> = {
  fields: {
    name: ['nama', 'nama lengkap', 'nama guru', 'name'],
    nip: ['nip', 'nuptk', 'nomor induk pegawai'],
    status: ['status'],
  },
  required: ['name'],
  headers: ['Nama', 'NIP', 'Status'],
  textColumns: [2],
  columnWidths: [30, 24, 14],
  sheetName: 'Guru',
  help: [
    'Isi lembar "Guru" mulai baris 2. Jangan mengubah judul kolom di baris 1.',
    'Nama wajib. NIP boleh kosong, tetapi bila diisi tidak boleh sama dengan guru lain.',
    'Status: Aktif atau Nonaktif. Kosong dianggap Aktif.',
    `Maksimal ${MAX_IMPORT_ROWS} baris per berkas.`,
  ],
};

export const parseTeacherSheet = (buffer: ArrayBuffer) => parseSheet(buffer, TEACHER_SPEC);
export const buildTeacherTemplate = () => buildTemplate(TEACHER_SPEC);
