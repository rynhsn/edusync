import {
  computeGraduationSuggestion,
  GRADUATION_FINAL_CODE,
  type GraduationConfig,
  type GraduationSubjectInput,
  graduationConfigSchema,
  isFinalLevel,
  type ReportDocumentV2,
} from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  classRoom,
  enrollment,
  eq,
  graduationDecision,
  graduationPolicy,
  inArray,
  isNull,
  program,
  promotionDecision,
  reportCard,
  schoolExam,
  schoolExamScore,
  schoolLevel,
  semester,
  student,
  subject,
  type Tx,
} from '@edusync/db';
import { HttpError } from './http-error';

/**
 * Kelulusan (tahap 3C.4): pemuatan data dan perhitungan saran per murid, serta penjaga penetapan final. Nilai rapor HANYA dibaca
 * dari snapshot rapor final (`report_card.snapshot`), tidak pernah dihitung ulang dari data hidup. Jumlah kueri tidak bergantung
 * pada jumlah murid (semua dimuat sekali dan dikelompokkan di memori).
 */

export type PolicyRow = typeof graduationPolicy.$inferSelect;
export type DecisionRow = typeof graduationDecision.$inferSelect;

/**
 * Jalankan beberapa kueri Drizzle (pembangun malas) satu per satu pada koneksi transaksi yang sama: pg tidak menjamin kueri bersamaan
 * pada satu klien (usang di pg 9).
 */
export async function inOrder<T extends readonly PromiseLike<unknown>[]>(
  ...queries: T
): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
  const out: unknown[] = [];
  for (const q of queries) out.push(await q);
  return out as { -readonly [K in keyof T]: Awaited<T[K]> };
}

export const graduationFinalError = () =>
  new HttpError(
    409,
    GRADUATION_FINAL_CODE,
    'Penetapan kelulusan tahun ajaran ini sudah final, jadi kebijakan dan nilai ujian terkunci. Buka kembali penetapan murid yang bersangkutan bila perlu mengubahnya.',
  );

/** Tolak bila ada murid yang kelulusannya sudah final pada tahun ajaran itu. */
export async function assertGraduationNotFinal(tx: Tx, yearId: string) {
  const [hit] = await tx
    .select({ id: graduationDecision.id })
    .from(graduationDecision)
    .where(and(eq(graduationDecision.academicYearId, yearId), eq(graduationDecision.status, 'final')))
    .limit(1);
  if (hit) throw graduationFinalError();
}

/** Kebijakan tahun itu (tingkat sekolah, tanpa program); null = sekolah memakai alur kenaikan lama. */
export async function loadPolicy(tx: Tx, yearId: string): Promise<PolicyRow | null> {
  const [row] = await tx
    .select()
    .from(graduationPolicy)
    .where(and(eq(graduationPolicy.academicYearId, yearId), isNull(graduationPolicy.programId)));
  return row ?? null;
}

/** Isi `config` yang tersimpan, dinormalkan lewat skema (nilai bawaan terisi untuk baris lama). */
export function parseConfig(raw: unknown): GraduationConfig {
  return graduationConfigSchema.parse(raw);
}

/** Hasil keputusan kelulusan final per murid pada tahun itu (hanya yang final), untuk penjaga wizard kenaikan. */
export async function finalResultsOf(tx: Tx, yearId: string, studentIds: string[]) {
  const out = new Map<string, DecisionRow['result']>();
  if (studentIds.length === 0) return out;
  const rows = await tx
    .select({ studentId: graduationDecision.studentId, result: graduationDecision.result })
    .from(graduationDecision)
    .where(
      and(
        eq(graduationDecision.academicYearId, yearId),
        eq(graduationDecision.status, 'final'),
        inArray(graduationDecision.studentId, studentIds),
      ),
    );
  for (const r of rows) out.set(r.studentId, r.result);
  return out;
}

export interface FinalRosterClass {
  id: string;
  name: string;
  level: string;
}

/** Kelas tingkat akhir tahun itu (tingkat akhir jurusan bila diisi, selain itu tingkat dengan `sort` terbesar). */
export async function loadFinalClasses(tx: Tx, yearId: string): Promise<FinalRosterClass[]> {
  const levels = await tx.select({ code: schoolLevel.code, sort: schoolLevel.sort }).from(schoolLevel);
  const programs = new Map(
    (await tx.select({ id: program.id, finalLevelCode: program.finalLevelCode }).from(program)).map((p) => [
      p.id,
      p.finalLevelCode,
    ]),
  );
  const classes = await tx
    .select()
    .from(classRoom)
    .where(eq(classRoom.academicYearId, yearId))
    .orderBy(asc(classRoom.name));
  return classes
    .filter((c) => isFinalLevel(levels, c.level, c.programId ? (programs.get(c.programId) ?? null) : null))
    .map((c) => ({ id: c.id, name: c.name, level: c.level }));
}

