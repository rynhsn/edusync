import {
  blockingViolations,
  CHOICE_GROUP_KEY_MAX,
  CHOICE_LOCKED_CODE,
  CHOICE_RULE_VIOLATION_CODE,
  CHOICE_SCOPE_OVERLAP_CODE,
  type ChoiceRuleInput,
  type ChoiceRuleResult,
  evaluateOffered,
  evaluateStudentRules,
  pickReligionSubject,
  religionMatch,
  type StudentReligion,
  SUBJECT_ENROLLMENT_SOURCES,
  SUBJECT_NOT_SELECTED_MODE_CODE,
  SUBJECT_PARTICIPATION_MODES,
  type SubjectEnrollmentSource,
  type SubjectReligionVariant,
  takesSubject,
} from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  assessment,
  classRoom,
  classSubjectParticipation,
  curriculumSubjectAllocation,
  enrollment,
  eq,
  inArray,
  isNull,
  program,
  score,
  semester,
  sql,
  student,
  studentSubjectEnrollment,
  subject,
  subjectChoiceRule,
  subjectChoiceRuleSubject,
  type Tx,
  teachingAssignment,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { todayInSchool } from '../attendance-lib';
import { errorSchema, forbidden, HttpError } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';
import { isHomeroom } from '../report-card-access-lib';
import { assertClassYearHasNoFinal, assertStudentsReportNotFinal } from '../report-lock-lib';
import { participatingSubjectsOf } from '../subject-roster-lib';
import { audit, conflictAs409, guarded, idParams, ok, schoolHeader } from './helpers';

const tag = ['Academic'];
const readGate = [requirePermission('class:read')];
const ruleReadGate = [requirePermission('subject:read')];
const ruleWriteGate = [requirePermission('subject_choice:manage')];
const studentReadGate = [requirePermission('student:read')];

const invalidRef = (message: string) => new HttpError(400, 'invalid_reference', message);
const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);

/* ---------- Skema respons bersama ---------- */

const sourceEnum = z.enum(SUBJECT_ENROLLMENT_SOURCES);

const ruleResultSchema = z.object({
  ruleId: z.uuid(),
  groupKey: z.string(),
  label: z.string(),
  enforce: z.boolean(),
  count: z.number().int().describe('Jumlah mapel anggota aturan yang diambil murid pada semester itu'),
  minChoices: z.number().int().nullable(),
  maxChoices: z.number().int().nullable(),
  status: z.enum(['ok', 'below_min', 'above_max']),
});

const warningSchema = ruleResultSchema.extend({
  studentId: z.uuid(),
  studentName: z.string(),
  semesterId: z
    .uuid()
    .nullable()
    .describe('Semester yang dinilai; null bila hasilnya sama di semua semester tahun ajaran'),
});

const entrySchema = z.object({
  studentId: z.uuid(),
  subjectId: z.uuid(),
  semesterId: z.uuid().nullable().describe('null = setahun; terisi = hanya semester itu'),
  source: sourceEnum,
  note: z.string().nullable(),
  religionMismatch: z
    .literal(true)
    .optional()
    .describe('Sparse: ada hanya bila mapel agama tidak cocok dengan agama murid'),
});

const subjectBrief = z.object({
  subjectId: z.uuid(),
  code: z.string(),
  name: z.string(),
  kind: z.string(),
  religionVariant: z.string().nullable(),
});

