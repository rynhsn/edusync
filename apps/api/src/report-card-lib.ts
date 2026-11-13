import {
  averageOfFinals,
  DEFAULT_PREDICATE_DESCRIPTIONS,
  descriptionOf,
  type ReportDocument,
  type ReportDocumentV2,
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
  reportCardSection,
  reportSetting,
  reportSubjectNarrative,
  school,
  schoolLevel,
  semester,
  type Tx,
  teacher,
} from '@edusync/db';
import { historicalRosterOf } from './attendance-lib';
import { loadGradingConfig } from './grading-config-lib';
import { assessedSubjects, computeGrades, notCountedComponentIds, type StudentGrade } from './grading-lib';
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
  /** Tampilkan bagian deskripsi kokurikuler pada PDF (bawaan mati; K12). */
  showCocurricular: boolean;
  /** Tampilkan bagian tanggapan orang tua/wali pada PDF (bawaan mati; K12). */
  showGuardianResponse: boolean;
  /** Jendela tanggapan wali sejak finalisasi, dalam hari; null = tanpa batas (bawaan 30; K9). */
  responseWindowDays: number | null;
}

export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  principalName: null,
  principalNip: null,
  city: null,
  address: null,
  ...DEFAULT_PREDICATE_DESCRIPTIONS,
  showRank: false,
  showCocurricular: false,
  showGuardianResponse: false,
  responseWindowDays: 30,
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
    showCocurricular: s.showCocurricular,
    showGuardianResponse: s.showGuardianResponse,
    responseWindowDays: s.responseWindowDays,
  };
}

/**
 * Dokumen rapor satu siswa. Bentuk yang sama dikembalikan API dan disimpan sebagai snapshot saat final.
 * Tipe dan skema zod-nya satu tempat di kontrak (`report-document.ts`), dipakai juga oleh rute rapor dan portal.
 */
export type { ReportDocument };

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
  /** KKM sekolah (`grading_setting.kkm`); KKM tiap mapel ada di `kkmBySubject`. */
  kkm: number;
  /** KKM efektif per mapel (KKTP berjenjang, jatuh ke `kkm` bila tak ada kriteria). */
  kkmBySubject: Map<string, number>;
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
 * Roster memakai `historicalRosterOf` (aktif dan lulusan yang terdaftar di tahun kelas ini).
 * `extraStudentIds` menambahkan siswa di luar roster itu (mis. siswa pindah yang kini nonaktif) agar nilainya ikut dihitung.
 */
