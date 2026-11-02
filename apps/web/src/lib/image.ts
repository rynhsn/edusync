/** Batas berkas foto yang mau dibaca peramban sebelum dikecilkan. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Memotong gambar menjadi persegi dari tengah, mengecilkannya ke `size` piksel, dan mengembalikannya sebagai
 * data URL JPEG kecil (puluhan KB paling banyak). Melempar bila berkas bukan gambar yang bisa dibaca.
 */
export async function resizeToSquare(file: File, size = 160): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > MAX_BYTES) throw new Error('invalid_image');
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('invalid_image');
    // Latar putih agar PNG transparan tidak menjadi hitam di JPEG.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    bitmap.close();
  }
}
