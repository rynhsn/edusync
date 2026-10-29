/**
 * Membaca dan membuat berkas Excel untuk impor dan ekspor. Berkas dibaca di browser; server memvalidasi ulang
 * semuanya, jadi parser ini hanya mengubah sel menjadi teks yang rapi dan memetakan kolom menurut judulnya.
 */

export interface SheetSpec<F extends string> {
  /** Nama kolom yang dikenali per bidang (huruf kecil). Nama pertama dipakai saat melaporkan kolom wajib yang hilang. */
  fields: Record<F, string[]>;
  required: F[];
  /** Judul kolom pada templat, urut. */
  headers: string[];
  /** Indeks kolom (mulai 1) yang disimpan sebagai teks pada templat, mis. NIS berawalan nol. */
  textColumns: number[];
  columnWidths: number[];
  sheetName: string;
  help: string[];
}

export type SheetRow<F extends string> = Record<F, string> & { row: number };

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
    const v = value as { text?: unknown; result?: unknown; richText?: { text: string }[] };
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

export interface ParsedSheet<F extends string> {
  rows: SheetRow<F>[];
  /** Masalah yang membuat berkas tidak bisa diproses sama sekali. */
  fatal: 'no_sheet' | 'missing_columns' | 'too_many_rows' | 'no_rows' | null;
  missing: string[];
}

export async function parseSheet<F extends string>(
  buffer: ArrayBuffer,
  spec: SheetSpec<F>,
): Promise<ParsedSheet<F>> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], fatal: 'no_sheet', missing: [] };

  const fields = Object.keys(spec.fields) as F[];
  const columns = new Map<F, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const header = normalizeHeader(cellToString(cell.value));
    for (const field of fields) {
      if (spec.fields[field].includes(header) && !columns.has(field)) columns.set(field, col);
    }
  });
  const missing = spec.required.filter((f) => !columns.has(f)).map((f) => spec.fields[f][0] as string);
  if (missing.length > 0) return { rows: [], fatal: 'missing_columns', missing };

  const rows: SheetRow<F>[] = [];
  for (let n = 2; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n);
    const values = Object.fromEntries(
      fields.map((f) => {
        const col = columns.get(f);
        return [f, col ? cellToString(row.getCell(col).value) : ''];
      }),
    ) as Record<F, string>;
    // Baris yang seluruh kolomnya kosong dilewati (sering tertinggal di akhir lembar kerja).
    if (Object.values<string>(values).every((v) => v === '')) continue;
    rows.push({ row: n, ...values });
    if (rows.length > MAX_IMPORT_ROWS) return { rows: [], fatal: 'too_many_rows', missing: [] };
  }
  if (rows.length === 0) return { rows: [], fatal: 'no_rows', missing: [] };
  return { rows, fatal: null, missing: [] };
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Berkas templat: lembar data berisi judul kolom, dan lembar "Petunjuk". */
export async function buildTemplate<F extends string>(spec: SheetSpec<F>): Promise<Blob> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(spec.sheetName);
  sheet.addRow(spec.headers);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = spec.columnWidths.map((width) => ({ width }));
  for (const col of spec.textColumns) sheet.getColumn(col).numFmt = '@';
  const help = workbook.addWorksheet('Petunjuk');
  for (const line of spec.help) help.addRow([line]);
  help.getColumn(1).width = 100;
  return new Blob([await workbook.xlsx.writeBuffer()], { type: XLSX_TYPE });
}

/** Berkas ekspor: satu lembar dengan judul tebal. Kolom teks tidak diubah Excel menjadi angka. */
export async function buildExport(
  sheetName: string,
  headers: string[],
  rows: (string | number | null)[][],
  options: { textColumns?: number[]; widths?: number[] } = {},
): Promise<Blob> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = headers.map((_, i) => ({ width: options.widths?.[i] ?? 18 }));
  for (const col of options.textColumns ?? []) sheet.getColumn(col).numFmt = '@';
  for (const r of rows) sheet.addRow(r);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return new Blob([await workbook.xlsx.writeBuffer()], { type: XLSX_TYPE });
}

/** Unduh Blob sebagai berkas. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