export async function loadClassContext(
  tx: Tx,
  sem: SemesterRow,
  clsInput: ClassRow,
  extraStudentIds: string[] = [],
): Promise<ClassContext> {
  const { cls, rows: roster } = await historicalRosterOf(tx, clsInput.id);
  const [sch] = await tx.select({ name: school.name }).from(school);
  const [year] = await tx
    .select({ name: academicYear.name })
    .from(academicYear)
    .where(eq(academicYear.id, sem.academicYearId));
  const { settings, components, kkmResolver } = await loadGradingConfig(tx, sem.id);
  const reportSettings = await loadReportSettings(tx);
  const subjects = await assessedSubjects(tx, sem.id, cls.id, notCountedComponentIds(components));
  const studentIds = [...new Set([...roster.map((s) => s.id), ...extraStudentIds])];
  const grades = await computeGrades(tx, {
    semesterId: sem.id,
    classId: cls.id,
    subjectIds: subjects.map((s) => s.id),
    studentIds,
    components,
    settings,
  });
  const kkmOf = await kkmResolver(tx, {
    levelCode: cls.level,
    programId: cls.programId,
    subjectIds: subjects.map((s) => s.id),
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
    kkmBySubject: new Map(subjects.map((s) => [s.id, kkmOf(s.id)])),
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

/** Mode rapor tingkat kelas: 'descriptive' (Fase A, K10) atau null (numerik; juga bila tingkat belum diatur). */
export type ReportMode = 'descriptive' | null;

/** Bahan bagian v2 untuk seluruh kelas: mode rapor dan deskripsi manual per mapel (2 kueri, tidak bergantung jumlah siswa). */
export interface ReportExtras {
  reportMode: ReportMode;
  /** siswa -> mapel -> deskripsi manual. */
  narratives: Map<string, Map<string, string>>;
}

export async function loadReportExtras(tx: Tx, c: Pick<ClassContext, 'sem' | 'cls'>): Promise<ReportExtras> {
  const [[level], rows] = await Promise.all([
    tx
      .select({ mode: schoolLevel.reportMode })
      .from(schoolLevel)
      .where(eq(schoolLevel.code, c.cls.level))
      .limit(1),
    tx
      .select({
        studentId: reportSubjectNarrative.studentId,
        subjectId: reportSubjectNarrative.subjectId,
        text: reportSubjectNarrative.text,
      })
      .from(reportSubjectNarrative)
      .where(
        and(eq(reportSubjectNarrative.semesterId, c.sem.id), eq(reportSubjectNarrative.classId, c.cls.id)),
      ),
  ]);
  const narratives = new Map<string, Map<string, string>>();
  for (const r of rows) {
    const m = narratives.get(r.studentId) ?? new Map<string, string>();
    m.set(r.subjectId, r.text);
    narratives.set(r.studentId, m);
  }
  return { reportMode: level?.mode === 'descriptive' ? 'descriptive' : null, narratives };
}

/**
 * Kelengkapan satu siswa untuk finalisasi. Mode numerik: mapel yang sudah punya nilai akhir (sama dengan `liveSummary`).
 * Mode deskriptif: mapel yang sudah punya deskripsi manual (nilai akhir tidak dipersyaratkan; angka tetap dihitung dan disimpan).
 */
export function completenessOf(c: ClassContext, extras: ReportExtras, studentId: string) {
  if (extras.reportMode !== 'descriptive') {
    const { subjectsGraded, subjectsTotal } = liveSummary(c, studentId);
    return { subjectsGraded, subjectsTotal };
  }
  const mine = extras.narratives.get(studentId);
  return {
    subjectsGraded: c.subjects.filter((sub) => mine?.has(sub.id)).length,
    subjectsTotal: c.subjects.length,
  };
}

/** Deskripsi kokurikuler dan catatan perkembangan per siswa pada semester itu (satu kueri; `studentIds` kosong = semua). */
export async function loadSectionNotes(tx: Tx, semesterId: string) {
  const rows = await tx
    .select({
      studentId: reportCardSection.studentId,
      cocurricularNote: reportCardSection.cocurricularNote,
      developmentNote: reportCardSection.developmentNote,
    })
    .from(reportCardSection)
    .where(eq(reportCardSection.semesterId, semesterId));
  return new Map(rows.map((r) => [r.studentId, r]));
}

/** Isian bagian v2 satu siswa. Semua opsional: tanpa isian, dokumen persis v1. */
export interface StudentV2Input {
  reportMode?: ReportMode;
  /** mapel -> deskripsi manual siswa ini. */
  narratives?: Map<string, string> | undefined;
  cocurricularNote?: string | null;
  developmentNote?: string | null;
}

/**
 * Dokumen rapor (versi hidup, belum beku) untuk satu siswa dari konteks kelas.
 *
 * Bagian v2 ditulis SPARSE (rancangan 3.3): kunci hanya ada bila dipakai. `reportMode` hanya bila 'descriptive';
 * `cocurricularNote` bila terisi; `developmentNote` hanya di mode deskriptif dan terisi (K11); `descriptionSource: 'manual'`
 * dan `description` dari teks manual bila ada deskripsi manual untuk mapel itu. Di mode deskriptif deskripsi TIDAK jatuh ke
 * teks per predikat (itu membocorkan predikat): tanpa deskripsi manual, `description` = null.
 */
export async function buildDocument(
  tx: Tx,
  c: ClassContext,
  stu: { id: string; name: string; nis: string | null; nisn: string | null },
  homeroomNote: string | null,
  v2: StudentV2Input = {},
): Promise<ReportDocumentV2> {
  const descriptive = v2.reportMode === 'descriptive';
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
      const kkm = c.kkmBySubject.get(sub.id) ?? c.kkm;
      const manual = v2.narratives?.get(sub.id);
      return {
        subjectId: sub.id,
        name: sub.name,
        kkm,
        final,
        predicate,
        description: manual ?? (predicate && !descriptive ? descriptionOf(predicate, d) : null),
        belowKkm: final !== null && final < kkm,
        ...(manual ? { descriptionSource: 'manual' as const } : {}),
      };
    }),
    extracurriculars: ekskul,
    attendance: await attendanceCounts(tx, stu.id, c.sem.startsOn, c.sem.endsOn),
    homeroomNote,
    homeroomTeacher: c.homeroomTeacher,
    principal: d.principalName ? { name: d.principalName, nip: d.principalNip } : null,
    rank: d.showRank ? (c.ranks.get(stu.id) ?? null) : null,
    ...(descriptive ? { reportMode: 'descriptive' as const } : {}),
    ...(v2.cocurricularNote ? { cocurricularNote: v2.cocurricularNote } : {}),
    ...(descriptive && v2.developmentNote ? { developmentNote: v2.developmentNote } : {}),
    generatedAt: new Date().toISOString(),
  };
}
