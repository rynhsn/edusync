/** Nilai bawaan pengaturan sekolah, dipakai API (saat baris belum ada) dan web. */
export const SCHOOL_SETTING_DEFAULTS = {
  workingDays: [1, 2, 3, 4, 5, 6] as number[],
  semesterNames: ['Ganjil', 'Genap'] as string[],
  lessonDefaultStart: '07:00',
  lessonDefaultMinutes: 40,
};

export const MAX_SEMESTERS = 4;

/** Isi bawaan tingkat kelas menurut jenjang acuan (`ref_school_level.key`). */
export const DEFAULT_LEVELS: Record<string, { code: string; label: string }[]> = {
  sd: [1, 2, 3, 4, 5, 6].map((n) => ({ code: String(n), label: `Kelas ${n}` })),
  smp: [7, 8, 9].map((n) => ({ code: String(n), label: `Kelas ${n}` })),
  sma: ['X', 'XI', 'XII'].map((n) => ({ code: n, label: `Kelas ${n}` })),
  smk: ['X', 'XI', 'XII'].map((n) => ({ code: n, label: `Kelas ${n}` })),
};
