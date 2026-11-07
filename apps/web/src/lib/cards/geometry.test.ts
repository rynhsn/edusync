import { describe, expect, it } from 'vitest';
import {
  type Box,
  clampBox,
  fitScale,
  fontPx,
  mmToPt,
  moveBox,
  nudgeBox,
  PT_PER_MM,
  pxToMm,
  resizeBox,
  snap,
} from './geometry';

const canvas = { w: 86, h: 54 };

describe('konversi satuan', () => {
  it('25,4 mm = 72 pt', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 6);
    expect(mmToPt(86)).toBeCloseTo(86 * PT_PER_MM, 6);
  });

  it('px ke mm mengikuti skala', () => {
    expect(pxToMm(50, 5)).toBe(10);
  });

  it('ukuran huruf px dari pt', () => {
    // 72 pt = 25,4 mm; pada 2 px/mm = 50,8 px
    expect(fontPx(72, 2)).toBeCloseTo(50.8, 6);
  });

  it('skala pas dibatasi 2..14', () => {
    expect(fitScale(86, 860)).toBe(10);
    expect(fitScale(300, 300)).toBe(2);
    expect(fitScale(20, 5000)).toBe(14);
    expect(fitScale(0, 100)).toBe(4);
  });
});

describe('snap', () => {
  it('menempel ke kelipatan grid', () => {
    expect(snap(10.3, 0.5)).toBe(10.5);
    expect(snap(10.2, 0.5)).toBe(10);
  });
  it('grid 0 hanya membulatkan ekor desimal', () => {
    expect(snap(0.1 + 0.2, 0)).toBe(0.3);
  });
});

describe('clampBox', () => {
  it('menggeser kotak yang keluar kanvas', () => {
    expect(clampBox({ x: 80, y: 50, w: 20, h: 10 }, canvas)).toEqual({ x: 66, y: 44, w: 20, h: 10 });
    expect(clampBox({ x: -5, y: -1, w: 10, h: 10 }, canvas)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });
  it('memperkecil kotak yang lebih besar dari kanvas', () => {
    expect(clampBox({ x: 3, y: 3, w: 200, h: 100 }, canvas)).toEqual({ x: 0, y: 0, w: 86, h: 54 });
  });
});

describe('moveBox', () => {
  const orig: Box = { x: 10, y: 10, w: 20, h: 10 };
  it('menggeser dan menempel ke grid 0,5 mm', () => {
    expect(moveBox(orig, 3.3, -2.1, canvas, 0.5)).toEqual({ x: 13.5, y: 8, w: 20, h: 10 });
  });
  it('tanpa grid memakai nilai bebas', () => {
    expect(moveBox(orig, 3.33, 0, canvas, 0)).toEqual({ x: 13.33, y: 10, w: 20, h: 10 });
  });
  it('tidak keluar dari kanvas', () => {
    expect(moveBox(orig, 500, 500, canvas, 0.5)).toEqual({ x: 66, y: 44, w: 20, h: 10 });
    expect(moveBox(orig, -500, -500, canvas, 0.5)).toEqual({ x: 0, y: 0, w: 20, h: 10 });
  });
});

describe('resizeBox', () => {
  const orig: Box = { x: 10, y: 10, w: 20, h: 10 };
  it('pegangan tenggara memperbesar lebar dan tinggi', () => {
    expect(resizeBox(orig, 'se', 5, 4, canvas, 0.5)).toEqual({ x: 10, y: 10, w: 25, h: 14 });
  });
  it('pegangan barat laut menggeser pojok kiri atas dan menjaga tepi seberang', () => {
    expect(resizeBox(orig, 'nw', -4, -2, canvas, 0.5)).toEqual({ x: 6, y: 8, w: 24, h: 12 });
  });
  it('tidak lebih kecil dari ukuran minimum dan tepi seberang tetap', () => {
    expect(resizeBox(orig, 'e', -100, 0, canvas, 0.5, { w: 2, h: 2 })).toEqual({
      x: 10,
      y: 10,
      w: 2,
      h: 10,
    });
    expect(resizeBox(orig, 'w', 100, 0, canvas, 0.5, { w: 2, h: 2 })).toEqual({
      x: 28,
      y: 10,
      w: 2,
      h: 10,
    });
  });
  it('tidak keluar dari kanvas', () => {
    expect(resizeBox(orig, 'se', 500, 500, canvas, 0.5)).toEqual({ x: 10, y: 10, w: 76, h: 44 });
    expect(resizeBox(orig, 'nw', -500, -500, canvas, 0.5)).toEqual({ x: 0, y: 0, w: 30, h: 20 });
  });
  it('garis lurus mendatar tidak bisa ditebalkan', () => {
    const line: Box = { x: 5, y: 20, w: 40, h: 0 };
    expect(resizeBox(line, 'se', 10, 10, canvas, 0.5, { w: 0, h: 0 })).toEqual({
      x: 5,
      y: 20,
      w: 50,
      h: 0,
    });
  });
});

describe('nudgeBox', () => {
  it('menggeser satu langkah per arah', () => {
    expect(nudgeBox({ x: 10, y: 10, w: 5, h: 5 }, 1, 0, 0.5, canvas)).toEqual({
      x: 10.5,
      y: 10,
      w: 5,
      h: 5,
    });
    expect(nudgeBox({ x: 0, y: 0, w: 5, h: 5 }, -1, -1, 5, canvas)).toEqual({ x: 0, y: 0, w: 5, h: 5 });
  });
});
