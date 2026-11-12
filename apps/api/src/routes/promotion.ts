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
  enrollment,
  eq,
  inArray,
  isNull,
  promotionDecision,
  schoolLevel,
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
import { audit, conflictAs409, guarded, idParams, schoolHeader } from './helpers';

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

/** Kunci per tahun tujuan: dua rollover atau penerapan bersamaan untuk tahun yang sama berjalan bergantian. */
const lockTarget = (tx: Tx, kind: string, targetYearId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${kind}:${targetYearId}`}))`);

/* ---------- Skema ---------- */

const studentEntry = z.object({
  studentId: z.uuid(),
  name: z.string(),
  nis: z.string().nullable(),
  decision: decisionEnum.nullable().describe('Keputusan tersimpan; null bila belum diputuskan'),
  suggestedDecision: z
    .enum(['promote', 'graduate'])
    .describe('Saran bawaan: naik kelas, atau lulus bila kelasnya tingkat terakhir'),
  toClassId: z
    .uuid()
    .nullable()
    .describe('Kelas tujuan eksplisit; null = ditentukan otomatis saat diterapkan'),
  note: z.string().nullable(),
  applied: z.boolean().describe('Keputusan sudah diterapkan ke tahun tujuan; tidak bisa diubah lagi'),
});

const classEntry = z.object({
  classId: z.uuid(),
  name: z.string(),
  level: z.string(),
  nextLevel: z.string().nullable(),
  isFinalLevel: z.boolean(),
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
      }),
    )
    .min(1)
    .max(2000),
});

const rolloverBody = z.object({
  targetYearId: z.uuid(),
  copyClasses: z.boolean().default(true),
  copyAssignments: z.boolean().default(true),
  copyCalendar: z.boolean().default(true),
  dryRun: z.boolean().default(false),
});

const rolloverResponse = z.object({
  classesCreated: z.number().int(),
  classesSkipped: z.number().int(),
  assignmentsCreated: z.number().int(),
  eventsCreated: z.number().int(),
  warnings: z.array(z.string()),
});

const applyBody = z.object({ targetYearId: z.uuid(), dryRun: z.boolean().default(false) });

