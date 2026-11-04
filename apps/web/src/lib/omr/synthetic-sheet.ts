import {
  OMR_BUBBLE_RADIUS_MM,
  OMR_GRID,
  OMR_MARKER,
  OMR_PAGE,
  OMR_QR,
  omrBubbleCenter,
  omrMarkerCenters,
  omrNumberCenter,
} from '@edusync/contracts';
import QRCode from 'qrcode';
import { applyHomography, solveHomography } from './scan';
import type { GrayImage, Pt } from './types';

/** Pembangkit acak tetap (mulberry32) agar tes dapat diulang. */
export function rng(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SheetSpec {
  questions: number;
  options: number;
  /** Pilihan yang diisi per soal (indeks 0 = A); kosong = tidak diisi, dua indeks = ganda. */
  marks: number[][];
  qrText: string;
  /** Keabuan tinta isian: 20 spidol, 125 pensil, 160 pensil tipis. */
  fillGray?: number;
}

export interface Capture {
  /** Piksel per milimeter kertas. */
  scale: number;
  /** Putar searah jarum jam, derajat. */
  rotateDeg?: number;
  /** Sisi atas kertas lebih sempit dari sisi bawah sebesar pecahan ini (efek tekuk/perspektif). */
  keystone?: number;
  /** Penggelapan linear dari kiri ke kanan (0 sampai 1). */
  gradient?: number;
  noise?: number;
  /** Keabuan meja di luar kertas. */
  surface?: number;
  seed?: number;
}

const PAPER = 242;
const INK = 18;

function makeSheetFn(spec: SheetSpec) {
  const qr = QRCode.create(spec.qrText, { errorCorrectionLevel: 'M' }).modules;
  const n = qr.size;
  const moduleMm = OMR_QR.size / (n + 8);
  const [tl, tr, bl, br] = omrMarkerCenters();
  const fill = spec.fillGray ?? INK;
  const marked = spec.marks.map((m) => new Set(m));
  const g = OMR_GRID;

  const box = (x: number, y: number, c: Pt, half: number) =>
    Math.abs(x - c.x) <= half && Math.abs(y - c.y) <= half;

  return (x: number, y: number): number => {
    if (x < 0 || y < 0 || x > OMR_PAGE.widthMm || y > OMR_PAGE.heightMm) return -1;
    if (box(x, y, tl, OMR_MARKER.topLeftSize / 2)) return INK;
    if (
      box(x, y, tr, OMR_MARKER.size / 2) ||
      box(x, y, bl, OMR_MARKER.size / 2) ||
      box(x, y, br, OMR_MARKER.size / 2)
    )
      return INK;
    if (x >= OMR_QR.x && x < OMR_QR.x + OMR_QR.size && y >= OMR_QR.y && y < OMR_QR.y + OMR_QR.size) {
      const mx = Math.floor((x - OMR_QR.x) / moduleMm) - 4;
      const my = Math.floor((y - OMR_QR.y) / moduleMm) - 4;
      if (mx >= 0 && my >= 0 && mx < n && my < n && qr.get(my, mx)) return INK;
      return PAPER;
    }
    if (y >= g.y0 - 6 && y <= g.y0 + g.rows * g.rowPitch) {
      const col = Math.min(g.columns - 1, Math.max(0, Math.floor((x - g.x0) / g.colWidth)));
      const row = Math.round((y - g.y0) / g.rowPitch);
      const q = col * g.rows + row;
      if (row >= 0 && row < g.rows && q < spec.questions) {
        const label = omrNumberCenter(q);
        if (Math.abs(x - label.x) < 1.4 && Math.abs(y - label.y) < 1.7) return 90; // angka nomor soal
        const opt = Math.round((x - g.x0 - col * g.colWidth - g.firstOptionOffset) / g.optionPitch);
        if (opt >= 0 && opt < spec.options) {
          const c = omrBubbleCenter(q, opt);
          const d = Math.hypot(x - c.x, y - c.y);
          if (d <= OMR_BUBBLE_RADIUS_MM) {
            if ((marked[q] as Set<number>).has(opt) && d <= OMR_BUBBLE_RADIUS_MM * 0.97) return fill;
            if (d >= OMR_BUBBLE_RADIUS_MM - 0.2) return 45; // garis lingkaran
            if (d < 0.9) return 205; // huruf pilihan yang tercetak abu-abu muda
          }
        }
      }
    }
    return PAPER;
  };
}

function inverse3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [
    (e * i - f * h) / det,
    (c * h - b * i) / det,
    (b * f - c * e) / det,
    (f * g - d * i) / det,
    (a * i - c * g) / det,
    (c * d - a * f) / det,
    (d * h - e * g) / det,
    (b * g - a * h) / det,
    (a * e - b * d) / det,
  ];
}

/** Gambar lembar seolah difoto: rotasi, tekuk perspektif, gradien cahaya, dan derau. */
export function renderCapture(spec: SheetSpec, cap: Capture): GrayImage {
  const sheet = makeSheetFn(spec);
  const rot = ((cap.rotateDeg ?? 0) * Math.PI) / 180;
  const key = cap.keystone ?? 0;
  const s = cap.scale;
  const corners: Pt[] = [
    { x: 0, y: 0 },
    { x: OMR_PAGE.widthMm, y: 0 },
    { x: 0, y: OMR_PAGE.heightMm },
    { x: OMR_PAGE.widthMm, y: OMR_PAGE.heightMm },
  ];
  const placed = corners.map((c) => {
    const t = c.y / OMR_PAGE.heightMm;
    const x = (c.x - OMR_PAGE.widthMm / 2) * (1 - key * (1 - t));
    const y = c.y - OMR_PAGE.heightMm / 2;
    return { x: (x * Math.cos(rot) - y * Math.sin(rot)) * s, y: (x * Math.sin(rot) + y * Math.cos(rot)) * s };
  });
  const margin = 40;
  const minX = Math.min(...placed.map((p) => p.x));
  const minY = Math.min(...placed.map((p) => p.y));
  const width = Math.ceil(Math.max(...placed.map((p) => p.x)) - minX + margin * 2);
  const height = Math.ceil(Math.max(...placed.map((p) => p.y)) - minY + margin * 2);
  const out = placed.map((p) => ({ x: p.x - minX + margin, y: p.y - minY + margin }));
  const forward = solveHomography(corners, out);
  if (!forward) throw new Error('homografi singular');
  const back = inverse3(forward);

  const rand = rng(cap.seed ?? 1);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const surface = cap.surface ?? 190;
  const data = new Uint8ClampedArray(width * height);
  const offsets = [0.25, 0.75];
  for (let v = 0; v < height; v += 1) {
    for (let u = 0; u < width; u += 1) {
      let sum = 0;
      for (const dy of offsets) {
        for (const dx of offsets) {
          const p = applyHomography(back, u + dx, v + dy);
          const g = sheet(p.x, p.y);
          sum += g < 0 ? surface : g;
        }
      }
      const light = 1 - (cap.gradient ?? 0) * (u / width);
      data[v * width + u] = (sum / 4) * light + (cap.noise ? gauss() * cap.noise : 0);
    }
  }
  return { width, height, data };
}
