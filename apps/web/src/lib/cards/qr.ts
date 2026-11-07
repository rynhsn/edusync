import QRCode from 'qrcode';

export interface QrShape {
  /** Sisi matriks dalam modul. */
  size: number;
  /** Path SVG (satuan modul) yang menggambar semua modul gelap. */
  path: string;
}

const cache = new Map<string, QrShape | null>();

/** Bentuk vektor QR untuk teks (koreksi galat M). Null bila teks kosong atau terlalu panjang. Hasilnya di-cache. */
export function qrShape(text: string): QrShape | null {
  if (!text) return null;
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  let shape: QrShape | null = null;
  try {
    const { size, data } = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules;
    shape = { size, path: runsToPath(size, (r, c) => data[r * size + c] === 1) };
  } catch {
    shape = null;
  }
  if (cache.size > 800) cache.clear();
  cache.set(text, shape);
  return shape;
}

/** Gabungkan modul gelap sebaris menjadi satu persegi panjang agar path pendek. Murni. */
export function runsToPath(size: number, isDark: (row: number, col: number) => boolean): string {
  const parts: string[] = [];
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (!isDark(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < size && isDark(r, c)) c++;
      parts.push(`M${start} ${r}h${c - start}v1h-${c - start}z`);
    }
  }
  return parts.join('');
}
