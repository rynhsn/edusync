/**
 * Pengelompokan sel jadwal berlajur dan kandidat pertemuan gabungan (murni, mudah diuji). Aturan paralel dan gabungan yang
 * sebenarnya ada di @edusync/contracts (schedule-parallel) dan dijaga server; berkas ini hanya menyusun tampilan.
 */

export interface LaneEntry {
  id: string;
  classId: string;
  className: string;
  subjectId: string;
  weekday: number;
  periodId: string;
  semesterId: string | null;
  /** Dihilangkan server untuk lane bawaan 0. */
  lane?: number;
  /** Dihilangkan server untuk sel biasa. */
  combinedKey?: string;
}

export const laneOf = (e: { lane?: number }) => e.lane ?? 0;

/** Sel pada satu slot (hari + jam), diurutkan menurut lane. */
export function slotEntries<T extends LaneEntry>(
  entries: readonly T[],
  weekday: number,
  periodId: string,
): T[] {
  return entries
    .filter((e) => e.weekday === weekday && e.periodId === periodId)
    .sort((a, b) => laneOf(a) - laneOf(b));
}

/**
 * Sel di rombel lain yang bisa diajak bergabung: guru (sudah disaring oleh pemanggil lewat jadwal gurunya), mapel, hari, jam, dan
 * cakupan sama. `scopeId` kosong = setahun penuh.
 */
export function combineCandidates<T extends LaneEntry>(
  teacherEntries: readonly T[],
  target: { classId: string; subjectId: string; weekday: number; periodId: string; scopeId: string },
): T[] {
  return teacherEntries.filter(
    (e) =>
      e.classId !== target.classId &&
      e.subjectId === target.subjectId &&
      e.weekday === target.weekday &&
      e.periodId === target.periodId &&
      (e.semesterId ?? '') === target.scopeId,
  );
}
