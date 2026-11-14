import {
  and,
  classRoom,
  classSubjectParticipation,
  eq,
  inArray,
  isNull,
  or,
  studentSubjectEnrollment,
  type Tx,
} from '@edusync/db';
import { historicalRosterOf, rosterOf } from './attendance-lib';
import { HttpError } from './http-error';

/**
 * Roster per mapel (tahap 3B.1): SATU tempat yang menjawab "murid mana yang mengambil mapel ini di rombel ini". Aturan efektif
 * (rancangan 3.1, setara `takesSubject` di kontrak): bila (rombel, mapel) tidak punya penanda partisipasi, semua murid rombel
 * mengambilnya (perilaku sekarang); bila punya, hanya murid yang punya baris `student_subject_enrollment` untuk tahun rombel itu
 * (`semester_id` kosong) atau untuk semester yang dinilai.
 *
 * Sejak tahap 3B.2 fungsi ini dipakai semua jalur nilai (skor, rekap, matriks, TP, remedial, narasi, ujian), rapor, dan portal;
 * jadwal dan absensi per jam menyusul (3B.3/3B.4).
 */

/** Pengambil per mapel berpenanda: kunci = mapel berpenanda di rombel, nilai = id murid yang terdaftar pada semester itu. */
export type SubjectTakers = Map<string, Set<string>>;

/** Mapel yang berpenanda partisipasi di rombel itu. */
export async function participatingSubjectsOf(tx: Tx, classId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ subjectId: classSubjectParticipation.subjectId })
    .from(classSubjectParticipation)
    .where(eq(classSubjectParticipation.classId, classId));
  return new Set(rows.map((r) => r.subjectId));
}

/**
 * Pengambil per mapel di rombel pada semester itu. Mengembalikan `null` bila tidak ada mapel berpenanda (di antara `subjectIds`
 * bila diberikan): pemanggil lalu memperlakukan semua murid rombel sebagai pengambil tanpa kueri tambahan. Maksimal dua kueri
 * (penanda, lalu baris pilihan) tanpa memandang jumlah mapel atau murid.
 */
export async function takersOf(
  tx: Tx,
  input: { classId: string; semesterId: string; subjectIds?: readonly string[]; academicYearId?: string },
): Promise<SubjectTakers | null> {
  const participating = await participatingSubjectsOf(tx, input.classId);
  const subjectIds = input.subjectIds
    ? [...new Set(input.subjectIds)].filter((id) => participating.has(id))
    : [...participating];
  if (subjectIds.length === 0) return null;
  // Pemanggil yang sudah memuat rombelnya meneruskan tahun ajaran supaya tidak ada kueri tambahan.
  const academicYearId =
    input.academicYearId ??
    (
      await tx
        .select({ academicYearId: classRoom.academicYearId })
        .from(classRoom)
        .where(eq(classRoom.id, input.classId))
    )[0]?.academicYearId;
  const takers: SubjectTakers = new Map(subjectIds.map((id) => [id, new Set<string>()]));
  if (!academicYearId) return takers;
  const rows = await tx
    .select({
      studentId: studentSubjectEnrollment.studentId,
      subjectId: studentSubjectEnrollment.subjectId,
    })
    .from(studentSubjectEnrollment)
    .where(
      and(
        eq(studentSubjectEnrollment.academicYearId, academicYearId),
        inArray(studentSubjectEnrollment.subjectId, subjectIds),
        or(
          isNull(studentSubjectEnrollment.semesterId),
          eq(studentSubjectEnrollment.semesterId, input.semesterId),
        ),
      ),
    );
  for (const r of rows) takers.get(r.subjectId)?.add(r.studentId);
  return takers;
}

/** Apakah murid mengambil mapel itu menurut `takers`? `null` atau mapel tak berpenanda = ya. */
export function takes(takers: SubjectTakers | null, subjectId: string, studentId: string): boolean {
  if (takers === null) return true;
  const set = takers.get(subjectId);
  return set === undefined || set.has(studentId);
}

/**
 * Roster satu mapel di satu rombel pada satu semester: roster rombel (aktif, atau aktif + lulusan bila `historical`) dikurangi murid
 * yang tidak mengambil mapel itu. Tanpa penanda = persis roster rombel.
 */
