/**
 * Kelengkapan data diri (siswa, guru, wali), murni tanpa React supaya mudah diuji.
 * NIK dianggap terisi bila `nikMasked` (atau `nik`) ada: pengguna tanpa izin kelola hanya menerima `nikMasked`.
 */

export type Completeness = 'complete' | 'missingNik' | 'missingContact';

export interface CompletenessInput {
  nik?: string | null;
  nikMasked?: string | null;
  phone?: string | null;
  email?: string | null;
}

export const hasNik = (p: CompletenessInput): boolean => !!(p.nikMasked || p.nik);

/**
 * `missingNik` bila NIK belum diisi; `missingContact` bila NIK ada tetapi telepon dan email sama-sama kosong
 * (tanpa keduanya akun tidak bisa dipulihkan); selain itu `complete`.
 */
export function dataCompleteness(p: CompletenessInput): Completeness {
  if (!hasNik(p)) return 'missingNik';
  if (!p.phone?.trim() && !p.email?.trim()) return 'missingContact';
  return 'complete';
}

/** Jumlah orang yang NIK-nya belum terisi. */
export const countMissingNik = (people: CompletenessInput[]): number =>
  people.filter((p) => !hasNik(p)).length;
