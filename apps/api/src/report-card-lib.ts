import {
  averageOfFinals,
  DEFAULT_NARRATIVE_MAX_ITEMS,
  DEFAULT_PREDICATE_DESCRIPTIONS,
  descriptionOf,
  type ObjectiveNarrative,
  type ReportCocurricular,
  type ReportDocument,
  type ReportDocumentV2,
  type ReportExpertise,
  type ReportSubjectGroup,
  rankPositions,
} from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  classRoom,
  cocurricularAssessment,
  cocurricularProgram,
  cocurricularProgramClass,
  cocurricularRubricLevel,
  count,
  dailyAttendance,
  eq,
  extracurricular,
  extracurricularAssessment,
  gte,
  inArray,
  isNull,
  lte,
  or,
  programConcentration,
  refSubjectGroup,
  reportCardSection,
  reportSetting,
  reportSubjectNarrative,
  school,
  schoolIdentifier,
  schoolLevel,
  schoolProfileItem,
  semester,
  subject,
  type Tx,
  teacher,
  vocationalConcentration,
  vocationalField,
  vocationalProgram,
  vocationalSetting,
} from '@edusync/db';
import { type EffectiveGradingConfig, loadGradingConfig, remedialContextFor } from './grading-config-lib';
import { assessedSubjects, computeGrades, notCountedComponentIds, type StudentGrade } from './grading-lib';
import { HttpError } from './http-error';
import { isNarrativeStale, loadObjectiveNarratives, type ObjectiveNarratives } from './report-narrative-lib';
import { semesterRosterOf } from './student-mobility-lib';
import { type SubjectTakers, takersOf, takes } from './subject-roster-lib';

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
  /** Narasi dari TP (3.4): TP per sisi tinggi/rendah, 1..5, bawaan 2. */
  narrativeMaxItems: number;
  /** Templat kalimat narasi memuat `{tp}`; null = templat bawaan di kontrak. */
  narrativeHighTemplate: string | null;
  narrativeLowTemplate: string | null;
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
  narrativeMaxItems: DEFAULT_NARRATIVE_MAX_ITEMS,
  narrativeHighTemplate: null,
  narrativeLowTemplate: null,
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
    narrativeMaxItems: s.narrativeMaxItems,
    narrativeHighTemplate: s.narrativeHighTemplate,
    narrativeLowTemplate: s.narrativeLowTemplate,
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
  /** NSM madrasah (4.5); null bila belum diisi, sehingga dokumen tidak memuat `schoolNsm`. */
  schoolNsm: string | null;
  reportSettings: ReportSettings;
  /** Konfigurasi nilai efektif semester (salinan beku bila ada); dipakai ketercapaian TP untuk narasi. */
  cfg: EffectiveGradingConfig;
  /** KKM sekolah (`grading_setting.kkm`); KKM tiap mapel ada di `kkmBySubject`. */
  kkm: number;
  /** KKM efektif per mapel (KKTP berjenjang, jatuh ke `kkm` bila tak ada kriteria). */
  kkmBySubject: Map<string, number>;
  /**
   * Bahan rapor SMK (5.2): null bila sekolah tidak menyalakan `vocational_setting.report_grouped` (dokumen persis seperti sebelumnya).
   * `groups` = kelompok mapel beku per mapel (urutan `ref_subject_group.sort`); `expertise` null bila jurusan rombel belum ditautkan.
   */
  vocational: {
    expertise: ReportExpertise | null;
    groups: Map<string, ReportSubjectGroup & { sort: number }>;
  } | null;
  /** Mapel kelas yang dinilai pada semester itu; mapel yang dipilih per murid disaring lewat `subjectsOf`. */
  subjects: { id: string; name: string }[];
  /** Pengambil per mapel berpenanda partisipasi (3B.2); `null` = tidak ada mapel pilihan, semua murid mengambil semua mapel. */
  takers: SubjectTakers | null;
  roster: { id: string; name: string; nis: string | null }[];
  /** Nilai per mapel per murid; murid yang tidak mengambil mapel itu tidak ada di petanya. */
  grades: Map<string, Map<string, StudentGrade>>;
  homeroomTeacher: { name: string; nip: string | null } | null;
  /** Rata-rata nilai akhir mapel tiap siswa (null bila belum ada nilai). */
  averages: Map<string, number | null>;
  ranks: Map<string, { position: number; of: number }>;
}

