/** Satu soal hasil bacaan berkas, bentuknya sama dengan baris yang diterima `POST /v1/exam/questions/import`. */
// `type` (bukan interface) supaya cocok dengan baris longgar yang diterima API.
export type ImportRow = {
  type: 'mcq' | 'essay';
  body: string;
  options: { key: string; text: string }[];
  /** Pilihan ganda: huruf kunci. Esai: pedoman jawaban. */
  answer: string | null;
  points: number;
  explanation: string | null;
};

export interface ImportWarning {
  /** Baris berkas (teks) atau baris lembar (Excel), mulai 1; 0 = berkas secara umum. */
  line: number;
  message: string;
}

export interface ParsedImport {
  rows: ImportRow[];
  /** Nomor baris/lembar asal tiap soal, searah dengan `rows`. */
  lines: number[];
  warnings: ImportWarning[];
}

export const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
