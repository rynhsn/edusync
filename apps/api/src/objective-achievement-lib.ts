import {
  aggregateObjectivePercent,
  assessmentCounts,
  componentAverage,
  componentCounts,
  MAX_OBJECTIVES_PER_ASSESSMENT,
  mergeObjectiveCell,
  type ObjectiveAggregation,
  type ObjectiveCell,
  type ObjectiveOverride,
  type ObjectiveScoreEntry,
  objectiveStatus,
  resolveObjectiveCriteria,
} from '@edusync/contracts';
import {
  and,
  asc,
  assessment,
  assessmentObjective,
  classRoom,
  eq,
  inArray,
  learningObjective,
  learningOutcome,
  or,
  score,
  studentObjectiveAchievement,
  type Tx,
} from '@edusync/db';
import type { EffectiveGradingConfig } from './grading-config-lib';
import { round2 } from './grading-lib';
import { HttpError } from './http-error';

/**
 * Ketercapaian tujuan pembelajaran (TP) per murid untuk satu kelas-mapel-semester (rancangan fase 3, bagian 3.2). DIHITUNG saat
 * dibaca (bukan disimpan): skor penilaian sumatif yang dikaitkan ke TP, diagregasi menurut aturan sekolah (salinan beku bila
 * ada), dibandingkan dengan ambang bertingkat (kriteria per TP -> KKM mapel -> KKM sekolah), lalu keputusan guru (override)
 * menang. Formatif tidak dihitung (K3): tampil terpisah sebagai kemajuan.
 *
 * Jumlah kueri TETAP berapa pun jumlah siswa dan TP (tanpa N+1): kelas, penilaian, kaitan, TP, skor, override, dan (hanya bila
 * konfigurasi hidup) kriteria TP dan KKTP mapel beserta levelnya. Konfigurasi efektif dimuat pemanggil lewat `loadGradingConfig`.
 */

export interface ObjectiveInfo {
  id: string;
  code: string | null;
  description: string;
  active: boolean;
  sortOrder: number;
  /** Jumlah penilaian sumatif (ikut nilai akhir) yang dikaitkan ke TP ini pada kelas-mapel-semester itu. */
  assessmentCount: number;
  /** Jumlah penilaian formatif (tidak ikut nilai akhir) yang dikaitkan; hanya kemajuan. */
  formativeCount: number;
}

export interface ObjectiveAchievementResult {
  aggregation: ObjectiveAggregation;
  objectives: ObjectiveInfo[];
  /** studentId -> objectiveId -> sel */
  cells: Map<string, Map<string, ObjectiveCell>>;
}

