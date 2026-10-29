/**
 * Asal (origin) yang dipercaya untuk permintaan yang membawa cookie: alamat utama, setiap subdomain sekolah
 * dari APP_DOMAIN, dan daftar tetap TRUSTED_ORIGINS. Skema harus sama dengan AUTH_URL, jadi produksi
 * (https) tidak pernah menerima http.
 *
 * Domain milik sekolah sendiri akan ditambahkan dari tabel school_domains setelah diverifikasi; sampai
 * saat itu hanya subdomain APP_DOMAIN yang diterima.
 */
export function createOriginMatcher(options: {
  appDomain: string;
  scheme: 'http:' | 'https:';
  extra?: readonly string[];
}) {
  const { appDomain, scheme, extra = [] } = options;
  const exact = new Set(extra);

  return function isTrustedOrigin(origin: string | null | undefined): boolean {
    if (!origin) return false;
    if (exact.has(origin)) return true;
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      return false;
    }
    // Origin yang sah tidak membawa path, query, atau kredensial.
    if (url.origin !== origin || url.protocol !== scheme) return false;
    if (url.host === appDomain) return true;
    const suffix = `.${appDomain}`;
    if (!url.host.endsWith(suffix)) return false;
    const label = url.host.slice(0, -suffix.length);
    return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(label);
  };
}

/** Alamat sekolah dari domain dasar, mis. smpit + localhost:3000 → http://smpit.localhost:3000. */
export function schoolOrigin(scheme: 'http:' | 'https:', appDomain: string, slug: string) {
  return `${scheme}//${slug}.${appDomain}`;
}
