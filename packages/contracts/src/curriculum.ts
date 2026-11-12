/**
 * Aturan murni struktur kurikulum (fase 2B): kelompok mapel dan jam pelajaran (JP). Tanpa akses database.
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

/** JP valid: bilangan bulat tidak negatif, atau null/undefined (belum diisi). */
export function isValidPeriods(value: number | null | undefined): boolean {
  return value === null || value === undefined || (Number.isInteger(value) && value >= 0);
}

export interface AllocationLike {
  levelCode: string;
  programId?: string | null;
  weeklyPeriods?: number | null;
  yearlyPeriods?: number | null;
}

export interface LevelPeriodTotal {
  levelCode: string;
  programId: string | null;
  weeklyPeriods: number;
  yearlyPeriods: number;
}

/** Jumlah JP mingguan dan tahunan per (tingkat, program). JP kosong dihitung 0. Urut menurut tingkat lalu program. */
export function totalPeriodsByLevel(allocations: readonly AllocationLike[]): LevelPeriodTotal[] {
  const map = new Map<string, LevelPeriodTotal>();
  for (const a of allocations) {
    const programId = a.programId ?? null;
    const key = `${a.levelCode}|${programId ?? ''}`;
    const row = map.get(key) ?? { levelCode: a.levelCode, programId, weeklyPeriods: 0, yearlyPeriods: 0 };
    row.weeklyPeriods += a.weeklyPeriods ?? 0;
    row.yearlyPeriods += a.yearlyPeriods ?? 0;
    map.set(key, row);
  }
  return [...map.values()].sort(
    (a, b) => a.levelCode.localeCompare(b.levelCode) || (a.programId ?? '').localeCompare(b.programId ?? ''),
  );
}
