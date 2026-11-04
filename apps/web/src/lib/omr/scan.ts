import {
  OMR_BUBBLE_RADIUS_MM,
  OMR_MARKER,
  OMR_QR,
  omrBubbleCenter,
  omrMarkerCenters,
} from '@edusync/contracts';
import jsQR from 'jsqr';
import type { CellFlag, GrayImage, OverlayBubble, Pt, ScanOptions, ScanResult } from './types';

/* ---------- Geometri ---------- */

export type Homography = number[]; // 9 angka, baris demi baris, h33 = 1

/** Homografi yang memetakan 4 titik `from` ke 4 titik `to` (eliminasi Gauss dengan pivot). */
export function solveHomography(from: Pt[], to: Pt[]): Homography | null {
  const a: number[][] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = from[i] as Pt;
    const { x: u, y: v } = to[i] as Pt;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c += 1) {
    let p = c;
    for (let r = c + 1; r < 8; r += 1)
      if (Math.abs((a[r] as number[])[c] as number) > Math.abs((a[p] as number[])[c] as number)) p = r;
    const pivot = (a[p] as number[])[c] as number;
    if (Math.abs(pivot) < 1e-12) return null;
    [a[c], a[p]] = [a[p] as number[], a[c] as number[]];
    const row = a[c] as number[];
    for (let k = c; k < 9; k += 1) row[k] = (row[k] as number) / pivot;
    for (let r = 0; r < 8; r += 1) {
      if (r === c) continue;
      const other = a[r] as number[];
      const f = other[c] as number;
      if (f !== 0) for (let k = c; k < 9; k += 1) other[k] = (other[k] as number) - f * (row[k] as number);
    }
  }
  return [...a.map((r) => r[8] as number), 1];
}

export function applyHomography(h: Homography, x: number, y: number): Pt {
  const w = (h[6] as number) * x + (h[7] as number) * y + 1;
  return {
    x: ((h[0] as number) * x + (h[1] as number) * y + (h[2] as number)) / w,
    y: ((h[3] as number) * x + (h[4] as number) * y + (h[5] as number)) / w,
  };
}

/* ---------- Binarisasi dan komponen terhubung ---------- */

/** Ambang adaptif (rata-rata lokal): tahan terhadap pencahayaan foto yang tidak merata. 1 = gelap. */
function binarize(img: GrayImage): Uint8Array {
  const { width: w, height: h, data } = img;
  const stride = w + 1;
  const integral = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let run = 0;
    for (let x = 0; x < w; x += 1) {
      run += data[y * w + x] as number;
      integral[(y + 1) * stride + x + 1] = (integral[y * stride + x + 1] as number) + run;
    }
  }
  const half = Math.max(8, Math.round(Math.min(w, h) / 20));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(h, y + half + 1);
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w, x + half + 1);
      const sum =
        (integral[y1 * stride + x1] as number) -
        (integral[y0 * stride + x1] as number) -
        (integral[y1 * stride + x0] as number) +
        (integral[y0 * stride + x0] as number);
      const mean = sum / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = (data[y * w + x] as number) < mean * 0.8 ? 1 : 0;
    }
  }
  return out;
}

interface Blob {
  area: number;
  cx: number;
  cy: number;
  /** Kekotakan: sisi dari area dibanding sisi dari momen kedua; ~1 untuk persegi padat, lebih besar untuk cincin/teks. */
  squareness: number;
  /** Keisotropan: rasio eigen kecil/besar momen; 1 untuk persegi dan lingkaran. */
  isotropy: number;
}

