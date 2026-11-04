import { describe, expect, it } from 'vitest';
import {
  OMR_BUBBLE_RADIUS_MM,
  OMR_GRID,
  OMR_MARKER,
  OMR_MAX_OPTIONS,
  OMR_MAX_QUESTIONS,
  OMR_PAGE,
  OMR_QR,
  omrBubbleCenter,
  omrFits,
  omrMarkerCenters,
  omrParseQr,
  omrQrPayload,
} from './omr';

describe('tata letak OMR', () => {
  it('seluruh gelembung ada di dalam kotak penanda dan tidak menabrak QR', () => {
    const [tl, , , br] = omrMarkerCenters();
    const r = OMR_BUBBLE_RADIUS_MM;
    const seen = new Set<string>();
    for (let q = 0; q < OMR_MAX_QUESTIONS; q += 1) {
      for (let o = 0; o < OMR_MAX_OPTIONS; o += 1) {
        const { x, y } = omrBubbleCenter(q, o);
        expect(x - r).toBeGreaterThan(tl.x + OMR_MARKER.topLeftSize / 2);
        expect(x + r).toBeLessThan(br.x - OMR_MARKER.size / 2);
        expect(y - r).toBeGreaterThan(OMR_QR.y + OMR_QR.size);
        expect(y + r).toBeLessThan(br.y - OMR_MARKER.size / 2);
        seen.add(`${x}:${y}`);
      }
    }
    expect(seen.size).toBe(OMR_MAX_QUESTIONS * OMR_MAX_OPTIONS);
  });

  it('gelembung bertetangga tidak bersentuhan', () => {
    const a = omrBubbleCenter(0, 0);
    expect(omrBubbleCenter(0, 1).x - a.x).toBeGreaterThan(OMR_BUBBLE_RADIUS_MM * 2 + 1);
    expect(omrBubbleCenter(1, 0).y - a.y).toBeGreaterThan(OMR_BUBBLE_RADIUS_MM * 2 + 1);
    // Kolom berikutnya cukup jauh dari pilihan terakhir kolom sebelumnya.
    const lastOfCol = omrBubbleCenter(0, OMR_MAX_OPTIONS - 1).x;
    expect(omrBubbleCenter(OMR_GRID.rows, 0).x - lastOfCol).toBeGreaterThan(OMR_BUBBLE_RADIUS_MM * 2 + 8);
  });

  it('nomor soal berjalan menurun per kolom', () => {
    expect(omrBubbleCenter(OMR_GRID.rows - 1, 0).x).toBe(omrBubbleCenter(0, 0).x);
    expect(omrBubbleCenter(OMR_GRID.rows, 0).y).toBe(omrBubbleCenter(0, 0).y);
    expect(omrBubbleCenter(OMR_GRID.rows, 0).x).toBeGreaterThan(omrBubbleCenter(0, 0).x);
  });

  it('QR dan penanda ada di dalam halaman; muat atau tidaknya soal', () => {
    for (const c of omrMarkerCenters()) {
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(OMR_PAGE.widthMm);
    }
    expect(OMR_QR.x + OMR_QR.size).toBeLessThan(OMR_PAGE.widthMm - OMR_MARKER.inset);
    expect(omrFits(100, 5)).toEqual({ ok: true });
    expect(omrFits(101, 4)).toEqual({ ok: false, reason: 'questions' });
    expect(omrFits(10, 6)).toEqual({ ok: false, reason: 'options' });
  });

  it('isi QR bisa dibaca kembali dan menolak yang bukan miliknya', () => {
    const e = '01a1a41f-595c-7db5-8d30-2a4c37521170';
    const s = '01A19F49-5709-7F52-8DD1-270C5654E24C';
    expect(omrParseQr(omrQrPayload(e, s))).toEqual({ examId: e, studentId: s.toLowerCase() });
    expect(omrParseQr('https://contoh.id')).toBeNull();
    expect(omrParseQr('ES1:bukan-uuid:x')).toBeNull();
  });
});
