import {
  EXPORT_SEMESTER_DATASETS,
  type ExportDataset,
  exportColumnKeys,
  type ReportDocumentV2,
} from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  classRoom,
  classSubjectParticipation,
  curriculumSubjectAllocation,
  enrollment,
  eq,
  inArray,
  isNull,
  or,
  program,
  refSubject,
  reportCard,
  school,
  semester,
  student,
  studentSubjectEnrollment,
  subject,
  type Tx,
  teacher,
  teachingAssignment,
} from '@edusync/db';
import { HttpError } from './http-error';

/**
 * Ekspor akademik generik (tahap 3C.5), format `edusync-academic-v1`. BUKAN format impor e-Rapor/Dapodik/EMIS. Nilai dan deskripsi
 * HANYA dibaca dari snapshot rapor final (`report_card.snapshot`, status `final`); draf tidak pernah ikut. NIK tidak pernah menjadi
 * kolom. Jumlah kueri tidak bergantung pada jumlah murid (semua dimuat sekali dan dikelompokkan di memori).
 */

export type Cell = string | number | boolean | null;
export type ExportRow = Record<string, Cell>;

const collator = new Intl.Collator('id');
const byText = (a: string, b: string) => collator.compare(a, b);

/** Cell yang diawali karakter rumus spreadsheet diberi apostrof di depan agar tidak dieksekusi Excel (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: Cell): string {
  if (value === null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** CSV UTF-8 dengan BOM, pemisah `;`, baris diakhiri CRLF, header = kunci kolom dataset (urutan tetap). */
export function toCsv(dataset: ExportDataset, rows: readonly ExportRow[]): string {
  const keys = exportColumnKeys(dataset);
  const lines = [keys.join(';'), ...rows.map((r) => keys.map((k) => csvCell(r[k] ?? null)).join(';'))];
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Potong ke kolom dataset (kunci di luar kamus tidak pernah keluar) dan urutkan kunci sesuai kamus. */
function shape(dataset: ExportDataset, rows: readonly ExportRow[]): ExportRow[] {
  const keys = exportColumnKeys(dataset);
  return rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k] ?? null])));
}

export interface ExportInput {
  academicYearId: string;
  semesterId?: string | undefined;
  dataset: ExportDataset;
}

export interface ExportResult {
  yearName: string;
  semesterName: string | null;
  rows: ExportRow[];
}

const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);

/** Susun satu dataset. Pemanggil memeriksa izin dan modul lebih dulu. */
export async function buildExport(tx: Tx, input: ExportInput): Promise<ExportResult> {
  const [year] = await tx
    .select({ id: academicYear.id, name: academicYear.name })
    .from(academicYear)
    .where(eq(academicYear.id, input.academicYearId));
  if (!year) throw invalidRef('Tahun ajaran tidak ditemukan.');

  let sem: { id: string; name: string } | null = null;
  if (input.semesterId) {
    const [row] = await tx
      .select({ id: semester.id, name: semester.name, academicYearId: semester.academicYearId })
      .from(semester)
      .where(eq(semester.id, input.semesterId));
    if (!row || row.academicYearId !== year.id) {
      throw invalidRef('Semester tidak ditemukan pada tahun ajaran itu.');
    }
    sem = { id: row.id, name: row.name };
  }
  if (EXPORT_SEMESTER_DATASETS.includes(input.dataset) && !sem) {
    throw invalidRef('Dataset ini memerlukan semester.');
  }

  const [sch] = await tx.select({ npsn: school.npsn }).from(school);
  const base = { school_npsn: sch?.npsn ?? null, academic_year: year.name };
  const ctx = { year, sem, base };

  let rows: ExportRow[];
  switch (input.dataset) {
    case 'rombel':
      rows = await rombelRows(tx, ctx);
      break;
    case 'class_subjects':
      rows = await classSubjectRows(tx, ctx);
      break;
    case 'subject_choices':
      rows = await subjectChoiceRows(tx, ctx);
      break;
    case 'final_grades':
    case 'descriptions':
      rows = await snapshotRows(tx, ctx, input.dataset);
      break;
  }
  return { yearName: year.name, semesterName: sem?.name ?? null, rows: shape(input.dataset, rows) };
}

