/**
 * Izin berdampak besar: pemegangnya bisa mengubah banyak data sekolah sekaligus (kelas, penugasan, status siswa,
 * struktur kurikulum). Layar peran memberi penanda dan keterangan pada izin ini supaya tidak diberikan sembarangan.
 * Nilai = kunci terjemahan `rolesPage.highImpact.<kunci>`.
 */
export const HIGH_IMPACT_PERMISSIONS = {
  'promotion:manage': 'promotion_manage',
  'curriculum:manage': 'curriculum_manage',
} as const;

export type HighImpactPermission = keyof typeof HIGH_IMPACT_PERMISSIONS;

export function isHighImpactPermission(permission: string): permission is HighImpactPermission {
  return Object.hasOwn(HIGH_IMPACT_PERMISSIONS, permission);
}

/** Kunci keterangan untuk izin berdampak besar, atau null untuk izin biasa. */
export function highImpactKey(permission: string): string | null {
  return isHighImpactPermission(permission) ? HIGH_IMPACT_PERMISSIONS[permission] : null;
}
