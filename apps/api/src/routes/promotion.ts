import {
  deriveTargetClassName,
  firstLevel,
  isFinalLevel,
  nextLevel,
  PROMOTION_DECISIONS,
  type PromotionDecision,
  shiftDateByYears,
  sortLevels,
} from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  calendarEvent,
  classRoom,
  desc,
  enrollment,
  eq,
  inArray,
  isNull,
  program,
  promotionDecision,
  reportCard,
  schoolLevel,
  semester,
  sql,
  student,
  type Tx,
  teacher,
  teachingAssignment,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { recordHomeroomChange, recordTeachingChange } from '../assignment-history-lib';
import { errorSchema, HttpError } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';
import { assertClassYearNotClosed } from '../report-lock-lib';
import { copyCurriculumStructure } from './curriculum-structure';
import { audit, conflictAs409, guarded, idParams, schoolHeader } from './helpers';
import { copyTeachingPlans } from './teaching-plan';

/**
 * Rollover tahun ajaran dan kenaikan kelas (fase 2A). Semua tulisan hanya menyentuh tahun tujuan (kelas, penugasan,
 * kalender, enrollment) dan status siswa yang lulus; kelas, penugasan, dan rapor tahun sumber tidak pernah diubah,
 * jadi rapor final tahun lalu tetap utuh.
 */

const decisionEnum = z.enum(PROMOTION_DECISIONS);
type YearRow = typeof academicYear.$inferSelect;

const notFound = (what: string) => new HttpError(404, 'not_found', `${what} tidak ditemukan.`);
const bad = (code: string, message: string) => new HttpError(400, code, message);

async function loadYear(tx: Tx, id: string): Promise<YearRow> {
  const [row] = await tx.select().from(academicYear).where(eq(academicYear.id, id));
  if (!row) throw notFound('Tahun ajaran');
  return row;
}

/** Tahun tujuan harus tahun lain milik sekolah ini yang dimulai setelah tahun sumber. */
async function loadTargetYear(tx: Tx, source: YearRow, targetYearId: string): Promise<YearRow> {
  if (targetYearId === source.id) {
    throw bad('invalid_target', 'Tahun ajaran tujuan tidak boleh sama dengan tahun ajaran sumber.');
  }
  const [target] = await tx.select().from(academicYear).where(eq(academicYear.id, targetYearId));
  if (!target) throw bad('invalid_target', 'Tahun ajaran tujuan tidak ditemukan.');
  if (target.startsOn <= source.startsOn) {
    throw bad('invalid_target', 'Tahun ajaran tujuan harus dimulai setelah tahun ajaran sumber.');
  }
  return target;
}

const loadLevels = (tx: Tx) =>
  tx.select({ code: schoolLevel.code, sort: schoolLevel.sort }).from(schoolLevel);

/**
 * Tingkat akhir per program (`program.final_level_code`). Kelas tanpa program, atau program tanpa tingkat akhir, memakai
 * tingkat dengan `sort` terbesar (aturan lama).
 */
async function loadFinalLevelResolver(tx: Tx) {
  const rows = await tx.select({ id: program.id, finalLevelCode: program.finalLevelCode }).from(program);
  const byProgram = new Map(rows.map((r) => [r.id, r.finalLevelCode]));
  return (programId: string | null | undefined): string | null =>
    programId ? (byProgram.get(programId) ?? null) : null;
}

/** Kunci per tahun tujuan: dua rollover atau penerapan bersamaan untuk tahun yang sama berjalan bergantian. */
const lockTarget = (tx: Tx, kind: string, targetYearId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${kind}:${targetYearId}`}))`);

/**
 * Kunci per TAHUN SUMBER untuk menyimpan dan menerapkan keputusan: dua penerapan ke tahun tujuan berbeda, atau simpan
 * bersamaan dengan penerapan, berjalan bergantian sehingga satu keputusan tidak diterapkan dua kali. Selalu diambil
 * SEBELUM kunci tahun tujuan agar urutan kunci seragam (tanpa deadlock).
 */