/**
 * Hitung nilai seluruh siswa kelas. Rumus nilai akhir dan predikat sama dengan rekap penilaian (`computeGrades`).
 * Roster memakai `semesterRosterOf`: `historicalRosterOf` (aktif dan lulusan yang terdaftar di tahun kelas ini) ditambah murid yang
 * keluar setelah semester berakhir dan diluruskan menurut riwayat rombel (sama persis bila tidak ada mutasi atau perpindahan).
 * `extraStudentIds` menambahkan siswa di luar roster itu (mis. siswa pindah yang kini nonaktif) agar nilainya ikut dihitung.
 */
/**
 * Mapel rapor satu murid: mapel kelas yang ia ambil (tahap 3B.2). Tanpa mapel pilihan (`takers` null) persis `c.subjects`, jadi
 * dokumen, ringkasan, kelengkapan finalisasi, rata-rata, dan peringkat sekolah lama tidak berubah.
 */
export function subjectsOf(c: Pick<ClassContext, 'subjects' | 'takers'>, studentId: string) {
  return c.takers === null ? c.subjects : c.subjects.filter((sub) => takes(c.takers, sub.id, studentId));
}

/**
 * Kelompok mapel beku dan identitas keahlian untuk rapor SMK (tahap 5.2); hanya dipanggil bila sakelar menyala. Dua kueri tetap
 * tanpa memandang jumlah murid. Mapel tanpa kelompok tidak ada di peta; label Indonesia dibekukan di dokumen.
 */
async function loadVocationalReport(tx: Tx, programId: string | null, subjectIds: string[]) {
  const groupRows = subjectIds.length
    ? await tx
        .select({
          subjectId: subject.id,
          key: refSubjectGroup.key,
          label: refSubjectGroup.labelId,
          section: refSubjectGroup.reportSection,
          sort: refSubjectGroup.sort,
        })
        .from(subject)
        .innerJoin(refSubjectGroup, eq(refSubjectGroup.key, subject.subjectGroup))
        .where(inArray(subject.id, subjectIds))
    : [];
  const groups = new Map(
    groupRows.map(({ subjectId, ...g }) => [subjectId, g] as [string, ReportSubjectGroup & { sort: number }]),
  );
  let expertise: ReportExpertise | null = null;
  if (programId) {
    const [e] = await tx
      .select({
        field: vocationalField.name,
        program: vocationalProgram.name,
        concentration: vocationalConcentration.name,
      })
      .from(programConcentration)
      .innerJoin(
        vocationalConcentration,
        eq(vocationalConcentration.id, programConcentration.concentrationId),
      )
      .innerJoin(vocationalProgram, eq(vocationalProgram.id, vocationalConcentration.vocationalProgramId))
      .innerJoin(vocationalField, eq(vocationalField.id, vocationalProgram.fieldId))
      .where(eq(programConcentration.programId, programId));
    expertise = e ?? null;
  }
  return { expertise, groups };
}

