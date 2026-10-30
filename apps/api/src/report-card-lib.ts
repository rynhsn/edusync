import {
  averageOfFinals,
  DEFAULT_PREDICATE_DESCRIPTIONS,
  descriptionOf,
  type Predicate,
  rankPositions,
} from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  classRoom,
  count,
  dailyAttendance,
  eq,
  extracurricular,
  extracurricularAssessment,
  gte,
  lte,
  reportSetting,
  school,
  semester,
  type Tx,
  teacher,
} from '@edusync/db';
import { rosterOf } from './attendance-lib';
import {
  assessedSubjects,
  computeGrades,
  loadComponents,
  loadSettings,
  type StudentGrade,
} from './grading-lib';
import { HttpError } from './http-error';

/** Pengaturan rapor sekolah. Sekolah yang belum mengaturnya mendapat nilai bawaan. */
export interface ReportSettings {
  principalName: string | null;
  principalNip: string | null;
  city: string | null;
  address: string | null;
  descA: string;
  descB: string;
  descC: string;
  descD: string;
  showRank: boolean;
}

export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  principalName: null,
  principalNip: null,
  city: null,
  address: null,
  ...DEFAULT_PREDICATE_DESCRIPTIONS,
  showRank: false,
};

export async function loadReportSettings(tx: Tx): Promise<ReportSettings> {
  const [s] = await tx.select().from(reportSetting);
  if (!s) return { ...DEFAULT_REPORT_SETTINGS };
  return {
    principalName: s.principalName,
    principalNip: s.principalNip,
    city: s.city,
    address: s.address,
    descA: s.descA,
    descB: s.descB,
    descC: s.descC,
    descD: s.descD,
    showRank: s.showRank,
  };
}

/** Dokumen rapor satu siswa. Bentuk yang sama dikembalikan API dan disimpan sebagai snapshot saat final. */
export interface ReportDocument {
  status: 'draft' | 'final';
  school: { name: string; address: string | null; city: string | null };
  semester: { id: string; name: string; academicYear: string };
  student: {
    id: string;
    name: string;
    nis: string | null;
    nisn: string | null;
    className: string;
    level: string;
  };
  subjects: {
    subjectId: string;
    name: string;
    kkm: number;
    final: number | null;
    predicate: Predicate | null;
    description: string | null;
    belowKkm: boolean;
  }[];
  extracurriculars: { name: string; predicate: Predicate | null; note: string | null }[];
  attendance: { sick: number; excused: number; absent: number; late: number };
  homeroomNote: string | null;
  homeroomTeacher: { name: string; nip: string | null } | null;
  principal: { name: string; nip: string | null } | null;
  rank: { position: number; of: number } | null;
  generatedAt: string;
}

const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);

/** Semester dan kelas harus milik sekolah ini (pencarian di transaksi tenant) dan satu tahun ajaran. */
export async function requireSemesterClass(tx: Tx, semesterId: string, classId: string) {
  const [sem] = await tx.select().from(semester).where(eq(semester.id, semesterId));
  if (!sem) throw invalidRef('Semester tidak ditemukan.');
  const [cls] = await tx.select().from(classRoom).where(eq(classRoom.id, classId));
  if (!cls) throw invalidRef('Kelas tidak ditemukan.');
  if (cls.academicYearId !== sem.academicYearId) {
    throw invalidRef('Semester dan kelas harus berada pada tahun ajaran yang sama.');
  }
  return { sem, cls };
}

type SemesterRow = typeof semester.$inferSelect;
type ClassRow = typeof classRoom.$inferSelect;

/** Bahan rapor satu kelas pada satu semester; dihitung sekali lalu dipakai untuk semua siswa. */
export interface ClassContext {
  sem: SemesterRow;
  cls: ClassRow;
  yearName: string;
  schoolName: string;
  reportSettings: ReportSettings;
  kkm: number;
  subjects: { id: string; name: string }[];
  roster: { id: string; name: string; nis: string | null }[];
  grades: Map<string, Map<string, StudentGrade>>;
  homeroomTeacher: { name: string; nip: string | null } | null;
  /** Rata-rata nilai akhir mapel tiap siswa (null bila belum ada nilai). */
  averages: Map<string, number | null>;
  ranks: Map<string, { position: number; of: number }>;
}

/**
 * Hitung nilai seluruh siswa kelas. Rumus nilai akhir dan predikat sama dengan rekap penilaian (`computeGrades`).
 * `extraStudentIds` menambahkan siswa di luar roster aktif (mis. siswa yang kini nonaktif) agar nilainya ikut dihitung.
 */
