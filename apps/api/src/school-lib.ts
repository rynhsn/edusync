import { SCHOOL_SETTING_DEFAULTS } from '@edusync/contracts';
import { eq, schoolLevel, schoolSetting, type Tx } from '@edusync/db';
import { HttpError } from './http-error';

export interface SchoolSettings {
  workingDays: number[];
  semesterNames: string[];
  lessonDefaultStart: string;
  lessonDefaultMinutes: number;
}

/** Pengaturan sekolah; bila baris belum ada, nilai bawaan (baris dibuat saat pertama kali disimpan). */
export async function loadSchoolSettings(tx: Tx, schoolId?: string): Promise<SchoolSettings> {
  const [row] = await tx
    .select()
    .from(schoolSetting)
    .where(schoolId ? eq(schoolSetting.schoolId, schoolId) : undefined);
  if (!row)
    return {
      ...SCHOOL_SETTING_DEFAULTS,
      workingDays: [...SCHOOL_SETTING_DEFAULTS.workingDays],
      semesterNames: [...SCHOOL_SETTING_DEFAULTS.semesterNames],
    };
  return {
    workingDays: [...row.workingDays].sort((a, b) => a - b),
    semesterNames: row.semesterNames,
    lessonDefaultStart: row.lessonDefaultStart,
    lessonDefaultMinutes: row.lessonDefaultMinutes,
  };
}

/**
 * Tingkat kelas harus ada di daftar `school_level` sekolah. Bila daftar masih kosong, teks bebas diterima
 * (sekolah belum mengaturnya). `level` kosong/null (mis. tarif semua tingkat) selalu lolos.
 */
export async function assertLevelAllowed(tx: Tx, level: string | null | undefined) {
  if (level === null || level === undefined || level === '') return;
  const codes = (await tx.select({ code: schoolLevel.code }).from(schoolLevel)).map((r) => r.code);
  if (codes.length > 0 && !codes.includes(level)) {
    throw new HttpError(
      400,
      'invalid_level',
      `Tingkat "${level}" tidak ada di daftar tingkat sekolah. Tambahkan di Pengaturan sekolah.`,
    );
  }
}
