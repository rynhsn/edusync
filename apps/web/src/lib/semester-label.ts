/**
 * Label semester untuk pilihan (select). Bila ada lebih dari satu tahun ajaran, nama saja ("Ganjil") tampak
 * dobel; label memuat tahun ajarannya: "Ganjil 2026/2027". Tanpa nama tahun (jawaban lama), nama semester saja.
 */
export function semesterLabel(s: { name: string; academicYearName?: string | undefined | null }): string {
  return s.academicYearName ? `${s.name} ${s.academicYearName}` : s.name;
}
