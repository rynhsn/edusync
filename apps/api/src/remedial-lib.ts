import { effectiveScore, type RemedialAttempt, type RemedialPolicy } from '@edusync/contracts';
import { inArray, scoreRemedialAttempt, type Tx } from '@edusync/db';

/**
 * Nilai efektif remedial untuk penghitung nilai (rancangan fase 3, bagian 3.6). Skor asli di `score.value` TIDAK pernah ditimpa:
 * fungsi di sini hanya menghitung nilai yang dipakai nilai akhir dan ketercapaian TP, memakai kontrak murni `effectiveScore`.
 * Tanpa konteks remedial (kebijakan `record_only` dan penanda tidak diminta) penghitung tidak memuat apa pun dari tabel
 * percobaan, jadi hasil dan jumlah kueri sama persis dengan sebelum tahap ini.
 */

export interface RemedialContext {
  policy: RemedialPolicy;
  /** KKM efektif mapel (persen); hanya dipakai `cap_at_criteria`, selain itu boleh tidak ada. */
  kkmOf(subjectId: string): number | undefined;
}

/** Kunci `${assessmentId}:${studentId}`. */
export type AttemptMap = Map<string, RemedialAttempt[]>;

/** Percobaan remedial untuk penilaian-penilaian itu (satu kueri batch), dikelompokkan per (penilaian, siswa). */
export async function loadAttempts(tx: Tx, assessmentIds: readonly string[]): Promise<AttemptMap> {
  const out: AttemptMap = new Map();
  if (assessmentIds.length === 0) return out;
  const rows = await tx
    .select({
      assessmentId: scoreRemedialAttempt.assessmentId,
      studentId: scoreRemedialAttempt.studentId,
      attemptNo: scoreRemedialAttempt.attemptNo,
      value: scoreRemedialAttempt.value,
    })
    .from(scoreRemedialAttempt)
    .where(inArray(scoreRemedialAttempt.assessmentId, [...assessmentIds]));
  for (const r of rows) {
    const key = `${r.assessmentId}:${r.studentId}`;
    out.set(key, [...(out.get(key) ?? []), { attemptNo: r.attemptNo, value: r.value }]);
  }
  return out;
}

export interface AppliedRemedial {
  assessmentId: string;
  studentId: string;
  subjectId: string;
  /** Jumlah percobaan (termasuk yang tanpa nilai). */
  attempts: number;
  source: 'original' | 'remedial';
}

/**
 * Ganti nilai di `scoreOf` (kunci `${assessmentId}:${studentId}`) dengan nilai efektif untuk setiap (penilaian, siswa) yang punya
 * percobaan. `assessmentOf` memberi mapel dan skor maksimum penilaian (undefined = abaikan percobaan itu). Mengembalikan rincian
 * per (penilaian, siswa) bagi penanda; di bawah `record_only` nilainya tidak berubah dan `source` selalu `original`.
 */
export function applyRemedialScores(
  scoreOf: Map<string, number | null>,
  assessmentOf: (assessmentId: string) => { subjectId: string; maxScore: number } | undefined,
  attempts: AttemptMap,
  ctx: RemedialContext,
): AppliedRemedial[] {
  const applied: AppliedRemedial[] = [];
  for (const [key, list] of attempts) {
    const [assessmentId, studentId] = key.split(':') as [string, string];
    const a = assessmentOf(assessmentId);
    if (!a) continue;
    const eff = effectiveScore(ctx.policy, {
      original: scoreOf.get(key) ?? null,
      max: a.maxScore,
      attempts: list,
      kkmPercent: ctx.kkmOf(a.subjectId),
    });
    if (eff.source === 'remedial') scoreOf.set(key, eff.value);
    applied.push({
      assessmentId,
      studentId,
      subjectId: a.subjectId,
      attempts: list.length,
      source: eff.source,
    });
  }
  return applied;
}

/** Ringkasan penanda remedial satu siswa pada satu mapel (field sparse di API): hanya bila ada percobaan. */
export function remedialMark(rows: readonly AppliedRemedial[]) {
  if (rows.length === 0) return undefined;
  return {
    attempts: rows.reduce((n, r) => n + r.attempts, 0),
    effectiveSource: rows.some((r) => r.source === 'remedial')
      ? ('remedial' as const)
      : ('original' as const),
  };
}
