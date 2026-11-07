/** Pengambilan gambar untuk PDF kartu: latar, gambar elemen (publik), dan foto siswa (butuh cookie + x-school-id). */

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

/** Ambil gambar sebagai data URL PNG/JPEG; null bila tidak ada (404), bukan PNG/JPEG, atau gagal diambil. */
export async function fetchImageDataUrl(path: string, schoolId: string): Promise<string | null> {
  try {
    const res = await fetch(path, { credentials: 'include', headers: { 'x-school-id': schoolId } });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!IMAGE_TYPES.has(blob.type)) return null;
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

/**
 * Jalankan `fn` untuk semua butir dengan paling banyak `limit` yang berjalan bersamaan; hasil berurutan seperti
 * `items`. `onProgress(selesai, total)` dipanggil setiap satu butir selesai.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T, i);
      done++;
      onProgress?.(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