/** Komponen terhubung (8 arah) dengan statistik momen; hanya yang berukuran `minArea` ke atas dikembalikan. */
function blobs(bin: Uint8Array, w: number, h: number, minArea: number): Blob[] {
  const label = new Int32Array(w * h);
  const parent = new Int32Array(((w + 1) >> 1) * ((h + 1) >> 1) + 2);
  let next = 1;
  const find = (a: number) => {
    let r = a;
    while (parent[r] !== r) r = parent[r] as number;
    let c = a;
    while (parent[c] !== r) {
      const n = parent[c] as number;
      parent[c] = r;
      c = n;
    }
    return r;
  };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!bin[y * w + x]) continue;
      let l = 0;
      const consider = (nx: number, ny: number) => {
        if (nx < 0 || nx >= w || ny < 0) return;
        const n = label[ny * w + nx] as number;
        if (!n) return;
        if (!l) l = find(n);
        else {
          const r = find(n);
          if (r !== l) parent[Math.max(r, l)] = Math.min(r, l);
          l = Math.min(r, l);
        }
      };
      consider(x - 1, y);
      consider(x - 1, y - 1);
      consider(x, y - 1);
      consider(x + 1, y - 1);
      if (!l) {
        l = next;
        parent[next] = next;
        next += 1;
      }
      label[y * w + x] = l;
    }
  }
  const n = new Float64Array(next);
  const sx = new Float64Array(next);
  const sy = new Float64Array(next);
  const sxx = new Float64Array(next);
  const syy = new Float64Array(next);
  const sxy = new Float64Array(next);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const l = label[y * w + x] as number;
      if (!l) continue;
      const r = find(l);
      n[r] = (n[r] as number) + 1;
      sx[r] = (sx[r] as number) + x;
      sy[r] = (sy[r] as number) + y;
      sxx[r] = (sxx[r] as number) + x * x;
      syy[r] = (syy[r] as number) + y * y;
      sxy[r] = (sxy[r] as number) + x * y;
    }
  }
  const out: Blob[] = [];
  for (let r = 1; r < next; r += 1) {
    const area = n[r] as number;
    if (area < minArea || parent[r] !== r) continue;
    const cx = (sx[r] as number) / area;
    const cy = (sy[r] as number) / area;
    const vxx = (sxx[r] as number) / area - cx * cx;
    const vyy = (syy[r] as number) / area - cy * cy;
    const vxy = (sxy[r] as number) / area - cx * cy;
    const tr = vxx + vyy;
    const det = Math.sqrt(Math.max(0, ((vxx - vyy) / 2) ** 2 + vxy * vxy));
    const l1 = tr / 2 + det;
    const l2 = tr / 2 - det;
    if (l1 <= 0) continue;
    out.push({
      area,
      cx,
      cy,
      squareness: Math.sqrt(6 * tr) / Math.sqrt(area),
      isotropy: l2 / l1,
    });
  }
  return out;
}

/* ---------- Penanda sudut ---------- */

const [TL_MM, TR_MM, BL_MM, BR_MM] = omrMarkerCenters();
const EDGE_TR = Math.hypot(TR_MM.x - TL_MM.x, TR_MM.y - TL_MM.y);
const EDGE_BL = Math.hypot(BL_MM.x - TL_MM.x, BL_MM.y - TL_MM.y);
const EDGE_BR = Math.hypot(BR_MM.x - TL_MM.x, BR_MM.y - TL_MM.y);
const SMALL_TO_TL_AREA = (OMR_MARKER.size / OMR_MARKER.topLeftSize) ** 2;
const DIST_TOLERANCE = 0.25;

/** Empat penanda menurut lembar [kiri atas, kanan atas, kiri bawah, kanan bawah]; null bila tidak ketemu. */
function findMarkers(candidates: Blob[]): [Blob, Blob, Blob, Blob] | null {
  const solid = candidates
    .filter((b) => b.squareness > 0.88 && b.squareness < 1.12 && b.isotropy > 0.7)
    .sort((a, b) => b.area - a.area);
  // Kiri atas = persegi padat terbesar; yang lain dikenali dari jarak ke sana (tahan rotasi 0/90/180/270 dan miring).
  for (const tl of solid.slice(0, 3)) {
    const px = Math.sqrt(tl.area) / OMR_MARKER.topLeftSize; // piksel per mm
    const pick = (expected: number) => {
      let best: Blob | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const c of solid) {
        if (c === tl) continue;
        const d = Math.hypot(c.cx - tl.cx, c.cy - tl.cy) / px;
        const off = Math.abs(d / expected - 1);
        if (off > DIST_TOLERANCE) continue;
        const areaOff = Math.abs(Math.log(c.area / (tl.area * SMALL_TO_TL_AREA)));
        if (areaOff > 0.9) continue;
        const score = off + areaOff * 0.3;
        if (score < bestScore) {
          best = c;
          bestScore = score;
        }
      }
      return best;
    };
    const tr = pick(EDGE_TR);
    const bl = pick(EDGE_BL);
    const br = pick(EDGE_BR);
    if (tr && bl && br && tr !== bl && tr !== br && bl !== br) return [tl, tr, bl, br];
  }
  return null;
}

