import { and, classRoom, eq, gte, inArray, lte, reportCard, semester, type Tx } from '@edusync/db';
import { HttpError } from './http-error';

/**
 * Penjaga rapor final. Rapor yang sudah difinalkan membeku di `report_card.snapshot`, tetapi buku nilai, rekap, dan portal
 * membaca data hidup. Tanpa penjaga ini, mengubah nilai setelah finalisasi membuat rapor terbit dan nilai hidup berbeda
 * tanpa ada yang tahu. Semua jalur yang mengubah data penyusun rapor memanggil fungsi di sini di dalam transaksinya,
 * dan menjawab 409 `report_final`; wali kelas atau pengelola rapor harus membuka kembali rapornya lebih dulu.
 *
 * Granularitas: per kelas untuk jalur yang menyentuh satu kelas (penilaian, komponen, dorong nilai ujian), per siswa untuk
 * jalur yang menyentuh siswa tertentu (ekskul, absensi, jawaban CBT). Finalisasi bekerja per (semester, kelas), jadi satu
 * baris final sudah berarti kelas itu terkunci.
 */
export const REPORT_FINAL_CODE = 'report_final';

const classMessage = (names: string[]) =>
  `Rapor ${names.length === 1 ? 'kelas' : 'kelas-kelas'} ${names.join(', ')} pada semester ini sudah difinalkan. ` +
  'Buka kembali rapornya di menu Rapor bila nilai perlu diubah.';

/** Tolak bila ada kelas di antara `classIds` yang rapornya sudah final pada semester itu. */
export async function assertClassesReportNotFinal(tx: Tx, semesterId: string, classIds: string[]) {
  const ids = [...new Set(classIds)];
  if (ids.length === 0) return;
  const rows = await tx
    .selectDistinct({ id: reportCard.classId, name: classRoom.name })
    .from(reportCard)
    .innerJoin(classRoom, eq(classRoom.id, reportCard.classId))
    .where(
      and(
        eq(reportCard.semesterId, semesterId),
        inArray(reportCard.classId, ids),
        eq(reportCard.status, 'final'),
      ),
    );
  if (rows.length > 0) {
    throw new HttpError(409, REPORT_FINAL_CODE, classMessage(rows.map((r) => r.name).sort()));
  }
}

export const assertClassReportNotFinal = (tx: Tx, semesterId: string, classId: string) =>
  assertClassesReportNotFinal(tx, semesterId, [classId]);

/** Tolak bila rapor salah satu siswa sudah final pada semester itu. */
export async function assertStudentsReportNotFinal(tx: Tx, semesterId: string, studentIds: string[]) {
  const ids = [...new Set(studentIds)];
  if (ids.length === 0) return;
  const [hit] = await tx
    .select({ id: reportCard.id })
    .from(reportCard)
    .where(
      and(
        eq(reportCard.semesterId, semesterId),
        inArray(reportCard.studentId, ids),
        eq(reportCard.status, 'final'),
      ),
    )
    .limit(1);
  if (hit) {
    throw new HttpError(
      409,
      REPORT_FINAL_CODE,
      'Rapor siswa ini pada semester tersebut sudah difinalkan. Buka kembali rapor kelasnya di menu Rapor bila perlu mengubahnya.',
    );
  }
}

/** Sama seperti di atas untuk data bertanggal (mis. absensi harian): semester yang rentangnya memuat `date`. */
export async function assertStudentsReportNotFinalOnDate(tx: Tx, studentIds: string[], date: string) {
  const sems = await tx
    .select({ id: semester.id })
    .from(semester)
    .where(and(lte(semester.startsOn, date), gte(semester.endsOn, date)));
  for (const s of sems) await assertStudentsReportNotFinal(tx, s.id, studentIds);
}

/**
 * Wali kelas dan guru pengampu boleh berganti di tengah tahun (rapor yang sudah final menyimpan nama saat itu), jadi
 * hanya ditolak bila setiap semester pada tahun ajaran kelas itu sudah final: tahun ajarannya sudah tertutup.
 */
export async function assertClassYearNotClosed(tx: Tx, classId: string) {
  const [cls] = await tx
    .select({ academicYearId: classRoom.academicYearId })
    .from(classRoom)
    .where(eq(classRoom.id, classId));
  if (!cls) return;
  const sems = await tx
    .select({ id: semester.id })
    .from(semester)
    .where(eq(semester.academicYearId, cls.academicYearId));
  if (sems.length === 0) return;
  const finals = await tx
    .selectDistinct({ semesterId: reportCard.semesterId })
    .from(reportCard)
    .where(
      and(
        eq(reportCard.classId, classId),
        eq(reportCard.status, 'final'),
        inArray(
          reportCard.semesterId,
          sems.map((s) => s.id),
        ),
      ),
    );
  if (finals.length === sems.length) {
    throw new HttpError(
      409,
      REPORT_FINAL_CODE,
      'Semua semester pada tahun ajaran kelas ini sudah difinalkan, jadi guru pengampu dan wali kelasnya tidak bisa diubah. Buka kembali rapor bila memang perlu.',
    );
  }
}