const applyResponse = z.object({
  placed: z.number().int().describe('Siswa naik kelas yang ditempatkan di kelas tahun tujuan'),
  retained: z.number().int().describe('Siswa tinggal kelas yang ditempatkan di kelas sebaya tahun tujuan'),
  graduated: z.number().int().describe('Siswa yang statusnya menjadi lulus'),
  unplaced: z.array(z.object({ studentId: z.uuid(), reason: z.string() })),
  alreadyEnrolled: z
    .array(z.object({ studentId: z.uuid(), classId: z.uuid() }))
    .describe('Sudah punya enrollment di tahun tujuan: dilewati, keputusannya tetap menunggu'),
  skippedNoDecision: z.number().int().describe('Siswa aktif tahun sumber yang belum punya keputusan'),
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
  const out = { classesCreated: 0, classesSkipped: 0, assignmentsCreated: 0, eventsCreated: 0, warnings };
  const write = !body.dryRun;
  const levels = await loadLevels(tx);
  if (levels.length === 0 && (body.copyClasses || body.copyAssignments)) {
    throw bad(
      'levels_not_configured',
      'Daftar tingkat sekolah masih kosong. Atur tingkat di Pengaturan sekolah sebelum menyalin kelas.',
    );
  }
  const first = firstLevel(levels);
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
      warnings.push(
        `Kelas "${c.name}" bertingkat "${c.level}" yang tidak ada di daftar tingkat sekolah, jadi dilewati.`,
      );
      if (body.copyClasses) out.classesSkipped++;
      continue;
    }
    if (isFinalLevel(levels, c.level)) {
      finalLevelClasses++;
      continue;
    }
    const next = nextLevel(levels, c.level) as string;
    const derived = deriveTargetClassName(c.name, c.level, next);
    if (derived.warning) warnings.push(derived.warning);
    const candidates: Planned[] = [{ src: c, name: derived.name, level: next, primary: true }];
    if (c.level === first) candidates.push({ src: c, name: c.name, level: c.level, primary: false });
    for (const cand of candidates) {
      if (seen.has(cand.name)) {
        warnings.push(
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
    warnings.push(`${finalLevelClasses} kelas tingkat akhir tidak disalin (siswanya lulus).`);
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
        warnings.push(
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
    warnings.push(
      `${inactiveHomerooms} wali kelas nonaktif tidak disalin; isi wali kelasnya di tahun tujuan.`,
    );
  }
  const doubled = [...homeroomLoad.values()].filter((n) => n > 1).length;
  if (doubled > 0) {
    warnings.push(
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
      warnings.push(`${inactiveTeachers} penugasan guru nonaktif tidak disalin.`);
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
  if (body.copyCalendar) {
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
      warnings.push(`${skippedClass} acara kalender kelas dilewati karena kelas tujuannya tidak ada.`);
    }
    if (skippedRange > 0) {
      warnings.push(
        `${skippedRange} acara kalender dilewati karena tanggalnya jatuh di luar tahun ajaran tujuan.`,
      );
    }
    out.eventsCreated = toInsert.length;
    if (write && toInsert.length > 0) await tx.insert(calendarEvent).values(toInsert);
  }

  if (write) {
    await audit(tx, ctx, 'academic_year.rollover', 'academic_year', source.id, {
      targetYearId: target.id,
      classesCreated: out.classesCreated,
      classesSkipped: out.classesSkipped,
      assignmentsCreated: out.assignmentsCreated,
      eventsCreated: out.eventsCreated,
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
    unplaced: [] as { studentId: string; reason: string }[],
    alreadyEnrolled: [] as { studentId: string; classId: string }[],
    skippedNoDecision: 0,
  };
  const enrollRows: (typeof enrollment.$inferInsert)[] = [];
  const graduateIds: string[] = [];
  const appliedIds: string[] = [];

  const pickClass = (from: typeof classRoom.$inferSelect, level: string) => {
    const derived =
      level === from.level ? from.name : deriveTargetClassName(from.name, from.level, level).name;
    const pool = targetClasses.filter((c) => c.level === level);
    return (
      pool.find((c) => c.name === derived) ??
      pool.find((c) => c.programId !== null && c.programId === from.programId) ??
      pool[0] ??
      null
    );
  };

  for (const d of decisions) {
    const stu = students.get(d.studentId);
    if (!stu || stu.deletedAt) {
      out.unplaced.push({ studentId: d.studentId, reason: 'Siswa tidak ditemukan atau sudah dihapus.' });
      continue;
    }
    if (stu.status !== 'active') {
      out.unplaced.push({
        studentId: d.studentId,
        reason: `Status siswa "${stu.status}", bukan aktif, jadi keputusan tidak diterapkan.`,
      });
      continue;
    }
    if (d.decision === 'graduate') {
      out.graduated++;
      graduateIds.push(d.studentId);
      appliedIds.push(d.id);
      continue;
    }
    const already = enrolledTarget.get(d.studentId);
    if (already) {
      out.alreadyEnrolled.push({ studentId: d.studentId, classId: already });
      continue;
    }
    const from = fromClasses.get(d.fromClassId);
    if (!from) {
      out.unplaced.push({ studentId: d.studentId, reason: 'Kelas asal siswa sudah tidak ada.' });
      continue;
    }
    let dest: typeof classRoom.$inferSelect | null = null;
    if (d.toClassId) {
      const picked = explicit.get(d.toClassId);
      if (!picked || picked.academicYearId !== target.id) {
        out.unplaced.push({
          studentId: d.studentId,
          reason: 'Kelas tujuan yang dipilih bukan kelas pada tahun ajaran tujuan.',
        });
        continue;
      }
      dest = picked;
    } else {
      const level = d.decision === 'promote' ? nextLevel(levels, from.level) : from.level;
      if (!level) {
        out.unplaced.push({
          studentId: d.studentId,
          reason: `Kelas "${from.name}" tidak punya tingkat berikutnya; gunakan keputusan lulus atau pilih kelas tujuan.`,
        });
        continue;
      }
      dest = pickClass(from, level);
      if (!dest) {
        out.unplaced.push({
          studentId: d.studentId,
          reason: `Tahun ajaran tujuan belum punya kelas tingkat "${level}". Jalankan rollover atau buat kelasnya.`,
        });
        continue;
      }
    }
    if (d.decision === 'promote') out.placed++;
    else out.retained++;
    enrollRows.push({
      schoolId: ctx.schoolId,
      studentId: d.studentId,
      classId: dest.id,
      academicYearId: target.id,
    });
    appliedIds.push(d.id);
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

  if (write) {
    if (enrollRows.length > 0) await tx.insert(enrollment).values(enrollRows).onConflictDoNothing();
    if (graduateIds.length > 0) {
      await tx.update(student).set({ status: 'graduated' }).where(inArray(student.id, graduateIds));
    }
    if (appliedIds.length > 0) {
      await tx
        .update(promotionDecision)
        .set({ appliedAt: new Date() })
        .where(inArray(promotionDecision.id, appliedIds));
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
          '(`decision`, null bila belum), saran bawaan (`suggestedDecision`: naik, atau lulus bila kelasnya tingkat terakhir), ' +
          'kelas tujuan, dan penanda `applied`. Tingkat berikutnya diturunkan dari daftar tingkat sekolah (urutan `sort`).',
        headers: schoolHeader,
        params: idParams,
        response: { 200: listResponse, 404: errorSchema, ...guarded },
      },
    },
    async (request) =>
      tenant(request, async (tx) => {
        const year = await loadYear(tx, request.params.id);
        const levels = await loadLevels(tx);
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
            const final = isFinalLevel(levels, c.level);
            return {
              classId: c.id,
              name: c.name,
              level: c.level,
              nextLevel: nextLevel(levels, c.level),
              isFinalLevel: final,
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
                    suggestedDecision: final ? ('graduate' as const) : ('promote' as const),
                    toClassId: d?.toClassId ?? null,
                    note: d?.note ?? null,
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
          'semua atau tidak sama sekali. 400 `not_final_level`: lulus hanya untuk kelas tingkat terakhir dan naik tidak bisa dari ' +
          'tingkat terakhir. 400 `student_not_enrolled`: siswa tidak ter-enroll di tahun itu. 400 `invalid_target_class`: ' +
          '`toClassId` harus kelas pada tahun ajaran yang dimulai setelah tahun sumber (diabaikan untuk `graduate`). ' +
          '409 `promotion_applied`: keputusan siswa itu sudah diterapkan dan tidak bisa diubah.',
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
          const levels = await loadLevels(tx);
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
            const final = isFinalLevel(levels, enr.level);
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
            values.push({
              schoolId: ctx.schoolId,
              academicYearId: year.id,
              studentId: item.studentId,
              fromClassId: enr.classId,
              decision: item.decision as PromotionDecision,
              toClassId,
              note: item.note ?? null,
              decidedBy: ctx.userId,
              decidedAt: new Date(),
            });
          }
          await tx
            .insert(promotionDecision)
            .values(values)
            .onConflictDoUpdate({
              target: [promotionDecision.academicYearId, promotionDecision.studentId],
              set: {
                fromClassId: sql`excluded.from_class_id`,
                decision: sql`excluded.decision`,
                toClassId: sql`excluded.to_class_id`,
                note: sql`excluded.note`,
                decidedBy: sql`excluded.decided_by`,
                decidedAt: sql`excluded.decided_at`,
              },
              setWhere: isNull(promotionDecision.appliedAt),
            });
          await audit(tx, ctx, 'promotion.decide', 'academic_year', year.id, {
            count: values.length,
            promote: values.filter((v) => v.decision === 'promote').length,
            retain: values.filter((v) => v.decision === 'retain').length,
            graduate: values.filter((v) => v.decision === 'graduate').length,
          });
          return { saved: values.length };
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
          'beserta wali kelas, penugasan guru mapel ke kelas hasil salinan, dan kalender akademik (tanggal digeser selisih tahun mulai). ' +
          'Idempoten: kelas dicocokkan menurut nama, penugasan menurut (kelas, mapel), acara menurut (jenis, cakupan, judul, tanggal mulai); ' +
          'yang sudah ada dilewati. Data tahun sumber tidak diubah. `dryRun` menghitung tanpa menulis. ' +
          '400 `invalid_target`: tahun tujuan sama dengan sumber atau tidak dimulai setelahnya. ' +
          '400 `levels_not_configured`: daftar tingkat sekolah kosong. Respons memuat `warnings` bagi hal yang perlu diperiksa.',
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
          'atau kelas tingkat berikutnya pada tahun tujuan dengan "bagian" nama yang sama, atau kelas pertama tingkat itu), `retain` di kelas ' +
          'sebaya tahun tujuan, `graduate` mengubah status siswa menjadi lulus. Enrollment lama tidak dihapus; siswa yang sudah ter-enroll ' +
          'di tahun tujuan dilewati dan dilaporkan di `alreadyEnrolled`. Siswa tanpa kelas tujuan masuk `unplaced` beserta alasannya, ' +
          'tanpa menggagalkan yang lain. Tahun ajaran aktif tidak diubah. `dryRun` menghitung tanpa menulis. ' +
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
          await lockTarget(tx, 'apply', target.id);
          return runApply(tx, ctx, source, target, request.body);
        }),
      );
    },
  );
}
