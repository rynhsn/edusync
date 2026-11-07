/** Tata letak lembar cetak: beberapa kartu per halaman (A4 dst.) atau satu kartu per halaman. Murni, satuan mm. */

export type SheetPaper = 'A4' | 'A3' | 'F4' | 'Letter';

export const PAPER_MM: Record<SheetPaper, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  F4: { w: 215, h: 330 },
  Letter: { w: 215.9, h: 279.4 },
};

export interface SheetOptions {
  paper: SheetPaper;
  /** Tepi kertas yang dikosongkan (mm). */
  margin: number;
  /** Jarak antar-kartu (mm). */
  gap: number;
  /** Tanda potong di sudut tiap kartu. */
  cropMarks: boolean;
}

export const DEFAULT_SHEET: SheetOptions = { paper: 'A4', margin: 8, gap: 2, cropMarks: false };

export interface SheetGrid {
  pageW: number;
  pageH: number;
  landscape: boolean;
  cols: number;
  rows: number;
  perPage: number;
  /** Pojok kiri atas blok kartu (blok diletakkan di tengah halaman). */
  originX: number;
  originY: number;
}

const countFit = (avail: number, size: number, gap: number) =>
  size > 0 ? Math.max(0, Math.floor((avail + gap + 1e-9) / (size + gap))) : 0;

function gridFor(
  pageW: number,
  pageH: number,
  cardW: number,
  cardH: number,
  margin: number,
  gap: number,
  landscape: boolean,
): SheetGrid {
  const cols = countFit(pageW - 2 * margin, cardW, gap);
  const rows = countFit(pageH - 2 * margin, cardH, gap);
  const blockW = cols * cardW + Math.max(0, cols - 1) * gap;
  const blockH = rows * cardH + Math.max(0, rows - 1) * gap;
  return {
    pageW,
    pageH,
    landscape,
    cols,
    rows,
    perPage: cols * rows,
    originX: cols > 0 ? (pageW - blockW) / 2 : margin,
    originY: rows > 0 ? (pageH - blockH) / 2 : margin,
  };
}

/** Pilih orientasi (tegak atau mendatar) yang memuat lebih banyak kartu; seri = tegak. perPage 0 bila tidak muat. */
export function bestSheetGrid(cardW: number, cardH: number, opts: SheetOptions): SheetGrid {
  const p = PAPER_MM[opts.paper];
  const portrait = gridFor(p.w, p.h, cardW, cardH, opts.margin, opts.gap, false);
  const landscape = gridFor(p.h, p.w, cardW, cardH, opts.margin, opts.gap, true);
  return landscape.perPage > portrait.perPage ? landscape : portrait;
}

export const pagesNeeded = (count: number, perPage: number) =>
  perPage > 0 ? Math.max(0, Math.ceil(count / perPage)) : 0;

/** Pecah daftar menjadi halaman berisi paling banyak `perPage` butir. */
export function paginate<T>(items: readonly T[], perPage: number): T[][] {
  if (perPage <= 0) return [];
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return pages;
}

/** Posisi kiri-atas kartu ke-`slot` (0 dst., kiri ke kanan lalu atas ke bawah) pada halaman. */
export function slotPosition(grid: SheetGrid, cardW: number, cardH: number, gap: number, slot: number) {
  const col = slot % grid.cols;
  const row = Math.floor(slot / grid.cols);
  return { x: grid.originX + col * (cardW + gap), y: grid.originY + row * (cardH + gap) };
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Panjang tanda potong (mm): tidak lebih dari separuh jarak antar-kartu, maksimum 3 mm; 0 bila tak ada ruang. */
export const cropLength = (gap: number) => Math.min(3, Math.max(0, gap / 2));

/** Delapan garis kecil di luar sudut-sudut kartu pada (x, y) berukuran w x h. */
export function cropMarkSegments(x: number, y: number, w: number, h: number, len: number): Segment[] {
  if (len <= 0) return [];
  const r = x + w;
  const b = y + h;
  return [
    { x1: x - len, y1: y, x2: x, y2: y },
    { x1: x, y1: y - len, x2: x, y2: y },
    { x1: r, y1: y, x2: r + len, y2: y },
    { x1: r, y1: y - len, x2: r, y2: y },
    { x1: x - len, y1: b, x2: x, y2: b },
    { x1: x, y1: b, x2: x, y2: b + len },
    { x1: r, y1: b, x2: r + len, y2: b },
    { x1: r, y1: b, x2: r, y2: b + len },
  ];
}