interface Ctx {
  year: { id: string; name: string };
  sem: { id: string; name: string } | null;
  base: { school_npsn: string | null; academic_year: string };
}

/** Kode mapel acuan per mapel sekolah (kosong bila mapel buatan sekolah). */
async function refCodes(tx: Tx, subjectIds: string[]) {
  const out = new Map<string, string>();
  if (subjectIds.length === 0) return out;
  const rows = await tx
    .select({ id: subject.id, code: refSubject.code })
    .from(subject)
    .innerJoin(refSubject, eq(refSubject.id, subject.refSubjectId))
    .where(inArray(subject.id, subjectIds));
  for (const r of rows) out.set(r.id, r.code);
  return out;
}

async function classesOf(tx: Tx, yearId: string) {
  const classes = await tx.select().from(classRoom).where(eq(classRoom.academicYearId, yearId));
  const programIds = [...new Set(classes.map((c) => c.programId).filter((x): x is string => !!x))];
  const programs = new Map(
    (programIds.length ? await tx.select().from(program).where(inArray(program.id, programIds)) : []).map(
      (p) => [p.id, p],
    ),
  );
  return { classes, programs };
}

async function rombelRows(tx: Tx, c: Ctx): Promise<ExportRow[]> {
  const { classes, programs } = await classesOf(tx, c.year.id);
  const teacherIds = [...new Set(classes.map((k) => k.homeroomTeacherId).filter((x): x is string => !!x))];
  const teachers = new Map(
    (teacherIds.length
      ? await tx
          .select({ id: teacher.id, name: teacher.name, nip: teacher.nip })
          .from(teacher)
          .where(inArray(teacher.id, teacherIds))
      : []
    ).map((t) => [t.id, t]),
  );
  const members = await tx
    .select({
      classId: enrollment.classId,
      nisn: student.nisn,
      nis: student.nis,
      name: student.name,
      gender: student.gender,
      birthDate: student.birthDate,
      status: student.status,
    })
    .from(enrollment)
    .innerJoin(student, eq(student.id, enrollment.studentId))
    .where(and(eq(enrollment.academicYearId, c.year.id), isNull(student.deletedAt)))
    .orderBy(asc(student.name));
  const byClass = new Map<string, typeof members>();
  for (const m of members) byClass.set(m.classId, [...(byClass.get(m.classId) ?? []), m]);

  const rows: ExportRow[] = [];
  for (const k of [...classes].sort((a, b) => byText(a.name, b.name))) {
    const prog = k.programId ? programs.get(k.programId) : undefined;
    const homeroom = k.homeroomTeacherId ? teachers.get(k.homeroomTeacherId) : undefined;
    for (const m of (byClass.get(k.id) ?? []).sort((a, b) => byText(a.name, b.name))) {
      rows.push({
        ...c.base,
        class_name: k.name,
        level: k.level,
        program_code: prog?.code ?? null,
        program_name: prog?.name ?? null,
        homeroom_teacher: homeroom?.name ?? null,
        homeroom_teacher_nip: homeroom?.nip ?? null,
        student_nisn: m.nisn,
        student_nis: m.nis,
        student_name: m.name,
        gender: m.gender,
        birth_date: m.birthDate,
        student_status: m.status,
      });
    }
  }
  return rows;
}

