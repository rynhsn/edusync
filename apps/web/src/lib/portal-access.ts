/**
 * Pengguna portal (wali/siswa) hanya memegang izin baca portal (dan boleh membaca pengumuman). Mereka tidak
 * memakai menu staf, jadi setelah masuk mendarat di /portal dan kerangka halaman dibuat lebih ringkas.
 */
const PORTAL_ONLY_ALLOWED = new Set(['portal:read', 'announcement:read']);

export function isPortalOnly(permissions: readonly string[]): boolean {
  return permissions.includes('portal:read') && permissions.every((p) => PORTAL_ONLY_ALLOWED.has(p));
}

/** Halaman beranda setelah masuk menurut izin. */
export function homePathFor(permissions: readonly string[]): '/portal' | '/dashboard' {
  return isPortalOnly(permissions) ? '/portal' : '/dashboard';
}

/** Halaman yang boleh dibuka pengguna portal: hanya /portal dan turunannya. */
export function isPortalPath(pathname: string): boolean {
  return pathname === '/portal' || pathname.startsWith('/portal/');
}
