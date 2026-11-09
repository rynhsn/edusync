/** Logika murni halaman Data wali (tanpa React supaya mudah diuji). */

export const GUARDIAN_FILTERS = ['all', 'missingNik', 'noPortal', 'hasAccount'] as const;
export type GuardianFilter = (typeof GUARDIAN_FILTERS)[number];

export type PortalStatus = 'active' | 'invited' | 'none';

/** Saringan pada halaman menjadi parameter kueri API. */
export function filterQuery(filter: GuardianFilter): { missingNik?: 'true'; portal?: 'none' | 'has' } {
  switch (filter) {
    case 'missingNik':
      return { missingNik: 'true' };
    case 'noPortal':
      return { portal: 'none' };
    case 'hasAccount':
      return { portal: 'has' };
    default:
      return {};
  }
}

interface RowFacts {
  childCount: number;
  portalStatus: PortalStatus;
}

/** Hapus hanya bila wali tidak menaungi siswa dan tidak punya akun portal (API menolak selain itu dengan 409). */
export const canDeleteGuardian = (g: RowFacts): boolean => g.childCount === 0 && g.portalStatus !== 'active';

/** Undang ke portal: modul portal aktif, wali punya minimal satu siswa, dan belum punya akun. */
export const canInviteGuardian = (g: RowFacts, portalModuleOn: boolean): boolean =>
  portalModuleOn && g.childCount > 0 && g.portalStatus !== 'active';

/** Tautan ke halaman Siswa yang sudah disaring menurut nama anak (halaman itu membaca `?q=`, maksimal 80 huruf). */
export const studentSearchHref = (name: string): string =>
  `/students?q=${encodeURIComponent(name.slice(0, 80))}`;

/** Jumlah anak yang tidak ikut tampil karena daftar dipotong. */
export const hiddenChildren = (childCount: number, shown: number): number => Math.max(0, childCount - shown);
