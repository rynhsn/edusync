import { homeroomAssignmentHistory, type Tx, teachingAssignmentHistory } from '@edusync/db';

/** Catat penggantian guru pengampu mapel di satu kelas (diisi oleh route penugasan; tidak pernah dihapus). */
export async function recordTeachingChange(
  tx: Tx,
  entry: {
    schoolId: string;
    classId: string;
    subjectId: string;
    teacherId: string | null;
    previousTeacherId: string | null;
    actorId: string;
  },
) {
  const action =
    entry.teacherId === null ? 'released' : entry.previousTeacherId === null ? 'assigned' : 'changed';
  await tx.insert(teachingAssignmentHistory).values({ ...entry, action });
}

/** Catat penggantian wali kelas satu kelas. */
export async function recordHomeroomChange(
  tx: Tx,
  entry: {
    schoolId: string;
    classId: string;
    teacherId: string | null;
    previousTeacherId: string | null;
    actorId: string;
  },
) {
  await tx.insert(homeroomAssignmentHistory).values(entry);
}
