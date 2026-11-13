import {
  assessmentCounts,
  type CalculationMode,
  type ComponentCategory,
  componentAverage,
  componentCounts,
  finalGrade,
  type Predicate,
  predicateOf,
} from '@edusync/contracts';
import {
  and,
  asc,
  assessment,
  eq,
  gradeComponent,
  gradingSetting,
  inArray,
  isNull,
  ne,
  notInArray,
  or,
  score,
  subject,
  type Tx,
} from '@edusync/db';

/** Pustaka perhitungan nilai bersama: dipakai rute penilaian dan rapor agar rumusnya tunggal. */

export type { CalculationMode };

export const DEFAULT_SETTINGS = {
  kkm: 75,
  predicateA: 90,
  predicateB: 80,
  predicateC: 70,
  calculationMode: 'weighted_average' as CalculationMode,
};

export interface GradingSettings {
  /** KKM sekolah; KKM per mapel (KKTP) dipecah oleh `kktp-lib` dan jatuh ke nilai ini. */
  kkm: number;
  predicateA: number;
  predicateB: number;
  predicateC: number;
  calculationMode: CalculationMode;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function loadSettings(tx: Tx): Promise<GradingSettings> {
  const [s] = await tx.select().from(gradingSetting);
  return s
    ? {
        kkm: s.kkm,
        predicateA: s.predicateA,
        predicateB: s.predicateB,
        predicateC: s.predicateC,
        calculationMode: s.calculationMode,
      }
    : { ...DEFAULT_SETTINGS };
}

/** Komponen nilai beserta kategorinya (rancangan fase 3, 3.1). Kategori yang hilang = sumatif dan ikut nilai akhir. */
export interface GradingComponent {
  id: string;
  name: string;
  weight: number;
  sort: number;
  category: ComponentCategory;
  includeInFinal: boolean;
}

export async function loadComponents(tx: Tx): Promise<GradingComponent[]> {
  const rows = await tx
    .select({
      id: gradeComponent.id,
      name: gradeComponent.name,
      weight: gradeComponent.weight,
      sort: gradeComponent.sort,
      category: gradeComponent.category,
      includeInFinal: gradeComponent.includeInFinal,
    })
    .from(gradeComponent)
    .orderBy(asc(gradeComponent.sort), asc(gradeComponent.name));
  return rows.map((r) => ({ ...r, category: r.category as ComponentCategory }));
}

/** Id komponen yang TIDAK dihitung ke nilai akhir (formatif atau dikeluarkan) menurut konfigurasi efektif. */
export const notCountedComponentIds = (
  components: readonly { id: string; category?: ComponentCategory; includeInFinal?: boolean }[],
) => components.filter((c) => !componentCounts(c)).map((c) => c.id);

export interface StudentGrade {
  /** SEMUA komponen (formatif juga, untuk tampilan); hanya komponen yang dihitung yang masuk `final`. */
  perComponent: { componentId: string; average: number | null }[];
  final: number | null;
  predicate: Predicate | null;
  /**
   * Umpan balik formatif: rata-rata persen semua skor terisi di komponen yang TIDAK dihitung, dan jumlah skornya. Hanya ada
   * bila siswa punya skor semacam itu; tidak pernah memengaruhi `final`, `predicate`, atau peringkat.
   */
  formative?: { average: number; count: number };
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
    components: { id: string; weight: number; category?: ComponentCategory; includeInFinal?: boolean }[];
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
          purpose: assessment.purpose,
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
    // Penyaringan kategori di SATU tempat ini (rancangan fase 3, risiko R1): hanya komponen yang dihitung (sumatif dan
    // `includeInFinal`) dan bukan penilaian asesmen awal yang masuk `finalGrade`, jadi rumus nilai akhir tidak berubah.
    // `perComponent` tetap memuat semua komponen untuk tampilan.
    const groups = p.components.map((c) => {
      const counts = componentCounts(c);
      return {
        componentId: c.id,
        weight: c.weight,
        counts,
        scores: assessments
          .filter(
            (a) => a.subjectId === subjectId && a.componentId === c.id && (!counts || assessmentCounts(a, c)),
          )
          .map((a) => ({ value: scoreOf.get(`${a.id}:${studentId}`) ?? null, max: a.maxScore })),
      };
    });
    const final = finalGrade(
      groups.filter((g) => g.counts),
      p.settings.calculationMode,
    );
    const formativeScores = groups.filter((g) => !g.counts).flatMap((g) => g.scores);
    const formativeAverage = componentAverage(formativeScores);
    return {
      perComponent: groups.map((g) => {
        const avg = componentAverage(g.scores);
        return { componentId: g.componentId, average: avg === null ? null : round2(avg) };
      }),
      final,
      predicate: final === null ? null : predicateOf(final, p.settings),
      ...(formativeAverage === null
        ? {}
        : {
            formative: {
              average: round2(formativeAverage),
              count: formativeScores.filter((s) => s.value !== null).length,
            },
          }),
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

/**
 * Mapel yang punya penilaian di kelas itu pada semester itu, urut nama. Hanya penilaian yang IKUT nilai akhir yang dihitung:
 * mapel yang cuma punya penilaian formatif (komponennya ada di `notCounted`) atau asesmen awal tidak termasuk, jadi tidak muncul
 * di rapor dan tidak memicu `grades_incomplete`. `notCounted` = `notCountedComponentIds(config.components)`; kosong = perilaku
 * sebelum fase 3.
 */
export async function assessedSubjects(
  tx: Tx,
  semesterId: string,
  classId: string,
  notCounted: readonly string[] = [],
) {
  const assessed = await tx
    .selectDistinct({ subjectId: assessment.subjectId })
    .from(assessment)
    .where(
      and(
        eq(assessment.semesterId, semesterId),
        eq(assessment.classId, classId),
        or(isNull(assessment.purpose), ne(assessment.purpose, 'initial')),
        notCounted.length ? notInArray(assessment.componentId, [...notCounted]) : undefined,
      ),
    );
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
