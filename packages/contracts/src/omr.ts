/**
 * Tata letak lembar jawaban pilihan ganda yang bisa dipindai (OMR). Satu sumber untuk pencetak (menggambar lembar)
 * dan pemindai (menemukan gelembung), supaya keduanya tidak pernah berbeda. Semua ukuran dalam milimeter pada
 * kertas A4 tegak (210 x 297), titik asal di sudut kiri atas halaman.
 *
 * Soal pada lembar = soal pilihan ganda ujian menurut urutan `sort` (soal ke-1 = nomor 1 di lembar), bernomor
 * menurun per kolom: 1..25 di kolom pertama, 26..50 di kolom kedua, dan seterusnya.
 */
export const OMR_PAGE = { widthMm: 210, heightMm: 297 } as const;

/** Penanda sudut: kotak hitam padat. Kiri atas lebih besar agar pemindai tahu arah lembar (lembar boleh terbalik). */
export const OMR_MARKER = { size: 8, topLeftSize: 11, inset: 12 } as const;

/** Kotak QR (sudut kiri atas dan sisi) yang memuat `omrQrPayload`. */
export const OMR_QR = { x: 148, y: 24, size: 40 } as const;

export const OMR_GRID = {
  x0: 19,
  y0: 104,
  columns: 4,
  rows: 25,
  colWidth: 44,
  rowPitch: 7,
  optionPitch: 7,
  /** Jarak dari awal kolom ke pusat gelembung pilihan pertama (ruang untuk nomor soal). */
  firstOptionOffset: 12,
} as const;

export const OMR_BUBBLE_RADIUS_MM = 2.4;
export const OMR_MAX_QUESTIONS = OMR_GRID.columns * OMR_GRID.rows;
export const OMR_MAX_OPTIONS = 5;

export interface Point {
  x: number;
  y: number;
}

/** Pusat keempat penanda sudut, urut kiri atas, kanan atas, kiri bawah, kanan bawah. */
export function omrMarkerCenters(): [Point, Point, Point, Point] {
  const { inset } = OMR_MARKER;
  const right = OMR_PAGE.widthMm - inset;
  const bottom = OMR_PAGE.heightMm - inset;
  return [
    { x: inset, y: inset },
    { x: right, y: inset },
    { x: inset, y: bottom },
    { x: right, y: bottom },
  ];
}

/** Pusat gelembung untuk soal `question` (mulai 0) dan pilihan `option` (0 = A). */
export function omrBubbleCenter(question: number, option: number): Point {
  const g = OMR_GRID;
  const col = Math.floor(question / g.rows);
  const row = question % g.rows;
  return {
    x: g.x0 + col * g.colWidth + g.firstOptionOffset + option * g.optionPitch,
    y: g.y0 + row * g.rowPitch,
  };
}

/** Titik tengah nomor soal (di kiri gelembung A), untuk mencetak angka. */
export function omrNumberCenter(question: number): Point {
  const g = OMR_GRID;
  const col = Math.floor(question / g.rows);
  return { x: g.x0 + col * g.colWidth + 4, y: g.y0 + (question % g.rows) * g.rowPitch };
}

/** Apakah `questions` soal dengan `options` pilihan terbanyak muat di satu lembar. */
export function omrFits(
  questions: number,
  options: number,
): { ok: true } | { ok: false; reason: 'questions' | 'options' } {
  if (questions > OMR_MAX_QUESTIONS) return { ok: false, reason: 'questions' };
  if (options > OMR_MAX_OPTIONS) return { ok: false, reason: 'options' };
  return { ok: true };
}

const QR_PREFIX = 'ES1';

/** Isi QR: ujian dan siswa pemilik lembar. */
export function omrQrPayload(examId: string, studentId: string): string {
  return `${QR_PREFIX}:${examId}:${studentId}`;
}

export function omrParseQr(text: string): { examId: string; studentId: string } | null {
  const m = /^ES1:([0-9a-f-]{36}):([0-9a-f-]{36})$/i.exec(text.trim());
  return m ? { examId: (m[1] as string).toLowerCase(), studentId: (m[2] as string).toLowerCase() } : null;
}
