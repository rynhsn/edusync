import { MM_PER_PT } from './geometry';

/**
 * Perkiraan ukuran teks Helvetica untuk membungkus dan memperkecil huruf agar muat di kotak. Perkiraan ini dipakai
 * sama persis oleh pratinjau editor dan PDF, jadi keduanya konsisten; bukan pengukuran huruf sesungguhnya.
 */

export const LINE_HEIGHT = 1.2;
export const MIN_FONT_PT = 4;

const NARROW = new Set("iljtf.,:;|!'` ()[]I");
const WIDE = new Set('mwMW@%');

function charWidth(ch: string): number {
  if (NARROW.has(ch)) return 0.3;
  if (WIDE.has(ch)) return 0.82;
  if (ch >= 'A' && ch <= 'Z') return 0.66;
  if (ch >= '0' && ch <= '9') return 0.556;
  return 0.5;
}

/** Perkiraan lebar teks satu baris (mm). */
export function estimateTextWidthMm(text: string, fontSizePt: number, bold: boolean): number {
  let em = 0;
  for (const ch of text) em += charWidth(ch);
  return em * (bold ? 1.07 : 1) * fontSizePt * MM_PER_PT;
}

/** Bungkus teks per kata (dan per baris baru) pada lebar `widthMm`; kata terlalu panjang dipotong per huruf. */
export function wrapLines(text: string, fontSizePt: number, bold: boolean, widthMm: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (estimateTextWidthMm(candidate, fontSizePt, bold) <= widthMm || !line) {
        line = candidate;
        // Kata tunggal yang melebihi lebar dipecah per huruf.
        while (estimateTextWidthMm(line, fontSizePt, bold) > widthMm && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && estimateTextWidthMm(line.slice(0, cut), fontSizePt, bold) > widthMm) cut--;
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

export interface FitInput {
  text: string;
  fontSize: number;
  bold: boolean;
  widthMm: number;
  heightMm: number;
}

/**
 * Ukuran huruf terbesar (<= fontSize, >= 4 pt) agar teks muat di kotak. Teks satu baris yang kepanjangan diperkecil
 * dulu; teks bertingkat (mis. jadwal) diperkecil sampai semua baris muat tingginya.
 */
export function fitFontSize({ text, fontSize, bold, widthMm, heightMm }: FitInput): number {
  if (!text.trim() || widthMm <= 0 || heightMm <= 0) return fontSize;
  let size = fontSize;
  while (size > MIN_FONT_PT) {
    const lines = wrapLines(text, size, bold, widthMm);
    if (lines.length * size * LINE_HEIGHT * MM_PER_PT <= heightMm + 0.01) return size;
    size = Math.round((size - 0.25) * 100) / 100;
  }
  return MIN_FONT_PT;
}