export interface RosterStudent {
  studentId: string;
  name: string;
  nis: string | null;
  nisn: string | null;
  status: 'active' | 'graduated' | 'transferred' | 'dropped';
  classId: string;
  className: string;
}

/** Murid aktif atau sudah lulus yang ter-enroll di kelas tingkat akhir tahun itu (terurut kelas lalu nama). */
export async function loadFinalRoster(
  tx: Tx,
  yearId: string,
  classes: readonly FinalRosterClass[],
): Promise<RosterStudent[]> {
  if (classes.length === 0) return [];
  const rows = await tx
    .select({
      studentId: student.id,
      name: student.name,
      nis: student.nis,
      nisn: student.nisn,
      status: student.status,
      classId: enrollment.classId,
    })
    .from(enrollment)
    .innerJoin(student, eq(student.id, enrollment.studentId))
    .where(
      and(
        eq(enrollment.academicYearId, yearId),
        inArray(
          enrollment.classId,
          classes.map((c) => c.id),
        ),
        isNull(student.deletedAt),
        inArray(student.status, ['active', 'graduated']),
      ),
    );
  const names = new Map(classes.map((c) => [c.id, c.name]));
  return rows
    .map((r) => ({ ...r, className: names.get(r.classId) ?? '' }))
    .sort((a, b) => a.className.localeCompare(b.className, 'id') || a.name.localeCompare(b.name, 'id'));
}

/** Satu murid yang diperiksa untuk penetapan: saran angka dan status rapornya. */
export interface StudentScoring {
  suggestion: ReturnType<typeof computeGraduationSuggestion>;
  reportNotFinal: boolean;
  reportSemesters: { semesterId: string; name: string; className: string }[];
}

/**
 * Hitung saran semua `studentIds` sekaligus. Rapor yang dipakai: snapshot rapor FINAL menurut cakupan kebijakan. `reportNotFinal`:
 * ada semester pada tahun kelulusan yang rapornya belum final untuk murid itu (hanya bila bobot rapor > 0 dan cakupan memuat
 * tahun itu).
 */
export async function scoreStudents(
  tx: Tx,
  year: { id: string },
  config: GraduationConfig,
  studentIds: string[],
): Promise<Map<string, StudentScoring>> {
  const out = new Map<string, StudentScoring>();
  if (studentIds.length === 0) return out;

  const [cards, yearSemesters, scores, subjects] = await inOrder(
    tx
      .select({
        studentId: reportCard.studentId,
        semesterId: reportCard.semesterId,
        snapshot: reportCard.snapshot,
        semesterName: semester.name,
        semesterYearId: semester.academicYearId,
        startsOn: semester.startsOn,
        className: classRoom.name,
        level: classRoom.level,
      })
      .from(reportCard)
      .innerJoin(semester, eq(semester.id, reportCard.semesterId))
      .innerJoin(classRoom, eq(classRoom.id, reportCard.classId))
      .where(and(inArray(reportCard.studentId, studentIds), eq(reportCard.status, 'final'))),
    tx.select({ id: semester.id }).from(semester).where(eq(semester.academicYearId, year.id)),
    tx
      .select({
        studentId: schoolExamScore.studentId,
        subjectId: schoolExamScore.subjectId,
        examId: schoolExamScore.examId,
        value: schoolExamScore.value,
      })
      .from(schoolExamScore)
      .innerJoin(schoolExam, eq(schoolExam.id, schoolExamScore.examId))
      .where(and(eq(schoolExam.academicYearId, year.id), inArray(schoolExamScore.studentId, studentIds))),
    tx.select({ id: subject.id, name: subject.name }).from(subject),
  );
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const weightedExams = new Set(Object.entries(config.examWeights).flatMap(([id, w]) => (w > 0 ? [id] : [])));

  const inScope = (c: (typeof cards)[number]) =>
    config.reportScope === 'all_levels'
      ? true
      : config.reportScope === 'final_level'
        ? c.semesterYearId === year.id
        : config.reportLevels.includes(c.level);

  const cardsOf = new Map<string, typeof cards>();
  for (const c of cards) cardsOf.set(c.studentId, [...(cardsOf.get(c.studentId) ?? []), c]);
  const scoresOf = new Map<string, typeof scores>();
  for (const s of scores) scoresOf.set(s.studentId, [...(scoresOf.get(s.studentId) ?? []), s]);

  for (const studentId of studentIds) {
    const all = (cardsOf.get(studentId) ?? []).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    const used = config.reportWeight > 0 ? all.filter(inScope) : [];
    const inputs = new Map<string, GraduationSubjectInput>();
    const ensure = (subjectId: string, name: string) => {
      let s = inputs.get(subjectId);
      if (!s) {
        s = { subjectId, name, reportFinals: [], exams: [] };
        inputs.set(subjectId, s);
      }
      return s;
    };
    for (const c of used) {
      for (const sub of (c.snapshot as ReportDocumentV2 | null)?.subjects ?? []) {
        ensure(sub.subjectId, sub.name).reportFinals.push(sub.final);
      }
    }
    for (const s of scoresOf.get(studentId) ?? []) {
      if (!weightedExams.has(s.examId)) continue;
      ensure(s.subjectId, subjectName.get(s.subjectId) ?? '').exams.push({
        examId: s.examId,
        value: s.value,
      });
    }
    const finalYearCards = new Set(all.filter((c) => c.semesterYearId === year.id).map((c) => c.semesterId));
    const coversYear =
      config.reportScope !== 'levels' ||
      all.some((c) => c.semesterYearId === year.id && config.reportLevels.includes(c.level)) ||
      yearSemesters.length === 0;
    const reportNotFinal =
      config.reportWeight > 0 &&
      coversYear &&
      (yearSemesters.length === 0 || yearSemesters.some((s) => !finalYearCards.has(s.id)));
    out.set(studentId, {
      suggestion: computeGraduationSuggestion(
        config,
        [...inputs.values()].sort((a, b) => a.name.localeCompare(b.name, 'id')),
      ),
      reportNotFinal,
      reportSemesters: used.map((c) => ({
        semesterId: c.semesterId,
        name: c.semesterName,
        className: c.className,
      })),
    });
  }
  return out;
}

