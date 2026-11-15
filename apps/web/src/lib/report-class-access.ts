/**
 * Kelas yang boleh dibuka di rapor dan leger: pemegang kelola/lihat-semua melihat semua kelas, selain itu hanya kelas
 * yang ia walikan (aturan yang sama dengan API: report-card-access-lib). Mencegah galat 403 sejak pilihan awal.
 */
export function reportClassList<T extends { homeroomIsMe?: boolean }>(list: T[], wide: boolean): T[] {
  return wide ? list : list.filter((c) => c.homeroomIsMe === true);
}

/** Pilihan pengguna bila masih ada di daftar; kalau tidak, kelas pertama dari daftar yang sudah disaring. */
export function pickClassId(list: { id: string }[], choice: string): string {
  return list.some((c) => c.id === choice) ? choice : (list[0]?.id ?? '');
}