export async function computeObjectiveAchievement(
  tx: Tx,
  p: {
    semesterId: string;
    classId: string;
    subjectId: string;
    studentIds: string[];
    cfg: EffectiveGradingConfig;
    /** true: sertakan semua TP aktif mapel (bukan hanya yang dikaitkan atau punya keputusan guru). */
    includeAll?: boolean;
  },
): Promise<ObjectiveAchievementResult> {
  const { cfg } = p;
  const [cls] = await tx
    .select({ level: classRoom.level, programId: classRoom.programId })
    .from(classRoom)
    .where(eq(classRoom.id, p.classId));
  const target = { levelCode: cls?.level ?? null, programId: cls?.programId ?? null };

  const assessments = await tx
    .select({
      id: assessment.id,
      componentId: assessment.componentId,
      maxScore: assessment.maxScore,
      purpose: assessment.purpose,
      date: assessment.date,
      createdAt: assessment.createdAt,
    })
    .from(assessment)
    .where(
      and(
        eq(assessment.semesterId, p.semesterId),
        eq(assessment.classId, p.classId),
        eq(assessment.subjectId, p.subjectId),
      ),
    );
  const links = assessments.length
    ? await tx
        .select({
          assessmentId: assessmentObjective.assessmentId,
          objectiveId: assessmentObjective.objectiveId,
        })
        .from(assessmentObjective)
        .where(
          inArray(
            assessmentObjective.assessmentId,
            assessments.map((a) => a.id),
          ),
        )
    : [];
  const overrides = await tx
    .select()
    .from(studentObjectiveAchievement)
    .where(
      and(
        eq(studentObjectiveAchievement.semesterId, p.semesterId),
        eq(studentObjectiveAchievement.classId, p.classId),
        eq(studentObjectiveAchievement.subjectId, p.subjectId),
      ),
    );

  const wanted = [...new Set([...links.map((l) => l.objectiveId), ...overrides.map((o) => o.objectiveId)])];
  const objectiveRows =
    wanted.length > 0 || p.includeAll
      ? await tx
          .select({
            id: learningObjective.id,
            code: learningObjective.code,
            description: learningObjective.description,
            active: learningObjective.active,
            sortOrder: learningObjective.sortOrder,
          })
          .from(learningObjective)
          .innerJoin(learningOutcome, eq(learningOutcome.id, learningObjective.outcomeId))
          .where(
            p.includeAll
              ? or(
                  wanted.length ? inArray(learningObjective.id, wanted) : undefined,
                  and(eq(learningOutcome.subjectId, p.subjectId), eq(learningObjective.active, true)),
                )
              : inArray(learningObjective.id, wanted),
          )
          .orderBy(asc(learningObjective.sortOrder), asc(learningObjective.code), asc(learningObjective.id))
      : [];
  const objectiveIds = objectiveRows.map((o) => o.id);

  const linkedAssessmentIds = [...new Set(links.map((l) => l.assessmentId))];
  const scores = linkedAssessmentIds.length
    ? await tx
        .select({ assessmentId: score.assessmentId, studentId: score.studentId, value: score.value })
        .from(score)
        .where(inArray(score.assessmentId, linkedAssessmentIds))
    : [];
  const scoreOf = new Map(scores.map((s) => [`${s.assessmentId}:${s.studentId}`, s.value]));

  const criteriaByObjective = await cfg.objectiveKktpRows(tx, objectiveIds);
  const kkmDetail = (await cfg.kkmResolver(tx, { ...target, subjectIds: [p.subjectId] })).detail(p.subjectId);
  const aggregation = await cfg.objectiveAggregation(tx);
  const componentOf = new Map(cfg.components.map((c) => [c.id, c]));
  const overrideOf = new Map(overrides.map((o) => [`${o.studentId}:${o.objectiveId}`, o]));

  // Penilaian terkait per TP, dipisah: sumatif (dihitung) dan formatif/tidak ikut nilai akhir (kemajuan). Penilaian pada komponen
  // yang tidak ada di konfigurasi efektif diabaikan (sama dengan penghitung nilai), begitu juga asesmen awal di komponen sumatif.
  const assessmentById = new Map(assessments.map((a) => [a.id, a]));
  const counted = new Map<string, (typeof assessments)[number][]>();
  const progress = new Map<string, (typeof assessments)[number][]>();
  for (const l of links) {
    const a = assessmentById.get(l.assessmentId);
    const comp = a ? componentOf.get(a.componentId) : undefined;
    if (!a || !comp) continue;
    if (!componentCounts(comp)) {
      progress.set(l.objectiveId, [...(progress.get(l.objectiveId) ?? []), a]);
    } else if (assessmentCounts(a, comp)) {
      counted.set(l.objectiveId, [...(counted.get(l.objectiveId) ?? []), a]);
    }
  }

  const cells = new Map<string, Map<string, ObjectiveCell>>();
  for (const studentId of p.studentIds) {
    const row = new Map<string, ObjectiveCell>();
    for (const objectiveId of objectiveIds) {
      const entries: ObjectiveScoreEntry[] = (counted.get(objectiveId) ?? []).flatMap((a) => {
        const value = scoreOf.get(`${a.id}:${studentId}`);
        return value === null || value === undefined
          ? []
          : [{ value, max: a.maxScore, date: a.date, order: `${a.createdAt.toISOString()}|${a.id}` }];
      });
      const percent = aggregateObjectivePercent(entries, aggregation);
      const status =
        percent === null
          ? null
          : objectiveStatus(
              percent,
              resolveObjectiveCriteria(criteriaByObjective.get(objectiveId) ?? [], objectiveId, target),
              kkmDetail,
            );
      const progressScores = (progress.get(objectiveId) ?? []).flatMap((a) => {
        const value = scoreOf.get(`${a.id}:${studentId}`);
        return value === null || value === undefined ? [] : [{ value, max: a.maxScore }];
      });
      const progressAverage = componentAverage(progressScores);
      const o = overrideOf.get(`${studentId}:${objectiveId}`);
      const override: ObjectiveOverride | null = o
        ? { achieved: o.achieved, levelLabel: o.levelLabel, note: o.note }
        : null;
      row.set(
        objectiveId,
        mergeObjectiveCell(
          {
            percent,
            status,
            scoredCount: entries.length,
            formative:
              progressAverage === null
                ? undefined
                : { average: round2(progressAverage), count: progressScores.length },
          },
          override,
        ),
      );
    }
    cells.set(studentId, row);
  }

  return {
    aggregation,
    objectives: objectiveRows.map((o) => ({
      ...o,
      assessmentCount: counted.get(o.id)?.length ?? 0,
      formativeCount: progress.get(o.id)?.length ?? 0,
    })),
    cells,
  };
}

/* ---------- Kaitan penilaian <-> TP ---------- */

export interface LinkedObjective {
  id: string;
  code: string | null;
  description: string;
  active: boolean;
}

