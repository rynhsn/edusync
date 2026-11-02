/**
 * Ringkasan perangkat dari teks user-agent, mis. "Chrome · Windows". Hanya untuk ditampilkan pada daftar
 * perangkat yang sedang masuk, jadi cukup mengenali peramban dan sistem yang umum; selebihnya null.
 */
export function describeDevice(userAgent: string | null | undefined): { browser: string; os: string } | null {
  const ua = userAgent ?? '';
  if (!ua) return null;
  // Urutan penting: Edge dan Opera juga memuat "Chrome", Chrome juga memuat "Safari".
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\/|FxiOS\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  // iPhone/iPad menyebut "like Mac OS X", Android menyebut "Linux": cek yang lebih khusus lebih dulu.
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux|X11/.test(ua)
            ? 'Linux'
            : null;
  if (!browser && !os) return null;
  return { browser: browser ?? '', os: os ?? '' };
}
