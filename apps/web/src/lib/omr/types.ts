/** Gambar keabuan 8-bit (0 = hitam, 255 = putih), baris demi baris. Inti pemindai hanya memakai ini, tanpa DOM. */
export interface GrayImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Pt {
  x: number;
  y: number;
}

export type CellFlag = 'ok' | 'blank' | 'multiple' | 'faint';

/** Satu gelembung pada koordinat piksel gambar, untuk digambar di atas foto. */
export interface OverlayBubble {
  question: number;
  option: number;
  x: number;
  y: number;
  r: number;
  marked: boolean;
  /** Tingkat pengisian relatif terhadap dasar lembar (0 sampai 1). */
  score: number;
}

export interface ScanResult {
  ok: boolean;
  /** Mengapa `ok` false: penanda sudut tidak ketemu, atau lembar tanpa satu pun tanda. */
  reason?: 'markers' | 'blank';
  /** Pusat penanda sudut di gambar: kiri atas, kanan atas, kiri bawah, kanan bawah (menurut lembar, bukan layar). */
  markers?: [Pt, Pt, Pt, Pt];
  /** Huruf jawaban (A, B, ...) per soal; null bila kosong atau ganda. */
  answers: (string | null)[];
  flags: CellFlag[];
  /** Isi QR bila terbaca. */
  qr: string | null;
  /** 0 sampai 1; turun bila banyak sel bertanda khusus. */
  confidence: number;
  warnings: string[];
  overlay: OverlayBubble[];
  width: number;
  height: number;
}

export interface ScanOptions {
  questions: number;
  options: number;
  /** Pembaca QR (RGBA); bawaan jsQR. Disuntikkan agar bisa diganti/di-tes. */
  decodeQr?: (rgba: Uint8ClampedArray, width: number, height: number) => string | null;
}