/** TP yang dikaitkan ke penilaian-penilaian itu (satu kueri), urut kode lalu id. Penilaian tanpa kaitan tidak ada di peta. */
export async function objectivesOfAssessments(
  tx: Tx,
  assessmentIds: string[],
): Promise<Map<string, LinkedObjective[]>> {
  const out = new Map<string, LinkedObjective[]>();
  if (assessmentIds.length === 0) return out;
  const rows = await tx
    .select({
      assessmentId: assessmentObjective.assessmentId,
      id: learningObjective.id,
      code: learningObjective.code,
      description: learningObjective.description,
      active: learningObjective.active,
    })
    .from(assessmentObjective)
    .innerJoin(learningObjective, eq(learningObjective.id, assessmentObjective.objectiveId))
    .where(inArray(assessmentObjective.assessmentId, assessmentIds))
    .orderBy(asc(learningObjective.sortOrder), asc(learningObjective.code), asc(learningObjective.id));
  for (const { assessmentId, ...o } of rows) out.set(assessmentId, [...(out.get(assessmentId) ?? []), o]);
  return out;
}

/**
 * Periksa himpunan TP untuk sebuah mapel: tanpa duplikat, paling banyak 20 (400 `too_many_objectives`), ada di sekolah ini
 * (400 `invalid_reference`; baris sekolah lain tidak terlihat oleh RLS), milik mapel yang sama (400
 * `objective_subject_mismatch`), dan aktif (400 `objective_inactive`). `keep` = TP yang sudah terkait dan boleh tetap walau
 * sudah nonaktif (mis. diganti versi baru); `requireActive` false untuk override yang tidak mengaitkan apa pun.
 */
export async function assertObjectivesForSubject(
  tx: Tx,
  subjectId: string,
  objectiveIds: readonly string[],
  opts: { keep?: ReadonlySet<string>; requireActive?: boolean; maxCount?: boolean } = {},
): Promise<string[]> {
  const ids = [...new Set(objectiveIds)];
  if (opts.maxCount !== false && ids.length > MAX_OBJECTIVES_PER_ASSESSMENT) {
    throw new HttpError(
      400,
      'too_many_objectives',
      `Satu penilaian paling banyak dikaitkan ke ${MAX_OBJECTIVES_PER_ASSESSMENT} tujuan pembelajaran.`,
    );
  }
  if (ids.length === 0) return ids;
  const rows = await tx
    .select({
      id: learningObjective.id,
      active: learningObjective.active,
      subjectId: learningOutcome.subjectId,
    })
    .from(learningObjective)
    .innerJoin(learningOutcome, eq(learningOutcome.id, learningObjective.outcomeId))
    .where(inArray(learningObjective.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  if (ids.some((id) => !byId.has(id))) {
    throw new HttpError(400, 'invalid_reference', 'Tujuan pembelajaran tidak ditemukan.');
  }
  if (rows.some((r) => r.subjectId !== subjectId)) {
    throw new HttpError(
      400,
      'objective_subject_mismatch',
      'Tujuan pembelajaran harus milik mata pelajaran yang sama dengan penilaian.',
    );
  }
  if (opts.requireActive !== false && rows.some((r) => !r.active && !opts.keep?.has(r.id))) {
    throw new HttpError(
      400,
      'objective_inactive',
      'Tujuan pembelajaran sudah dinonaktifkan atau diganti versi baru; pilih versi yang aktif.',
    );
  }
  return ids;
}

/** Ganti himpunan TP sebuah penilaian dengan `objectiveIds` (sudah divalidasi). Mengembalikan jumlah tautan yang dibuang dan ditambah. */
export async function replaceAssessmentObjectives(
  tx: Tx,
  schoolId: string,
  assessmentId: string,
  objectiveIds: readonly string[],
): Promise<{ added: number; removed: number }> {
  const current = await tx
    .select({ objectiveId: assessmentObjective.objectiveId })
    .from(assessmentObjective)
    .where(eq(assessmentObjective.assessmentId, assessmentId));
  const have = new Set(current.map((c) => c.objectiveId));
  const want = new Set(objectiveIds);
  const drop = [...have].filter((id) => !want.has(id));
  const add = [...want].filter((id) => !have.has(id));
  if (drop.length > 0) {
    await tx
      .delete(assessmentObjective)
      .where(
        and(
          eq(assessmentObjective.assessmentId, assessmentId),
          inArray(assessmentObjective.objectiveId, drop),
        ),
      );
  }
  if (add.length > 0) {
    await tx
      .insert(assessmentObjective)
      .values(add.map((objectiveId) => ({ schoolId, assessmentId, objectiveId })));
  }
  return { added: add.length, removed: drop.length };
}

/** Id TP yang saat ini terkait ke sebuah penilaian. */
export async function linkedObjectiveIds(tx: Tx, assessmentId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ objectiveId: assessmentObjective.objectiveId })
    .from(assessmentObjective)
    .where(eq(assessmentObjective.assessmentId, assessmentId));
  return new Set(rows.map((r) => r.objectiveId));
}