/** Ringkasan kebijakan yang dibekukan ke transkrip (nama ujian ikut dibekukan). */
export async function policySnapshot(tx: Tx, yearId: string, config: GraduationConfig) {
  const exams = await tx
    .select({ id: schoolExam.id, name: schoolExam.name })
    .from(schoolExam)
    .where(eq(schoolExam.academicYearId, yearId));
  return {
    reportWeight: config.reportWeight,
    examWeights: exams
      .filter((e) => (config.examWeights[e.id] ?? 0) > 0)
      .map((e) => ({ examId: e.id, name: e.name, weight: config.examWeights[e.id] as number })),
    reportScope: config.reportScope,
    reportLevels: config.reportLevels,
    rounding: config.rounding,
    minAverage: config.minAverage,
    minSubjectScore: config.minSubjectScore,
    requiredSubjectIds: config.requiredSubjectIds,
    criteriaText: config.criteriaText ?? null,
  };
}

export async function loadYear(tx: Tx, id: string) {
  const [row] = await tx.select().from(academicYear).where(eq(academicYear.id, id));
  if (!row) throw new HttpError(404, 'not_found', 'Tahun ajaran tidak ditemukan.');
  return row;
}

/** Murid yang keputusan kenaikannya pada tahun itu sudah diterapkan (penjaga buka kembali). */
export async function appliedPromotionOf(tx: Tx, yearId: string, studentIds: string[]) {
  if (studentIds.length === 0) return new Set<string>();
  const rows = await tx
    .select({ studentId: promotionDecision.studentId, appliedAt: promotionDecision.appliedAt })
    .from(promotionDecision)
    .where(
      and(eq(promotionDecision.academicYearId, yearId), inArray(promotionDecision.studentId, studentIds)),
    );
  return new Set(rows.filter((r) => r.appliedAt !== null).map((r) => r.studentId));
}

/* ---------- Daftar penetapan ---------- */

export interface GraduationListStudent extends RosterStudent {
  scoring: StudentScoring;
  decision: DecisionRow | null;
  promotionApplied: boolean;
}

/**
 * Seluruh murid kelas tingkat akhir tahun itu dengan saran angka dan keputusan tersimpan. Jumlah kueri tetap (tidak bergantung
 * jumlah murid atau mapel): kelas, murid, keputusan, keputusan kenaikan, rapor final, nilai ujian, mapel.
 */
export async function buildGraduationList(
  tx: Tx,
  year: { id: string },
  config: GraduationConfig,
  filter: { classId?: string | undefined } = {},
) {
  const allClasses = await loadFinalClasses(tx, year.id);
  const classes = filter.classId ? allClasses.filter((c) => c.id === filter.classId) : allClasses;
  const roster = await loadFinalRoster(tx, year.id, classes);
  const ids = roster.map((r) => r.studentId);
  const decisions = ids.length
    ? await tx
        .select()
        .from(graduationDecision)
        .where(
          and(eq(graduationDecision.academicYearId, year.id), inArray(graduationDecision.studentId, ids)),
        )
    : [];
  const applied = await appliedPromotionOf(tx, year.id, ids);
  const scoring = await scoreStudents(tx, year, config, ids);
  const decisionOf = new Map(decisions.map((d) => [d.studentId, d]));
  const students: GraduationListStudent[] = roster.map((r) => ({
    ...r,
    scoring: scoring.get(r.studentId) as StudentScoring,
    decision: decisionOf.get(r.studentId) ?? null,
    promotionApplied: applied.has(r.studentId),
  }));
  return { classes, students };
}