async function classSubjectRows(tx: Tx, c: Ctx): Promise<ExportRow[]> {
  const { classes, programs } = await classesOf(tx, c.year.id);
  if (classes.length === 0) return [];
  const classIds = classes.map((k) => k.id);
  const assignments = await tx
    .select()
    .from(teachingAssignment)
    .where(inArray(teachingAssignment.classId, classIds));
  const subjectIds = [...new Set(assignments.map((a) => a.subjectId))];
  const teacherIds = [...new Set(assignments.map((a) => a.teacherId))];
  const subjects = new Map(
    (subjectIds.length ? await tx.select().from(subject).where(inArray(subject.id, subjectIds)) : []).map(
      (s) => [s.id, s],
    ),
  );
  const teachers = new Map(
    (teacherIds.length
      ? await tx
          .select({ id: teacher.id, name: teacher.name, nip: teacher.nip })
          .from(teacher)
          .where(inArray(teacher.id, teacherIds))
      : []
    ).map((t) => [t.id, t]),
  );
  const refs = await refCodes(tx, subjectIds);
  const allocations = await tx
    .select()
    .from(curriculumSubjectAllocation)
    .where(eq(curriculumSubjectAllocation.academicYearId, c.year.id));
  const selected = new Set(
    (
      await tx
        .select({
          classId: classSubjectParticipation.classId,
          subjectId: classSubjectParticipation.subjectId,
        })
        .from(classSubjectParticipation)
        .where(inArray(classSubjectParticipation.classId, classIds))
    ).map((p) => `${p.classId}:${p.subjectId}`),
  );

  const classOf = new Map(classes.map((k) => [k.id, k]));
  const weeklyOf = (k: (typeof classes)[number], subjectId: string): number | null => {
    const hits = allocations.filter((a) => a.levelCode === k.level && a.subjectId === subjectId);
    const exact = hits.find((a) => a.programId !== null && a.programId === k.programId);
    return (exact ?? hits.find((a) => a.programId === null))?.weeklyPeriods ?? null;
  };

  const rows: (ExportRow & { _sort: string })[] = [];
  for (const a of assignments) {
    const k = classOf.get(a.classId);
    const s = subjects.get(a.subjectId);
    if (!k || !s) continue;
    const t = teachers.get(a.teacherId);
    rows.push({
      ...c.base,
      class_name: k.name,
      level: k.level,
      program_code: (k.programId ? programs.get(k.programId)?.code : null) ?? null,
      subject_code: s.code,
      ref_subject_code: refs.get(s.id) ?? null,
      subject_name: s.name,
      subject_group: s.subjectGroup,
      subject_kind: s.kind,
      teacher_name: t?.name ?? null,
      teacher_nip: t?.nip ?? null,
      weekly_periods: weeklyOf(k, s.id),
      participation: selected.has(`${k.id}:${s.id}`) ? 'selected' : 'all',
      _sort: `${k.name}\u0000${String(s.sortOrder).padStart(6, '0')}\u0000${s.code}`,
    });
  }
  return rows.sort((a, b) => byText(a._sort, b._sort));
}