/* ---------- Pengambilan sampel ---------- */

function sampleBilinear(img: GrayImage, x: number, y: number): number {
  const { width: w, height: h, data } = img;
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(y)));
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = Math.min(1, Math.max(0, x - x0));
  const fy = Math.min(1, Math.max(0, y - y0));
  const top = (data[y0 * w + x0] as number) * (1 - fx) + (data[y0 * w + x1] as number) * fx;
  const bottom = (data[y1 * w + x0] as number) * (1 - fx) + (data[y1 * w + x1] as number) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Rata-rata keabuan pada cakram (rIn = 0) atau cincin [rIn, rOut] di sekitar (cx, cy). NaN bila di luar gambar. */
function ringMean(img: GrayImage, cx: number, cy: number, rIn: number, rOut: number): number {
  const { width: w, height: h, data } = img;
  if (cx - rOut < 0 || cy - rOut < 0 || cx + rOut >= w || cy + rOut >= h) return Number.NaN;
  let sum = 0;
  let count = 0;
  const y0 = Math.floor(cy - rOut);
  const y1 = Math.ceil(cy + rOut);
  const x0 = Math.floor(cx - rOut);
  const x1 = Math.ceil(cx + rOut);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= rIn && d <= rOut) {
        sum += data[y * w + x] as number;
        count += 1;
      }
    }
  }
  return count ? sum / count : Number.NaN;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[s.length >> 1] as number) : 0;
};

/** Potongan tegak kotak QR (dengan zona tenang) dari foto, sebagai RGBA untuk pembaca QR. */
function cropQr(img: GrayImage, h: Homography, pxPerMm = 7) {
  const margin = 5;
  const sizeMm = OMR_QR.size + margin * 2;
  const n = Math.round(sizeMm * pxPerMm);
  const rgba = new Uint8ClampedArray(n * n * 4);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const p = applyHomography(
        h,
        OMR_QR.x - margin + (i + 0.5) / pxPerMm,
        OMR_QR.y - margin + (j + 0.5) / pxPerMm,
      );
      const g = sampleBilinear(img, p.x, p.y);
      const o = (j * n + i) * 4;
      rgba[o] = g;
      rgba[o + 1] = g;
      rgba[o + 2] = g;
      rgba[o + 3] = 255;
    }
  }
  return { rgba, size: n };
}

