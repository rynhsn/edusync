/**
 * Membaca dan membuat berkas Excel untuk impor siswa. Berkas dibaca di browser; server memvalidasi ulang
 * semuanya, jadi parser ini hanya mengubah sel menjadi teks yang rapi dan memetakan kolom.
 */

export interface ImportRow {
  row: number;
  name: string;
  nis: string;
  nisn: string;
  gender: string;
  birthDate: string;
  className: string;
}

type Field = keyof Omit<ImportRow, 'row'>;

/** Nama kolom yang dikenali (huruf kecil, tanpa spasi berlebih). */
const ALIASES: Record<Field, string[]> = {
  name: ['nama', 'nama lengkap', 'nama siswa', 'name'],
  nis: ['nis', 'nomor induk siswa'],
  nisn: ['nisn'],
  gender: ['jenis kelamin', 'jk', 'l/p', 'gender', 'kelamin'],
  birthDate: ['tanggal lahir', 'tgl lahir', 'birth date', 'tanggal_lahir'],
  className: ['kelas', 'class'],
};

export const TEMPLATE_HEADERS = ['Nama', 'NIS', 'NISN', 'Jenis Kelamin', 'Tanggal Lahir', 'Kelas'] as const;
export const MAX_IMPORT_ROWS = 1000;

export const normalizeHeader = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Tanggal Excel dibaca sebagai UTC; ambil komponen UTC agar tidak bergeser sehari karena zona waktu. */
export function toIsoDate(value: Date) {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

/** Ubah nilai sel (teks, angka, tanggal, rumus, teks kaya) menjadi teks. */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return toIsoDate(value);
  if (typeof value === 'object') {
    const v = value as {
      text?: unknown;
      result?: unknown;
      richText?: { text: string }[];
      hyperlink?: string;
    };
    if (Array.isArray(v.richText))
      return v.richText
        .map((p) => p.text)
        .join('')
        .trim();
    if ('result' in v) return cellToString(v.result);
    if ('text' in v) return cellToString(v.text);
    return '';
  }
  return String(value).trim();
}

export interface ParsedSheet {
  rows: ImportRow[];
  /** Masalah yang membuat berkas tidak bisa diproses sama sekali. */
  fatal: 'no_sheet' | 'missing_columns' | 'too_many_rows' | 'no_rows' | null;
  missing: string[];
}

export async function parseStudentSheet(buffer: ArrayBuffer): Promise<ParsedSheet> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], fatal: 'no_sheet', missing: [] };

  const columns = new Map<Field, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const header = normalizeHeader(cellToString(cell.value));
    for (const [field, names] of Object.entries(ALIASES) as [Field, string[]][]) {
      if (names.includes(header) && !columns.has(field)) columns.set(field, col);
    }
  });
  const missing = (['name', 'gender'] as Field[])
    .filter((f) => !columns.has(f))
    .map((f) => ALIASES[f][0] as string);
  if (missing.length > 0) return { rows: [], fatal: 'missing_columns', missing };

  const rows: ImportRow[] = [];
  const text = (row: ReturnType<typeof sheet.getRow>, field: Field) => {
    const col = columns.get(field);
    return col ? cellToString(row.getCell(col).value) : '';
  };
  for (let n = 2; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n);
    const parsed: ImportRow = {
      row: n,
      name: text(row, 'name'),
      nis: text(row, 'nis'),
      nisn: text(row, 'nisn'),
      gender: text(row, 'gender'),
      birthDate: text(row, 'birthDate'),
      className: text(row, 'className'),
    };
    // Baris yang seluruh kolomnya kosong dilewati (sering tertinggal di akhir lembar kerja).
    if (Object.values({ ...parsed, row: '' }).every((v) => v === '')) continue;
    rows.push(parsed);
    if (rows.length > MAX_IMPORT_ROWS) return { rows: [], fatal: 'too_many_rows', missing: [] };
  }
  if (rows.length === 0) return { rows: [], fatal: 'no_rows', missing: [] };
  return { rows, fatal: null, missing: [] };
}

/** Berkas templat: lembar "Siswa" berisi judul kolom, dan lembar "Petunjuk". */
export async function buildStudentTemplate(): Promise<Blob> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Siswa');
  sheet.addRow([...TEMPLATE_HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = [{ width: 30 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 14 }];
  // NIS dan NISN sering berawalan nol; simpan sebagai teks agar tidak terpotong.
  for (const col of [2, 3]) sheet.getColumn(col).numFmt = '@';
  const help = workbook.addWorksheet('Petunjuk');
  for (const line of [
    ['Isi lembar "Siswa" mulai baris 2. Jangan mengubah judul kolom di baris 1.'],
    ['Nama dan Jenis Kelamin (L atau P) wajib. Kolom lain boleh kosong.'],
    ['Tanggal Lahir: tulis sebagai tanggal Excel, atau teks TTTT-BB-HH (mis. 2013-05-04).'],
    ['Kelas: harus sama dengan nama kelas pada tahun ajaran aktif. Kosongkan bila belum ditempatkan.'],
    ['NIS dan NISN tidak boleh sama dengan siswa yang sudah ada atau baris lain dalam berkas.'],
    [`Maksimal ${MAX_IMPORT_ROWS} baris per berkas.`],
  ]) {
    help.addRow(line);
  }
  help.getColumn(1).width = 100;
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
