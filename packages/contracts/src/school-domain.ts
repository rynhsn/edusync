/** Maksimal domain sendiri per sekolah. */
export const MAX_SCHOOL_DOMAINS = 3;

/** Label DNS tempat token verifikasi dipasang: TXT di `_edusync-verify.<hostname>`. */
export const DOMAIN_VERIFY_LABEL = '_edusync-verify';

export type HostnameProblem = 'format' | 'ip' | 'localhost' | 'app_domain';

const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Normalisasi dan validasi hostname domain sendiri. Mengembalikan hostname huruf kecil, atau alasan penolakan:
 * bukan host biasa (skema, path, port, spasi), alamat IP, localhost/.local, atau milik APP_DOMAIN
 * (domain dasar maupun subdomainnya).
 */
export function checkCustomHostname(
  raw: string,
  appDomain: string,
): { ok: true; hostname: string } | { ok: false; problem: HostnameProblem } {
  const hostname = raw.trim().toLowerCase().replace(/\.$/, '');
  const base = appDomain.toLowerCase().replace(/:\d+$/, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || /^[0-9a-f]*:[0-9a-f:]*$/.test(hostname))
    return { ok: false, problem: 'ip' };
  if (hostname.length > 253) return { ok: false, problem: 'format' };
  const labels = hostname.split('.');
  // Domain publik butuh minimal dua label (nama + TLD), TLD tidak boleh angka semua.
  if (
    labels.length < 2 ||
    !labels.every((l) => l.length <= 63 && LABEL.test(l)) ||
    /^\d+$/.test(labels.at(-1) ?? '')
  ) {
    return { ok: false, problem: 'format' };
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    return { ok: false, problem: 'localhost' };
  }
  if (hostname === base || hostname.endsWith(`.${base}`)) return { ok: false, problem: 'app_domain' };
  return { ok: true, hostname };
}
