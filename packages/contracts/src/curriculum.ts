/**
 * Aturan murni struktur kurikulum (fase 2B): kelompok mapel dan jam pelajaran (JP). Tanpa akses database.
 */

/**
 * Kunci kelompok mapel lama. BUKAN lagi sumber kebenaran sejak fase 2C: daftar sah ada di tabel acuan `ref_subject_group`
 * (`GET /v1/reference/subject-groups`). Ekspor ini dipertahankan agar kode dan tes lama tetap berjalan.
 */
export const SUBJECT_GROUPS = [
  'general',
  'vocational_base',
  'vocational_concentration',
  'vocational_project',
  'elective',
  'internship',
] as const;
export type SubjectGroup = (typeof SUBJECT_GROUPS)[number];

export function isSubjectGroup(value: unknown): value is SubjectGroup {
  return typeof value === 'string' && (SUBJECT_GROUPS as readonly string[]).includes(value);
}

/** Jenis mapel (peran di struktur kurikulum). */
export const SUBJECT_KINDS = ['compulsory', 'elective', 'local_content', 'project', 'internship'] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

/** Varian pendidikan agama per agama (mapel agama dipetakan ke siswa menurut agamanya). */
export const RELIGION_VARIANTS = [
  'islam',
  'christian',
  'catholic',
  'hindu',
  'buddhist',
  'confucian',
  'belief',
] as const;
export type ReligionVariant = (typeof RELIGION_VARIANTS)[number];

/**
 * SARAN menit per JP dan minggu efektif per profil jenjang (bukan nilai tersimpan; sekolah menetapkan sendiri per tingkat).
 * Acuan awal: SD/MI 35 menit, SMP/MTs 40 menit, SMA/MA/SMK/MAK 45 menit; 36 minggu efektif, 32 minggu untuk tingkat akhir.
 * Angka resmi harus diverifikasi ke Lampiran II Permendikdasmen 13/2025.
 */
export function suggestedPeriodMinutes(profileKey: string | null | undefined): number | null {
  switch (profileKey) {
    case 'sd':
    case 'mi':
      return 35;
    case 'smp':
    case 'mts':
      return 40;
    case 'sma':
    case 'ma':
    case 'smk':
    case 'mak':
      return 45;
    default:
      return null;
  }
}

export const SUGGESTED_EFFECTIVE_WEEKS = 36;
export const SUGGESTED_FINAL_LEVEL_EFFECTIVE_WEEKS = 32;

/** Saran minggu efektif: 36, atau 32 untuk tingkat akhir. */
export function suggestedEffectiveWeeks(isFinalLevel: boolean): number {
  return isFinalLevel ? SUGGESTED_FINAL_LEVEL_EFFECTIVE_WEEKS : SUGGESTED_EFFECTIVE_WEEKS;
}

/** JP valid: bilangan bulat tidak negatif, atau null/undefined (belum diisi). */
export function isValidPeriods(value: number | null | undefined): boolean {
  return value === null || value === undefined || (Number.isInteger(value) && value >= 0);
}

export interface AllocationLike {
  levelCode: string;
  programId?: string | null;
  weeklyPeriods?: number | null;
  yearlyPeriods?: number | null;
  cocurricularYearlyPeriods?: number | null;
  weeks?: number | null;
}

export interface LevelPeriodTotal {
  levelCode: string;
  programId: string | null;
  weeklyPeriods: number;
  yearlyPeriods: number;
  /** JP kokurikuler tahunan (di luar `yearlyPeriods`, yang intrakurikuler). */
  cocurricularYearlyPeriods: number;
  /** Jumlah minggu (mis. PKL). */
  weeks: number;
}

/** Jumlah JP mingguan, tahunan (intrakurikuler), kokurikuler, dan minggu per (tingkat, program). Kosong dihitung 0. Urut menurut tingkat lalu program. */
export function totalPeriodsByLevel(allocations: readonly AllocationLike[]): LevelPeriodTotal[] {
  const map = new Map<string, LevelPeriodTotal>();
  for (const a of allocations) {
    const programId = a.programId ?? null;
    const key = `${a.levelCode}|${programId ?? ''}`;
    const row = map.get(key) ?? {
      levelCode: a.levelCode,
      programId,
      weeklyPeriods: 0,
      yearlyPeriods: 0,
      cocurricularYearlyPeriods: 0,
      weeks: 0,
    };
    row.weeklyPeriods += a.weeklyPeriods ?? 0;
    row.yearlyPeriods += a.yearlyPeriods ?? 0;
    row.cocurricularYearlyPeriods += a.cocurricularYearlyPeriods ?? 0;
    row.weeks += a.weeks ?? 0;
    map.set(key, row);
  }
  return [...map.values()].sort(
    (a, b) => a.levelCode.localeCompare(b.levelCode) || (a.programId ?? '').localeCompare(b.programId ?? ''),
  );
}