export async function subjectRosterOf(
  tx: Tx,
  classId: string,
  subjectId: string,
  semesterId: string,
  opts: { historical?: boolean } = {},
) {
  const base = opts.historical ? await historicalRosterOf(tx, classId) : await rosterOf(tx, classId);
  const takers = await takersOf(tx, {
    classId,
    semesterId,
    subjectIds: [subjectId],
    academicYearId: base.cls.academicYearId,
  });
  if (takers === null) return base;
  return { cls: base.cls, rows: base.rows.filter((r) => takes(takers, subjectId, r.id)) };
}

/** Galat 400 bila murid tidak mengambil mapel yang nilainya hendak disimpan (hanya terjadi bila rombel menandai mapel itu pilihan). */
export const notTakingSubject = () =>
  new HttpError(400, 'student_not_taking_subject', 'Ada siswa yang tidak mengambil mata pelajaran ini.');

/**
 * Pastikan semua murid mengambil mapel itu. Tanpa penanda partisipasi tidak ada kueri tambahan selain pembacaan penanda
 * (satu kueri) dan tidak pernah melempar.
 */
export async function assertStudentsTakeSubject(
  tx: Tx,
  input: { classId: string; semesterId: string; subjectId: string; studentIds: readonly string[] },
) {
  const takers = await takersOf(tx, {
    classId: input.classId,
    semesterId: input.semesterId,
    subjectIds: [input.subjectId],
  });
  if (takers === null) return;
  if (input.studentIds.some((id) => !takes(takers, input.subjectId, id))) throw notTakingSubject();
}

export interface SubjectPair {
  classId: string;
  semesterId: string;
  subjectId: string;
}

/** Kunci peta hasil `takersForPairs`. */
export const pairKey = (p: SubjectPair) => `${p.classId}:${p.semesterId}:${p.subjectId}`;

/**
 * Pengambil untuk banyak (rombel, semester, mapel) sekaligus: satu kueri penanda; bila tidak ada pasangan berpenanda selesai di
 * situ (peta kosong), selain itu dua kueri lagi (tahun rombel dan baris pilihan), tanpa memandang jumlah pasangan atau murid.
 * Pasangan yang tidak ada di peta = semua murid rombel mengambilnya.
 */
export async function takersForPairs(
  tx: Tx,
  pairs: readonly SubjectPair[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (pairs.length === 0) return out;
  const classIds = [...new Set(pairs.map((p) => p.classId))];
  const marked = await tx
    .select({ classId: classSubjectParticipation.classId, subjectId: classSubjectParticipation.subjectId })
    .from(classSubjectParticipation)
    .where(inArray(classSubjectParticipation.classId, classIds));
  if (marked.length === 0) return out;
  const markedKeys = new Set(marked.map((m) => `${m.classId}:${m.subjectId}`));
  const active = pairs.filter((p) => markedKeys.has(`${p.classId}:${p.subjectId}`));
  if (active.length === 0) return out;
  const years = await tx
    .select({ id: classRoom.id, academicYearId: classRoom.academicYearId })
    .from(classRoom)
    .where(inArray(classRoom.id, [...new Set(active.map((p) => p.classId))]));
  const yearOfClass = new Map(years.map((c) => [c.id, c.academicYearId]));
  const rows = await tx
    .select({
      studentId: studentSubjectEnrollment.studentId,
      subjectId: studentSubjectEnrollment.subjectId,
      academicYearId: studentSubjectEnrollment.academicYearId,
      semesterId: studentSubjectEnrollment.semesterId,
    })
    .from(studentSubjectEnrollment)
    .where(
      and(
        inArray(studentSubjectEnrollment.academicYearId, [...new Set(years.map((c) => c.academicYearId))]),
        inArray(studentSubjectEnrollment.subjectId, [...new Set(active.map((p) => p.subjectId))]),
      ),
    );
  for (const p of active) {
    const yearId = yearOfClass.get(p.classId);
    const set = new Set<string>();
    for (const r of rows) {
      if (r.subjectId !== p.subjectId || r.academicYearId !== yearId) continue;
      if (r.semesterId === null || r.semesterId === p.semesterId) set.add(r.studentId);
    }
    out.set(pairKey(p), set);
  }
  return out;
}
