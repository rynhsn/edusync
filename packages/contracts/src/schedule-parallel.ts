/**
 * Aturan murni jadwal paralel dan gabungan (tahap 3B.3). Tanpa akses data: dipakai API (validasi sel) dan klien (pilihan mapel
 * dan pemberitahuan) sehingga satu definisi.
 *
 * Model (docs/rancangan-3b-3c-pilihan-mapel-kelulusan.md, 3.1): satu slot rombel (hari + jam + cakupan) boleh punya beberapa sel
 * pada `lane` berbeda hanya bila semua mapel di slot itu berpenanda pilihan di rombel itu; sel di rombel berbeda dengan guru,
 * mapel, hari, jam, dan cakupan sama serta `combinedKey` sama adalah satu pertemuan gabungan. Sekolah yang tidak memakai
 * keduanya (lane 0, tanpa kunci) berperilaku persis seperti sebelumnya.
 */

/** Lane bawaan; semua jadwal lama berlane ini. */
export const SCHEDULE_DEFAULT_LANE = 0;
/** Lane terbesar (CHECK di DB: 0..9), jadi paling banyak 10 sel paralel per slot. */
export const SCHEDULE_MAX_LANE = 9;

/** Kode galat tahap 3B.3. */
export const PARALLEL_REQUIRES_SELECTED_CODE = 'parallel_requires_selected';
export const COMBINED_MISMATCH_CODE = 'combined_mismatch';

/** Bentuk minimal sel jadwal untuk aturan di bawah. */
export interface ScheduleCellLike {
  classId: string;
  subjectId: string;
  teacherId: string;
  weekday: number;
  periodId: string;
  semesterId: string | null;
  lane: number;
}

/**
 * Mapel di slot yang melanggar aturan paralel. Slot boleh berisi satu sel di lane 0 apa pun mapelnya (perilaku lama); begitu ada
 * lebih dari satu sel, atau ada sel di lane > 0, SEMUA mapel di slot harus berpenanda pilihan (`selected`). Mengembalikan id mapel
 * yang tidak berpenanda (kosong = sah).
 */
export function parallelViolations(
  cells: readonly Pick<ScheduleCellLike, 'subjectId' | 'lane'>[],
  selectedSubjectIds: ReadonlySet<string>,
): string[] {
  const parallel = cells.length > 1 || cells.some((c) => c.lane > SCHEDULE_DEFAULT_LANE);
  if (!parallel) return [];
  return [...new Set(cells.filter((c) => !selectedSubjectIds.has(c.subjectId)).map((c) => c.subjectId))];
}

/** Lane kosong terkecil di slot (null bila semua lane 0..9 terpakai). */
export function nextFreeLane(usedLanes: readonly number[]): number | null {
  const used = new Set(usedLanes);
  for (let lane = SCHEDULE_DEFAULT_LANE; lane <= SCHEDULE_MAX_LANE; lane++) if (!used.has(lane)) return lane;
  return null;
}

/**
 * Apakah `candidate` cocok menjadi anggota kelompok gabungan yang sudah punya `member`: rombel harus berbeda; guru, mapel, hari,
 * jam, dan cakupan harus sama. (Lane tidak harus sama: tiap rombel bebas menaruhnya di lane-nya sendiri.)
 */
export function combinedMatches(
  member: Pick<
    ScheduleCellLike,
    'classId' | 'subjectId' | 'teacherId' | 'weekday' | 'periodId' | 'semesterId'
  >,
  candidate: Pick<
    ScheduleCellLike,
    'classId' | 'subjectId' | 'teacherId' | 'weekday' | 'periodId' | 'semesterId'
  >,
): boolean {
  return (
    member.classId !== candidate.classId &&
    member.subjectId === candidate.subjectId &&
    member.teacherId === candidate.teacherId &&
    member.weekday === candidate.weekday &&
    member.periodId === candidate.periodId &&
    member.semesterId === candidate.semesterId
  );
}