const defaultDecode = (rgba: Uint8ClampedArray, w: number, h: number) =>
  jsQR(rgba, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null;

/* ---------- Penilaian gelembung ---------- */

/** Selisih pengisian (terhadap dasar lembar) yang dianggap tanda jelas, dan yang dianggap samar. */
const STRONG = 0.2;
const FAINT = 0.1;

/**
 * Pindai satu lembar jawaban. `img` sebaiknya sudah dikecilkan (sisi terpanjang sekitar 1800 px, lihat loadGrayImage).
 * shortcut: lembar harus utuh (keempat penanda terlihat) dan tegak lurus kamera secukupnya; foto yang sangat miring
 * atau tertekuk gagal dengan reason 'markers', upgrade dengan deteksi tepi kertas bila perlu.
 */
export function scanSheet(img: GrayImage, opts: ScanOptions): ScanResult {
  const { width, height } = img;
  const empty = (reason: 'markers' | 'blank', extra: Partial<ScanResult> = {}): ScanResult => ({
    ok: false,
    reason,
    answers: Array.from({ length: opts.questions }, () => null),
    flags: Array.from({ length: opts.questions }, (): CellFlag => 'blank'),
    qr: null,
    confidence: 0,
    warnings: [],
    overlay: [],
    width,
    height,
    ...extra,
  });

  const bin = binarize(img);
  const found = findMarkers(blobs(bin, width, height, Math.max(150, Math.round(width * height * 0.00008))));
  if (!found) return empty('markers');
  const markers = found.map((b) => ({ x: b.cx, y: b.cy })) as [Pt, Pt, Pt, Pt];
  const h = solveHomography([TL_MM, TR_MM, BL_MM, BR_MM], markers);
  if (!h) return empty('markers');

  // Setiap gelembung: pengisian = seberapa lebih gelap bagian dalamnya daripada kertas di sekelilingnya.
  const scores: number[][] = [];
  const overlay: OverlayBubble[] = [];
  const warnings: string[] = [];
  let outside = false;
  for (let q = 0; q < opts.questions; q += 1) {
    const row: number[] = [];
    for (let o = 0; o < opts.options; o += 1) {
      const mm = omrBubbleCenter(q, o);
      const c = applyHomography(h, mm.x, mm.y);
      const px = applyHomography(h, mm.x + 1, mm.y);
      const py = applyHomography(h, mm.x, mm.y + 1);
      const r =
        OMR_BUBBLE_RADIUS_MM *
        ((Math.hypot(px.x - c.x, px.y - c.y) + Math.hypot(py.x - c.x, py.y - c.y)) / 2);
      const inner = ringMean(img, c.x, c.y, 0, r * 0.62);
      const ref = ringMean(img, c.x, c.y, r * 1.3, r * 1.75);
      let s = 0;
      if (Number.isNaN(inner) || Number.isNaN(ref)) outside = true;
      else s = Math.min(1, Math.max(0, (ref - inner) / Math.max(1, ref)));
      row.push(s);
      overlay.push({ question: q, option: o, x: c.x, y: c.y, r, marked: false, score: s });
    }
    scores.push(row);
  }
  if (outside) warnings.push('outside');

  const baseline = median(scores.flat());
  const answers: (string | null)[] = [];
  const flags: CellFlag[] = [];
  for (let q = 0; q < opts.questions; q += 1) {
    const row = (scores[q] as number[]).map((s) => s - baseline);
    const strong = row.map((v, i) => (v >= STRONG ? i : -1)).filter((i) => i >= 0);
    const top = row.indexOf(Math.max(...row));
    let flag: CellFlag = 'ok';
    let chosen: number | null = null;
    if (strong.length === 1) chosen = strong[0] as number;
    else if (strong.length > 1) flag = 'multiple';
    else if ((row[top] as number) >= FAINT) {
      chosen = top;
      flag = 'faint';
    } else flag = 'blank';
    answers.push(chosen === null ? null : String.fromCharCode(65 + chosen));
    flags.push(flag);
    for (const i of flag === 'multiple' ? strong : chosen === null ? [] : [chosen]) {
      const b = overlay[q * opts.options + i];
      if (b) b.marked = true;
    }
  }

  let qr: string | null = null;
  const decode = opts.decodeQr ?? defaultDecode;
  for (const ppm of [7, 10]) {
    const { rgba, size } = cropQr(img, h, ppm);
    qr = decode(rgba, size, size);
    if (qr) break;
  }
  if (!qr) warnings.push('qr');

  const flagged = flags.filter((f) => f !== 'ok').length;
  const blanks = flags.filter((f) => f === 'blank').length;
  const confidence = Math.max(
    0,
    1 - (flagged / Math.max(1, opts.questions)) * 0.6 - (qr ? 0 : 0.1) - (outside ? 0.3 : 0),
  );
  const result: ScanResult = {
    ok: true,
    markers,
    answers,
    flags,
    qr,
    confidence,
    warnings,
    overlay,
    width,
    height,
  };
  if (blanks === opts.questions) return { ...result, ok: false, reason: 'blank' };
  return result;
}
