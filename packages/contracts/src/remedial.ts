import { DEFAULT_REMEDIAL_POLICY, REMEDIAL_POLICIES, type RemedialPolicy } from './grading-config';

/**
 * Nilai efektif sebuah skor di bawah kebijakan remedial (rancangan: docs/rancangan-fase-3-asesmen-rapor.md, bagian 3.6). Murni,
 * tanpa database. Skor ASLI tidak pernah ditimpa: yang dihitung di sini hanya nilai yang dipakai nilai akhir dan ketercapaian TP.
 *
 * | Kebijakan            | Nilai efektif                                                                                         |
 * | -------------------- | ----------------------------------------------------------------------------------------------------- |
 * | `record_only`        | skor asli (percobaan hanya dicatat; bawaan)                                                           |
 * | `replace_latest`     | percobaan terakhir yang berisi nilai (walau lebih rendah dari skor asli)                              |
 * | `max`                | maksimum skor asli dan semua percobaan                                                                |
 * | `cap_at_criteria`    | maksimum (skor asli, min(percobaan terbaik, ambang ketuntasan)): remedial paling tinggi menaikkan     |
 * |                      | ke ambang (KKM efektif mapel, persen dari skor maksimum); skor asli di atas ambang tidak diturunkan   |
 * | `mean_with_original` | rata-rata skor asli dan percobaan terakhir yang berisi nilai (dua desimal)                            |
 *
 * Tanpa skor asli (kosong) percobaan tetap dipakai: `replace_latest` dan `mean_with_original` memakai percobaan terakhir,
 * `max` dan `cap_at_criteria` memakai percobaan terbaik (yang terakhir dibatasi ambang). Percobaan tanpa nilai (null) diabaikan.
 * Tanpa percobaan berisi nilai, hasilnya selalu skor asli, apa pun kebijakannya.
 */

export { DEFAULT_REMEDIAL_POLICY, REMEDIAL_POLICIES, type RemedialPolicy };

/** Jumlah percobaan remedial maksimal per (penilaian, murid); sama dengan CHECK di DB. */
export const MAX_REMEDIAL_ATTEMPTS = 20;

export const REMEDIAL_ERROR_CODES = ['score_out_of_range', 'too_many_attempts'] as const;
export type RemedialErrorCode = (typeof REMEDIAL_ERROR_CODES)[number];

export const LEARNING_SUPPORT_KINDS = ['remedial', 'enrichment'] as const;
export type LearningSupportKind = (typeof LEARNING_SUPPORT_KINDS)[number];

export const SUPPORT_PARTICIPANT_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'] as const;
export type SupportParticipantStatus = (typeof SUPPORT_PARTICIPANT_STATUSES)[number];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const isRemedialPolicy = (v: unknown): v is RemedialPolicy =>
  typeof v === 'string' && (REMEDIAL_POLICIES as readonly string[]).includes(v);

/** Kebijakan dari nilai mentah kolom (NULL, kosong, atau tak dikenal = `record_only`). */
export const normalizeRemedialPolicy = (v: string | null | undefined): RemedialPolicy =>
  isRemedialPolicy(v) ? v : DEFAULT_REMEDIAL_POLICY;

/** Satu percobaan remedial. `attemptNo` menentukan "terakhir" (yang terbesar). */
export interface RemedialAttempt {
  attemptNo: number;
  value: number | null;
}

export interface EffectiveScoreInput {
  /** Skor asli di `score.value`; null = kosong. */
  original: number | null;
  /** Skor maksimum penilaian. */
  max: number;
  attempts: readonly RemedialAttempt[];
  /** KKM efektif mapel dalam persen (0..100); dipakai `cap_at_criteria`. Tanpa nilai = tanpa batas atas. */
  kkmPercent?: number | null | undefined;
}

export interface EffectiveScore {
  value: number | null;
  /** `remedial` bila nilai efektif berbeda dari skor asli karena percobaan; selain itu `original`. */
  source: 'original' | 'remedial';
}

/** Batas atas nilai remedial untuk `cap_at_criteria`: ambang KKM dalam satuan skor (dua desimal). */
export function remedialCap(max: number, kkmPercent: number): number {
  return round2((kkmPercent / 100) * max);
}

/** Nilai efektif satu skor. Tanpa percobaan berisi nilai, atau kebijakan `record_only`: persis skor asli. */
export function effectiveScore(policy: RemedialPolicy, p: EffectiveScoreInput): EffectiveScore {
  const original: EffectiveScore = { value: p.original, source: 'original' };
  if (policy === 'record_only') return original;
  const filled = p.attempts
    .filter((a): a is { attemptNo: number; value: number } => a.value !== null)
    .sort((a, b) => a.attemptNo - b.attemptNo);
  if (filled.length === 0) return original;
  const latest = filled[filled.length - 1]!.value;
  const best = Math.max(...filled.map((a) => a.value));

  let value: number;
  switch (policy) {
    case 'replace_latest':
      value = latest;
      break;
    case 'max':
      value = p.original === null ? best : Math.max(p.original, best);
      break;
    case 'cap_at_criteria': {
      const lifted =
        p.kkmPercent === null || p.kkmPercent === undefined
          ? best
          : Math.min(best, remedialCap(p.max, p.kkmPercent));
      value = p.original === null ? lifted : Math.max(p.original, lifted);
      break;
    }
    case 'mean_with_original':
      value = p.original === null ? latest : round2((p.original + latest) / 2);
      break;
  }
  return { value, source: value === p.original ? 'original' : 'remedial' };
}

/** Apakah persen skor di bawah ambang ketuntasan (kandidat remedial). Persen dan ambang sama-sama 0..100. */
export const needsRemedial = (percent: number | null, kkmPercent: number): boolean =>
  percent !== null && percent < kkmPercent;