export async function loadClassContext(
  tx: Tx,
  sem: SemesterRow,
  clsInput: ClassRow,
  extraStudentIds: string[] = [],
): Promise<ClassContext> {
  const { cls, rows: roster } = await semesterRosterOf(tx, clsInput.id, sem);
  // Satu kueri untuk nama sekolah dan sakelar kejuruan (jumlah kueri konteks tidak bertambah).
  const [sch] = await tx
    .select({ name: school.name, reportGrouped: vocationalSetting.reportGrouped })
    .from(school)
    .leftJoin(vocationalSetting, eq(vocationalSetting.schoolId, school.id));
  const [ident] = await tx.select({ nsm: schoolIdentifier.nsm }).from(schoolIdentifier);
  const [year] = await tx
    .select({ name: academicYear.name })
    .from(academicYear)
    .where(eq(academicYear.id, sem.academicYearId));
  const cfg = await loadGradingConfig(tx, sem.id);
  const { settings, components, kkmResolver } = cfg;
  const reportSettings = await loadReportSettings(tx);
  const subjects = await assessedSubjects(tx, sem.id, cls.id, notCountedComponentIds(components));
  const studentIds = [...new Set([...roster.map((s) => s.id), ...extraStudentIds])];
  // Satu kueri batch (dua bila ada mapel pilihan) tanpa memandang jumlah murid; sekolah tanpa penanda mendapat null.
  const takers = await takersOf(tx, {
    classId: cls.id,
    semesterId: sem.id,
    subjectIds: subjects.map((s) => s.id),
    academicYearId: cls.academicYearId,
  });
  const grades = await computeGrades(tx, {
    semesterId: sem.id,
    classId: cls.id,
    subjectIds: subjects.map((s) => s.id),
    studentIds,
    components,
    settings,
    takers,
    // Nilai efektif remedial menurut kebijakan semester (undefined = record_only: tanpa kueri tambahan, hasil identik).
    remedial: await remedialContextFor(tx, cfg, { classId: cls.id, subjectIds: subjects.map((s) => s.id) }),
  });
  const vocational = sch?.reportGrouped
    ? await loadVocationalReport(
        tx,
        cls.programId,
        subjects.map((s) => s.id),
      )
    : null;
  const kkmOf = await kkmResolver(tx, {
    levelCode: cls.level,
    programId: cls.programId,
    subjectIds: subjects.map((s) => s.id),
  });
  const averages = new Map(
    studentIds.map((id) => [
      id,
      averageOfFinals(
        subjectsOf({ subjects, takers }, id).map((sub) => grades.get(sub.id)?.get(id)?.final ?? null),
      ),
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
    schoolNsm: ident?.nsm ?? null,
    vocational,
    reportSettings,
    cfg,
    kkm: settings.kkm,
    kkmBySubject: new Map(subjects.map((s) => [s.id, kkmOf(s.id)])),
    subjects,
    takers,
    roster,
    grades,
    homeroomTeacher,
    averages,
    ranks,
  };
}

/** Ringkasan nilai satu siswa (versi hidup) untuk daftar rapor. */
export function liveSummary(c: ClassContext, studentId: string) {
  const finals = subjectsOf(c, studentId).map((sub) => c.grades.get(sub.id)?.get(studentId)?.final ?? null);
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

/**
 * Bahan bagian v2 untuk seluruh kelas: mode rapor, deskripsi manual per mapel, dan narasi otomatis dari TP. Jumlah kueri tidak
 * bergantung pada jumlah siswa (lihat `loadObjectiveNarratives`).
 */
export interface ReportExtras {
  reportMode: ReportMode;
  /** siswa -> mapel -> deskripsi manual. */
  narratives: Map<string, Map<string, string>>;
  /** siswa -> mapel -> sidik teks otomatis saat deskripsi manual disunting (null = suntingan tahap 3.2, tanpa sidik). */
  narrativeHashes: Map<string, Map<string, string | null>>;
  /** siswa -> mapel -> narasi otomatis dari TP (hanya (siswa, mapel) yang punya TP berstatus). */
  objectives: ObjectiveNarratives;
}

/** `extraStudentIds`: siswa di luar roster (mis. pindah) yang dokumennya ikut dibuat. */
export async function loadReportExtras(
  tx: Tx,
  c: Pick<ClassContext, 'sem' | 'cls' | 'subjects' | 'takers' | 'roster' | 'reportSettings' | 'cfg'>,
  extraStudentIds: string[] = [],
): Promise<ReportExtras> {
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
        generatedHash: reportSubjectNarrative.generatedHash,
      })
      .from(reportSubjectNarrative)
      .where(
        and(eq(reportSubjectNarrative.semesterId, c.sem.id), eq(reportSubjectNarrative.classId, c.cls.id)),
      ),
  ]);
  const narratives = new Map<string, Map<string, string>>();
  const narrativeHashes = new Map<string, Map<string, string | null>>();
  for (const r of rows) {
    const m = narratives.get(r.studentId) ?? new Map<string, string>();
    m.set(r.subjectId, r.text);
    narratives.set(r.studentId, m);
    const h = narrativeHashes.get(r.studentId) ?? new Map<string, string | null>();
    h.set(r.subjectId, r.generatedHash);
    narrativeHashes.set(r.studentId, h);
  }
  const studentIds = [...new Set([...c.roster.map((s) => s.id), ...extraStudentIds])];
  const objectives = await loadObjectiveNarratives(tx, c, studentIds, c.reportSettings);
  return {
    reportMode: level?.mode === 'descriptive' ? 'descriptive' : null,
    narratives,
    narrativeHashes,
    objectives,
  };
}

