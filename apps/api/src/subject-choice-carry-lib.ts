import {
  and,
  classSubjectParticipation,
  eq,
  inArray,
  isNull,
  studentSubjectEnrollment,
  type Tx,
} from '@edusync/db';

/**
 * Pilihan mapel ikut naik kelas (tahap 3B.4, rancangan 3.2 "Rollover dan kenaikan"). Dua bagian:
 *
 * - `copyParticipationMarks`: rollover menyalin penanda partisipasi (`class_subject_participation`) rombel sumber ke rombel hasil
 *   salinan. Rombel tujuan yang sudah punya penanda tidak disentuh (yang sudah ada tidak ditimpa).
 * - `carryChoices`: penerapan keputusan menyalin baris pilihan SETAHUN murid ke tahun tujuan bila rombel tujuannya juga menandai
 *   mapel itu pilihan (pilihan berlanjut XI ke XII). Baris per semester tidak disalin (pilihan transisi), mapel yang tak lagi
 *   berpenanda di rombel tujuan dihitung `dropped`, dan baris yang sudah ada di tahun tujuan tidak ditimpa. Penempatan murid sendiri
 *   tidak memperhitungkan pilihan.
 */

export interface CarryResult {
  copied: number;
  dropped: number;
}

/** Salin penanda partisipasi. `targets` memetakan rombel sumber ke rombel tujuan (id sungguhan, atau id rencana saat dry run). */
export async function copyParticipationMarks(
  tx: Tx,
  input: {
    schoolId: string;
    actorId: string;
    targets: ReadonlyMap<string, readonly { id: string; isNew: boolean }[]>;
    write: boolean;
  },
): Promise<number> {
  const sourceIds = [...input.targets.keys()];
  if (sourceIds.length === 0) return 0;
  const marks = await tx
    .select({ classId: classSubjectParticipation.classId, subjectId: classSubjectParticipation.subjectId })
    .from(classSubjectParticipation)
    .where(inArray(classSubjectParticipation.classId, sourceIds));
  if (marks.length === 0) return 0;
  const isPlan = (id: string) => id.startsWith('rencana:');
  const realTargets = [...input.targets.values()].flat().filter((t) => !isPlan(t.id));
  const configured = new Set(
    realTargets.length === 0
      ? []
      : (
          await tx
            .select({ classId: classSubjectParticipation.classId })
            .from(classSubjectParticipation)
            .where(
              inArray(
                classSubjectParticipation.classId,
                realTargets.map((t) => t.id),
              ),
            )
        ).map((r) => r.classId),
  );
  const toInsert: (typeof classSubjectParticipation.$inferInsert)[] = [];
  let planned = 0;
  for (const m of marks) {
    for (const target of input.targets.get(m.classId) ?? []) {
      if (isPlan(target.id)) {
        planned++;
        continue;
      }
      if (configured.has(target.id)) continue;
      toInsert.push({
        schoolId: input.schoolId,
        classId: target.id,
        subjectId: m.subjectId,
        mode: 'selected',
        updatedBy: input.actorId,
      });
    }
  }
  if (!input.write) return planned + toInsert.length;
  if (toInsert.length === 0) return 0;
  const inserted = await tx
    .insert(classSubjectParticipation)
    .values(toInsert)
    .onConflictDoNothing()
    .returning({ id: classSubjectParticipation.id });
  return inserted.length;
}

/**
 * Bawa pilihan setahun murid. `placements` = murid dan rombel tujuannya. Bila `write` false hanya menghitung. Mengembalikan
 * `null` bila tidak ada satu pun baris pilihan setahun di tahun sumber untuk murid-murid itu (bentuk respons lama dipertahankan).
 */
export async function carryChoices(
  tx: Tx,
  input: {
    schoolId: string;
    actorId: string;
    sourceYearId: string;
    targetYearId: string;
    placements: readonly { studentId: string; classId: string }[];
    write: boolean;
  },
): Promise<CarryResult | null> {
  if (input.placements.length === 0) return null;
  const studentIds = [...new Set(input.placements.map((p) => p.studentId))];
  const sourceRows = await tx
    .select({
      studentId: studentSubjectEnrollment.studentId,
      subjectId: studentSubjectEnrollment.subjectId,
      source: studentSubjectEnrollment.source,
    })
    .from(studentSubjectEnrollment)
    .where(
      and(
        eq(studentSubjectEnrollment.academicYearId, input.sourceYearId),
        isNull(studentSubjectEnrollment.semesterId),
        inArray(studentSubjectEnrollment.studentId, studentIds),
      ),
    );
  if (sourceRows.length === 0) return null;

  const classOf = new Map(input.placements.map((p) => [p.studentId, p.classId]));
  const marked = await tx
    .select({ classId: classSubjectParticipation.classId, subjectId: classSubjectParticipation.subjectId })
    .from(classSubjectParticipation)
    .where(inArray(classSubjectParticipation.classId, [...new Set(classOf.values())]));
  const markedKeys = new Set(marked.map((m) => `${m.classId}:${m.subjectId}`));
  const existing = await tx
    .select({
      studentId: studentSubjectEnrollment.studentId,
      subjectId: studentSubjectEnrollment.subjectId,
    })
    .from(studentSubjectEnrollment)
    .where(
      and(
        eq(studentSubjectEnrollment.academicYearId, input.targetYearId),
        inArray(studentSubjectEnrollment.studentId, studentIds),
      ),
    );
  const haveKeys = new Set(existing.map((e) => `${e.studentId}:${e.subjectId}`));

  const toInsert: (typeof studentSubjectEnrollment.$inferInsert)[] = [];
  let dropped = 0;
  for (const row of sourceRows) {
    const classId = classOf.get(row.studentId);
    if (!classId) continue;
    if (!markedKeys.has(`${classId}:${row.subjectId}`)) {
      dropped++;
      continue;
    }
    if (haveKeys.has(`${row.studentId}:${row.subjectId}`)) continue;
    toInsert.push({
      schoolId: input.schoolId,
      studentId: row.studentId,
      subjectId: row.subjectId,
      academicYearId: input.targetYearId,
      semesterId: null,
      source: row.source,
      createdBy: input.actorId,
    });
  }
  if (!input.write) return { copied: toInsert.length, dropped };
  if (toInsert.length === 0) return { copied: 0, dropped };
  const inserted = await tx
    .insert(studentSubjectEnrollment)
    .values(toInsert)
    .onConflictDoNothing()
    .returning({ id: studentSubjectEnrollment.id });
  return { copied: inserted.length, dropped };
}
