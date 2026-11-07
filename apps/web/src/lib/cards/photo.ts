/** Foto siswa: potong ke rasio 3:4 dari tengah, kecilkan, dan simpan sebagai JPEG di bawah batas unggah server. */

export const PHOTO_MAX_BYTES = 500 * 1024;
export const PHOTO_RATIO = 3 / 4;
const SOURCE_MAX_BYTES = 12 * 1024 * 1024;

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Persegi panjang potongan (piksel sumber) berrasio `ratio` (lebar/tinggi), diambil dari tengah gambar. */
export function centerCrop(width: number, height: number, ratio = PHOTO_RATIO): CropRect {
  if (width / height > ratio) {
    const sw = Math.round(height * ratio);
    return { sx: Math.round((width - sw) / 2), sy: 0, sw, sh: height };
  }
  const sh = Math.round(width / ratio);
  return { sx: 0, sy: Math.round((height - sh) / 2), sw: width, sh };
}

/** Ukuran keluaran: tidak dibesarkan, sisi panjang paling banyak `maxHeight`. */
export function outputSize(sw: number, sh: number, maxHeight = 640): { w: number; h: number } {
  const k = Math.min(1, maxHeight / sh);
  return { w: Math.max(1, Math.round(sw * k)), h: Math.max(1, Math.round(sh * k)) };
}

/** Ukuran byte dari string base64 (tanpa awalan data:). */
export function base64Bytes(b64: string): number {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/**
 * Siapkan berkas gambar menjadi JPEG base64 (tanpa awalan data:) yang muat di batas unggah.
 * Melempar `invalid_image` bila bukan gambar yang bisa dibaca.
 */
export async function preparePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > SOURCE_MAX_BYTES) throw new Error('invalid_image');
  const bitmap = await createImageBitmap(file);
  try {
    const crop = centerCrop(bitmap.width, bitmap.height);
    const size = outputSize(crop.sw, crop.sh);
    const canvas = document.createElement('canvas');
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('invalid_image');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, size.w, size.h);
    for (const quality of [0.88, 0.8, 0.7, 0.6, 0.5]) {
      const b64 = canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? '';
      if (b64 && base64Bytes(b64) <= PHOTO_MAX_BYTES) return b64;
    }
    throw new Error('invalid_image');
  } finally {
    bitmap.close();
  }
}
