import {
  and,
  classSubjectParticipation,
  enrollment,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  semester,
  student,
  type Tx,
} from '@edusync/db';
import { rosterOf } from './attendance-lib';
import { pairKey, participatingSubjectsOf, subjectRosterOf, takersForPairs } from './subject-roster-lib';

/**
 * Roster absensi per jam yang peka pilihan mapel (tahap 3B.4). Sel jadwal pada mapel yang berpenanda pilihan di rombelnya hanya
 * berisi murid yang mengambil mapel itu pada semester tanggal tersebut; sel pada mapel tak berpenanda persis roster rombel
 * seperti sebelumnya (tanpa kueri tambahan selain pembacaan penanda).
 */

/** Id semester yang tidak mungkin ada: dipakai bila tanggal di luar semua semester, sehingga hanya pilihan setahun yang berlaku. */
const NO_SEMESTER = '00000000-0000-0000-0000-000000000000';

export interface LessonCell {
  id: string;
  classId: string;
  subjectId: string;
  semesterId: string | null;
  academicYearId: string;
}

/** Semester yang dinilai untuk sel pada tanggal itu: semester sel bila khusus semester, selain itu semester tahunnya yang memuat tanggal. */
export async function cellSemesterOn(tx: Tx, cell: LessonCell, date: string): Promise<string> {
  if (cell.semesterId) return cell.semesterId;
  const [s] = await tx
    .select({ id: semester.id })
    .from(semester)
    .where(
      and(
        eq(semester.academicYearId, cell.academicYearId),
        lte(semester.startsOn, date),
        gte(semester.endsOn, date),
      ),
    );
  return s?.id ?? NO_SEMESTER;
}

/**
 * Roster satu sel jadwal pada satu tanggal: murid aktif rombel yang mengambil mapel sel itu. Mapel tak berpenanda = `rosterOf`
 * (perilaku lama, satu kueri penanda tambahan).
 */
export async function lessonRosterOf(tx: Tx, cell: LessonCell, date: string) {
  const participating = await participatingSubjectsOf(tx, cell.classId);
  if (!participating.has(cell.subjectId)) return rosterOf(tx, cell.classId);
  return subjectRosterOf(tx, cell.classId, cell.subjectId, await cellSemesterOn(tx, cell, date));
}

/**
 * Jumlah murid per sel untuk sel yang mapelnya berpenanda pilihan di rombelnya. Sel lain TIDAK ada di peta (pemanggil memakai
 * hitungan rombel seperti sebelumnya). Peta kosong dan satu kueri bila tidak ada sel berpenanda.
 */
export async function lessonTakerCounts(
  tx: Tx,
  cells: readonly LessonCell[],
  date: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (cells.length === 0) return out;
  const classIds = [...new Set(cells.map((c) => c.classId))];
  const marked = await tx
    .select({ classId: classSubjectParticipation.classId, subjectId: classSubjectParticipation.subjectId })
    .from(classSubjectParticipation)
    .where(inArray(classSubjectParticipation.classId, classIds));
  if (marked.length === 0) return out;
  const keys = new Set(marked.map((m) => `${m.classId}:${m.subjectId}`));
  const active = cells.filter((c) => keys.has(`${c.classId}:${c.subjectId}`));
  if (active.length === 0) return out;

  const onDate = await tx
    .select({ id: semester.id, academicYearId: semester.academicYearId })
    .from(semester)
    .where(and(lte(semester.startsOn, date), gte(semester.endsOn, date)));
  const semesterOfYear = new Map(onDate.map((s) => [s.academicYearId, s.id]));
  const semesterOf = (c: LessonCell) => c.semesterId ?? semesterOfYear.get(c.academicYearId) ?? NO_SEMESTER;
  const takers = await takersForPairs(
    tx,
    active.map((c) => ({ classId: c.classId, semesterId: semesterOf(c), subjectId: c.subjectId })),
  );

  const activeClassIds = [...new Set(active.map((c) => c.classId))];
  const roster = await tx
    .select({ classId: enrollment.classId, studentId: student.id })
    .from(enrollment)
    .innerJoin(student, eq(student.id, enrollment.studentId))
    .where(
      and(
        inArray(enrollment.classId, activeClassIds),
        isNull(student.deletedAt),
        eq(student.status, 'active'),
      ),
    );
  const byClass = new Map<string, string[]>();
  for (const r of roster) byClass.set(r.classId, [...(byClass.get(r.classId) ?? []), r.studentId]);
  for (const c of active) {
    const set = takers.get(
      pairKey({ classId: c.classId, semesterId: semesterOf(c), subjectId: c.subjectId }),
    );
    const ids = byClass.get(c.classId) ?? [];
    out.set(c.id, set ? ids.filter((id) => set.has(id)).length : ids.length);
  }
  return out;
}