async function subjectChoiceRows(tx: Tx, c: Ctx): Promise<ExportRow[]> {
  const semesterId = c.sem?.id;
  const choices = await tx
    .select({
      studentId: studentSubjectEnrollment.studentId,
      subjectId: studentSubjectEnrollment.subjectId,
      semesterId: studentSubjectEnrollment.semesterId,
      source: studentSubjectEnrollment.source,
    })
    .from(studentSubjectEnrollment)
    .where(
      and(
        eq(studentSubjectEnrollment.academicYearId, c.year.id),
        semesterId
          ? or(
              isNull(studentSubjectEnrollment.semesterId),
              eq(studentSubjectEnrollment.semesterId, semesterId),
            )
          : isNull(studentSubjectEnrollment.semesterId),
      ),
    );
  if (choices.length === 0) return [];
  const studentIds = [...new Set(choices.map((x) => x.studentId))];
  const subjectIds = [...new Set(choices.map((x) => x.subjectId))];
  const students = new Map(
    (
      await tx
        .select({ id: student.id, nisn: student.nisn, nis: student.nis, name: student.name })
        .from(student)
        .where(and(inArray(student.id, studentIds), isNull(student.deletedAt)))
    ).map((s) => [s.id, s]),
  );
  const subjects = new Map(
    (await tx.select().from(subject).where(inArray(subject.id, subjectIds))).map((s) => [s.id, s]),
  );
  const classOf = new Map(
    (
      await tx
        .select({ studentId: enrollment.studentId, className: classRoom.name })
        .from(enrollment)
        .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
        .where(and(eq(enrollment.academicYearId, c.year.id), inArray(enrollment.studentId, studentIds)))
    ).map((e) => [e.studentId, e.className]),
  );
  const refs = await refCodes(tx, subjectIds);

  const rows: (ExportRow & { _sort: string })[] = [];
  for (const x of choices) {
    const st = students.get(x.studentId);
    const s = subjects.get(x.subjectId);
    if (!st || !s) continue;
    rows.push({
      ...c.base,
      scope: x.semesterId ? 'semester' : 'year',
      semester: x.semesterId ? (c.sem?.name ?? null) : null,
      class_name: classOf.get(x.studentId) ?? null,
      student_nisn: st.nisn,
      student_nis: st.nis,
      student_name: st.name,
      subject_code: s.code,
      ref_subject_code: refs.get(s.id) ?? null,
      subject_name: s.name,
      source: x.source,
      _sort: `${classOf.get(x.studentId) ?? ''}\u0000${st.name}\u0000${s.code}`,
    });
  }
  return rows.sort((a, b) => byText(a._sort, b._sort));
}

/** Nilai akhir dan deskripsi: hanya dari rapor berstatus final, isi dibaca dari snapshot beku. */
async function snapshotRows(tx: Tx, c: Ctx, dataset: 'final_grades' | 'descriptions'): Promise<ExportRow[]> {
  if (!c.sem) return [];
  const cards = await tx
    .select({ snapshot: reportCard.snapshot, finalizedAt: reportCard.finalizedAt })
    .from(reportCard)
    .where(and(eq(reportCard.semesterId, c.sem.id), eq(reportCard.status, 'final')));
  const docs = cards.flatMap((r) =>
    r.snapshot ? [{ doc: r.snapshot as ReportDocumentV2, finalizedAt: r.finalizedAt }] : [],
  );
  const subjectIds = [...new Set(docs.flatMap((d) => d.doc.subjects.map((s) => s.subjectId)))];
  const codes = new Map(
    (subjectIds.length
      ? await tx
          .select({ id: subject.id, code: subject.code })
          .from(subject)
          .where(inArray(subject.id, subjectIds))
      : []
    ).map((s) => [s.id, s.code]),
  );
  const refs = await refCodes(tx, subjectIds);

  const rows: (ExportRow & { _sort: string })[] = [];
  for (const { doc, finalizedAt } of docs) {
    for (const s of doc.subjects) {
      if (dataset === 'descriptions' && !s.description) continue;
      const common = {
        ...c.base,
        semester: c.sem.name,
        class_name: doc.student.className,
        level: doc.student.level,
        student_nisn: doc.student.nisn,
        student_nis: doc.student.nis,
        student_name: doc.student.name,
        subject_code: codes.get(s.subjectId) ?? null,
        ref_subject_code: refs.get(s.subjectId) ?? null,
        subject_name: s.name,
        finalized_at: finalizedAt ? finalizedAt.toISOString() : null,
        _sort: `${doc.student.className}\u0000${doc.student.name}\u0000${s.name}`,
      };
      rows.push(
        dataset === 'final_grades'
          ? {
              ...common,
              final_grade: s.final,
              predicate: s.predicate,
              kkm: s.kkm,
              below_kkm: s.belowKkm,
            }
          : { ...common, description: s.description },
      );
    }
  }
  return rows.sort((a, b) => byText(a._sort, b._sort));
}

/** Nama berkas yang aman untuk header (huruf, angka, strip). */
export function exportFileName(dataset: ExportDataset, yearName: string, ext: 'csv' | 'json'): string {
  const slug = yearName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `edusync-${dataset.replaceAll('_', '-')}${slug ? `-${slug}` : ''}.${ext}`;
}
