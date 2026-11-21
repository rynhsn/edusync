/**
 * Aturan murni perangkat ajar (fase 2B tahap 2): fase Kurikulum Merdeka dan validasi isi ATP. Tanpa akses database.
 */

export const PHASES = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type Phase = (typeof PHASES)[number];

export function isPhase(value: unknown): value is Phase {
  return typeof value === 'string' && (PHASES as readonly string[]).includes(value);
}

/** Jumlah TP/item maksimal dalam satu ATP. */
export const MAX_FLOW_ITEMS = 300;

/** Fase menurut kelas (1-12): A = 1-2, B = 3-4, C = 5-6, D = 7-9, E = 10, F = 11-12. */
export function phaseForGrade(grade: number): Phase | null {
  if (!Number.isInteger(grade) || grade < 1 || grade > 12) return null;
  if (grade <= 2) return 'A';
  if (grade <= 4) return 'B';
  if (grade <= 6) return 'C';
  if (grade <= 9) return 'D';
  if (grade === 10) return 'E';
  return 'F';
}

const ROMAN: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
  XI: 11,
  XII: 12,
};

/** Kelas dari kode tingkat: "7", "10", atau angka Romawi ("VII", "XII"). Selain itu null. */
export function gradeFromLevelCode(code: string): number | null {
  const text = code.trim().toUpperCase();
  if (/^\d{1,2}$/.test(text)) return Number(text);
  return ROMAN[text] ?? null;
}

/** Fase untuk kode tingkat sekolah; null bila kode tidak dikenali sebagai kelas 1-12. */
export function phaseForLevelCode(code: string): Phase | null {
  const grade = gradeFromLevelCode(code);
  return grade === null ? null : phaseForGrade(grade);
}

export interface FlowItemLike {
  objectiveId: string;
}

export type FlowItemsProblem = 'too_many' | 'duplicate_entry';

/** Memeriksa daftar item ATP: maksimal 300 dan tiap TP hanya sekali. Mengembalikan null bila sah. */
export function checkFlowItems(items: readonly FlowItemLike[]): FlowItemsProblem | null {
  if (items.length > MAX_FLOW_ITEMS) return 'too_many';
  return new Set(items.map((i) => i.objectiveId)).size === items.length ? null : 'duplicate_entry';
}

/** Jumlah minggu/JP valid: bilangan bulat 0..9999, atau kosong. */
export function isValidFlowQuantity(value: number | null | undefined): boolean {
  return value === null || value === undefined || (Number.isInteger(value) && value >= 0 && value <= 9999);
}

/** Perencanaan pembelajaran (tahap 3.6.1): panjang tiap kolom teks, jumlah TP, dan panjang tautan. */
export const MAX_PLAN_TEXT = 8000;
export const MAX_PLAN_OBJECTIVES = 20;
export const MAX_PLAN_LINK = 500;

/** Tautan berkas perencanaan: hanya https (tanpa spasi, maksimal 500 karakter), karena belum ada penyimpanan berkas sekolah. */
export function isValidPlanLink(value: string): boolean {
  return value.length <= MAX_PLAN_LINK && /^https:\/\/[^\s/?#]+[^\s]*$/.test(value);
}

/** Jurnal mengajar (tahap 3.6.2): batas topik, catatan, dan jumlah TP per jurnal. */
export const MAX_JOURNAL_TOPIC = 200;
export const MAX_JOURNAL_NOTE = 2000;
export const MAX_JOURNAL_OBJECTIVES = 10;

/** Penilaian proses pembelajaran (tahap 3.6.3, C12): jenis penilai, butir rubrik tetap (skala 1-4), dan batas isian. */
export const REVIEWER_KINDS = ['self', 'peer', 'principal', 'student'] as const;
export type ReviewerKind = (typeof REVIEWER_KINDS)[number];
/** Perencanaan, pelaksanaan, penilaian, tindak lanjut. Tidak dapat dikustom per sekolah (kunci terjemahan `teachingPlan.reviewItems.<kunci>`). */
export const LEARNING_REVIEW_ITEMS = ['planning', 'implementation', 'assessment', 'follow_up'] as const;
export type LearningReviewItem = (typeof LEARNING_REVIEW_ITEMS)[number];
export const MAX_REVIEW_NOTE = 2000;
export const MAX_REVIEW_RESPONDENTS = 100000;

/**
 * Rating sah: kunci hanya butir rubrik, nilai 1..4. Bilangan bulat, kecuali `student` (rata-rata agregat survei, maks 2 desimal).
 * Mengembalikan kunci/nilai pertama yang tidak sah, atau null bila semua sah.
 */
export function invalidReviewRating(ratings: Record<string, number>, kind: ReviewerKind): string | null {
  for (const [key, value] of Object.entries(ratings)) {
    if (!(LEARNING_REVIEW_ITEMS as readonly string[]).includes(key)) return key;
    const aggregate = kind === 'student' && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
    if (!Number.isFinite(value) || value < 1 || value > 4 || !(Number.isInteger(value) || aggregate))
      return key;
  }
  return null;
}
