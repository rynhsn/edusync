/**
 * Geometri murni untuk editor kartu: semua dalam milimeter (mm) dari pojok kiri atas kartu.
 * Tidak menyentuh DOM supaya mudah diuji.
 */

export const PT_PER_MM = 72 / 25.4;
/** 1 pt dalam mm (ukuran huruf PDF berupa pt). */
export const MM_PER_PT = 25.4 / 72;

export const GRID_MM = 0.5;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export const mmToPt = (mm: number) => mm * PT_PER_MM;
export const mmToPx = (mm: number, pxPerMm: number) => mm * pxPerMm;
export const pxToMm = (px: number, pxPerMm: number) => px / pxPerMm;

/** Bulatkan ke 0,01 mm agar tidak ada ekor desimal (0.30000000000000004). */
export const roundMm = (v: number) => Math.round(v * 100) / 100;

/** Tempelkan ke kelipatan `grid`; grid 0 = hanya dibulatkan. */
export function snap(v: number, grid: number): number {
  return grid > 0 ? roundMm(Math.round(v / grid) * grid) : roundMm(v);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Geser kotak ke dalam kanvas; bila lebih besar dari kanvas, diperkecil. */
export function clampBox(box: Box, canvas: Size): Box {
  const w = Math.min(box.w, canvas.w);
  const h = Math.min(box.h, canvas.h);
  return {
    x: roundMm(clamp(box.x, 0, canvas.w - w)),
    y: roundMm(clamp(box.y, 0, canvas.h - h)),
    w: roundMm(w),
    h: roundMm(h),
  };
}

/** Geser kotak sejauh (dx, dy) mm dari kotak awal, menempel ke grid dan tetap di dalam kanvas. */
export function moveBox(orig: Box, dx: number, dy: number, canvas: Size, grid: number): Box {
  return {
    ...orig,
    x: roundMm(clamp(snap(orig.x + dx, grid), 0, canvas.w - orig.w)),
    y: roundMm(clamp(snap(orig.y + dy, grid), 0, canvas.h - orig.h)),
  };
}

/**
 * Ubah ukuran dari pegangan `handle` sejauh (dx, dy) mm. Tepi yang digeser menempel ke grid, tidak keluar dari
 * kanvas, dan tidak lebih kecil dari `min`. Garis lurus (lebar atau tinggi 0) tidak bisa ditebalkan pada sumbu itu.
 */
export function resizeBox(
  orig: Box,
  handle: Handle,
  dx: number,
  dy: number,
  canvas: Size,
  grid: number,
  min: Size = { w: 1, h: 1 },
): Box {
  let left = orig.x;
  let right = orig.x + orig.w;
  let top = orig.y;
  let bottom = orig.y + orig.h;
  const flatW = orig.w === 0;
  const flatH = orig.h === 0;

  if (!flatW) {
    if (handle.includes('w')) left = clamp(snap(orig.x + dx, grid), 0, right - min.w);
    if (handle.includes('e')) right = clamp(snap(orig.x + orig.w + dx, grid), left + min.w, canvas.w);
  }
  if (!flatH) {
    if (handle.includes('n')) top = clamp(snap(orig.y + dy, grid), 0, bottom - min.h);
    if (handle.includes('s')) bottom = clamp(snap(orig.y + orig.h + dy, grid), top + min.h, canvas.h);
  }
  return { x: roundMm(left), y: roundMm(top), w: roundMm(right - left), h: roundMm(bottom - top) };
}

/** Geser satu langkah (mis. tombol panah): arah -1, 0, atau 1 pada tiap sumbu. */
export function nudgeBox(box: Box, dirX: number, dirY: number, step: number, canvas: Size): Box {
  return moveBox(box, dirX * step, dirY * step, canvas, 0);
}

/** Ukuran kanvas dalam piksel pada skala `pxPerMm`. */
export function canvasPixels(canvas: Size, pxPerMm: number): Size {
  return { w: canvas.w * pxPerMm, h: canvas.h * pxPerMm };
}

/** Skala px/mm agar kanvas muat dalam `availablePx` lebar, dibatasi 2..14. */
export function fitScale(canvasWidthMm: number, availablePx: number): number {
  if (!(canvasWidthMm > 0) || !(availablePx > 0)) return 4;
  return Math.min(14, Math.max(2, Math.floor((availablePx / canvasWidthMm) * 100) / 100));
}

/** Ukuran huruf dalam px pada kanvas editor (ukuran huruf kartu berupa pt). */
export const fontPx = (fontSizePt: number, pxPerMm: number) => fontSizePt * MM_PER_PT * pxPerMm;

/** Apakah dua kotak saling menimpa (untuk pemeriksaan sederhana). */
export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