export async function loadClassContext(
  tx: Tx,
  sem: SemesterRow,
  clsInput: ClassRow,
  extraStudentIds: string[] = [],
): Promise<ClassContext> {
  const { cls, rows: roster } = await rosterOf(tx, clsInput.id);
  const [sch] = await tx.select({ name: school.name }).from(school);
  const [year] = await tx
    .select({ name: academicYear.name })
    .from(academicYear)
    .where(eq(academicYear.id, sem.academicYearId));
  const settings = await loadSettings(tx);
  const components = await loadComponents(tx);
  const reportSettings = await loadReportSettings(tx);
  const subjects = await assessedSubjects(tx, sem.id, cls.id);
  const studentIds = [...new Set([...roster.map((s) => s.id), ...extraStudentIds])];
  const grades = await computeGrades(tx, {
    semesterId: sem.id,
    classId: cls.id,
    subjectIds: subjects.map((s) => s.id),
    studentIds,
    components,
    settings,
  });
  const averages = new Map(
    studentIds.map((id) => [
      id,
      averageOfFinals(subjects.map((sub) => grades.get(sub.id)?.get(id)?.final ?? null)),
    ]),
  );
  const ranks = rankPositions(roster.map((s) => ({ id: s.id, average: averages.get(s.id) ?? null })));

  let homeroomTeacher: ClassContext['homeroomTeacher'] = null;
  if (cls.homeroomTeacherId) {
    const [t] = await tx
      .select({ name: teacher.name, nip: teacher.nip })
      .from(teacher)
      .where(eq(teacher.id, cls.homeroomTeacherId));
    homeroomTeacher = t ?? null;
  }
  return {
    sem,
    cls,
    yearName: year?.name ?? '',
    schoolName: sch?.name ?? '',
    reportSettings,
    kkm: settings.kkm,
    subjects,
    roster,
    grades,
    homeroomTeacher,
    averages,
    ranks,
  };
}

/** Ringkasan nilai satu siswa (versi hidup) untuk daftar rapor. */
export function liveSummary(c: ClassContext, studentId: string) {
  const finals = c.subjects.map((sub) => c.grades.get(sub.id)?.get(studentId)?.final ?? null);
  return summarizeFinals(finals);
}

function summarizeFinals(finals: (number | null)[]) {
  return {
    average: averageOfFinals(finals),
    subjectsGraded: finals.filter((f) => f !== null).length,
    subjectsTotal: finals.length,
  };
}

/** Ringkasan nilai dari dokumen (snapshot) yang sudah beku. */
export function documentSummary(doc: Pick<ReportDocument, 'subjects'>) {
  return summarizeFinals(doc.subjects.map((s) => s.final));
}

/** Jumlah hari tercatat per status dalam rentang semester (hari tanpa catatan tidak dihitung). */
async function attendanceCounts(tx: Tx, studentId: string, startsOn: string, endsOn: string) {
  const rows = await tx
    .select({ status: dailyAttendance.status, n: count() })
    .from(dailyAttendance)
    .where(
      and(
        eq(dailyAttendance.studentId, studentId),
        gte(dailyAttendance.date, startsOn),
        lte(dailyAttendance.date, endsOn),
      ),
    )
    .groupBy(dailyAttendance.status);
  const n = (status: string) => rows.find((r) => r.status === status)?.n ?? 0;
  return { sick: n('sick'), excused: n('excused'), absent: n('absent'), late: n('late') };
}

/** Dokumen rapor (versi hidup, belum beku) untuk satu siswa dari konteks kelas. */
export async function buildDocument(
  tx: Tx,
  c: ClassContext,
  stu: { id: string; name: string; nis: string | null; nisn: string | null },
  homeroomNote: string | null,
): Promise<ReportDocument> {
  const d = c.reportSettings;
  const ekskul = await tx
    .select({
      name: extracurricular.name,
      predicate: extracurricularAssessment.predicate,
      note: extracurricularAssessment.note,
    })
    .from(extracurricularAssessment)
    .innerJoin(extracurricular, eq(extracurricular.id, extracurricularAssessment.extracurricularId))
    .where(
      and(
        eq(extracurricularAssessment.studentId, stu.id),
        eq(extracurricularAssessment.semesterId, c.sem.id),
      ),
    )
    .orderBy(asc(extracurricular.name));
  return {
    status: 'draft',
    school: { name: c.schoolName, address: d.address, city: d.city },
    semester: { id: c.sem.id, name: c.sem.name, academicYear: c.yearName },
    student: {
      id: stu.id,
      name: stu.name,
      nis: stu.nis,
      nisn: stu.nisn,
      className: c.cls.name,
      level: c.cls.level,
    },
    subjects: c.subjects.map((sub) => {
      const g = c.grades.get(sub.id)?.get(stu.id);
      const final = g?.final ?? null;
      const predicate = g?.predicate ?? null;
      return {
        subjectId: sub.id,
        name: sub.name,
        kkm: c.kkm,
        final,
        predicate,
        description: predicate ? descriptionOf(predicate, d) : null,
        belowKkm: final !== null && final < c.kkm,
      };
    }),
    extracurriculars: ekskul,
    attendance: await attendanceCounts(tx, stu.id, c.sem.startsOn, c.sem.endsOn),
    homeroomNote,
    homeroomTeacher: c.homeroomTeacher,
    principal: d.principalName ? { name: d.principalName, nip: d.principalNip } : null,
    rank: d.showRank ? (c.ranks.get(stu.id) ?? null) : null,
    generatedAt: new Date().toISOString(),
  };
}