/**
 * Deskripsi otomatis satu (siswa, mapel): dari TP bila siswa punya TP berstatus di mapel itu; selain itu menurut predikat (v1);
 * di mode deskriptif tanpa TP null (teks per predikat membocorkan predikat).
 */
export function autoDescriptionOf(
  c: Pick<ClassContext, 'grades' | 'reportSettings'>,
  extras: Pick<ReportExtras, 'reportMode' | 'objectives'>,
  studentId: string,
  subjectId: string,
): { text: string | null; source: 'objectives' | 'predicate' | null } {
  const fromObjectives = extras.objectives.get(studentId)?.get(subjectId);
  if (fromObjectives) return { text: fromObjectives.text, source: 'objectives' };
  const predicate = c.grades.get(subjectId)?.get(studentId)?.predicate ?? null;
  if (predicate && extras.reportMode !== 'descriptive') {
    return { text: descriptionOf(predicate, c.reportSettings), source: 'predicate' };
  }
  return { text: null, source: null };
}

/** Jumlah deskripsi manual yang usang (teks otomatis berubah sejak disunting) pada siswa-siswa itu (R7). */
export function countStaleNarratives(
  c: Pick<ClassContext, 'grades' | 'reportSettings' | 'subjects' | 'takers'>,
  extras: ReportExtras,
  studentIds: readonly string[],
): number {
  let n = 0;
  for (const studentId of studentIds) {
    const hashes = extras.narrativeHashes.get(studentId);
    if (!hashes) continue;
    for (const sub of subjectsOf(c, studentId)) {
      if (!hashes.has(sub.id)) continue;
      if (isNarrativeStale(hashes.get(sub.id), autoDescriptionOf(c, extras, studentId, sub.id).text)) n += 1;
    }
  }
  return n;
}

/**
 * Kelengkapan satu siswa untuk finalisasi. Mode numerik: mapel yang sudah punya nilai akhir (sama dengan `liveSummary`).
 * Mode deskriptif: mapel yang sudah punya deskripsi, manual atau otomatis dari TP (nilai akhir tidak dipersyaratkan; angka tetap
 * dihitung dan disimpan).
 */
export function completenessOf(c: ClassContext, extras: ReportExtras, studentId: string) {
  if (extras.reportMode !== 'descriptive') {
    const { subjectsGraded, subjectsTotal } = liveSummary(c, studentId);
    return { subjectsGraded, subjectsTotal };
  }
  const mine = extras.narratives.get(studentId);
  const auto = extras.objectives.get(studentId);
  const own = subjectsOf(c, studentId);
  return {
    subjectsGraded: own.filter((sub) => mine?.has(sub.id) || auto?.has(sub.id)).length,
    subjectsTotal: own.length,
  };
}

/**
 * Penilaian kokurikuler terstruktur per murid pada semester itu (tahap 4.4; satu kueri, tanpa N+1). Hanya program
 * `show_in_report`; murid tanpa penilaian tidak ada di peta (dokumennya persis seperti sebelumnya). Label dibaca saat ini
 * lalu dibekukan di snapshot.
 */
