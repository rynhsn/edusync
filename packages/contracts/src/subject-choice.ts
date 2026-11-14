/**
 * Aturan murni pilihan mata pelajaran per murid (tahap 3B.1). Tanpa akses data: dipakai API (rute pilihan, roster per mapel)
 * dan klien (tampilan peringatan) sehingga satu definisi untuk "murid mengambil mapel ini", validasi aturan, dan pemetaan agama.
 *
 * Model (docs/rancangan-3b-3c-pilihan-mapel-kelulusan.md, 3.1): sebuah mapel di sebuah rombel hanya diikuti murid yang terdaftar
 * bila rombel itu punya penanda partisipasi untuk mapel tersebut; tanpa penanda semua murid rombel mengikutinya (perilaku lama).
 */

/** Mode partisipasi mapel di rombel. `all` = bawaan (tidak disimpan); `selected` = hanya murid yang terdaftar. */
export const SUBJECT_PARTICIPATION_MODES = ['all', 'selected'] as const;
export type SubjectParticipationMode = (typeof SUBJECT_PARTICIPATION_MODES)[number];

/** Sumber baris pilihan murid. */
export const SUBJECT_ENROLLMENT_SOURCES = ['choice', 'religion', 'arts', 'admin'] as const;
export type SubjectEnrollmentSource = (typeof SUBJECT_ENROLLMENT_SOURCES)[number];

/** Kode galat tahap 3B.1. */
export const SUBJECT_NOT_SELECTED_MODE_CODE = 'subject_not_selected_mode';
export const CHOICE_RULE_VIOLATION_CODE = 'choice_rule_violation';
export const CHOICE_SCOPE_OVERLAP_CODE = 'scope_overlap';
export const CHOICE_LOCKED_CODE = 'choice_locked';

/** Batas panjang kunci kelompok aturan (sama dengan CHECK di DB). */
export const CHOICE_GROUP_KEY_MAX = 40;

/** Agama murid (`student.religion`) dan varian mapel agama (`subject.religion_variant`); `other` murid = `belief` mapel. */
export const STUDENT_RELIGIONS = [
  'islam',
  'christian',
  'catholic',
  'hindu',
  'buddhist',
  'confucian',
  'other',
] as const;
export type StudentReligion = (typeof STUDENT_RELIGIONS)[number];
export const SUBJECT_RELIGION_VARIANTS = [
  'islam',
  'christian',
  'catholic',
  'hindu',
  'buddhist',
  'confucian',
  'belief',
] as const;
export type SubjectReligionVariant = (typeof SUBJECT_RELIGION_VARIANTS)[number];

/** Varian mapel agama yang sesuai dengan agama murid (`other` -> `belief`). Tanpa agama = null. */
export function religionVariantOf(
  religion: StudentReligion | null | undefined,
): SubjectReligionVariant | null {
  if (!religion) return null;
  return religion === 'other' ? 'belief' : religion;
}

export type ReligionMatch = 'match' | 'mismatch' | 'unknown';

/** Apakah mapel agama bervarian `variant` cocok dengan agama murid? `unknown` bila murid tanpa agama atau mapel tanpa varian. */
export function religionMatch(
  religion: StudentReligion | null | undefined,
  variant: SubjectReligionVariant | null | undefined,
): ReligionMatch {
  const expected = religionVariantOf(religion);
  if (!expected || !variant) return 'unknown';
  return expected === variant ? 'match' : 'mismatch';
}

export type ReligionPick =
  | { kind: 'matched'; subjectId: string }
  | { kind: 'unmatched'; reason: 'no_religion' | 'no_matching_subject' | 'ambiguous_subject' };

/**
 * Pilih mapel agama untuk murid dari mapel agama yang ditawarkan rombel. Tidak menebak: harus ada TEPAT satu mapel dengan varian
 * yang sesuai (termasuk `belief` untuk `other`); nol atau lebih dari satu dilaporkan sebagai tidak cocok.
 */
