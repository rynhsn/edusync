import type { GrayImage } from './types';

export interface LoadedScan {
  gray: GrayImage;
  /** Pratinjau kecil (RGB) untuk digambari; skala terhadap `gray` = preview.width / gray.width. */
  preview: HTMLCanvasElement;
}

/**
 * Muat foto/hasil pindai menjadi gambar keabuan (sisi terpanjang paling banyak `maxSide`) dan pratinjau kecil.
 * Orientasi EXIF diterapkan oleh createImageBitmap (bawaan 'from-image').
 */
export async function loadScan(file: File, maxSide = 1800, previewSide = 640): Promise<LoadedScan> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < data.length; i += 1, j += 4) {
    data[i] = 0.299 * (rgba[j] as number) + 0.587 * (rgba[j + 1] as number) + 0.114 * (rgba[j + 2] as number);
  }
  const k = Math.min(1, previewSide / Math.max(width, height));
  const preview = document.createElement('canvas');
  preview.width = Math.max(1, Math.round(width * k));
  preview.height = Math.max(1, Math.round(height * k));
  preview.getContext('2d')?.drawImage(canvas, 0, 0, preview.width, preview.height);
  return { gray: { width, height, data }, preview };
}

export async function loadGrayImage(file: File, maxSide = 1800): Promise<GrayImage> {
  return (await loadScan(file, maxSide)).gray;
}
