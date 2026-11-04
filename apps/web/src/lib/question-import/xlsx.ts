import { readSheet } from 'read-excel-file/universal';
import writeXlsxFile from 'write-excel-file/universal';
import { type ImportRow, type ImportWarning, OPTION_KEYS, type ParsedImport } from './types';

const norm = (v: unknown) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Nama kolom (sudah dinormalkan) yang dikenali untuk tiap bidang. */
const COLUMN_ALIASES: Record<string, string[]> = {
  type: ['tipe', 'jenis', 'type', 'jenissoal'],
  body: ['soal', 'pertanyaan', 'question', 'teksoal'],
  key: ['kunci', 'kuncijawaban', 'jawaban', 'key', 'answer'],
  points: ['poin', 'skor', 'bobot', 'point', 'points'],
  explanation: ['pembahasan', 'penjelasan', 'explanation'],
};

const MCQ_NAMES = new Set(['pg', 'pilihanganda', 'pilgan', 'mcq', 'pilihan']);
const ESSAY_NAMES = new Set(['esai', 'essay', 'uraian', 'isian']);

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

/**
 * Baca lembar pertama berkas .xlsx. Baris judul dicari otomatis (baris pertama yang punya kolom "Soal"); nama kolom
 * dicocokkan tanpa memedulikan huruf besar/kecil dan tanda baca; kolom lain diabaikan; baris kosong dilewati.
 */
export async function parseXlsx(file: ArrayBuffer): Promise<ParsedImport> {
  const data = (await readSheet(file)) as unknown[][];
  const warnings: ImportWarning[] = [];
  const headerAt = data.findIndex((r) => r.some((c) => COLUMN_ALIASES.body?.includes(norm(c))));
  if (headerAt < 0) {
    warnings.push({ line: 0, message: 'Baris judul tidak ditemukan: butuh kolom "Soal".' });
    return { rows: [], lines: [], warnings };
  }
  const header = (data[headerAt] as unknown[]).map(norm);
  const colOf = (names: string[]) => header.findIndex((h) => names.includes(h));
  const col = {
    type: colOf(COLUMN_ALIASES.type as string[]),
    body: colOf(COLUMN_ALIASES.body as string[]),
    key: colOf(COLUMN_ALIASES.key as string[]),
    points: colOf(COLUMN_ALIASES.points as string[]),
    explanation: colOf(COLUMN_ALIASES.explanation as string[]),
    options: OPTION_KEYS.map((k) => header.indexOf(k.toLowerCase())),
  };

  const rows: ImportRow[] = [];
  const lines: number[] = [];
  for (let i = headerAt + 1; i < data.length; i += 1) {
    const r = data[i] as unknown[];
    const line = i + 1;
    const cell = (c: number) => (c >= 0 ? text(r[c]) : '');
    if (r.every((c) => text(c) === '')) continue;

    const options = OPTION_KEYS.map((k, o) => ({
      key: k as string,
      text: cell(col.options[o] ?? -1),
    })).filter((o) => o.text !== '');
    const typeName = norm(cell(col.type));
    let type: 'mcq' | 'essay';
    if (MCQ_NAMES.has(typeName)) type = 'mcq';
    else if (ESSAY_NAMES.has(typeName)) type = 'essay';
    else {
      type = options.length > 0 ? 'mcq' : 'essay';
      if (typeName)
        warnings.push({
          line,
          message: `Tipe "${cell(col.type)}" tidak dikenal; dianggap ${type === 'mcq' ? 'pilihan ganda' : 'esai'}.`,
        });
    }

    let points = 1;
    const rawPoints = cell(col.points);
    if (rawPoints !== '') {
      const n = Number(rawPoints.replace(',', '.'));
      if (Number.isInteger(n) && n >= 1) points = n;
      else warnings.push({ line, message: `Poin "${rawPoints}" tidak valid; dipakai 1.` });
    }

    const rawKey = cell(col.key);
    let answer: string | null = null;
    if (type === 'mcq') {
      const letter = /^[A-Fa-f]\b/.exec(rawKey);
      if (letter) answer = letter[0].toUpperCase();
      else if (rawKey) warnings.push({ line, message: `Kunci "${rawKey}" bukan huruf pilihan.` });
    } else {
      answer = rawKey || null;
    }

    rows.push({
      type,
      body: cell(col.body),
      options: type === 'mcq' ? options : [],
      answer,
      points,
      explanation: cell(col.explanation) || null,
    });
    lines.push(line);
  }
  return { rows, lines, warnings };
}

/** Templat Excel: baris judul dan dua contoh (satu pilihan ganda berumus, satu esai). */
export async function buildTemplate(): Promise<Blob> {
  const head = ['Tipe', 'Soal', 'A', 'B', 'C', 'D', 'E', 'F', 'Kunci', 'Poin', 'Pembahasan'];
  const sheet = [
    head,
    [
      'PG',
      'Hasil dari $2 + 3 \\times 4$ adalah ...',
      '20',
      '14',
      '24',
      '10',
      '',
      '',
      'B',
      1,
      'Perkalian dikerjakan lebih dulu.',
    ],
    [
      'Esai',
      'Jelaskan perbedaan alamat IP publik dan privat.',
      '',
      '',
      '',
      '',
      '',
      '',
      'IP publik unik secara global; IP privat dipakai di jaringan lokal.',
      5,
      '',
    ],
  ];
  return writeXlsxFile(sheet).toBlob();
}
