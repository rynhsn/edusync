import type { YardRect } from './logic';
import type { BuildingKind, Pt } from './types';

/** Ukuran kanvas peta (viewBox) dan satuan isometrik: satu unit sumbu = (2U, U) piksel peta. */
export const VIEW_W = 960;
export const VIEW_H = 560;
export const U = 9;

/**
 * Titik isometrik. Sumbu `a` turun ke kanan (2U, U), sumbu `b` turun ke kiri (-2U, U), `h` ke atas.
 * (x, y) adalah sudut belakang (paling atas) dari alas.
 */
export const iso = (x: number, y: number, a: number, b: number, h = 0): Pt => [
  x + (a - b) * 2 * U,
  y + (a + b) * U - h,
];

/** Rute sosok: tepi peta (jalan) -> bahu jalan -> gerbang -> pelataran -> pintu gedung kelas. */
export const ROUTE = {
  spawn: [-14, 367] as Pt,
  road: [246, 497] as Pt,
  gate: [300, 470] as Pt,
  plaza: [575, 333] as Pt,
  door: [391, 241] as Pt,
};

/** Halaman tempat sosok berdiri saat peta dimuat. */
export const YARD: YardRect = { x0: 262, y0: 345, x1: 650, y1: 432 };

export interface BuildingBox {
  kind: BuildingKind;
  /** Kotak sentuh/fokus dalam koordinat peta: x, y, lebar, tinggi. */
  box: readonly [number, number, number, number];
}

/** Urutan = urutan fokus keyboard. */
export const BUILDINGS: BuildingBox[] = [
  { kind: 'gate', box: [240, 402, 252, 96] },
  { kind: 'classes', box: [328, 84, 252, 194] },
  { kind: 'teachers', box: [72, 146, 174, 138] },
  { kind: 'office', box: [622, 140, 174, 136] },
  { kind: 'field', box: [690, 350, 216, 108] },
  { kind: 'mail', box: [196, 334, 52, 56] },
];

/** Gedung kelas: asal, ukuran, dan jendela. */
export const CLASS_BLDG = { x: 400, y: 150, a: 10, b: 4, h: 64 };
export const OFFICE_BLDG = { x: 700, y: 190, a: 5, b: 4, h: 48 };
export const STAFF_BLDG = { x: 150, y: 200, a: 5, b: 4, h: 48 };
export const FIELD = { x: 780, y: 350, a: 7, b: 5 };
