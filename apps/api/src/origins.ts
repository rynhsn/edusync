/**
 * Asal (origin) yang dipercaya untuk permintaan yang membawa cookie: alamat utama, setiap subdomain sekolah
 * dari APP_DOMAIN, dan daftar tetap TRUSTED_ORIGINS. Skema harus sama dengan AUTH_URL, jadi produksi
 * (https) tidak pernah menerima http.
 *
 * Domain sendiri sekolah yang terverifikasi dipercaya terpisah lewat createDynamicOriginChecker.
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

/** Penyelesai host terverifikasi (cache pendek) dan pemeriksa asal yang ikut mempercayainya. */
export interface HostResolver {
  /** Slug sekolah aktif bila `host` adalah domain sendiri terverifikasi; selain itu null. */
  resolve(host: string): Promise<string | null>;
  /** Kosongkan cache (dipanggil setelah domain diverifikasi atau dihapus). */
  invalidate(): void;
}

const HOST_TTL_MS = 60_000;
const HOST_CACHE_MAX = 1000;

export function createHostResolver(
  lookup: (host: string) => Promise<string | null>,
  now: () => number = Date.now,
): HostResolver {
  const cache = new Map<string, { slug: string | null; exp: number }>();
  return {
    async resolve(raw) {
      const host = raw.trim().toLowerCase();
      if (!host || host.length > 253) return null;
      const hit = cache.get(host);
      if (hit && hit.exp > now()) return hit.slug;
      const slug = await lookup(host);
      // Batas ukuran: host acak dari header Origin tidak boleh menumpuk di memori.
      if (cache.size >= HOST_CACHE_MAX) cache.clear();
      cache.set(host, { slug, exp: now() + HOST_TTL_MS });
      return slug;
    },
    invalidate: () => cache.clear(),
  };
}

/**
 * Asal dipercaya bila lolos pencocok statis, atau hostname-nya domain sendiri terverifikasi dengan skema
 * yang sama dengan AUTH_URL (dan tanpa port, karena domain sendiri selalu di port standar).
 */
export function createDynamicOriginChecker(
  isStatic: (origin: string | null | undefined) => boolean,
  hosts: HostResolver,
  scheme: 'http:' | 'https:',
) {
  return async function isTrustedOriginAsync(origin: string | null | undefined): Promise<boolean> {
    if (!origin) return false;
    if (isStatic(origin)) return true;
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      return false;
    }
    if (url.origin !== origin || url.protocol !== scheme || url.port) return false;
    return (await hosts.resolve(url.hostname)) !== null;
  };
}
