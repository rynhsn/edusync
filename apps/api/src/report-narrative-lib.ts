import { createHash } from 'node:crypto';
import {
  buildObjectiveNarrative,
  type NarrativeCandidate,
  type NarrativeSettings,
  type ObjectiveNarrative,
} from '@edusync/contracts';
import {
  and,
  assessment,
  assessmentObjective,
  eq,
  inArray,
  isNull,
  learningFlow,
  learningFlowItem,
  or,
  studentObjectiveAchievement,
  type Tx,
} from '@edusync/db';
import type { EffectiveGradingConfig } from './grading-config-lib';
import { computeObjectiveAchievement } from './objective-achievement-lib';
import { type SubjectTakers, takes } from './subject-roster-lib';

/**
 * Narasi rapor dari ketercapaian TP (rancangan fase 3, bagian 3.4). Menghitung, untuk satu kelas-semester, narasi otomatis tiap
 * (murid, mapel) yang punya TP berstatus. Murid atau mapel tanpa TP berstatus tidak ada di hasil: pemanggil jatuh ke teks v1.
 *
 * Jumlah kueri TIDAK bergantung pada jumlah murid maupun TP: dua kueri untuk mencari mapel ber-TP, lalu per mapel ber-TP satu
 * `computeObjectiveAchievement` (kueri tetap), dan satu kueri urutan ATP. Kelas tanpa kaitan TP dan tanpa keputusan guru hanya
 * membayar dua kueri pencarian itu.
 */

/** studentId -> subjectId -> narasi otomatis. */
export type ObjectiveNarratives = Map<string, Map<string, ObjectiveNarrative>>;

export interface NarrativeClassInput {
  sem: { id: string; academicYearId: string };
  cls: { id: string; level: string };
  subjects: { id: string }[];
  /** Pengambil per mapel (3B.2): murid yang tidak mengambil suatu mapel tidak mendapat narasi mapel itu. Kosong/null = semua. */
  takers?: SubjectTakers | null | undefined;
  cfg: EffectiveGradingConfig;
}

export async function loadObjectiveNarratives(
  tx: Tx,
  c: NarrativeClassInput,
  studentIds: string[],
  settings: Partial<NarrativeSettings>,
): Promise<ObjectiveNarratives> {
  const out: ObjectiveNarratives = new Map();
  if (c.subjects.length === 0 || studentIds.length === 0) return out;
  const subjectIds = c.subjects.map((s) => s.id);

  // Mapel yang punya kaitan penilaian ke TP atau keputusan guru pada kelas-semester ini.
  const [linked, decided] = await Promise.all([
    tx
      .selectDistinct({ subjectId: assessment.subjectId })
      .from(assessmentObjective)
      .innerJoin(assessment, eq(assessment.id, assessmentObjective.assessmentId))
      .where(
        and(
          eq(assessment.semesterId, c.sem.id),
          eq(assessment.classId, c.cls.id),
          inArray(assessment.subjectId, subjectIds),
        ),
      ),
    tx
      .selectDistinct({ subjectId: studentObjectiveAchievement.subjectId })
      .from(studentObjectiveAchievement)
      .where(
        and(
          eq(studentObjectiveAchievement.semesterId, c.sem.id),
          eq(studentObjectiveAchievement.classId, c.cls.id),
          inArray(studentObjectiveAchievement.subjectId, subjectIds),
        ),
      ),
  ]);
  const withObjectives = [...new Set([...linked, ...decided].map((r) => r.subjectId))];
  if (withObjectives.length === 0) return out;

  const results = [];
  for (const subjectId of withObjectives) {
    results.push({
      subjectId,
      r: await computeObjectiveAchievement(tx, {
        semesterId: c.sem.id,
        classId: c.cls.id,
        subjectId,
        studentIds,
        cfg: c.cfg,
      }),
    });
  }

  // Urutan ATP terbit tahun ajaran itu (tingkat sama atau tanpa tingkat); TP di beberapa ATP memakai urutan terkecil.
  const objectiveIds = [...new Set(results.flatMap(({ r }) => r.objectives.map((o) => o.id)))];
  const atpOrder = new Map<string, number>();
  if (objectiveIds.length > 0) {
    const items = await tx
      .select({ objectiveId: learningFlowItem.objectiveId, sortOrder: learningFlowItem.sortOrder })
      .from(learningFlowItem)
      .innerJoin(learningFlow, eq(learningFlow.id, learningFlowItem.flowId))
      .where(
        and(
          eq(learningFlow.academicYearId, c.sem.academicYearId),
          eq(learningFlow.status, 'published'),
          or(isNull(learningFlow.levelCode), eq(learningFlow.levelCode, c.cls.level)),
          inArray(learningFlowItem.objectiveId, objectiveIds),
        ),
      );
    for (const i of items) {
      const prev = atpOrder.get(i.objectiveId);
      if (prev === undefined || i.sortOrder < prev) atpOrder.set(i.objectiveId, i.sortOrder);
    }
  }

  for (const studentId of studentIds) {
    for (const { subjectId, r } of results) {
      if (!takes(c.takers ?? null, subjectId, studentId)) continue;
      const row = r.cells.get(studentId);
      if (!row) continue;
      const candidates: NarrativeCandidate[] = [];
      for (const o of r.objectives) {
        const cell = row.get(o.id);
        if (!cell || cell.achieved === null) continue;
        candidates.push({
          id: o.id,
          code: o.code,
          text: o.description,
          achieved: cell.achieved,
          percent: cell.percent,
          atpOrder: atpOrder.get(o.id) ?? null,
          sortOrder: o.sortOrder,
        });
      }
      const narrative = buildObjectiveNarrative(candidates, settings);
      if (!narrative) continue;
      const bySubject = out.get(studentId) ?? new Map<string, ObjectiveNarrative>();
      bySubject.set(subjectId, narrative);
      out.set(studentId, bySubject);
    }
  }
  return out;
}

/** Sidik teks otomatis saat narasi manual disunting (`report_subject_narrative.generated_hash`); teks kosong = ''. */
export function narrativeHash(autoText: string | null): string {
  return createHash('sha256')
    .update(autoText ?? '')
    .digest('hex')
    .slice(0, 16);
}

/**
 * Narasi manual usang (R7): disimpan dengan sidik teks otomatis, dan teks otomatis sekarang berbeda. Baris tanpa sidik (suntingan
 * tahap 3.2) tidak pernah dianggap usang karena tidak ada pembanding.
 */
export function isNarrativeStale(storedHash: string | null | undefined, autoText: string | null): boolean {
  return Boolean(storedHash) && storedHash !== narrativeHash(autoText);
}