export function pickReligionSubject(
  religion: StudentReligion | null | undefined,
  candidates: readonly { id: string; religionVariant: SubjectReligionVariant | null }[],
): ReligionPick {
  const variant = religionVariantOf(religion);
  if (!variant) return { kind: 'unmatched', reason: 'no_religion' };
  const hits = candidates.filter((c) => c.religionVariant === variant);
  if (hits.length === 0) return { kind: 'unmatched', reason: 'no_matching_subject' };
  if (hits.length > 1) return { kind: 'unmatched', reason: 'ambiguous_subject' };
  return { kind: 'matched', subjectId: hits[0]!.id };
}

/**
 * "Murid mengambil mapel ini pada semester X?" Aturan efektif (rancangan 3.1):
 * (a) mapel tidak berpenanda di rombel -> ya (perilaku lama); atau
 * (b) berpenanda dan murid punya baris untuk tahun itu (`semesterId` null) atau untuk semester X.
 * `rows` = baris `student_subject_enrollment` murid untuk mapel itu pada tahun rombel.
 */
export function takesSubject(input: {
  participating: boolean;
  rows: readonly { semesterId: string | null }[];
  semesterId: string;
}): boolean {
  if (!input.participating) return true;
  return input.rows.some((r) => r.semesterId === null || r.semesterId === input.semesterId);
}

/** Cakupan baris pilihan: setahun (`semesterId` null) atau satu semester. Dua baris mapel yang sama tidak boleh bertumpuk. */
export function scopesOverlap(a: { semesterId: string | null }, b: { semesterId: string | null }): boolean {
  return a.semesterId === null || b.semesterId === null || a.semesterId === b.semesterId;
}

export interface ChoiceRuleBounds {
  minChoices: number | null;
  maxChoices: number | null;
  minOffered: number | null;
}

export type ChoiceRuleStatus = 'ok' | 'below_min' | 'above_max';

/** Status jumlah mapel anggota aturan yang diambil satu murid terhadap batas aturan. */
export function evaluateChoiceCount(
  rule: Pick<ChoiceRuleBounds, 'minChoices' | 'maxChoices'>,
  count: number,
): ChoiceRuleStatus {
  if (rule.minChoices !== null && count < rule.minChoices) return 'below_min';
  if (rule.maxChoices !== null && count > rule.maxChoices) return 'above_max';
  return 'ok';
}

/** Apakah jumlah mapel yang ditawarkan rombel memenuhi `minOffered`? */
export function evaluateOffered(rule: Pick<ChoiceRuleBounds, 'minOffered'>, offered: number): boolean {
  return rule.minOffered === null || offered >= rule.minOffered;
}

export interface ChoiceRuleInput extends ChoiceRuleBounds {
  id: string;
  groupKey: string;
  label: string;
  enforce: boolean;
  subjectIds: readonly string[];
}

export interface ChoiceRuleResult {
  ruleId: string;
  groupKey: string;
  label: string;
  enforce: boolean;
  count: number;
  minChoices: number | null;
  maxChoices: number | null;
  status: ChoiceRuleStatus;
}

/** Hasil semua aturan untuk satu murid; `takes(subjectId)` menjawab apakah murid mengambil mapel itu pada semester yang dinilai. */
export function evaluateStudentRules(
  rules: readonly ChoiceRuleInput[],
  takes: (subjectId: string) => boolean,
): ChoiceRuleResult[] {
  return rules.map((rule) => {
    const count = rule.subjectIds.filter((id) => takes(id)).length;
    return {
      ruleId: rule.id,
      groupKey: rule.groupKey,
      label: rule.label,
      enforce: rule.enforce,
      count,
      minChoices: rule.minChoices,
      maxChoices: rule.maxChoices,
      status: evaluateChoiceCount(rule, count),
    };
  });
}

/** Hasil yang melanggar dan aturannya `enforce` (menolak penyimpanan). */
export const blockingViolations = (results: readonly ChoiceRuleResult[]) =>
  results.filter((r) => r.enforce && r.status !== 'ok');
