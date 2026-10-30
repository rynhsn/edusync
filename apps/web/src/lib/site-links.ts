import { parseHost, siteUrl } from './host';

export interface SiteLinks {
  /** Awalan jalur halaman situs: "/site" (dibuka dari host sekolah) atau "/site/<slug>". */
  base: string;
  login: string;
  apply: string;
}

/**
 * Tautan di dalam situs publik. Dibuka dari host sekolahnya sendiri, tautan masuk/daftar cukup relatif;
 * dibuka dari host lain (mis. /site/<slug> di alamat utama) harus mutlak ke host sekolah, karena sesi dan
 * halaman /apply milik host sekolah.
 */
export function siteLinks(opts: {
  host: string;
  baseDomain: string;
  protocol: string;
  slug: string;
  mode: 'host' | 'slug';
}): SiteLinks {
  const where = parseHost(opts.host, opts.baseDomain);
  const onOwnHost = where.kind === 'school' && where.slug === opts.slug;
  const to = (path: string) => (onOwnHost ? path : siteUrl(opts.protocol, opts.baseDomain, opts.slug, path));
  return {
    base: opts.mode === 'host' ? '/site' : `/site/${opts.slug}`,
    login: to('/login'),
    apply: to('/apply'),
  };
}

/** Protokol dari header proksi; lokal (localhost) bawaannya http, selain itu https. */
export function protocolOf(forwardedProto: string | null | undefined, host: string): 'http:' | 'https:' {
  const first = forwardedProto?.split(',')[0]?.trim().toLowerCase();
  if (first === 'https' || first === 'http') return `${first}:`;
  return /(^|\.)localhost(:\d+)?$|^127\.0\.0\.1/.test(host) ? 'http:' : 'https:';
}
