import { MAX_SIGNATURE_BYTES } from '@edusync/contracts';
import { nextSignatureScale } from '../format';

/** Titik goresan dalam piksel CSS kanvas. */
export interface Point {
  x: number;
  y: number;
}

export const SIGNATURE_INK = '#1b1a4a';
const MAX_W = 520;
const MAX_H = 170;
const PAD = 8;

/** Gambar satu goresan dengan kurva halus (titik tengah sebagai simpul). */
export function paintStroke(ctx: CanvasRenderingContext2D, stroke: Point[], scale = 1, dx = 0, dy = 0) {
  const p = (pt: Point): [number, number] => [(pt.x - dx) * scale, (pt.y - dy) * scale];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = SIGNATURE_INK;
  ctx.fillStyle = SIGNATURE_INK;
  ctx.lineWidth = 2.6 * scale;
  const first = stroke[0];
  if (!first) return;
  if (stroke.length === 1) {
    const [x, y] = p(first);
    ctx.beginPath();
    ctx.arc(x, y, 1.4 * scale, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(...p(first));
  for (let i = 1; i < stroke.length - 1; i++) {
    const a = stroke[i] as Point;
    const b = stroke[i + 1] as Point;
    const [ax, ay] = p(a);
    const [mx, my] = p({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    ctx.quadraticCurveTo(ax, ay, mx, my);
  }
  ctx.lineTo(...p(stroke[stroke.length - 1] as Point));
  ctx.stroke();
}

/** Ekspor goresan menjadi PNG berlatar transparan, dipangkas pada tepi goresan dan dimuat dalam batas ukuran. */
export function strokesToDataUrl(strokes: Point[][]): string | null {
  const pts = strokes.flat();
  if (pts.length === 0) return null;
  const minX = Math.min(...pts.map((p) => p.x)) - PAD;
  const minY = Math.min(...pts.map((p) => p.y)) - PAD;
  const w = Math.max(...pts.map((p) => p.x)) + PAD - minX;
  const h = Math.max(...pts.map((p) => p.y)) + PAD - minY;
  let scale = Math.min(1, MAX_W / w, MAX_H / h);
  for (;;) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    for (const s of strokes) paintStroke(ctx, s, scale, minX, minY);
    const url = canvas.toDataURL('image/png');
    if (url.length <= MAX_SIGNATURE_BYTES) return url;
    const next = nextSignatureScale(scale);
    if (next === null) return null;
    scale = next;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });
}

/**
 * Ubah berkas gambar (PNG/JPEG) menjadi data URL PNG yang muat batas ukuran. Latar putih/terang dapat dibuang
 * (dijadikan transparan) agar tanda tangan menyatu dengan kertas.
 */
export async function fileToSignatureDataUrl(file: File, removeWhite: boolean): Promise<string | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    let scale = Math.min(1, MAX_W / img.naturalWidth, MAX_H / img.naturalHeight);
    for (;;) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (removeWhite) {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          const lum =
            0.299 * (px[i] as number) + 0.587 * (px[i + 1] as number) + 0.114 * (px[i + 2] as number);
          if (lum > 225) px[i + 3] = 0;
          else if (lum > 170) px[i + 3] = Math.round(((225 - lum) / 55) * (px[i + 3] as number));
        }
        ctx.putImageData(data, 0, 0);
      }
      const url = canvas.toDataURL('image/png');
      if (url.length <= MAX_SIGNATURE_BYTES) return url;
      const next = nextSignatureScale(scale);
      if (next === null) return null;
      scale = next;
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