const semesterBrief = z.object({
  id: z.uuid(),
  name: z.string(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
});

/* ---------- Pembaca bersama ---------- */

interface ClassRow {
  id: string;
  name: string;
  level: string;
  academicYearId: string;
  programId: string | null;
  homeroomTeacherId: string | null;
}

async function loadClass(tx: Tx, classId: string): Promise<ClassRow> {
  const [cls] = await tx.select().from(classRoom).where(eq(classRoom.id, classId));
  if (!cls) throw notFound('Kelas');
  return cls;
}

/** Penulis: pemegang `subject_choice:manage` atau wali kelas rombel itu. */
async function canManageClass(tx: Tx, ctx: TenantContext, cls: ClassRow) {
  return ctx.permissions.has('subject_choice:manage') || (await isHomeroom(tx, ctx, cls.homeroomTeacherId));
}

async function assertCanManage(tx: Tx, ctx: TenantContext, cls: ClassRow) {
  if (!(await canManageClass(tx, ctx, cls))) {
    throw forbidden(
      'Hanya pemegang izin kelola pilihan mapel atau wali kelas rombel ini yang boleh mengubah pilihan mapel.',
    );
  }
}

const semestersOfYear = (tx: Tx, yearId: string) =>
  tx
    .select({
      id: semester.id,
      name: semester.name,
      startsOn: semester.startsOn,
      endsOn: semester.endsOn,
      isActive: semester.isActive,
    })
    .from(semester)
    .where(eq(semester.academicYearId, yearId))
    .orderBy(asc(semester.startsOn));

type SemesterRow = Awaited<ReturnType<typeof semestersOfYear>>[number];

/** Semester yang dinilai bila klien tidak menyebut: semester aktif, lalu yang paling awal; null bila tahun tanpa semester. */
function defaultSemester(sems: SemesterRow[]) {
  return (sems.find((s) => s.isActive) ?? sems[0])?.id ?? null;
}

/** Murid aktif yang terdaftar di rombel itu pada tahun ajarannya. */
const activeStudentsOf = (tx: Tx, cls: ClassRow) =>
  tx
    .select({ id: student.id, name: student.name, nis: student.nis, religion: student.religion })
    .from(enrollment)
    .innerJoin(student, eq(student.id, enrollment.studentId))
    .where(
      and(
        eq(enrollment.classId, cls.id),
        eq(enrollment.academicYearId, cls.academicYearId),
        isNull(student.deletedAt),
        eq(student.status, 'active'),
      ),
    )
    .orderBy(asc(student.name));

interface EnrRow {
  id: string;
  studentId: string;
  subjectId: string;
  semesterId: string | null;
  source: SubjectEnrollmentSource;
  note: string | null;
}

const enrollmentRowsOf = (tx: Tx, yearId: string, studentIds: string[]): Promise<EnrRow[]> =>
  studentIds.length === 0
    ? Promise.resolve([])
    : tx
        .select({
          id: studentSubjectEnrollment.id,
          studentId: studentSubjectEnrollment.studentId,
          subjectId: studentSubjectEnrollment.subjectId,
          semesterId: studentSubjectEnrollment.semesterId,
          source: studentSubjectEnrollment.source,
          note: studentSubjectEnrollment.note,
        })
        .from(studentSubjectEnrollment)
        .where(
          and(
            eq(studentSubjectEnrollment.academicYearId, yearId),
            inArray(studentSubjectEnrollment.studentId, studentIds),
          ),
        );

const keyOf = (studentId: string, subjectId: string) => `${studentId}|${subjectId}`;

function groupRows(rows: EnrRow[]) {
  const map = new Map<string, EnrRow[]>();
  for (const r of rows) {
    const k = keyOf(r.studentId, r.subjectId);
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return map;
}

interface LoadedRule extends ChoiceRuleInput {
  levelCode: string;
  programId: string | null;
  lockedFromSemesterId: string | null;
}

/** Aturan yang berlaku untuk tahun ajaran, tingkat, dan program rombel (aturan tanpa program berlaku untuk semua program). */
async function rulesForClass(tx: Tx, cls: ClassRow): Promise<LoadedRule[]> {
  const rules = await tx
    .select()
    .from(subjectChoiceRule)
    .where(
      and(
        eq(subjectChoiceRule.academicYearId, cls.academicYearId),
        eq(subjectChoiceRule.levelCode, cls.level),
      ),
    )
    .orderBy(asc(subjectChoiceRule.groupKey));
  const applicable = rules.filter((r) => r.programId === null || r.programId === cls.programId);
  if (applicable.length === 0) return [];
  const members = await tx
    .select({ ruleId: subjectChoiceRuleSubject.ruleId, subjectId: subjectChoiceRuleSubject.subjectId })
    .from(subjectChoiceRuleSubject)
    .where(
      inArray(
        subjectChoiceRuleSubject.ruleId,
        applicable.map((r) => r.id),
      ),
    );
  return applicable.map((r) => ({
    id: r.id,
    groupKey: r.groupKey,
    label: r.label,
    enforce: r.enforce,
    minChoices: r.minChoices,
    maxChoices: r.maxChoices,
    minOffered: r.minOffered,
    levelCode: r.levelCode,
    programId: r.programId,
    lockedFromSemesterId: r.lockedFromSemesterId,
    subjectIds: members.filter((m) => m.ruleId === r.id).map((m) => m.subjectId),
  }));
}

/**
 * Hasil aturan satu murid pada semua semester tahun ajaran; semester dengan hasil sama dipadatkan menjadi satu entri
 * (`semesterId` null). Tanpa semester, dinilai atas baris setahun saja.
 */
function resultsAcrossSemesters(
  rules: ChoiceRuleInput[],
  participating: Set<string>,
  rowsOf: (subjectId: string) => { semesterId: string | null }[],
  sems: { id: string }[],
): { semesterId: string | null; results: ChoiceRuleResult[] }[] {
  const evalAt = (semesterId: string) =>
    evaluateStudentRules(rules, (subjectId) =>
      takesSubject({ participating: participating.has(subjectId), rows: rowsOf(subjectId), semesterId }),
    );
  if (sems.length === 0) return [{ semesterId: null, results: evalAt('') }];
  const per = sems.map((s) => ({ semesterId: s.id, results: evalAt(s.id) }));
  const sig = (rs: ChoiceRuleResult[]) => rs.map((r) => `${r.ruleId}:${r.count}:${r.status}`).join(',');
  const first = sig(per[0]!.results);
  if (per.every((p) => sig(p.results) === first)) return [{ semesterId: null, results: per[0]!.results }];
  return per;
}

/* ---------- Penerapan perubahan pilihan ---------- */

interface Draft {
  id?: string;
  semesterId: string | null;
  source: SubjectEnrollmentSource;
  note: string | null;
}

interface ChangeSet {
  set: {
    studentId: string;
    subjectId: string;
    semesterId: string | null;
    source?: SubjectEnrollmentSource | undefined;
    note?: string | null | undefined;
  }[];
  remove: { studentId: string; subjectId: string; semesterId?: string | null | undefined }[];
  changeFrom: {
    studentId: string;
    subjectId: string;
    fromSemesterId: string;
    taking: boolean;
    source?: SubjectEnrollmentSource | undefined;
  }[];
}

const overlap = () =>
  new HttpError(
    400,
    CHOICE_SCOPE_OVERLAP_CODE,
    'Pilihan setahun dan per semester untuk mapel yang sama tidak boleh bertumpuk. Hapus salah satunya, atau pakai "ganti mulai semester".',
  );

interface ApplyResult {
  created: number;
  updated: number;
  removed: number;
  warnings: z.infer<typeof warningSchema>[];
}

/**
 * Menerapkan perubahan pilihan murid satu rombel secara atomik (di dalam transaksi pemanggil). Urutan pemeriksaan: rujukan dan
 * cakupan (400), batas ganti pilihan (409 `choice_locked`), rapor final per murid dan semester yang takes-nya benar-benar berubah
 * (409 `report_final`), lalu aturan pilihan yang `enforce` (400 `choice_rule_violation`). Aturan tanpa `enforce` hanya menghasilkan
 * peringatan. Perubahan yang tidak mengubah apa pun (idempoten) tidak memicu penjaga mana pun.
 */
async function applyChoices(
  tx: Tx,
  ctx: TenantContext,
  cls: ClassRow,
  changes: ChangeSet,
  override: boolean,
): Promise<ApplyResult> {
  const sems = await semestersOfYear(tx, cls.academicYearId);
  const semIds = new Set(sems.map((s) => s.id));
  const participating = await participatingSubjectsOf(tx, cls.id);
  const roster = await activeStudentsOf(tx, cls);
  const rosterById = new Map(roster.map((s) => [s.id, s]));

  const involvedStudents = new Set<string>();
  const involvedSubjects = new Set<string>();
  const touch = (studentId: string, subjectId: string) => {
    involvedStudents.add(studentId);
    involvedSubjects.add(subjectId);
  };
  for (const i of changes.set) touch(i.studentId, i.subjectId);
  for (const i of changes.remove) touch(i.studentId, i.subjectId);
  for (const i of changes.changeFrom) touch(i.studentId, i.subjectId);

  for (const sid of involvedStudents) {
    if (!rosterById.has(sid)) {
      throw invalidRef('Ada murid yang bukan anggota aktif rombel ini pada tahun ajarannya.');
    }
  }
  const knownSubjects = involvedSubjects.size
    ? await tx
        .select({ id: subject.id })
        .from(subject)
        .where(inArray(subject.id, [...involvedSubjects]))
    : [];
  if (knownSubjects.length !== involvedSubjects.size)
    throw invalidRef('Ada mata pelajaran yang tidak ditemukan.');
  const checkSemester = (id: string | null | undefined) => {
    if (id && !semIds.has(id)) throw invalidRef('Ada semester yang bukan milik tahun ajaran rombel ini.');
  };
  for (const i of changes.set) {
    checkSemester(i.semesterId);
    if (!participating.has(i.subjectId)) {
      throw new HttpError(
        400,
        SUBJECT_NOT_SELECTED_MODE_CODE,
        'Mapel ini belum ditandai "berdasarkan pilihan" di rombel ini, jadi pilihan murid tidak diperlukan.',
      );
    }
  }
  for (const i of changes.remove) checkSemester(i.semesterId);
  for (const i of changes.changeFrom) {
    checkSemester(i.fromSemesterId);
    if (!participating.has(i.subjectId)) {
      throw new HttpError(
        400,
        SUBJECT_NOT_SELECTED_MODE_CODE,
        'Mapel ini belum ditandai "berdasarkan pilihan" di rombel ini, jadi pilihan murid tidak diperlukan.',
      );
    }
  }
  if (changes.changeFrom.length > 0 && sems.length === 0) {
    throw invalidRef('Tahun ajaran rombel ini belum punya semester.');
  }

  // Keadaan awal semua baris murid yang terlibat (semua mapel) dan salinan kerja yang diubah operasi.
  const existing = await enrollmentRowsOf(tx, cls.academicYearId, [...involvedStudents]);
  const before = groupRows(existing);
  const working = new Map<string, Draft[]>();
  const draftsOf = (studentId: string, subjectId: string) => {
    const k = keyOf(studentId, subjectId);
    let list = working.get(k);
    if (!list) {
      list = (before.get(k) ?? []).map((r) => ({
        id: r.id,
        semesterId: r.semesterId,
        source: r.source,
        note: r.note,
      }));
      working.set(k, list);
    }
    return list;
  };

  for (const op of changes.set) {
    const list = draftsOf(op.studentId, op.subjectId);
    const hit = list.find((d) => d.semesterId === op.semesterId);
    if (hit) {
      if (op.source !== undefined) hit.source = op.source;
      if (op.note !== undefined) hit.note = op.note;
      continue;
    }
    if (list.some((d) => (op.semesterId === null ? true : d.semesterId === null))) throw overlap();
    list.push({ semesterId: op.semesterId, source: op.source ?? 'choice', note: op.note ?? null });
  }
  for (const op of changes.remove) {
    const list = draftsOf(op.studentId, op.subjectId);
    if (op.semesterId === undefined) {
      list.length = 0;
    } else if (op.semesterId === null) {
      const i = list.findIndex((d) => d.semesterId === null);
      if (i >= 0) list.splice(i, 1);
      else if (list.length > 0) throw overlap();
    } else {
      const i = list.findIndex((d) => d.semesterId === op.semesterId);
      if (i >= 0) list.splice(i, 1);
      else if (list.some((d) => d.semesterId === null)) throw overlap();
    }
  }
  for (const op of changes.changeFrom) {
    const list = draftsOf(op.studentId, op.subjectId);
    const fromIdx = sems.findIndex((s) => s.id === op.fromSemesterId);
    const now = sems.map((s, idx) =>
      idx < fromIdx ? list.some((d) => d.semesterId === null || d.semesterId === s.id) : op.taking,
    );
    const seed = list[0];
    const source = op.source ?? seed?.source ?? 'choice';
    const note = seed?.note ?? null;
    const reuse = (semesterId: string | null): Draft => {
      const old = list.find((d) => d.semesterId === semesterId);
      return old ?? { semesterId, source, note };
    };
    let next: Draft[];
    if (now.every(Boolean)) next = [reuse(null)];
    else if (!now.some(Boolean)) next = [];
    else next = sems.filter((_, idx) => now[idx]).map((s) => reuse(s.id));
    if (op.source !== undefined) for (const d of next) d.source = op.source;
    list.splice(0, list.length, ...next);
  }

  // Selisih baris (dicocokkan lewat cakupan semester) dan semester yang takes-nya berubah.
  const inserts: { studentId: string; subjectId: string; draft: Draft }[] = [];
  const updates: { id: string; source: SubjectEnrollmentSource; note: string | null }[] = [];
  const deletes: string[] = [];
  const changedSubjects = new Set<string>();
  const changedStudents = new Set<string>();
  const affected = new Map<string, Set<string>>(); // semesterId -> studentIds
  for (const [k, list] of working) {
    const [studentId, subjectId] = k.split('|') as [string, string];
    const old = before.get(k) ?? [];
    let keyChanged = false;
    for (const d of list) {
      const prev = old.find((o) => o.semesterId === d.semesterId);
      if (!prev) {
        inserts.push({ studentId, subjectId, draft: d });
        keyChanged = true;
      } else if (prev.source !== d.source || prev.note !== d.note) {
        updates.push({ id: prev.id, source: d.source, note: d.note });
        keyChanged = true;
      }
    }
    for (const o of old) {
      if (!list.some((d) => d.semesterId === o.semesterId)) {
        deletes.push(o.id);
        keyChanged = true;
      }
    }
    if (!keyChanged) continue;
    changedSubjects.add(subjectId);
    changedStudents.add(studentId);
    for (const s of sems) {
      const was = old.some((r) => r.semesterId === null || r.semesterId === s.id);
      const will = list.some((r) => r.semesterId === null || r.semesterId === s.id);
      if (was !== will) {
        const set = affected.get(s.id) ?? new Set<string>();
        set.add(studentId);
        affected.set(s.id, set);
      }
    }
  }

  const rules = await rulesForClass(tx, cls);

  // Batas ganti pilihan: aturan terkunci dari semester X berlaku setelah semester itu dimulai.
  if (changedSubjects.size > 0) {
    const lockedIds = [
      ...new Set(rules.flatMap((r) => (r.lockedFromSemesterId ? [r.lockedFromSemesterId] : []))),
    ];
    if (lockedIds.length > 0) {
      const lockSems = await tx
        .select({ id: semester.id, startsOn: semester.startsOn })
        .from(semester)
        .where(inArray(semester.id, lockedIds));
      const today = todayInSchool();
      const startedIds = new Set(lockSems.filter((s) => s.startsOn <= today).map((s) => s.id));
      const hitRule = rules.find(
        (r) =>
          r.lockedFromSemesterId !== null &&
          startedIds.has(r.lockedFromSemesterId) &&
          r.subjectIds.some((id) => changedSubjects.has(id)),
      );
      if (hitRule) {
        if (!(override && ctx.permissions.has('curriculum:manage'))) {
          throw new HttpError(
            409,
            CHOICE_LOCKED_CODE,
            `Batas ganti pilihan untuk kelompok "${hitRule.label}" sudah lewat. Hanya pemegang izin kelola kurikulum yang dapat menimpanya (override).`,
          );
        }
      }
    }
  }

  // Rapor final: per semester yang takes-nya berubah.
  for (const [semesterId, studentIds] of affected) {
    await assertStudentsReportNotFinal(tx, semesterId, [...studentIds]);
  }

  // Aturan pilihan atas keadaan sesudah perubahan, hanya untuk murid dan kelompok yang tersentuh.
  const after = new Map(before);
  for (const [k, list] of working) {
    const [studentId, subjectId] = k.split('|') as [string, string];
    after.set(
      k,
      list.map((d) => ({ id: d.id ?? '', studentId, subjectId, ...d })),
    );
  }
  const touchedSubjectsOf = new Map<string, Set<string>>();
  for (const k of working.keys()) {
    const [studentId, subjectId] = k.split('|') as [string, string];
    if (!changedStudents.has(studentId)) continue;
    const set = touchedSubjectsOf.get(studentId) ?? new Set<string>();
    set.add(subjectId);
    touchedSubjectsOf.set(studentId, set);
  }
  const warnings: z.infer<typeof warningSchema>[] = [];
  for (const studentId of changedStudents) {
    const touched = touchedSubjectsOf.get(studentId) ?? new Set<string>();
    const rel = rules.filter((r) => r.subjectIds.some((id) => touched.has(id)));
    if (rel.length === 0) continue;
    const name = rosterById.get(studentId)?.name ?? '';
    const entries = resultsAcrossSemesters(
      rel,
      participating,
      (subjectId) => after.get(keyOf(studentId, subjectId)) ?? [],
      sems,
    );
    const blocked = entries.flatMap((e) => blockingViolations(e.results));
    if (blocked.length > 0) {
      const b = blocked[0]!;
      throw new HttpError(
        400,
        CHOICE_RULE_VIOLATION_CODE,
        `Pilihan ${name} melanggar aturan "${b.label}": diambil ${b.count}` +
          (b.minChoices !== null || b.maxChoices !== null
            ? `, batas ${b.minChoices ?? 0}-${b.maxChoices ?? 'tak terbatas'}.`
            : '.'),
      );
    }
    for (const e of entries) {
      for (const r of e.results) {
        if (r.status !== 'ok')
          warnings.push({ ...r, studentId, studentName: name, semesterId: e.semesterId });
      }
    }
  }

  if (deletes.length > 0) {
    await tx.delete(studentSubjectEnrollment).where(inArray(studentSubjectEnrollment.id, deletes));
  }
  const now = new Date();
  for (const u of updates) {
    await tx
      .update(studentSubjectEnrollment)
      .set({ source: u.source, note: u.note, updatedAt: now })
      .where(eq(studentSubjectEnrollment.id, u.id));
  }
  if (inserts.length > 0) {
    await tx.insert(studentSubjectEnrollment).values(
      inserts.map((i) => ({
        schoolId: ctx.schoolId,
        studentId: i.studentId,
        subjectId: i.subjectId,
        academicYearId: cls.academicYearId,
        semesterId: i.draft.semesterId,
        source: i.draft.source,
        note: i.draft.note,
        createdBy: ctx.userId,
      })),
    );
  }
  if (inserts.length + updates.length + deletes.length > 0) {
    await audit(tx, ctx, 'subject_choice.save', 'class', cls.id, {
      created: inserts.length,
      updated: updates.length,
      removed: deletes.length,
      students: changedStudents.size,
      override: override && ctx.permissions.has('curriculum:manage'),
    });
  }
  return { created: inserts.length, updated: updates.length, removed: deletes.length, warnings };
}

/* ---------- Pembentuk respons ---------- */

async function participationView(tx: Tx, ctx: TenantContext, cls: ClassRow) {
  const participating = await participatingSubjectsOf(tx, cls.id);
  const assigned = await tx
    .select({ subjectId: teachingAssignment.subjectId })
    .from(teachingAssignment)
    .where(eq(teachingAssignment.classId, cls.id));
  const allocated = await tx
    .select({
      subjectId: curriculumSubjectAllocation.subjectId,
      programId: curriculumSubjectAllocation.programId,
    })
    .from(curriculumSubjectAllocation)
    .where(
      and(
        eq(curriculumSubjectAllocation.academicYearId, cls.academicYearId),
        eq(curriculumSubjectAllocation.levelCode, cls.level),
      ),
    );
  const ids = new Set<string>([
    ...participating,
    ...assigned.map((a) => a.subjectId),
    ...allocated.filter((a) => a.programId === null || a.programId === cls.programId).map((a) => a.subjectId),
  ]);
  const subjects = ids.size
    ? await tx
        .select()
        .from(subject)
        .where(inArray(subject.id, [...ids]))
        .orderBy(asc(subject.name))
    : [];
  const scored = await tx
    .select({
      subjectId: assessment.subjectId,
      n: sql<number>`count(distinct ${score.studentId})::int`,
    })
    .from(score)
    .innerJoin(assessment, eq(assessment.id, score.assessmentId))
    .where(and(eq(assessment.classId, cls.id), sql`${score.value} is not null`))
    .groupBy(assessment.subjectId);
  const enrolled = await tx
    .select({
      subjectId: studentSubjectEnrollment.subjectId,
      n: sql<number>`count(distinct ${studentSubjectEnrollment.studentId})::int`,
    })
    .from(studentSubjectEnrollment)
    .innerJoin(
      enrollment,
      and(
        eq(enrollment.studentId, studentSubjectEnrollment.studentId),
        eq(enrollment.academicYearId, studentSubjectEnrollment.academicYearId),
      ),
    )
    .where(
      and(eq(enrollment.classId, cls.id), eq(studentSubjectEnrollment.academicYearId, cls.academicYearId)),
    )
    .groupBy(studentSubjectEnrollment.subjectId);
  const scoredBy = new Map(scored.map((r) => [r.subjectId, r.n]));
  const enrolledBy = new Map(enrolled.map((r) => [r.subjectId, r.n]));
  return {
    classId: cls.id,
    className: cls.name,
    academicYearId: cls.academicYearId,
    canManage: await canManageClass(tx, ctx, cls),
    subjects: subjects.map((s) => ({
      subjectId: s.id,
      code: s.code,
      name: s.name,
      kind: s.kind,
      religionVariant: s.religionVariant,
      mode: (participating.has(s.id) ? 'selected' : 'all') as 'selected' | 'all',
      scoredStudents: scoredBy.get(s.id) ?? 0,
      enrolledStudents: enrolledBy.get(s.id) ?? 0,
    })),
  };
}

const participationResponse = z.object({
  classId: z.uuid(),
  className: z.string(),
  academicYearId: z.uuid(),
  canManage: z
    .boolean()
    .describe('Pengguna ini boleh mengubah pilihan mapel rombel (izin kelola atau wali kelas)'),
  subjects: z.array(
    z.object({
      subjectId: z.uuid(),
      code: z.string(),
      name: z.string(),
      kind: z.string(),
      religionVariant: z.string().nullable(),
      mode: z
        .enum(SUBJECT_PARTICIPATION_MODES)
        .describe('`all` = semua murid rombel; `selected` = hanya yang terdaftar'),
      scoredStudents: z
        .number()
        .int()
        .describe(
          'Murid rombel yang sudah punya skor pada mapel ini. Skor tidak pernah dihapus; layar menampilkannya sebelum mode `selected` dinyalakan.',
        ),
      enrolledStudents: z
        .number()
        .int()
        .describe('Murid rombel yang punya baris pilihan untuk mapel ini tahun ini'),
    }),
  ),
});

async function matrixView(tx: Tx, ctx: TenantContext, cls: ClassRow) {
  const participating = await participatingSubjectsOf(tx, cls.id);
  const subjects = participating.size
    ? await tx
        .select()
        .from(subject)
        .where(inArray(subject.id, [...participating]))
        .orderBy(asc(subject.name))
    : [];
  const roster = await activeStudentsOf(tx, cls);
  const rows = (
    await enrollmentRowsOf(
      tx,
      cls.academicYearId,
      roster.map((s) => s.id),
    )
  ).filter((r) => participating.has(r.subjectId));
  const sems = await semestersOfYear(tx, cls.academicYearId);
  const religionOf = new Map(roster.map((s) => [s.id, s.religion as StudentReligion | null]));
  const variantOf = new Map(subjects.map((s) => [s.id, s.religionVariant as SubjectReligionVariant | null]));
  return {
    classId: cls.id,
    className: cls.name,
    academicYearId: cls.academicYearId,
    canManage: await canManageClass(tx, ctx, cls),
    semesters: sems.map(({ id, name, startsOn, endsOn }) => ({ id, name, startsOn, endsOn })),
    subjects: subjects.map((s) => ({
      subjectId: s.id,
      code: s.code,
      name: s.name,
      kind: s.kind,
      religionVariant: s.religionVariant,
    })),
    students: roster.map((s) => ({ id: s.id, name: s.name, nis: s.nis, religion: s.religion })),
    entries: rows.map((r) => ({
      studentId: r.studentId,
      subjectId: r.subjectId,
      semesterId: r.semesterId,
      source: r.source,
      note: r.note,
      ...(religionMatch(religionOf.get(r.studentId), variantOf.get(r.subjectId)) === 'mismatch'
        ? { religionMismatch: true as const }
        : {}),
    })),
  };
}

const matrixResponse = z.object({
  classId: z.uuid(),
  className: z.string(),
  academicYearId: z.uuid(),
  canManage: z.boolean(),
  semesters: z.array(semesterBrief),
  subjects: z.array(subjectBrief).describe('Mapel berpenanda `selected` di rombel ini'),
  students: z.array(
    z.object({ id: z.uuid(), name: z.string(), nis: z.string().nullable(), religion: z.string().nullable() }),
  ),
  entries: z.array(entrySchema),
});

/* ---------- Aturan: tampilan ---------- */

const ruleView = z.object({
  id: z.uuid(),
  academicYearId: z.uuid(),
  levelCode: z.string(),
  programId: z.uuid().nullable(),
  groupKey: z.string(),
  label: z.string(),
  minChoices: z.number().int().nullable(),
  maxChoices: z.number().int().nullable(),
  minOffered: z.number().int().nullable(),
  enforce: z.boolean(),
  lockedFromSemesterId: z.uuid().nullable(),
  subjectIds: z.array(z.uuid()),
});

async function loadRuleViews(tx: Tx, where: ReturnType<typeof and> | undefined) {
  const rules = await tx
    .select()
    .from(subjectChoiceRule)
    .where(where)
    .orderBy(asc(subjectChoiceRule.levelCode), asc(subjectChoiceRule.groupKey));
  if (rules.length === 0) return [];
  const members = await tx
    .select({ ruleId: subjectChoiceRuleSubject.ruleId, subjectId: subjectChoiceRuleSubject.subjectId })
    .from(subjectChoiceRuleSubject)
    .where(
      inArray(
        subjectChoiceRuleSubject.ruleId,
        rules.map((r) => r.id),
      ),
    );
  return rules.map((r) => ({
    id: r.id,
    academicYearId: r.academicYearId,
    levelCode: r.levelCode,
    programId: r.programId,
    groupKey: r.groupKey,
    label: r.label,
    minChoices: r.minChoices,
    maxChoices: r.maxChoices,
    minOffered: r.minOffered,
    enforce: r.enforce,
    lockedFromSemesterId: r.lockedFromSemesterId,
    subjectIds: members.filter((m) => m.ruleId === r.id).map((m) => m.subjectId),
  }));
}

const optionalCount = z.number().int().min(0).max(100).nullable().default(null);

const ruleBody = z
  .object({
    academicYearId: z.uuid(),
    levelCode: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .describe('Kode tingkat rombel (mis. XI), sama dengan `level` kelas'),
    programId: z.uuid().nullable().default(null).describe('Kosong = berlaku untuk semua program'),
    groupKey: z
      .string()
      .trim()
      .min(1)
      .max(CHOICE_GROUP_KEY_MAX)
      .describe('Kunci kelompok bebas, mis. elective, arts, religion'),
    label: z.string().trim().min(1).max(120),
    minChoices: optionalCount,
    maxChoices: optionalCount,
    minOffered: optionalCount.describe('Jumlah mapel anggota yang minimal ditawarkan (berpenanda) di rombel'),
    enforce: z
      .boolean()
      .default(false)
      .describe(
        'false (bawaan) = hanya peringatan; true = penyimpanan pilihan di luar batas ditolak 400 `choice_rule_violation`',
      ),
    lockedFromSemesterId: z
      .uuid()
      .nullable()
      .default(null)
      .describe(
        'Setelah semester ini dimulai, perubahan pilihan kelompok ini ditolak 409 `choice_locked` (kecuali override kurikulum)',
      ),
    subjectIds: z.array(z.uuid()).max(100).default([]).describe('Mapel anggota kelompok'),
  })
  .refine((v) => v.minChoices === null || v.maxChoices === null || v.minChoices <= v.maxChoices, {
    message: 'Batas minimal tidak boleh melebihi batas maksimal.',
    path: ['minChoices'],
  });

async function validateRuleRefs(tx: Tx, b: z.infer<typeof ruleBody>) {
  const [year] = await tx
    .select({ id: academicYear.id })
    .from(academicYear)
    .where(eq(academicYear.id, b.academicYearId));
  if (!year) throw invalidRef('Tahun ajaran tidak ditemukan.');
  if (b.programId) {
    const [p] = await tx.select({ id: program.id }).from(program).where(eq(program.id, b.programId));
    if (!p) throw invalidRef('Program tidak ditemukan.');
  }
  if (b.lockedFromSemesterId) {
    const [s] = await tx
      .select({ yearId: semester.academicYearId })
      .from(semester)
      .where(eq(semester.id, b.lockedFromSemesterId));
    if (!s || s.yearId !== b.academicYearId) {
      throw invalidRef('Semester batas ganti pilihan harus milik tahun ajaran aturan ini.');
    }
  }
  const unique = [...new Set(b.subjectIds)];
  if (unique.length) {
    const found = await tx.select({ id: subject.id }).from(subject).where(inArray(subject.id, unique));
    if (found.length !== unique.length) throw invalidRef('Ada mata pelajaran anggota yang tidak ditemukan.');
  }
  return unique;
}

/* ---------- Rute ---------- */

export async function subjectChoiceRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    fn: (tx: Tx) => Promise<T>,
  ) => {
    const ctx = request.ctx as TenantContext;
    return withTenant(request.server.tenantDb, [ctx.schoolId], fn);
  };

  /* ----- Penanda partisipasi mapel per rombel ----- */

  app.get(
    '/v1/classes/:id/subject-participation',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Mapel rombel dan mode partisipasinya',
        description:
          'Izin: `class:read`. Mapel rombel (penugasan guru, alokasi kurikulum tingkat/program, dan mapel berpenanda) dengan `mode`: ' +
          '`all` (bawaan: semua murid rombel mengikuti) atau `selected` (hanya murid yang terdaftar). `scoredStudents` = murid rombel yang ' +
          'sudah punya skor di mapel itu (skor tidak pernah dihapus; tampilkan sebelum menyalakan `selected`). `canManage` = pengguna ' +
          'boleh mengubah (pemegang `subject_choice:manage` atau wali kelas rombel ini). Tahap 3B.1: mode belum memengaruhi nilai, rapor, jadwal, atau absensi.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: participationResponse, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) =>
        participationView(tx, request.ctx as TenantContext, await loadClass(tx, request.params.id)),
      ),
  );

  app.put(
    '/v1/classes/:id/subject-participation',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Atur mode partisipasi mapel rombel (batch)',
        description:
          'Izin: `class:read`, dan pemegang `subject_choice:manage` atau wali kelas rombel itu (selain itu 403). Menetapkan `mode` per mapel: ' +
          '`selected` membuat penanda (mapel hanya diikuti murid yang terdaftar), `all` menghapusnya (kembali ke semua murid; baris pilihan ' +
          'murid tetap tersimpan). Hanya perubahan nyata yang diterapkan. Ditolak 409 `report_final` bila ada semester tahun rombel yang sudah ' +
          'final untuk rombel ini (buka kembali rapornya lebih dulu). Mengembalikan keadaan terbaru seperti GET.',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          subjects: z
            .array(z.object({ subjectId: z.uuid(), mode: z.enum(SUBJECT_PARTICIPATION_MODES) }))
            .min(1)
            .max(200),
        }),
        response: {
          200: participationResponse,
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return tenant(request, async (tx) => {
        const cls = await loadClass(tx, request.params.id);
        await assertCanManage(tx, ctx, cls);
        const wanted = new Map<string, 'all' | 'selected'>();
        for (const s of request.body.subjects) wanted.set(s.subjectId, s.mode);
        const found = await tx
          .select({ id: subject.id })
          .from(subject)
          .where(inArray(subject.id, [...wanted.keys()]));
        if (found.length !== wanted.size) throw invalidRef('Ada mata pelajaran yang tidak ditemukan.');
        const current = await participatingSubjectsOf(tx, cls.id);
        const toAdd = [...wanted]
          .filter(([id, mode]) => mode === 'selected' && !current.has(id))
          .map(([id]) => id);
        const toDrop = [...wanted]
          .filter(([id, mode]) => mode === 'all' && current.has(id))
          .map(([id]) => id);
        if (toAdd.length + toDrop.length > 0) {
          await assertClassYearHasNoFinal(tx, cls.id);
          if (toDrop.length > 0) {
            await tx
              .delete(classSubjectParticipation)
              .where(
                and(
                  eq(classSubjectParticipation.classId, cls.id),
                  inArray(classSubjectParticipation.subjectId, toDrop),
                ),
              );
          }
          if (toAdd.length > 0) {
            await tx.insert(classSubjectParticipation).values(
              toAdd.map((subjectId) => ({
                schoolId: ctx.schoolId,
                classId: cls.id,
                subjectId,
                mode: 'selected' as const,
                updatedBy: ctx.userId,
              })),
            );
          }
          await audit(tx, ctx, 'subject_choice.participation_save', 'class', cls.id, {
            selected: toAdd,
            all: toDrop,
          });
        }
        return participationView(tx, ctx, cls);
      });
    },
  );

  /* ----- Pilihan murid ----- */

  app.get(
    '/v1/classes/:id/subject-choices',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Matriks pilihan murid x mapel berpenanda rombel',
        description:
          'Izin: `class:read`. Mapel berpenanda `selected` di rombel, murid aktif rombel, dan semua baris pilihan tahun ajaran rombel ' +
          '(`semesterId` null = setahun). `entries[].religionMismatch` (sparse) menandai mapel agama yang tidak cocok dengan agama murid.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: matrixResponse, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) =>
        matrixView(tx, request.ctx as TenantContext, await loadClass(tx, request.params.id)),
      ),
  );

  const putResult = z.object({
    created: z.number().int(),
    updated: z.number().int(),
    removed: z.number().int(),
    warnings: z
      .array(warningSchema)
      .describe('Peringatan aturan pilihan untuk murid dan kelompok yang disentuh (aturan tanpa `enforce`)'),
  });

  app.put(
    '/v1/classes/:id/subject-choices',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Tetapkan, ubah, atau hapus pilihan murid (batch)',
        description:
          'Izin: `class:read`, dan pemegang `subject_choice:manage` atau wali kelas rombel itu (selain itu 403). Atomik. `set` membuat/mengubah ' +
          'baris (`semesterId` null atau kosong = setahun; `source` bawaan `choice` pada baris baru, `note` null menghapus catatan), `remove` ' +
          'menghapus (tanpa `semesterId` = semua baris mapel itu; dengan `semesterId` = baris semester itu), `changeFrom` memecah baris setahun ' +
          'menjadi per semester dan mengganti pilihan mulai `fromSemesterId` (semester sebelumnya mempertahankan keadaan lama). Mapel harus ' +
          'berpenanda di rombel (400 `subject_not_selected_mode`); murid harus anggota aktif rombel dan semester milik tahun rombel ' +
          '(400 `invalid_reference`); baris setahun dan per semester untuk mapel yang sama tidak boleh bertumpuk (400 `scope_overlap`). ' +
          'Perubahan yang mengubah apa yang diambil murid pada semester yang rapornya sudah final ditolak 409 `report_final`. Aturan pilihan: ' +
          'peringatan di `warnings`, kecuali aturan ber-`enforce` menolak 400 `choice_rule_violation`. Setelah batas `lockedFromSemesterId` ' +
          'aturan lewat: 409 `choice_locked`, kecuali pemegang `curriculum:manage` mengirim `override: true` (dicatat di audit). ' +
          'Tahap 3B.1: pilihan belum memengaruhi nilai, rapor, jadwal, atau absensi.',
        headers: schoolHeader,
        params: idParams,
        body: z
          .object({
            set: z
              .array(
                z.object({
                  studentId: z.uuid(),
                  subjectId: z.uuid(),
                  semesterId: z.uuid().nullable().default(null),
                  source: sourceEnum.optional(),
                  note: z.string().trim().max(500).nullable().optional(),
                }),
              )
              .max(2000)
              .default([]),
            remove: z
              .array(
                z.object({
                  studentId: z.uuid(),
                  subjectId: z.uuid(),
                  semesterId: z.uuid().nullable().optional(),
                }),
              )
              .max(2000)
              .default([]),
            changeFrom: z
              .array(
                z.object({
                  studentId: z.uuid(),
                  subjectId: z.uuid(),
                  fromSemesterId: z.uuid(),
                  taking: z.boolean(),
                  source: sourceEnum.optional(),
                }),
              )
              .max(2000)
              .default([]),
            override: z.boolean().default(false),
          })
          .refine((v) => v.set.length + v.remove.length + v.changeFrom.length > 0, {
            message: 'Isi minimal satu perubahan (set, remove, atau changeFrom).',
          }),
        response: {
          200: putResult,
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return tenant(request, async (tx) => {
        const cls = await loadClass(tx, request.params.id);
        await assertCanManage(tx, ctx, cls);
        return applyChoices(
          tx,
          ctx,
          cls,
          {
            set: b.set.map((i) => ({ ...i, note: i.note })),
            remove: b.remove,
            changeFrom: b.changeFrom,
          },
          b.override,
        );
      });
    },
  );

  app.post(
    '/v1/classes/:id/subject-choices/from-religion',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Isi pilihan mapel agama dari agama murid',
        description:
          'Izin: `class:read`, dan pemegang `subject_choice:manage` atau wali kelas rombel itu (selain itu 403). Untuk tiap murid aktif rombel ' +
          '(atau hanya `studentIds`) membuat baris setahun `source = religion` ke mapel agama berpenanda yang bervarian sesuai agama murid ' +
          '(agama `other` ke varian `belief`). Tidak menebak: harus ada tepat satu mapel agama berpenanda dengan varian itu; yang lain ' +
          'dilaporkan di `unmatched` dengan `reason`: `no_religion`, `no_matching_subject`, `ambiguous_subject`, ' +
          '`has_other_religion_choice` (murid sudah memilih mapel agama lain). `existing` = murid yang sudah punya pilihan itu. Penjaga ' +
          'sama dengan PUT pilihan (409 `report_final`, `choice_locked`).',
        headers: schoolHeader,
        params: idParams,
        body: z.object({
          studentIds: z.array(z.uuid()).max(500).optional(),
          override: z.boolean().default(false),
        }),
        response: {
          200: z.object({
            created: z.number().int(),
            existing: z.number().int(),
            unmatched: z.array(
              z.object({
                studentId: z.uuid(),
                studentName: z.string(),
                religion: z.string().nullable(),
                reason: z.enum([
                  'no_religion',
                  'no_matching_subject',
                  'ambiguous_subject',
                  'has_other_religion_choice',
                ]),
              }),
            ),
            warnings: z.array(warningSchema),
          }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return tenant(request, async (tx) => {
        const cls = await loadClass(tx, request.params.id);
        await assertCanManage(tx, ctx, cls);
        const participating = await participatingSubjectsOf(tx, cls.id);
        const subs = participating.size
          ? await tx
              .select({ id: subject.id, religionVariant: subject.religionVariant })
              .from(subject)
              .where(inArray(subject.id, [...participating]))
          : [];
        const candidates = subs.filter((s) => s.religionVariant !== null);
        const roster = await activeStudentsOf(tx, cls);
        const scope = b.studentIds ? new Set(b.studentIds) : null;
        if (scope) {
          const known = new Set(roster.map((s) => s.id));
          if ([...scope].some((id) => !known.has(id))) {
            throw invalidRef('Ada murid yang bukan anggota aktif rombel ini pada tahun ajarannya.');
          }
        }
        const targets = roster.filter((s) => !scope || scope.has(s.id));
        const rows = groupRows(
          await enrollmentRowsOf(
            tx,
            cls.academicYearId,
            targets.map((s) => s.id),
          ),
        );
        const candidateIds = new Set(candidates.map((c) => c.id));
        const unmatched: {
          studentId: string;
          studentName: string;
          religion: string | null;
          reason: 'no_religion' | 'no_matching_subject' | 'ambiguous_subject' | 'has_other_religion_choice';
        }[] = [];
        const sets: ChangeSet['set'] = [];
        let existing = 0;
        for (const s of targets) {
          const pick = pickReligionSubject(
            s.religion as StudentReligion | null,
            candidates.map((c) => ({
              id: c.id,
              religionVariant: c.religionVariant as SubjectReligionVariant | null,
            })),
          );
          if (pick.kind === 'unmatched') {
            unmatched.push({
              studentId: s.id,
              studentName: s.name,
              religion: s.religion,
              reason: pick.reason,
            });
            continue;
          }
          if ((rows.get(keyOf(s.id, pick.subjectId)) ?? []).length > 0) {
            existing++;
            continue;
          }
          const hasOther = [...candidateIds].some(
            (id) => id !== pick.subjectId && (rows.get(keyOf(s.id, id)) ?? []).length > 0,
          );
          if (hasOther) {
            unmatched.push({
              studentId: s.id,
              studentName: s.name,
              religion: s.religion,
              reason: 'has_other_religion_choice',
            });
            continue;
          }
          sets.push({ studentId: s.id, subjectId: pick.subjectId, semesterId: null, source: 'religion' });
        }
        if (sets.length === 0) return { created: 0, existing, unmatched, warnings: [] };
        const res = await applyChoices(tx, ctx, cls, { set: sets, remove: [], changeFrom: [] }, b.override);
        return { created: res.created, existing, unmatched, warnings: res.warnings };
      });
    },
  );

  /* ----- Ringkasan dan murid belum memilih ----- */

  const summaryResponse = z.object({
    classId: z.uuid(),
    academicYearId: z.uuid(),
    semesterId: z.uuid().nullable().describe('Semester yang dinilai; null bila tahun ajaran tanpa semester'),
    participatingSubjectIds: z.array(z.uuid()),
    rules: z.array(
      z.object({
        ruleId: z.uuid(),
        groupKey: z.string(),
        label: z.string(),
        enforce: z.boolean(),
        minChoices: z.number().int().nullable(),
        maxChoices: z.number().int().nullable(),
        minOffered: z.number().int().nullable(),
        offered: z.number().int().describe('Mapel anggota yang berpenanda (ditawarkan) di rombel ini'),
        offeredOk: z.boolean().describe('false bila `offered` kurang dari `minOffered`'),
      }),
    ),
    students: z.array(
      z.object({
        studentId: z.uuid(),
        name: z.string(),
        nis: z.string().nullable(),
        religion: z.string().nullable(),
        takenCount: z.number().int().describe('Jumlah mapel berpenanda yang diambil pada semester itu'),
        results: z.array(ruleResultSchema),
        warningCount: z.number().int(),
      }),
    ),
    unchosen: z
      .array(z.object({ studentId: z.uuid(), name: z.string() }))
      .describe('Murid yang belum mengambil satu pun mapel berpenanda pada semester itu'),
  });

  app.get(
    '/v1/classes/:id/subject-choices/summary',
    {
      onRequest: readGate,
      schema: {
        tags: tag,
        summary: 'Ringkasan pilihan rombel: aturan, peringatan, murid belum memilih',
        description:
          'Izin: `class:read`. Per murid: jumlah mapel berpenanda yang diambil dan hasil tiap aturan (`ok`, `below_min`, `above_max`) pada ' +
          '`semesterId` (bawaan: semester aktif tahun rombel, lalu yang paling awal). Per aturan: jumlah mapel ditawarkan terhadap `minOffered`. ' +
          '`unchosen` = murid tanpa satu pun mapel berpenanda. Peringatan hanya informasi; aturan `enforce` menolak saat penyimpanan.',
        headers: schoolHeader,
        params: idParams,
        querystring: z.object({ semesterId: z.uuid().optional() }),
        response: { 200: summaryResponse, 400: errorSchema, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const cls = await loadClass(tx, request.params.id);
        const sems = await semestersOfYear(tx, cls.academicYearId);
        let semesterId = request.query.semesterId ?? defaultSemester(sems);
        if (request.query.semesterId && !sems.some((s) => s.id === request.query.semesterId)) {
          throw invalidRef('Semester bukan milik tahun ajaran rombel ini.');
        }
        if (semesterId && sems.length === 0) semesterId = null;
        const participating = await participatingSubjectsOf(tx, cls.id);
        const rules = await rulesForClass(tx, cls);
        const roster = await activeStudentsOf(tx, cls);
        const rows = groupRows(
          await enrollmentRowsOf(
            tx,
            cls.academicYearId,
            roster.map((s) => s.id),
          ),
        );
        const takesAt = (studentId: string, subjectId: string) =>
          takesSubject({
            participating: participating.has(subjectId),
            rows: rows.get(keyOf(studentId, subjectId)) ?? [],
            semesterId: semesterId ?? '',
          });
        const students = roster.map((s) => {
          const results = evaluateStudentRules(rules, (id) => takesAt(s.id, id));
          return {
            studentId: s.id,
            name: s.name,
            nis: s.nis,
            religion: s.religion,
            takenCount: [...participating].filter((id) => takesAt(s.id, id)).length,
            results,
            warningCount: results.filter((r) => r.status !== 'ok').length,
          };
        });
        return {
          classId: cls.id,
          academicYearId: cls.academicYearId,
          semesterId,
          participatingSubjectIds: [...participating],
          rules: rules.map((r) => {
            const offered = r.subjectIds.filter((id) => participating.has(id)).length;
            return {
              ruleId: r.id,
              groupKey: r.groupKey,
              label: r.label,
              enforce: r.enforce,
              minChoices: r.minChoices,
              maxChoices: r.maxChoices,
              minOffered: r.minOffered,
              offered,
              offeredOk: evaluateOffered(r, offered),
            };
          }),
          students,
          unchosen:
            participating.size === 0
              ? []
              : students
                  .filter((s) => s.takenCount === 0)
                  .map((s) => ({ studentId: s.studentId, name: s.name })),
        };
      }),
  );

  app.get(
    '/v1/students/:id/subject-choices',
    {
      onRequest: studentReadGate,
      schema: {
        tags: tag,
        summary: 'Pilihan mapel satu murid pada satu tahun ajaran',
        description:
          'Izin: `student:read`. Rombel murid pada `academicYearId` (bawaan: tahun ajaran aktif), mapel berpenanda rombel itu, baris pilihan ' +
          'murid, dan hasil aturan pada `semesterId` (bawaan: semester aktif, lalu yang paling awal). Murid tanpa rombel pada tahun itu: ' +
          '`classId` null dan daftar kosong.',
        headers: schoolHeader,
        params: idParams,
        querystring: z.object({ academicYearId: z.uuid().optional(), semesterId: z.uuid().optional() }),
        response: {
          200: z.object({
            studentId: z.uuid(),
            academicYearId: z.uuid().nullable(),
            classId: z.uuid().nullable(),
            semesterId: z.uuid().nullable(),
            subjects: z.array(
              subjectBrief.extend({
                taking: z.boolean().describe('Mengambil mapel ini pada semester yang dinilai'),
              }),
            ),
            entries: z.array(entrySchema),
            results: z.array(ruleResultSchema),
          }),
          400: errorSchema,
          404: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const [stu] = await tx
          .select()
          .from(student)
          .where(and(eq(student.id, request.params.id), isNull(student.deletedAt)));
        if (!stu) throw notFound('Murid');
        let yearId = request.query.academicYearId ?? null;
        if (!yearId) {
          const [active] = await tx
            .select({ id: academicYear.id })
            .from(academicYear)
            .where(eq(academicYear.isActive, true));
          yearId = active?.id ?? null;
        }
        const empty = {
          studentId: stu.id,
          academicYearId: yearId,
          classId: null,
          semesterId: null,
          subjects: [],
          entries: [],
          results: [],
        };
        if (!yearId) return empty;
        const [enr] = await tx
          .select({ classId: enrollment.classId })
          .from(enrollment)
          .where(and(eq(enrollment.studentId, stu.id), eq(enrollment.academicYearId, yearId)));
        if (!enr) return empty;
        const cls = await loadClass(tx, enr.classId);
        const sems = await semestersOfYear(tx, yearId);
        if (request.query.semesterId && !sems.some((s) => s.id === request.query.semesterId)) {
          throw invalidRef('Semester bukan milik tahun ajaran itu.');
        }
        const semesterId = request.query.semesterId ?? defaultSemester(sems);
        const participating = await participatingSubjectsOf(tx, cls.id);
        const rows = (await enrollmentRowsOf(tx, yearId, [stu.id])).filter((r) =>
          participating.has(r.subjectId),
        );
        const subs = participating.size
          ? await tx
              .select()
              .from(subject)
              .where(inArray(subject.id, [...participating]))
              .orderBy(asc(subject.name))
          : [];
        const variantOf = new Map(
          subs.map((s) => [s.id, s.religionVariant as SubjectReligionVariant | null]),
        );
        const grouped = groupRows(rows);
        const takesAt = (subjectId: string) =>
          takesSubject({
            participating: true,
            rows: grouped.get(keyOf(stu.id, subjectId)) ?? [],
            semesterId: semesterId ?? '',
          });
        const rules = await rulesForClass(tx, cls);
        return {
          studentId: stu.id,
          academicYearId: yearId,
          classId: cls.id,
          semesterId,
          subjects: subs.map((s) => ({
            subjectId: s.id,
            code: s.code,
            name: s.name,
            kind: s.kind,
            religionVariant: s.religionVariant,
            taking: takesAt(s.id),
          })),
          entries: rows.map((r) => ({
            studentId: r.studentId,
            subjectId: r.subjectId,
            semesterId: r.semesterId,
            source: r.source,
            note: r.note,
            ...(religionMatch(stu.religion as StudentReligion | null, variantOf.get(r.subjectId)) ===
            'mismatch'
              ? { religionMismatch: true as const }
              : {}),
          })),
          results: evaluateStudentRules(rules, (id) =>
            takesSubject({
              participating: participating.has(id),
              rows: grouped.get(keyOf(stu.id, id)) ?? [],
              semesterId: semesterId ?? '',
            }),
          ),
        };
      }),
  );

  /* ----- Aturan pilihan sekolah ----- */

  app.get(
    '/v1/subject-choice-rules',
    {
      onRequest: ruleReadGate,
      schema: {
        tags: tag,
        summary: 'Daftar aturan pilihan mapel',
        description:
          'Izin: `subject:read`. Aturan pilihan per tahun ajaran (`academicYearId`, bawaan semua), tingkat, dan program opsional: batas jumlah ' +
          'dipilih, minimal ditawarkan, `enforce`, batas ganti pilihan, dan mapel anggota.',
        headers: schoolHeader,
        querystring: z.object({ academicYearId: z.uuid().optional() }),
        response: { 200: z.array(ruleView), ...guarded },
      },
    },
    async (request) =>
      tenant(request, (tx) =>
        loadRuleViews(
          tx,
          request.query.academicYearId
            ? eq(subjectChoiceRule.academicYearId, request.query.academicYearId)
            : undefined,
        ),
      ),
  );

  app.post(
    '/v1/subject-choice-rules',
    {
      onRequest: ruleWriteGate,
      schema: {
        tags: tag,
        summary: 'Buat aturan pilihan mapel',
        description:
          'Izin: `subject_choice:manage`. Satu aturan per (tahun ajaran, tingkat, program, kunci kelompok); duplikat 409 `conflict`. ' +
          'Bawaan hanya peringatan (`enforce` false). Rujukan tidak valid (tahun, program, semester batas, mapel): 400 `invalid_reference`.',
        headers: schoolHeader,
        body: ruleBody,
        response: { 201: ruleView, 400: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      const view = await conflictAs409('Aturan untuk kelompok, tingkat, dan program itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const subjectIds = await validateRuleRefs(tx, b);
          const [row] = await tx
            .insert(subjectChoiceRule)
            .values({
              schoolId: ctx.schoolId,
              academicYearId: b.academicYearId,
              levelCode: b.levelCode,
              programId: b.programId,
              groupKey: b.groupKey,
              label: b.label,
              minChoices: b.minChoices,
              maxChoices: b.maxChoices,
              minOffered: b.minOffered,
              enforce: b.enforce,
              lockedFromSemesterId: b.lockedFromSemesterId,
            })
            .returning();
          if (subjectIds.length) {
            await tx
              .insert(subjectChoiceRuleSubject)
              .values(
                subjectIds.map((subjectId) => ({ schoolId: ctx.schoolId, ruleId: row!.id, subjectId })),
              );
          }
          await audit(tx, ctx, 'subject_choice.rule_create', 'subject_choice_rule', row!.id, {
            groupKey: b.groupKey,
            levelCode: b.levelCode,
            enforce: b.enforce,
          });
          return (await loadRuleViews(tx, eq(subjectChoiceRule.id, row!.id)))[0]!;
        }),
      );
      return reply.code(201).send(view);
    },
  );

  app.put(
    '/v1/subject-choice-rules/:id',
    {
      onRequest: ruleWriteGate,
      schema: {
        tags: tag,
        summary: 'Ubah aturan pilihan mapel',
        description:
          'Izin: `subject_choice:manage`. Mengganti seluruh isi aturan, termasuk daftar mapel anggota. Aturan tidak menghapus pilihan ' +
          'murid yang sudah ada; hanya menentukan peringatan atau penolakan pada penyimpanan berikutnya.',
        headers: schoolHeader,
        params: idParams,
        body: ruleBody,
        response: { 200: ruleView, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const b = request.body;
      return conflictAs409('Aturan untuk kelompok, tingkat, dan program itu sudah ada.', () =>
        tenant(request, async (tx) => {
          const [cur] = await tx
            .select()
            .from(subjectChoiceRule)
            .where(eq(subjectChoiceRule.id, request.params.id));
          if (!cur) throw notFound('Aturan');
          const subjectIds = await validateRuleRefs(tx, b);
          await tx
            .update(subjectChoiceRule)
            .set({
              academicYearId: b.academicYearId,
              levelCode: b.levelCode,
              programId: b.programId,
              groupKey: b.groupKey,
              label: b.label,
              minChoices: b.minChoices,
              maxChoices: b.maxChoices,
              minOffered: b.minOffered,
              enforce: b.enforce,
              lockedFromSemesterId: b.lockedFromSemesterId,
              updatedAt: new Date(),
            })
            .where(eq(subjectChoiceRule.id, cur.id));
          await tx.delete(subjectChoiceRuleSubject).where(eq(subjectChoiceRuleSubject.ruleId, cur.id));
          if (subjectIds.length) {
            await tx
              .insert(subjectChoiceRuleSubject)
              .values(subjectIds.map((subjectId) => ({ schoolId: ctx.schoolId, ruleId: cur.id, subjectId })));
          }
          await audit(tx, ctx, 'subject_choice.rule_update', 'subject_choice_rule', cur.id, {
            groupKey: b.groupKey,
            enforce: b.enforce,
          });
          return (await loadRuleViews(tx, eq(subjectChoiceRule.id, cur.id)))[0]!;
        }),
      );
    },
  );

  app.delete(
    '/v1/subject-choice-rules/:id',
    {
      onRequest: ruleWriteGate,
      schema: {
        tags: tag,
        summary: 'Hapus aturan pilihan mapel',
        description:
          'Izin: `subject_choice:manage`. Menghapus aturan dan daftar mapel anggotanya; pilihan murid tidak berubah.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: ok, 404: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      await tenant(request, async (tx) => {
        const [cur] = await tx
          .select()
          .from(subjectChoiceRule)
          .where(eq(subjectChoiceRule.id, request.params.id));
        if (!cur) throw notFound('Aturan');
        await tx.delete(subjectChoiceRule).where(eq(subjectChoiceRule.id, cur.id));
        await audit(tx, ctx, 'subject_choice.rule_delete', 'subject_choice_rule', cur.id, {
          groupKey: cur.groupKey,
          levelCode: cur.levelCode,
        });
      });
      return { ok: true as const };
    },
  );
}
