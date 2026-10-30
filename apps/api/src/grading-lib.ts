import { componentAverage, finalGrade, type Predicate, predicateOf } from '@edusync/contracts';
import {
  and,
  asc,
  assessment,
  eq,
  gradeComponent,
  gradingSetting,
  inArray,
  score,
  subject,
  type Tx,
} from '@edusync/db';

/** Pustaka perhitungan nilai bersama: dipakai rute penilaian dan rapor agar rumusnya tunggal. */

export const DEFAULT_SETTINGS = { kkm: 75, predicateA: 90, predicateB: 80, predicateC: 70 };

export interface GradingSettings {
  kkm: number;
  predicateA: number;
  predicateB: number;
  predicateC: number;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function loadSettings(tx: Tx): Promise<GradingSettings> {
  const [s] = await tx.select().from(gradingSetting);
  return s
    ? { kkm: s.kkm, predicateA: s.predicateA, predicateB: s.predicateB, predicateC: s.predicateC }
    : { ...DEFAULT_SETTINGS };
}

export function loadComponents(tx: Tx) {
  return tx
    .select({
      id: gradeComponent.id,
      name: gradeComponent.name,
      weight: gradeComponent.weight,
      sort: gradeComponent.sort,
    })
    .from(gradeComponent)
    .orderBy(asc(gradeComponent.sort), asc(gradeComponent.name));
}

export interface StudentGrade {
  perComponent: { componentId: string; average: number | null }[];
  final: number | null;
  predicate: Predicate | null;
}

/**
 * Nilai per mapel per siswa untuk satu kelas pada satu semester. Skor kosong atau tanpa baris skor diabaikan;
 * rumus bobot dan predikat ada di `@edusync/contracts`.
 */
export async function computeGrades(
  tx: Tx,
  p: {
    semesterId: string;
    classId: string;
    subjectIds: string[];
    studentIds: string[];
    components: { id: string; weight: number }[];
    settings: GradingSettings;
  },
) {
  const assessments = p.subjectIds.length
    ? await tx
        .select({
          id: assessment.id,
          subjectId: assessment.subjectId,
          componentId: assessment.componentId,
          maxScore: assessment.maxScore,
        })
        .from(assessment)
        .where(
          and(
            eq(assessment.semesterId, p.semesterId),
            eq(assessment.classId, p.classId),
            inArray(assessment.subjectId, p.subjectIds),
          ),
        )
    : [];
  const scores = assessments.length
    ? await tx
        .select({ assessmentId: score.assessmentId, studentId: score.studentId, value: score.value })
        .from(score)
        .where(
          inArray(
            score.assessmentId,
            assessments.map((a) => a.id),
          ),
        )
    : [];
  const scoreOf = new Map(scores.map((s) => [`${s.assessmentId}:${s.studentId}`, s.value]));

  const gradeOf = (subjectId: string, studentId: string): StudentGrade => {
    const groups = p.components.map((c) => ({
      componentId: c.id,
      weight: c.weight,
      scores: assessments
        .filter((a) => a.subjectId === subjectId && a.componentId === c.id)
        .map((a) => ({ value: scoreOf.get(`${a.id}:${studentId}`) ?? null, max: a.maxScore })),
    }));
    const final = finalGrade(groups);
    return {
      perComponent: groups.map((g) => {
        const avg = componentAverage(g.scores);
        return { componentId: g.componentId, average: avg === null ? null : round2(avg) };
      }),
      final,
      predicate: final === null ? null : predicateOf(final, p.settings),
    };
  };

  /** subjectId -> studentId -> hasil */
  const result = new Map<string, Map<string, StudentGrade>>();
  for (const subjectId of p.subjectIds) {
    result.set(
      subjectId,
      new Map(p.studentIds.map((studentId) => [studentId, gradeOf(subjectId, studentId)])),
    );
  }
  return result;
}

/** Mapel yang punya penilaian di kelas itu pada semester itu, urut nama. */
export async function assessedSubjects(tx: Tx, semesterId: string, classId: string) {
  const assessed = await tx
    .selectDistinct({ subjectId: assessment.subjectId })
    .from(assessment)
    .where(and(eq(assessment.semesterId, semesterId), eq(assessment.classId, classId)));
  if (assessed.length === 0) return [];
  return tx
    .select({ id: subject.id, name: subject.name })
    .from(subject)
    .where(
      inArray(
        subject.id,
        assessed.map((a) => a.subjectId),
      ),
    )
    .orderBy(asc(subject.name));
}