export async function loadCocurricular(tx: Tx, semesterId: string) {
  const rows = await tx
    .select({
      studentId: cocurricularAssessment.studentId,
      programId: cocurricularProgram.id,
      title: cocurricularProgram.title,
      form: cocurricularProgram.form,
      framework: schoolProfileItem.frameworkKey,
      itemSort: schoolProfileItem.sort,
      code: schoolProfileItem.code,
      label: schoolProfileItem.label,
      levelCode: cocurricularRubricLevel.code,
      levelLabel: cocurricularRubricLevel.label,
      note: cocurricularAssessment.note,
    })
    .from(cocurricularAssessment)
    .innerJoin(cocurricularProgram, eq(cocurricularProgram.id, cocurricularAssessment.programId))
    .innerJoin(schoolProfileItem, eq(schoolProfileItem.id, cocurricularAssessment.profileItemId))
    .leftJoin(cocurricularRubricLevel, eq(cocurricularRubricLevel.id, cocurricularAssessment.rubricLevelId))
    .where(and(eq(cocurricularAssessment.semesterId, semesterId), eq(cocurricularProgram.showInReport, true)))
    .orderBy(
      asc(cocurricularProgram.title),
      asc(cocurricularProgram.id),
      asc(schoolProfileItem.frameworkKey),
      asc(schoolProfileItem.sort),
      asc(schoolProfileItem.code),
    );
  const byStudent = new Map<string, ReportCocurricular>();
  for (const r of rows) {
    const programs = byStudent.get(r.studentId) ?? [];
    byStudent.set(r.studentId, programs);
    let program = programs.find((p) => p.programId === r.programId);
    if (!program) {
      program = { programId: r.programId, title: r.title, form: r.form, items: [] };
      programs.push(program);
    }
    program.items.push({
      code: r.code,
      label: r.label,
      framework: r.framework,
      level:
        r.levelCode !== null && r.levelLabel !== null ? { code: r.levelCode, label: r.levelLabel } : null,
      ...(r.note ? { note: r.note } : {}),
    });
  }
  return byStudent;
}

/**
 * Murid kelas ini yang belum punya penilaian kokurikuler padahal rombelnya ikut program aktif yang tampil di rapor pada semester
 * itu. Hanya lencana info di daftar rapor: TIDAK memengaruhi kelengkapan atau finalisasi. Tanpa program berlaku, selalu kosong.
 */
export async function cocurricularMissing(
  tx: Tx,
  sem: { id: string; academicYearId: string },
  classId: string,
  studentIds: string[],
): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set();
  const [program] = await tx
    .select({ id: cocurricularProgram.id })
    .from(cocurricularProgram)
    .innerJoin(cocurricularProgramClass, eq(cocurricularProgramClass.programId, cocurricularProgram.id))
    .where(
      and(
        eq(cocurricularProgramClass.classId, classId),
        eq(cocurricularProgram.academicYearId, sem.academicYearId),
        eq(cocurricularProgram.status, 'active'),
        eq(cocurricularProgram.showInReport, true),
        or(isNull(cocurricularProgram.semesterId), eq(cocurricularProgram.semesterId, sem.id)),
      ),
    )
    .limit(1);
  if (!program) return new Set();
  const assessed = await tx
    .selectDistinct({ studentId: cocurricularAssessment.studentId })
    .from(cocurricularAssessment)
    .where(
      and(
        eq(cocurricularAssessment.semesterId, sem.id),
        inArray(cocurricularAssessment.studentId, studentIds),
      ),
    );
  const done = new Set(assessed.map((r) => r.studentId));
  return new Set(studentIds.filter((id) => !done.has(id)));
}

/**
 * Deskripsi kokurikuler, catatan perkembangan, dan penilaian kokurikuler terstruktur per siswa pada semester itu. Hasilnya
 * disebar ke `StudentV2Input`: `cocurricular` hanya ada bagi murid yang punya penilaian.
 */
export async function loadSectionNotes(tx: Tx, semesterId: string) {
  const [rows, structured] = await Promise.all([
    tx
      .select({
        studentId: reportCardSection.studentId,
        cocurricularNote: reportCardSection.cocurricularNote,
        developmentNote: reportCardSection.developmentNote,
      })
      .from(reportCardSection)
      .where(eq(reportCardSection.semesterId, semesterId)),
    loadCocurricular(tx, semesterId),
  ]);
  const out = new Map<string, StudentV2Sections>(rows.map((r) => [r.studentId, r]));
  for (const [studentId, cocurricular] of structured) {
    out.set(studentId, { ...out.get(studentId), cocurricular });
  }
  return out;
}

