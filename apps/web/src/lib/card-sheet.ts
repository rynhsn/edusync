import { buildTemplate, MAX_IMPORT_ROWS, parseSheet, type SheetRow, type SheetSpec } from './sheet';

export type CardField = 'nis' | 'code';
export type CardImportRow = SheetRow<CardField>;

export const CARD_SPEC: SheetSpec<CardField> = {
  fields: {
    nis: ['nis', 'nomor induk siswa'],
    code: ['kode kartu', 'kode', 'uid', 'card code'],
  },
  required: ['nis', 'code'],
  headers: ['NIS', 'Kode kartu'],
  // NIS dan kode kartu disimpan sebagai teks supaya angka nol di depan tidak hilang.
  textColumns: [1, 2],
  columnWidths: [20, 28],
  sheetName: 'Kartu',
  help: [
    'Isi lembar "Kartu" mulai baris 2. Jangan mengubah judul kolom di baris 1.',
    'NIS harus sama dengan NIS siswa aktif. Kode kartu adalah kode yang dibaca pembaca RFID (minimal 4 karakter, tanpa spasi).',
    'Satu siswa hanya boleh punya satu kartu RFID dan satu kode hanya boleh dipakai satu siswa.',
    `Maksimal ${MAX_IMPORT_ROWS} baris per berkas.`,
  ],
};

export const parseCardSheet = (buffer: ArrayBuffer) => parseSheet(buffer, CARD_SPEC);
export const buildCardTemplate = () => buildTemplate(CARD_SPEC);
