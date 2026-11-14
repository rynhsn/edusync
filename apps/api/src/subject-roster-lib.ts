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

/**
 * Roster per mapel (tahap 3B.1): SATU tempat yang menjawab "murid mana yang mengambil mapel ini di rombel ini". Aturan efektif
 * (rancangan 3.1, setara `takesSubject` di kontrak): bila (rombel, mapel) tidak punya penanda partisipasi, semua murid rombel
 * mengambilnya (perilaku sekarang); bila punya, hanya murid yang punya baris `student_subject_enrollment` untuk tahun rombel itu
 * (`semester_id` kosong) atau untuk semester yang dinilai.
 *
 * Tahap 3B.1 BELUM memakai fungsi ini di jalur nilai, rapor, portal, jadwal, atau absensi (tahap 3B.2 dan seterusnya); hanya
 * layar pilihan yang membacanya.
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
  input: { classId: string; semesterId: string; subjectIds?: readonly string[] },
): Promise<SubjectTakers | null> {
  const participating = await participatingSubjectsOf(tx, input.classId);
  const subjectIds = input.subjectIds
    ? [...new Set(input.subjectIds)].filter((id) => participating.has(id))
    : [...participating];
  if (subjectIds.length === 0) return null;
  const [cls] = await tx
    .select({ academicYearId: classRoom.academicYearId })
    .from(classRoom)
    .where(eq(classRoom.id, input.classId));
  const takers: SubjectTakers = new Map(subjectIds.map((id) => [id, new Set<string>()]));
  if (!cls) return takers;
  const rows = await tx
    .select({
      studentId: studentSubjectEnrollment.studentId,
      subjectId: studentSubjectEnrollment.subjectId,
    })
    .from(studentSubjectEnrollment)
    .where(
      and(
        eq(studentSubjectEnrollment.academicYearId, cls.academicYearId),
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
  const takers = await takersOf(tx, { classId, semesterId, subjectIds: [subjectId] });
  if (takers === null) return base;
  return { cls: base.cls, rows: base.rows.filter((r) => takes(takers, subjectId, r.id)) };
}