const lockSource = (tx: Tx, sourceYearId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`promotion:${sourceYearId}`}))`);

/** Tingkat kelas dikenal bila ada di daftar tingkat sekolah; tingkat tak dikenal tidak punya tingkat berikutnya. */
const isKnownLevel = (levels: readonly { code: string }[], code: string) =>
  levels.some((l) => l.code === code);

/* ---------- Skema ---------- */

const studentEntry = z.object({
  studentId: z.uuid(),
  name: z.string(),
  nis: z.string().nullable(),
  decision: decisionEnum.nullable().describe('Keputusan tersimpan; null bila belum diputuskan'),
  suggestedDecision: z
    .enum(['promote', 'graduate'])
    .nullable()
    .describe(
      'Saran bawaan: `promote` bila bukan tingkat akhir; null di tingkat akhir (kelulusan ditetapkan sekolah, wajib dipilih eksplisit)',
    ),
  toClassId: z
    .uuid()
    .nullable()
    .describe('Kelas tujuan eksplisit; null = ditentukan otomatis saat diterapkan'),
  note: z.string().nullable(),
  reason: z.string().nullable().optional().describe('Alasan keputusan (mis. tinggal kelas)'),
  followUp: z.string().nullable().optional().describe('Tindak lanjut'),
  meetingDate: z.iso.date().nullable().optional().describe('Tanggal rapat dewan pendidik'),
  applied: z.boolean().describe('Keputusan sudah diterapkan ke tahun tujuan; tidak bisa diubah lagi'),
});

const classEntry = z.object({
  classId: z.uuid(),
  name: z.string(),
  level: z.string(),
  nextLevel: z.string().nullable(),
  isFinalLevel: z.boolean(),
  levelUnknown: z
    .boolean()
    .optional()
    .describe(
      'true bila tingkat kelas tidak ada di daftar tingkat sekolah: tidak ada saran `promote`, dan naik kelas wajib menyertakan `toClassId` (400 `level_unknown`)',
    ),
  students: z.array(studentEntry),
});

const listResponse = z.object({
  academicYear: z.object({ id: z.uuid(), name: z.string(), startsOn: z.iso.date(), endsOn: z.iso.date() }),
  classes: z.array(classEntry),
});

const decisionsBody = z.object({
  decisions: z
    .array(
      z.object({
        studentId: z.uuid(),
        decision: decisionEnum,
        toClassId: z.uuid().nullable().optional(),
        note: z.string().trim().max(500).nullable().optional(),
        reason: z.string().trim().max(1000).nullable().optional(),
        followUp: z.string().trim().max(1000).nullable().optional(),
        meetingDate: z.iso.date().nullable().optional(),
      }),
    )
    .min(1)
    .max(2000),
});

const rolloverBody = z.object({
  targetYearId: z.uuid(),
  copyClasses: z.boolean().default(true),
  copyAssignments: z.boolean().default(true),
  copyCalendar: z
    .boolean()
    .default(false)
    .describe(
      'Salin kalender akademik (tanggal digeser selisih tahun mulai); bawaan false karena kalender tiap tahun berbeda',
    ),
  copyCurriculum: z.boolean().optional().describe('Salin alokasi JP dan versi kurikulum; bawaan true'),
  copyTeachingPlans: z
    .boolean()
    .optional()
    .describe('Salin ATP berstatus terbit sebagai draf ATP tahun tujuan; bawaan true'),
  dryRun: z.boolean().default(false),
});

const rolloverResponse = z.object({
  classesCreated: z.number().int(),
  classesSkipped: z.number().int(),
  assignmentsCreated: z.number().int(),
  eventsCreated: z.number().int(),
  allocationsCreated: z.number().int().optional(),
  versionsCreated: z.number().int().optional(),
  flowsCreated: z.number().int().optional(),
  warnings: z.array(z.string()),
  warningItems: z
    .array(z.object({ code: z.string(), params: z.record(z.string(), z.union([z.string(), z.number()])) }))
    .optional()
    .describe(
      'Peringatan terstruktur (kode stabil + parameter) yang sejajar dengan `warnings`, untuk diterjemahkan klien',
    ),
});

const applyBody = z.object({ targetYearId: z.uuid(), dryRun: z.boolean().default(false) });

const applyResponse = z.object({
  placed: z.number().int().describe('Siswa naik kelas yang ditempatkan di kelas tahun tujuan'),
  retained: z.number().int().describe('Siswa tinggal kelas yang ditempatkan di kelas sebaya tahun tujuan'),
  graduated: z.number().int().describe('Siswa yang statusnya menjadi lulus'),
  unplaced: z.array(
    z.object({
      studentId: z.uuid(),
      reason: z.string(),
      reasonCode: z
        .string()
        .optional()
        .describe(
          'Kode alasan stabil: student_missing, student_not_active, source_class_missing, target_class_invalid, no_next_level, no_target_class, not_final_level',
        ),
      reasonParams: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    }),
  ),
  alreadyEnrolled: z
    .array(z.object({ studentId: z.uuid(), classId: z.uuid() }))
    .describe('Sudah punya enrollment di tahun tujuan: dilewati, keputusannya tetap menunggu'),
  skippedNoDecision: z.number().int().describe('Siswa aktif tahun sumber yang belum punya keputusan'),
  graduateReportNotFinal: z
    .number()
    .int()
    .optional()
    .describe(
      'Jumlah siswa lulus yang kelas asalnya belum punya rapor final pada semester terakhir tahun sumber. Lulusan tetap tampil di rapor kelas tahun terakhirnya dan dapat difinalkan sesudah ditetapkan lulus; peringatan ini hanya mengingatkan bahwa rapornya belum final',
    ),
  warningItems: z
    .array(z.object({ code: z.string(), params: z.record(z.string(), z.union([z.string(), z.number()])) }))
    .optional()
    .describe('Peringatan terstruktur (kode stabil + parameter): graduate_report_not_final'),
});

/* ---------- Rollover ---------- */

type ClassRow = typeof classRoom.$inferSelect;
interface Copy {
  id: string;
  isNew: boolean;
  /** Salinan tingkat berikutnya (dipakai untuk memetakan kalender kelas); tingkat pertama juga disalin ke tingkat yang sama. */
  primary: boolean;
}

async function runRollover(
  tx: Tx,
  ctx: TenantContext,
  source: YearRow,
  target: YearRow,
  body: z.infer<typeof rolloverBody>,
) {
  const warnings: string[] = [];
  const warningItems: { code: string; params: Record<string, string | number> }[] = [];
  const warn = (code: string, params: Record<string, string | number>, message: string) => {
    warnings.push(message);
    warningItems.push({ code, params });
  };
  const out = {
    classesCreated: 0,
    classesSkipped: 0,
    assignmentsCreated: 0,
    eventsCreated: 0,
    allocationsCreated: 0,
    versionsCreated: 0,
    flowsCreated: 0,
    warnings,
    warningItems,
  };
  const write = !body.dryRun;
  const levels = await loadLevels(tx);
  if (levels.length === 0 && (body.copyClasses || body.copyAssignments)) {
    throw bad(
      'levels_not_configured',
      'Daftar tingkat sekolah masih kosong. Atur tingkat di Pengaturan sekolah sebelum menyalin kelas.',
    );
  }
  const first = firstLevel(levels);
  const finalOf = await loadFinalLevelResolver(tx);
  const srcClasses = await tx
    .select()
    .from(classRoom)
    .where(eq(classRoom.academicYearId, source.id))
    .orderBy(asc(classRoom.level), asc(classRoom.name));
  const tgtClasses = await tx.select().from(classRoom).where(eq(classRoom.academicYearId, target.id));
  const tgtByName = new Map(tgtClasses.map((c) => [c.name, c]));
  const inactive = new Set(
    (await tx.select({ id: teacher.id }).from(teacher).where(eq(teacher.status, 'inactive'))).map(
      (t) => t.id,
    ),
  );

  // 1. Rencana salinan kelas: tingkat non-akhir menjadi tingkat berikutnya; tingkat pertama juga disalin apa adanya
  //    (siswa baru dan yang tinggal kelas). Tingkat akhir tidak disalin.
  interface Planned {
    src: ClassRow;
    name: string;
    level: string;
    primary: boolean;
  }
  const planned: Planned[] = [];
  const seen = new Set<string>();
  let finalLevelClasses = 0;
  for (const c of srcClasses) {
    if (!levels.some((l) => l.code === c.level)) {
      warn(
        'class_level_unknown',
        { className: c.name, level: c.level },
        `Kelas "${c.name}" bertingkat "${c.level}" yang tidak ada di daftar tingkat sekolah, jadi dilewati.`,
      );
      if (body.copyClasses) out.classesSkipped++;
      continue;
    }
    const finalCode = finalOf(c.programId);
    if (isFinalLevel(levels, c.level, finalCode)) {
      finalLevelClasses++;
      continue;
    }
    const next = nextLevel(levels, c.level, finalCode) as string;
    const derived = deriveTargetClassName(c.name, c.level, next);
    if (derived.warning) warn('class_name_unmatched', { className: c.name, level: c.level }, derived.warning);
    const candidates: Planned[] = [{ src: c, name: derived.name, level: next, primary: true }];
    if (c.level === first) candidates.push({ src: c, name: c.name, level: c.level, primary: false });
    for (const cand of candidates) {
      if (seen.has(cand.name)) {
        warn(
          'class_name_conflict',
          { className: cand.name, sourceName: c.name },
          `Kelas hasil salinan "${cand.name}" (dari "${c.name}") bentrok dengan kelas lain dalam rencana yang sama, jadi dilewati.`,
        );
        if (body.copyClasses) out.classesSkipped++;
        continue;
      }
      seen.add(cand.name);
      planned.push(cand);
    }
  }
  if (finalLevelClasses > 0) {
    warn(
      'final_level_not_copied',
      { count: finalLevelClasses },
      `${finalLevelClasses} kelas tingkat akhir tidak disalin (kelulusan ditetapkan sekolah).`,
    );
  }

  // 2. Kelas: cocokkan dengan kelas tahun tujuan menurut nama; yang sudah ada dilewati.
  const copies = new Map<string, Copy[]>();
  const homeroomLoad = new Map<string, number>();
  let inactiveHomerooms = 0;
  for (const p of planned) {
    const existing = tgtByName.get(p.name);
    let copy: Copy | null = null;
    if (existing) {
      if (body.copyClasses) out.classesSkipped++;
      if (existing.level !== p.level) {
        warn(
          'class_level_mismatch',
          { className: p.name, existingLevel: existing.level, expectedLevel: p.level },
          `Kelas "${p.name}" sudah ada di tahun tujuan dengan tingkat "${existing.level}" (seharusnya "${p.level}"); dipakai apa adanya.`,
        );
      }
      copy = { id: existing.id, isNew: false, primary: p.primary };
    } else if (body.copyClasses) {
      let homeroom = p.src.homeroomTeacherId;
      if (homeroom && inactive.has(homeroom)) {
        homeroom = null;
        inactiveHomerooms++;
      }
      if (homeroom) homeroomLoad.set(homeroom, (homeroomLoad.get(homeroom) ?? 0) + 1);
      out.classesCreated++;
      if (write) {
        const [row] = await tx
          .insert(classRoom)
          .values({
            schoolId: ctx.schoolId,
            academicYearId: target.id,
            programId: p.src.programId,
            name: p.name,
            level: p.level,
            homeroomTeacherId: homeroom,
          })
          .onConflictDoNothing()
          .returning({ id: classRoom.id });
        if (!row) {
          // Dibuat pihak lain di antara pembacaan dan penulisan: perlakukan sebagai sudah ada.
          out.classesCreated--;
          out.classesSkipped++;
          const [again] = await tx
            .select({ id: classRoom.id })
            .from(classRoom)
            .where(and(eq(classRoom.academicYearId, target.id), eq(classRoom.name, p.name)));
          if (again) copy = { id: again.id, isNew: false, primary: p.primary };
        } else {
          if (homeroom) {
            await recordHomeroomChange(tx, {
              schoolId: ctx.schoolId,
              classId: row.id,
              teacherId: homeroom,
              previousTeacherId: null,
              actorId: ctx.userId,
            });
          }
          copy = { id: row.id, isNew: true, primary: p.primary };
        }
      } else {
        copy = { id: `rencana:${p.name}`, isNew: true, primary: p.primary };
      }
    }
    if (copy) copies.set(p.src.id, [...(copies.get(p.src.id) ?? []), copy]);
  }
  if (inactiveHomerooms > 0) {
    warn(
      'inactive_homeroom_skipped',
      { count: inactiveHomerooms },
      `${inactiveHomerooms} wali kelas nonaktif tidak disalin; isi wali kelasnya di tahun tujuan.`,
    );
  }
  const doubled = [...homeroomLoad.values()].filter((n) => n > 1).length;
  if (doubled > 0) {
    warn(
      'homeroom_multiple',
      { count: doubled },
      `${doubled} guru menjadi wali kelas di lebih dari satu kelas hasil salinan (kelas tingkat pertama disalin dua kali); periksa wali kelas di tahun tujuan.`,
    );
  }

  // 3. Penugasan guru mapel ke setiap kelas hasil salinan (yang sudah ada tidak ditimpa).
  if (body.copyAssignments && copies.size > 0) {
    const srcAssign = await tx
      .select()
      .from(teachingAssignment)
      .where(inArray(teachingAssignment.classId, [...copies.keys()]));
    const realTargets = [...copies.values()].flat().filter((c) => !c.id.startsWith('rencana:'));
    const have = new Set<string>();
    if (realTargets.length > 0) {
      const rows = await tx
        .select({ classId: teachingAssignment.classId, subjectId: teachingAssignment.subjectId })
        .from(teachingAssignment)
        .where(
          inArray(
            teachingAssignment.classId,
            realTargets.map((c) => c.id),
          ),
        );
      for (const r of rows) have.add(`${r.classId}|${r.subjectId}`);
    }
    const toInsert: { classId: string; subjectId: string; teacherId: string }[] = [];
    let inactiveTeachers = 0;
    for (const a of srcAssign) {
      if (inactive.has(a.teacherId)) {
        inactiveTeachers++;
        continue;
      }
      for (const copy of copies.get(a.classId) ?? []) {
        if (have.has(`${copy.id}|${a.subjectId}`)) continue;
        toInsert.push({ classId: copy.id, subjectId: a.subjectId, teacherId: a.teacherId });
      }
    }
    if (inactiveTeachers > 0) {
      warn(
        'inactive_teacher_skipped',
        { count: inactiveTeachers },
        `${inactiveTeachers} penugasan guru nonaktif tidak disalin.`,
      );
    }
    out.assignmentsCreated = toInsert.length;
    if (write && toInsert.length > 0) {
      const existingTouched = new Set(
        toInsert.map((r) => r.classId).filter((id) => realTargets.some((c) => c.id === id && !c.isNew)),
      );
      for (const id of existingTouched) await assertClassYearNotClosed(tx, id);
      const inserted = await tx
        .insert(teachingAssignment)
        .values(toInsert.map((r) => ({ schoolId: ctx.schoolId, ...r })))
        .onConflictDoNothing()
        .returning({
          classId: teachingAssignment.classId,
          subjectId: teachingAssignment.subjectId,
          teacherId: teachingAssignment.teacherId,
        });
      out.assignmentsCreated = inserted.length;
      for (const r of inserted) {
        await recordTeachingChange(tx, {
          schoolId: ctx.schoolId,
          classId: r.classId,
          subjectId: r.subjectId,
          teacherId: r.teacherId,
          previousTeacherId: null,
          actorId: ctx.userId,
        });
      }
    }
  }

  // 4. Kalender: tanggal digeser selisih tahun mulai; cakupan kelas dipetakan ke kelas baru atau dilewati.
  if (body.copyCalendar ?? false) {
    const events = await tx.select().from(calendarEvent).where(eq(calendarEvent.academicYearId, source.id));
    const key = (e: {
      type: string;
      scope: string;
      classId: string | null;
      programId: string | null;
      title: string;
      startsOn: string;
    }) => [e.type, e.scope, e.classId ?? '', e.programId ?? '', e.title, e.startsOn].join('|');
    const present = new Set(
      (await tx.select().from(calendarEvent).where(eq(calendarEvent.academicYearId, target.id))).map(key),
    );
    const years = Number(target.startsOn.slice(0, 4)) - Number(source.startsOn.slice(0, 4));
    const toInsert: (typeof calendarEvent.$inferInsert)[] = [];
    let skippedClass = 0;
    let skippedRange = 0;
    for (const e of events) {
      let classId: string | null = null;
      if (e.scope === 'class') {
        const list = copies.get(e.classId ?? '') ?? [];
        const pick = list.find((c) => c.primary) ?? list[0];
        if (!pick) {
          skippedClass++;
          continue;
        }
        classId = pick.id;
      }
      const startsOn = shiftDateByYears(e.startsOn, years);
      const endsOn = shiftDateByYears(e.endsOn, years);
      if (startsOn < target.startsOn || endsOn > target.endsOn) {
        skippedRange++;
        continue;
      }
      const row = {
        type: e.type,
        scope: e.scope,
        classId,
        programId: e.scope === 'program' ? e.programId : null,
        title: e.title,
        startsOn,
        endsOn,
      };
      if (present.has(key(row))) continue;
      present.add(key(row));
      toInsert.push({ schoolId: ctx.schoolId, academicYearId: target.id, ...row });
    }
    if (skippedClass > 0) {
      warn(
        'event_class_skipped',
        { count: skippedClass },
        `${skippedClass} acara kalender kelas dilewati karena kelas tujuannya tidak ada.`,
      );
    }
    if (skippedRange > 0) {
      warn(
        'event_out_of_year',
        { count: skippedRange },
        `${skippedRange} acara kalender dilewati karena tanggalnya jatuh di luar tahun ajaran tujuan.`,
      );
    }
    out.eventsCreated = toInsert.length;
    if (write && toInsert.length > 0) await tx.insert(calendarEvent).values(toInsert);
  }

  // 5. Struktur kurikulum: alokasi JP dan versi kurikulum per tingkat (tingkat yang sama; yang sudah ada tidak ditimpa).
  if (body.copyCurriculum ?? true) {
    const copied = await copyCurriculumStructure(tx, ctx, source.id, target.id, write);
    out.allocationsCreated = copied.allocationsCreated;
    out.versionsCreated = copied.versionsCreated;
  }

  // 6. ATP berstatus terbit tahun sumber menjadi draf ATP tahun tujuan (CP/TP tetap yang sama; yang sudah ada tidak ditimpa).
  if (body.copyTeachingPlans ?? true) {
    const copied = await copyTeachingPlans(tx, ctx, source.id, target.id, write);
    out.flowsCreated = copied.flowsCreated;
    if (copied.inactiveItems > 0) {
      warn(
        'flow_inactive_objectives',
        { flows: copied.inactiveFlows, items: copied.inactiveItems },
        `${copied.inactiveFlows} ATP hasil salinan memuat ${copied.inactiveItems} item TP nonaktif; ganti TP-nya sebelum menerbitkan ATP itu.`,
      );
    }
  }

  if (write) {
    await audit(tx, ctx, 'academic_year.rollover', 'academic_year', source.id, {
      targetYearId: target.id,
      classesCreated: out.classesCreated,
      classesSkipped: out.classesSkipped,
      assignmentsCreated: out.assignmentsCreated,
      eventsCreated: out.eventsCreated,
      allocationsCreated: out.allocationsCreated,
      versionsCreated: out.versionsCreated,
      flowsCreated: out.flowsCreated,
    });
  }
  return out;
}

/* ---------- Penerapan keputusan ---------- */

async function runApply(
  tx: Tx,
  ctx: TenantContext,
  source: YearRow,
  target: YearRow,
  body: z.infer<typeof applyBody>,
) {
  const write = !body.dryRun;
  const levels = await loadLevels(tx);
  const finalOf = await loadFinalLevelResolver(tx);
  const decisions = await tx
    .select()
    .from(promotionDecision)
    .where(and(eq(promotionDecision.academicYearId, source.id), isNull(promotionDecision.appliedAt)))
    .orderBy(asc(promotionDecision.decidedAt));

  const studentIds = decisions.map((d) => d.studentId);
  const students = new Map(
    (studentIds.length
      ? await tx
          .select({ id: student.id, status: student.status, deletedAt: student.deletedAt })
          .from(student)
          .where(inArray(student.id, studentIds))
      : []
    ).map((s) => [s.id, s]),
  );
  const fromClasses = new Map(
    (decisions.length
      ? await tx
          .select()
          .from(classRoom)
          .where(
            inArray(
              classRoom.id,
              decisions.map((d) => d.fromClassId),
            ),
          )
      : []
    ).map((c) => [c.id, c]),
  );
  const explicitIds = [...new Set(decisions.flatMap((d) => (d.toClassId ? [d.toClassId] : [])))];
  const explicit = new Map(
    (explicitIds.length
      ? await tx.select().from(classRoom).where(inArray(classRoom.id, explicitIds))
      : []
    ).map((c) => [c.id, c]),
  );
  const targetClasses = await tx
    .select()
    .from(classRoom)
    .where(eq(classRoom.academicYearId, target.id))
    .orderBy(asc(classRoom.name));
  const enrolledTarget = new Map(
    (studentIds.length
      ? await tx
          .select({ studentId: enrollment.studentId, classId: enrollment.classId })
          .from(enrollment)
          .where(and(eq(enrollment.academicYearId, target.id), inArray(enrollment.studentId, studentIds)))
      : []
    ).map((e) => [e.studentId, e.classId]),
  );

  const out = {
    placed: 0,
    retained: 0,
    graduated: 0,
    unplaced: [] as {
      studentId: string;
      reason: string;
      reasonCode?: string;
      reasonParams?: Record<string, string | number>;
    }[],
    alreadyEnrolled: [] as { studentId: string; classId: string }[],
    skippedNoDecision: 0,
    graduateReportNotFinal: 0,
    warningItems: [] as { code: string; params: Record<string, string | number> }[],
  };
  /** Penempatan yang direncanakan; hanya yang benar-benar menghasilkan enrollment yang ditandai diterapkan. */
  const pending: { decisionId: string; decision: string; row: typeof enrollment.$inferInsert }[] = [];
  const graduates: { decisionId: string; studentId: string; classId: string }[] = [];

  /**
   * Kelas tujuan otomatis: kelas bernama sama dengan turunan nama kelas asal; bila tidak ada, satu-satunya kelas
   * sejurusan pada tingkat itu (hanya bila kelas asal punya jurusan). Selain itu null (tidak ditebak): siswa dilaporkan
   * `unplaced` agar sekolah membuat kelasnya atau memilih kelas tujuan eksplisit.
   */
  const pickClass = (from: typeof classRoom.$inferSelect, level: string) => {
    const derived =
      level === from.level ? from.name : deriveTargetClassName(from.name, from.level, level).name;
    const pool = targetClasses.filter((c) => c.level === level);
    const byName = pool.find((c) => c.name === derived);
    if (byName) return byName;
    if (from.programId) {
      const samePrograms = pool.filter((c) => c.programId === from.programId);
      if (samePrograms.length === 1) return samePrograms[0] as typeof classRoom.$inferSelect;
    }
    return null;
  };

  for (const d of decisions) {
    const stu = students.get(d.studentId);
    if (!stu || stu.deletedAt) {
      out.unplaced.push({
        studentId: d.studentId,
        reason: 'Siswa tidak ditemukan atau sudah dihapus.',
        reasonCode: 'student_missing',
      });
      continue;
    }
    if (stu.status !== 'active') {
      out.unplaced.push({
        studentId: d.studentId,
        reason: `Status siswa "${stu.status}", bukan aktif, jadi keputusan tidak diterapkan.`,
        reasonCode: 'student_not_active',
        reasonParams: { status: stu.status },
      });
      continue;
    }
    if (d.decision === 'graduate') {
      // Tingkat akhir divalidasi ulang: daftar tingkat atau tingkat akhir jurusan bisa berubah sejak keputusan disimpan.
      const from = fromClasses.get(d.fromClassId);
      if (!from) {
        out.unplaced.push({
          studentId: d.studentId,
          reason: 'Kelas asal siswa sudah tidak ada.',
          reasonCode: 'source_class_missing',
        });
        continue;
      }
      if (!isFinalLevel(levels, from.level, finalOf(from.programId))) {
        out.unplaced.push({
          studentId: d.studentId,
          reason: `Kelas "${from.name}" (tingkat "${from.level}") bukan tingkat akhir lagi, jadi keputusan lulus tidak diterapkan. Ubah keputusannya.`,
          reasonCode: 'not_final_level',
          reasonParams: { className: from.name, level: from.level },
        });
        continue;
      }
      out.graduated++;
      graduates.push({ decisionId: d.id, studentId: d.studentId, classId: from.id });
      continue;
    }
    const already = enrolledTarget.get(d.studentId);
    if (already) {
      out.alreadyEnrolled.push({ studentId: d.studentId, classId: already });
      continue;
    }
    const from = fromClasses.get(d.fromClassId);
    if (!from) {
      out.unplaced.push({
        studentId: d.studentId,
        reason: 'Kelas asal siswa sudah tidak ada.',
        reasonCode: 'source_class_missing',
      });
      continue;
    }
    let dest: typeof classRoom.$inferSelect | null = null;
    if (d.toClassId) {
      const picked = explicit.get(d.toClassId);
      if (!picked || picked.academicYearId !== target.id) {
        out.unplaced.push({
          studentId: d.studentId,
          reason: 'Kelas tujuan yang dipilih bukan kelas pada tahun ajaran tujuan.',
          reasonCode: 'target_class_invalid',
        });
        continue;
      }
      dest = picked;
    } else {
      const level =
        d.decision === 'promote' ? nextLevel(levels, from.level, finalOf(from.programId)) : from.level;
      if (!level) {
        out.unplaced.push({
          studentId: d.studentId,
          reason: `Kelas "${from.name}" tidak punya tingkat berikutnya; gunakan keputusan lulus atau pilih kelas tujuan.`,
          reasonCode: 'no_next_level',
          reasonParams: { className: from.name },
        });
        continue;
      }
      dest = pickClass(from, level);
      if (!dest) {
        out.unplaced.push({
          studentId: d.studentId,
          reason: `Tahun ajaran tujuan belum punya kelas tingkat "${level}" yang cocok untuk "${from.name}". Jalankan rollover, buat kelasnya, atau pilih kelas tujuan.`,
          reasonCode: 'no_target_class',
          reasonParams: { level },
        });
        continue;
      }
    }
    if (d.decision === 'promote') out.placed++;
    else out.retained++;
    pending.push({
      decisionId: d.id,
      decision: d.decision,
      row: { schoolId: ctx.schoolId, studentId: d.studentId, classId: dest.id, academicYearId: target.id },
    });
  }

  // Siswa aktif tahun sumber yang belum punya keputusan sama sekali.
  const enrolledSource = await tx
    .select({ studentId: enrollment.studentId })
    .from(enrollment)
    .innerJoin(student, eq(student.id, enrollment.studentId))
    .where(
      and(eq(enrollment.academicYearId, source.id), eq(student.status, 'active'), isNull(student.deletedAt)),
    );
  const decidedAll = new Set(
    (
      await tx
        .select({ studentId: promotionDecision.studentId })
        .from(promotionDecision)
        .where(eq(promotionDecision.academicYearId, source.id))
    ).map((r) => r.studentId),
  );
  out.skippedNoDecision = enrolledSource.filter((e) => !decidedAll.has(e.studentId)).length;

  // Peringatan: status `graduated` mengeluarkan siswa dari roster rapor draf, jadi kelas lulusan yang belum difinalkan
  // pada semester terakhir tahun sumber tidak bisa lagi difinalkan utuh setelah penerapan.
  if (graduates.length > 0) {
    const [lastSemester] = await tx
      .select({ id: semester.id })
      .from(semester)
      .where(eq(semester.academicYearId, source.id))
      .orderBy(desc(semester.startsOn))
      .limit(1);
    const finalClasses = new Set(
      lastSemester
        ? (
            await tx
              .selectDistinct({ classId: reportCard.classId })
              .from(reportCard)
              .where(
                and(
                  eq(reportCard.semesterId, lastSemester.id),
                  eq(reportCard.status, 'final'),
                  inArray(reportCard.classId, [...new Set(graduates.map((g) => g.classId))]),
                ),
              )
          ).map((r) => r.classId)
        : [],
    );
    out.graduateReportNotFinal = graduates.filter((g) => !finalClasses.has(g.classId)).length;
    if (out.graduateReportNotFinal > 0) {
      out.warningItems.push({
        code: 'graduate_report_not_final',
        params: { count: out.graduateReportNotFinal },
      });
    }
  }

  if (write) {
    const inserted = pending.length
      ? await tx
          .insert(enrollment)
          .values(pending.map((p) => p.row))
          .onConflictDoNothing()
          .returning({ studentId: enrollment.studentId })
      : [];
    const enrolledNow = new Set(inserted.map((r) => r.studentId));
    // Konflik (siswa ter-enroll di tahun tujuan oleh proses lain sejak pembacaan): bukan penempatan kita, keputusan menunggu.
    const lost = pending.filter((p) => !enrolledNow.has(p.row.studentId));
    if (lost.length > 0) {
      const existing = new Map(
        (
          await tx
            .select({ studentId: enrollment.studentId, classId: enrollment.classId })
            .from(enrollment)
            .where(
              and(
                eq(enrollment.academicYearId, target.id),
                inArray(
                  enrollment.studentId,
                  lost.map((p) => p.row.studentId),
                ),
              ),
            )
        ).map((e) => [e.studentId, e.classId]),
      );
      for (const p of lost) {
        out.alreadyEnrolled.push({
          studentId: p.row.studentId,
          classId: existing.get(p.row.studentId) ?? p.row.classId,
        });
        if (p.decision === 'promote') out.placed--;
        else out.retained--;
      }
    }
    const candidateIds = [
      ...pending.filter((p) => enrolledNow.has(p.row.studentId)).map((p) => p.decisionId),
      ...graduates.map((g) => g.decisionId),
    ];
    // Penanda diterapkan hanya pada keputusan yang masih belum diterapkan (pengaman bila proses lain mendahului).
    const marked = new Set(
      candidateIds.length > 0
        ? (
            await tx
              .update(promotionDecision)
              .set({ appliedAt: new Date() })
              .where(and(inArray(promotionDecision.id, candidateIds), isNull(promotionDecision.appliedAt)))
              .returning({ id: promotionDecision.id })
          ).map((r) => r.id)
        : [],
    );
    const graduating = graduates.filter((g) => marked.has(g.decisionId));
    out.graduated = graduating.length;
    if (graduating.length > 0) {
      await tx
        .update(student)
        .set({ status: 'graduated' })
        .where(
          inArray(
            student.id,
            graduating.map((g) => g.studentId),
          ),
        );
    }
    await audit(tx, ctx, 'academic_year.promotions_apply', 'academic_year', source.id, {
      targetYearId: target.id,
      placed: out.placed,
      retained: out.retained,
      graduated: out.graduated,
      unplaced: out.unplaced.length,
      alreadyEnrolled: out.alreadyEnrolled.length,
    });
  }
  return out;
}

/* ---------- Route ---------- */

export async function promotionRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(
    request: { ctx?: TenantContext; server: FastifyInstance },
    fn: Parameters<typeof withTenant<T>>[2],
  ) => {
    const ctx = request.ctx as TenantContext;
    return withTenant(request.server.tenantDb, [ctx.schoolId], fn);
  };

  app.get(
    '/v1/academic-years/:id/promotions',
    {
      onRequest: [requirePermission('promotion:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Daftar siswa dan keputusan kenaikan kelas satu tahun ajaran',
        description:
          'Izin: `promotion:manage`. Kelas tahun ajaran itu beserta siswa aktif yang ter-enroll, dengan keputusan tersimpan ' +
          '(`decision`, null bila belum), saran bawaan (`suggestedDecision`: `promote`; null di tingkat akhir karena kelulusan ' +
          'ditetapkan sekolah setelah ujian satuan pendidikan dan wajib dipilih eksplisit), kelas tujuan, catatan (`note`, ' +
          '`reason`, `followUp`, `meetingDate`), dan penanda `applied`. Tingkat akhir kelas = `final_level_code` jurusannya bila ' +
          'diisi, jika tidak tingkat dengan `sort` terbesar; tingkat berikutnya diturunkan dari daftar tingkat sekolah (urutan `sort`). ' +
          'Kelas bertingkat yang tidak ada di daftar tingkat sekolah ditandai `levelUnknown` true dan tidak mendapat saran `promote`.',
        headers: schoolHeader,
        params: idParams,
        response: { 200: listResponse, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const year = await loadYear(tx, request.params.id);
        const levels = await loadLevels(tx);
        const finalOf = await loadFinalLevelResolver(tx);
        const classes = await tx
          .select()
          .from(classRoom)
          .where(eq(classRoom.academicYearId, year.id))
          .orderBy(asc(classRoom.level), asc(classRoom.name));
        const rows = await tx
          .select({
            classId: enrollment.classId,
            studentId: student.id,
            name: student.name,
            nis: student.nis,
            status: student.status,
          })
          .from(enrollment)
          .innerJoin(student, eq(student.id, enrollment.studentId))
          .where(and(eq(enrollment.academicYearId, year.id), isNull(student.deletedAt)))
          .orderBy(asc(student.name));
        const decisions = new Map(
          (
            await tx.select().from(promotionDecision).where(eq(promotionDecision.academicYearId, year.id))
          ).map((d) => [d.studentId, d]),
        );
        const order = new Map(sortLevels(levels).map((l, i) => [l.code, i]));
        classes.sort(
          (a, b) => (order.get(a.level) ?? 999) - (order.get(b.level) ?? 999) || a.name.localeCompare(b.name),
        );
        return {
          academicYear: { id: year.id, name: year.name, startsOn: year.startsOn, endsOn: year.endsOn },
          classes: classes.map((c) => {
            const finalCode = finalOf(c.programId);
            const final = isFinalLevel(levels, c.level, finalCode);
            const known = isKnownLevel(levels, c.level);
            return {
              classId: c.id,
              name: c.name,
              level: c.level,
              nextLevel: nextLevel(levels, c.level, finalCode),
              isFinalLevel: final,
              levelUnknown: !known,
              students: rows
                // Siswa aktif, atau yang sudah punya keputusan (mis. sudah lulus setelah diterapkan).
                .filter((r) => r.classId === c.id && (r.status === 'active' || decisions.has(r.studentId)))
                .map((r) => {
                  const d = decisions.get(r.studentId);
                  return {
                    studentId: r.studentId,
                    name: r.name,
                    nis: r.nis,
                    decision: d?.decision ?? null,
                    suggestedDecision: final || !known ? null : ('promote' as const),
                    toClassId: d?.toClassId ?? null,
                    note: d?.note ?? null,
                    reason: d?.reason ?? null,
                    followUp: d?.followUp ?? null,
                    meetingDate: d?.meetingDate ?? null,
                    applied: !!d?.appliedAt,
                  };
                }),
            };
          }),
        };
      }),
  );

  app.put(
    '/v1/academic-years/:id/promotions',
    {
      onRequest: [requirePermission('promotion:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Simpan keputusan kenaikan kelas',
        description:
          'Izin: `promotion:manage`. Upsert keputusan per siswa (`promote`, `retain`, `graduate`) untuk tahun ajaran yang ditutup; ' +
          '`graduate` berarti "ditetapkan lulus": kelulusan ditetapkan sekolah setelah ujian satuan pendidikan, tidak disarankan ' +
          'otomatis. Catatan opsional per baris: `note`, `reason` (alasan), `followUp` (tindak lanjut), `meetingDate` (tanggal rapat ' +
          'dewan pendidik, YYYY-MM-DD); yang DIHILANGKAN dipertahankan dari keputusan tersimpan, `null` eksplisit mengosongkan. ' +
          'Semua atau tidak sama sekali. 400 `level_unknown`: `promote` tanpa `toClassId` untuk kelas yang tingkatnya tidak ada di daftar tingkat sekolah. ' +
          '400 `not_final_level`: lulus hanya untuk kelas tingkat akhir (jurusan dengan `final_level_code` memakai tingkat itu) dan naik tidak bisa dari ' +
          'tingkat terakhir. 400 `student_not_enrolled`: siswa tidak ter-enroll di tahun itu. 400 `invalid_target_class`: ' +
          '`toClassId` harus kelas pada tahun ajaran yang dimulai setelah tahun sumber (diabaikan untuk `graduate`). ' +
          '409 `promotion_applied`: keputusan siswa itu sudah diterapkan dan tidak bisa diubah. Penyimpanan dan penerapan untuk tahun ' +
          'sumber yang sama berjalan bergantian (kunci per tahun sumber).',
        headers: schoolHeader,
        params: idParams,
        body: decisionsBody,
        response: {
          200: z.object({ saved: z.number().int() }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const items = request.body.decisions;
      return conflictAs409('Keputusan kenaikan kelas bentrok dengan perubahan lain; coba lagi.', () =>
        tenant(request, async (tx) => {
          const year = await loadYear(tx, request.params.id);
          await lockSource(tx, year.id);
          const levels = await loadLevels(tx);
          const finalOf = await loadFinalLevelResolver(tx);
          const ids = items.map((i) => i.studentId);
          if (new Set(ids).size !== ids.length) {
            throw bad('duplicate_student', 'Satu siswa hanya boleh muncul sekali dalam satu permintaan.');
          }
          const enrolled = new Map(
            (
              await tx
                .select({
                  studentId: enrollment.studentId,
                  classId: enrollment.classId,
                  level: classRoom.level,
                  programId: classRoom.programId,
                })
                .from(enrollment)
                .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
                .innerJoin(student, and(eq(student.id, enrollment.studentId), isNull(student.deletedAt)))
                .where(and(eq(enrollment.academicYearId, year.id), inArray(enrollment.studentId, ids)))
            ).map((e) => [e.studentId, e]),
          );
          const existing = new Map(
            (
              await tx
                .select()
                .from(promotionDecision)
                .where(
                  and(
                    eq(promotionDecision.academicYearId, year.id),
                    inArray(promotionDecision.studentId, ids),
                  ),
                )
            ).map((d) => [d.studentId, d]),
          );
          const toIds = [
            ...new Set(items.flatMap((i) => (i.decision !== 'graduate' && i.toClassId ? [i.toClassId] : []))),
          ];
          const targets = new Map(
            (toIds.length
              ? await tx
                  .select({ id: classRoom.id, startsOn: academicYear.startsOn })
                  .from(classRoom)
                  .innerJoin(academicYear, eq(academicYear.id, classRoom.academicYearId))
                  .where(inArray(classRoom.id, toIds))
              : []
            ).map((c) => [c.id, c.startsOn]),
          );

          const values: (typeof promotionDecision.$inferInsert)[] = [];
          for (const item of items) {
            const enr = enrolled.get(item.studentId);
            if (!enr) {
              throw bad(
                'student_not_enrolled',
                `Siswa ${item.studentId} tidak ter-enroll di tahun ajaran ini atau sudah dihapus.`,
              );
            }
            if (existing.get(item.studentId)?.appliedAt) {
              throw new HttpError(
                409,
                'promotion_applied',
                `Keputusan untuk siswa ${item.studentId} sudah diterapkan ke tahun ajaran berikutnya dan tidak bisa diubah.`,
              );
            }
            const final = isFinalLevel(levels, enr.level, finalOf(enr.programId));
            if (item.decision === 'graduate' && !final) {
              throw bad(
                'not_final_level',
                `Lulus hanya untuk kelas tingkat terakhir; tingkat "${enr.level}" bukan tingkat terakhir.`,
              );
            }
            if (item.decision === 'promote' && final) {
              throw bad(
                'not_final_level',
                `Kelas tingkat terakhir ("${enr.level}") tidak bisa naik kelas; pilih lulus atau tinggal kelas.`,
              );
            }
            if (item.decision === 'promote' && !item.toClassId && !isKnownLevel(levels, enr.level)) {
              throw bad(
                'level_unknown',
                `Tingkat "${enr.level}" tidak ada di daftar tingkat sekolah, jadi tingkat berikutnya tidak diketahui. Pilih kelas tujuan atau perbaiki daftar tingkat.`,
              );
            }
            let toClassId: string | null = null;
            if (item.decision !== 'graduate' && item.toClassId) {
              const startsOn = targets.get(item.toClassId);
              if (startsOn === undefined || startsOn <= year.startsOn) {
                throw bad(
                  'invalid_target_class',
                  'Kelas tujuan harus kelas pada tahun ajaran yang dimulai setelah tahun ajaran sumber.',
                );
              }
              toClassId = item.toClassId;
            }
            // Dihilangkan = pertahankan catatan tersimpan; null eksplisit = kosongkan.
            const prev = existing.get(item.studentId);
            values.push({
              schoolId: ctx.schoolId,
              academicYearId: year.id,
              studentId: item.studentId,
              fromClassId: enr.classId,
              decision: item.decision as PromotionDecision,
              toClassId,
              note: item.note === undefined ? (prev?.note ?? null) : item.note,
              reason: item.reason === undefined ? (prev?.reason ?? null) : item.reason,
              followUp: item.followUp === undefined ? (prev?.followUp ?? null) : item.followUp,
              meetingDate: item.meetingDate === undefined ? (prev?.meetingDate ?? null) : item.meetingDate,
              decidedBy: ctx.userId,
              decidedAt: new Date(),
            });
          }
          const written = await tx
            .insert(promotionDecision)
            .values(values)
            .onConflictDoUpdate({
              target: [promotionDecision.academicYearId, promotionDecision.studentId],
              set: {
                fromClassId: sql`excluded.from_class_id`,
                decision: sql`excluded.decision`,
                toClassId: sql`excluded.to_class_id`,
                note: sql`excluded.note`,
                reason: sql`excluded.reason`,
                followUp: sql`excluded.follow_up`,
                meetingDate: sql`excluded.meeting_date`,
                decidedBy: sql`excluded.decided_by`,
                decidedAt: sql`excluded.decided_at`,
              },
              setWhere: isNull(promotionDecision.appliedAt),
            })
            .returning({ id: promotionDecision.id });
          if (written.length !== values.length) {
            // Ada keputusan yang diterapkan oleh proses lain di antara pemeriksaan dan penulisan: batalkan semuanya.
            throw new HttpError(
              409,
              'promotion_applied',
              'Sebagian keputusan sudah diterapkan ke tahun ajaran berikutnya dan tidak bisa diubah; muat ulang daftar.',
            );
          }
          await audit(tx, ctx, 'promotion.decide', 'academic_year', year.id, {
            count: values.length,
            promote: values.filter((v) => v.decision === 'promote').length,
            retain: values.filter((v) => v.decision === 'retain').length,
            graduate: values.filter((v) => v.decision === 'graduate').length,
          });
          return { saved: written.length };
        }),
      );
    },
  );

  app.post(
    '/v1/academic-years/:id/rollover',
    {
      onRequest: [requirePermission('promotion:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Salin tahun ajaran ke tahun berikutnya',
        description:
          'Izin: `promotion:manage`. Menyalin ke `targetYearId`: kelas (tingkat non-akhir menjadi tingkat berikutnya, mis. 7A menjadi 8A; ' +
          'tingkat pertama juga disalin sebagai tingkat yang sama untuk siswa baru dan yang tinggal kelas; tingkat akhir tidak disalin) ' +
          'beserta wali kelas, penugasan guru mapel ke kelas hasil salinan, kalender akademik (hanya bila `copyCalendar` true; bawaan false; tanggal digeser selisih tahun mulai), ' +
          'struktur kurikulum (alokasi JP serta versi kurikulum per tingkat yang sama; `copyCurriculum`, bawaan true), ' +
          'dan ATP berstatus terbit (`copyTeachingPlans`, bawaan true; disalin sebagai draf versi 1 beserta item, hanya versi ' +
          'terbit terbaru tiap ATP, semester dikosongkan, `flowsCreated`). ' +
          'Idempoten: kelas dicocokkan menurut nama, penugasan menurut (kelas, mapel), acara menurut (jenis, cakupan, judul, tanggal mulai), ' +
          'alokasi menurut (tingkat, jurusan, mapel), versi menurut tingkat, ATP menurut (mapel, nama, tingkat); ' +
          'yang sudah ada dilewati. Data tahun sumber tidak diubah. `dryRun` menghitung tanpa menulis. ' +
          '400 `invalid_target`: tahun tujuan sama dengan sumber atau tidak dimulai setelahnya. ' +
          '400 `levels_not_configured`: daftar tingkat sekolah kosong. Respons memuat `warnings` (teks) dan `warningItems` ' +
          '(kode stabil + parameter, sejajar dengan `warnings`: class_level_unknown, class_name_unmatched, class_name_conflict, ' +
          'final_level_not_copied, class_level_mismatch, inactive_homeroom_skipped, homeroom_multiple, inactive_teacher_skipped, ' +
          'event_class_skipped, event_out_of_year, flow_inactive_objectives) bagi hal yang perlu diperiksa. Tingkat akhir kelas mengikuti `final_level_code` jurusannya.',
        headers: schoolHeader,
        params: idParams,
        body: rolloverBody,
        response: { 200: rolloverResponse, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return conflictAs409('Rollover bentrok dengan perubahan lain; coba lagi.', () =>
        tenant(request, async (tx) => {
          const source = await loadYear(tx, request.params.id);
          const target = await loadTargetYear(tx, source, request.body.targetYearId);
          await lockTarget(tx, 'rollover', target.id);
          return runRollover(tx, ctx, source, target, request.body);
        }),
      );
    },
  );

  app.post(
    '/v1/academic-years/:id/promotions/apply',
    {
      onRequest: [requirePermission('promotion:manage')],
      schema: {
        tags: ['Academic'],
        summary: 'Terapkan keputusan kenaikan kelas ke tahun berikutnya',
        description:
          'Izin: `promotion:manage`. Untuk tiap keputusan yang belum diterapkan: `promote` menempatkan siswa di kelas tujuan (eksplisit, ' +
          'atau kelas tingkat berikutnya pada tahun tujuan dengan "bagian" nama yang sama, atau bila tidak ada, satu-satunya kelas sejurusan ' +
          'pada tingkat itu; selain itu `unplaced` `no_target_class`, tidak pernah menebak kelas pertama), `retain` di kelas sebaya ' +
          'tahun tujuan dengan aturan yang sama, `graduate` mengubah status siswa menjadi lulus (tingkat akhir kelas asal divalidasi ulang: ' +
          'bukan tingkat akhir lagi = `unplaced` `not_final_level`). Enrollment lama tidak dihapus; siswa yang sudah ter-enroll ' +
          'di tahun tujuan (termasuk yang terdahului proses lain) dilewati dan dilaporkan di `alreadyEnrolled`, keputusannya tidak ditandai diterapkan. ' +
          'Siswa tanpa kelas tujuan masuk `unplaced` beserta alasannya, ' +
          'dengan `reasonCode` stabil (dan `reasonParams`), tanpa menggagalkan yang lain. `retain` tidak menghapus enrollment lama; ' +
          'riwayat rombel tahun sumber tetap utuh. `graduate` hanya diterapkan bila keputusan eksplisit tersimpan. Tahun ajaran aktif tidak diubah. `dryRun` menghitung tanpa menulis. ' +
          '`graduateReportNotFinal` dan `warningItems` (`graduate_report_not_final`) memberi tahu jumlah siswa lulus yang kelas asalnya belum punya rapor ' +
          'final pada semester terakhir tahun sumber (lulusan tetap tampil di rapor kelas tahun terakhirnya dan dapat difinalkan sesudah lulus). Penerapan untuk tahun sumber yang sama ' +
          'berjalan bergantian (kunci per tahun sumber), jadi dua penerapan ke tahun tujuan berbeda tidak menempatkan siswa ganda. ' +
          '400 `invalid_target`: tahun tujuan sama dengan sumber atau tidak dimulai setelahnya.',
        headers: schoolHeader,
        params: idParams,
        body: applyBody,
        response: { 200: applyResponse, 400: errorSchema, 404: errorSchema, 409: errorSchema, ...guarded },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      return conflictAs409('Penerapan bentrok dengan perubahan lain; coba lagi.', () =>
        tenant(request, async (tx) => {
          const source = await loadYear(tx, request.params.id);
          const target = await loadTargetYear(tx, source, request.body.targetYearId);
          await lockSource(tx, source.id);
          await lockTarget(tx, 'apply', target.id);
          return runApply(tx, ctx, source, target, request.body);
        }),
      );
    },
  );
}
