export type HostKind = { kind: 'main' } | { kind: 'school'; slug: string };

const LABEL = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Tentukan jenis alamat dari host (termasuk port). Alamat utama = domain dasar persis; satu label di depan
 * domain dasar = sekolah. Selain itu (mis. 127.0.0.1) diperlakukan sebagai alamat utama agar tidak macet.
 */
export function parseHost(host: string, baseDomain: string): HostKind {
  const h = host.toLowerCase();
  const base = baseDomain.toLowerCase();
  if (h === base) return { kind: 'main' };
  const suffix = `.${base}`;
  if (h.endsWith(suffix)) {
    const label = h.slice(0, -suffix.length);
    if (LABEL.test(label)) return { kind: 'school', slug: label };
  }
  return { kind: 'main' };
}

/** Alamat lengkap. slug null = alamat utama. Path diawali "/". */
export function siteUrl(protocol: string, baseDomain: string, slug: string | null, path = '/'): string {
  const host = slug ? `${slug}.${baseDomain}` : baseDomain;
  return `${protocol}//${host}${path}`;
}

/** Hanya path internal yang aman sebagai tujuan setelah login; menolak URL penuh dan "//host". */
export function safeNextPath(next: string | null | undefined): string {
  if (!next?.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  return next;
}
