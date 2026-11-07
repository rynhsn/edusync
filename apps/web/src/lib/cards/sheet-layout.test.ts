import { describe, expect, it } from 'vitest';
import {
  bestSheetGrid,
  cropLength,
  cropMarkSegments,
  DEFAULT_SHEET,
  pagesNeeded,
  paginate,
  slotPosition,
} from './sheet-layout';

const opts = { ...DEFAULT_SHEET, margin: 10, gap: 5 };

describe('susunan lembar', () => {
  it('menghitung kolom dan baris kartu CR80 pada A4', () => {
    // Mendatar: (277+5)/(86+5)=3,09 -> 3 kolom; (190+5)/(54+5)=3,3 -> 3 baris = 9. Tegak hanya 2 x 4 = 8.
    const g = bestSheetGrid(86, 54, opts);
    expect(g.landscape).toBe(true);
    expect([g.cols, g.rows, g.perPage]).toEqual([3, 3, 9]);
  });

  it('memilih orientasi tegak bila memuat lebih banyak', () => {
    // 50 x 100: tegak 3 x 2 = 6; mendatar 5 x 1 = 5
    const g = bestSheetGrid(50, 100, opts);
    expect(g.landscape).toBe(false);
    expect([g.cols, g.rows, g.perPage]).toEqual([3, 2, 6]);
  });

  it('memilih orientasi mendatar bila memuat lebih banyak', () => {
    // 100 x 60: tegak 1 x 4 = 4; mendatar lebar 277 -> 2 kolom, tinggi 190 -> 3 baris = 6
    const g = bestSheetGrid(100, 60, opts);
    expect(g.landscape).toBe(true);
    expect([g.cols, g.rows, g.perPage]).toEqual([2, 3, 6]);
    expect(g.pageW).toBe(297);
    expect(g.pageH).toBe(210);
  });

  it('blok kartu diletakkan di tengah halaman', () => {
    const g = bestSheetGrid(86, 54, opts);
    const blockW = 3 * 86 + 2 * 5;
    expect(g.originX).toBeCloseTo((297 - blockW) / 2, 6);
    const blockH = 3 * 54 + 2 * 5;
    expect(g.originY).toBeCloseTo((210 - blockH) / 2, 6);
  });

  it('perPage 0 bila kartu tidak muat', () => {
    expect(bestSheetGrid(250, 54, { ...opts, margin: 30 }).perPage).toBe(0);
    expect(bestSheetGrid(250, 400, opts).perPage).toBe(0);
  });

  it('jarak 0 dan tepi 0 memadatkan kartu', () => {
    const g = bestSheetGrid(105, 74, { ...DEFAULT_SHEET, margin: 0, gap: 0 });
    expect([g.cols, g.rows]).toEqual([2, 4]);
  });
});

describe('halaman dan posisi', () => {
  it('jumlah lembar dibulatkan ke atas', () => {
    expect(pagesNeeded(0, 8)).toBe(0);
    expect(pagesNeeded(8, 8)).toBe(1);
    expect(pagesNeeded(9, 8)).toBe(2);
    expect(pagesNeeded(5, 0)).toBe(0);
  });

  it('paginate memecah per halaman', () => {
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(paginate([1], 0)).toEqual([]);
  });

  it('posisi slot kiri ke kanan lalu atas ke bawah', () => {
    const g = bestSheetGrid(86, 54, opts);
    const p0 = slotPosition(g, 86, 54, 5, 0);
    const p1 = slotPosition(g, 86, 54, 5, 1);
    const p2 = slotPosition(g, 86, 54, 5, 3);
    expect(p0).toEqual({ x: g.originX, y: g.originY });
    expect(p1.x - p0.x).toBe(91);
    expect(p1.y).toBe(p0.y);
    expect(p2.x).toBe(p0.x);
    expect(p2.y - p0.y).toBe(59);
  });
});

describe('tanda potong', () => {
  it('panjang dibatasi separuh jarak dan maksimum 3 mm', () => {
    expect(cropLength(0)).toBe(0);
    expect(cropLength(2)).toBe(1);
    expect(cropLength(20)).toBe(3);
  });

  it('delapan garis di luar sudut kartu', () => {
    const segs = cropMarkSegments(10, 20, 86, 54, 2);
    expect(segs).toHaveLength(8);
    expect(cropMarkSegments(10, 20, 86, 54, 0)).toEqual([]);
    for (const s of segs) {
      const inside = (x: number, y: number) => x > 10 && x < 96 && y > 20 && y < 74;
      expect(inside(s.x1, s.y1) || inside(s.x2, s.y2)).toBe(false);
    }
  });
});