type StudentV2Sections = Pick<StudentV2Input, 'cocurricularNote' | 'developmentNote' | 'cocurricular'>;

/** Isian bagian v2 satu siswa. Semua opsional: tanpa isian, dokumen persis v1. */
export interface StudentV2Input {
  reportMode?: ReportMode;
  /** mapel -> deskripsi manual siswa ini. */
  narratives?: Map<string, string> | undefined;
  /** mapel -> narasi otomatis dari TP siswa ini (hanya mapel yang punya TP berstatus). */
  objectives?: Map<string, ObjectiveNarrative> | undefined;
  cocurricularNote?: string | null;
  /** Penilaian kokurikuler terstruktur (4.4); absen/kosong = kunci tidak ditulis. */
  cocurricular?: ReportCocurricular | undefined;
  developmentNote?: string | null;
}

/**
 * Dokumen rapor (versi hidup, belum beku) untuk satu siswa dari konteks kelas.
 *
 * Bagian v2 ditulis SPARSE (rancangan 3.3): kunci hanya ada bila dipakai. `reportMode` hanya bila 'descriptive';
 * `cocurricularNote` bila terisi; `developmentNote` hanya di mode deskriptif dan terisi (K11); `descriptionSource: 'manual'`
 * dan `description` dari teks manual bila ada deskripsi manual untuk mapel itu; selain itu bila siswa punya TP berstatus di mapel
 * itu (3.4) `descriptionSource: 'objectives'`, `description` dari narasi TP, dan `objectives` {assessed, achieved, high, low}.
 * Di mode deskriptif deskripsi TIDAK jatuh ke teks per predikat (itu membocorkan predikat): tanpa deskripsi manual atau TP,
 * `description` = null.
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
    // Rapor SMK berkelompok: mapel diurut per kelompok (urutan acuan; stabil, mapel tanpa kelompok di akhir).
    subjects: (c.vocational
      ? [...subjectsOf(c, stu.id)].sort(
          (a, b) =>
            (c.vocational?.groups.get(a.id)?.sort ?? Number.MAX_SAFE_INTEGER) -
            (c.vocational?.groups.get(b.id)?.sort ?? Number.MAX_SAFE_INTEGER),
        )
      : subjectsOf(c, stu.id)
    ).map((sub) => {
      const g = c.grades.get(sub.id)?.get(stu.id);
      const group = c.vocational?.groups.get(sub.id);
      const final = g?.final ?? null;
      const predicate = g?.predicate ?? null;
      const kkm = c.kkmBySubject.get(sub.id) ?? c.kkm;
      const manual = v2.narratives?.get(sub.id);
      const obj = v2.objectives?.get(sub.id);
      return {
        subjectId: sub.id,
        name: sub.name,
        kkm,
        final,
        predicate,
        // Manual > otomatis dari TP > per predikat (v1). Tanpa TP berstatus, teksnya persis v1.
        description: manual ?? obj?.text ?? (predicate && !descriptive ? descriptionOf(predicate, d) : null),
        belowKkm: final !== null && final < kkm,
        ...(group ? { group: { key: group.key, label: group.label, section: group.section } } : {}),
        ...(manual
          ? { descriptionSource: 'manual' as const }
          : obj
            ? { descriptionSource: 'objectives' as const }
            : {}),
        ...(obj
          ? { objectives: { assessed: obj.assessed, achieved: obj.achieved, high: obj.high, low: obj.low } }
          : {}),
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
    ...(v2.cocurricular?.length ? { cocurricular: v2.cocurricular } : {}),
    ...(c.schoolNsm ? { schoolNsm: c.schoolNsm } : {}),
    ...(c.vocational?.expertise ? { expertise: c.vocational.expertise } : {}),
    ...(descriptive && v2.developmentNote ? { developmentNote: v2.developmentNote } : {}),
    generatedAt: new Date().toISOString(),
  };
}
