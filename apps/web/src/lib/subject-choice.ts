/**
 * Logika murni halaman "Pilihan mata pelajaran": indeks pilihan murid per sel (murid x mapel), penyusunan isi permintaan
 * PUT, ringkasan peringatan aturan, pemetaan alasan, dan pembuatan kunci kelompok aturan. Tanpa React supaya mudah diuji.
 * Aturan mengikuti apps/api/src/routes/subject-choice.ts dan packages/contracts/src/subject-choice.ts.
 */

import { ApiError } from './api';

export type EnrollmentSource = 'choice' | 'religion' | 'arts' | 'admin';

export interface ChoiceEntry {
  studentId: string;
  subjectId: string;
  semesterId: string | null;
  source: EnrollmentSource;
  note: string | null;
  religionMismatch?: true | undefined;
}

export const cellKey = (studentId: string, subjectId: string) => `${studentId}:${subjectId}`;

/** Keadaan satu sel: tidak diambil, diambil setahun, atau hanya pada sebagian semester (tidak diubah dari matriks). */
export type CellState =
  | { kind: 'none' }
  | { kind: 'year'; source: EnrollmentSource; religionMismatch: boolean }
  | { kind: 'partial'; semesterIds: string[]; religionMismatch: boolean };

export function indexCells(entries: readonly ChoiceEntry[]): Map<string, CellState> {
  const out = new Map<string, CellState>();
  for (const e of entries) {
    const key = cellKey(e.studentId, e.subjectId);
    const mismatch = e.religionMismatch === true;
    if (e.semesterId === null) {
      out.set(key, { kind: 'year', source: e.source, religionMismatch: mismatch });
      continue;
    }
    const cur = out.get(key);
    if (cur?.kind === 'year') continue; // tidak mungkin bertumpuk; baris setahun menang
    out.set(key, {
      kind: 'partial',
      semesterIds: [...(cur?.kind === 'partial' ? cur.semesterIds : []), e.semesterId],
      religionMismatch: mismatch || (cur?.kind === 'partial' && cur.religionMismatch) || false,
    });
  }
  return out;
}

export const stateOf = (cells: ReadonlyMap<string, CellState>, key: string): CellState =>
  cells.get(key) ?? { kind: 'none' };

/** Nilai kotak centang: pilihan sementara bila ada, selain itu keadaan tersimpan (diambil setahun). */
export function isChecked(
  cells: ReadonlyMap<string, CellState>,
  draft: ReadonlyMap<string, boolean>,
  key: string,
): boolean {
  const d = draft.get(key);
  if (d !== undefined) return d;
  return stateOf(cells, key).kind === 'year';
}

/** Ubah satu sel pada pilihan sementara; kembali ke keadaan tersimpan menghapus catatan perubahannya. */
export function toggleDraft(
  cells: ReadonlyMap<string, CellState>,
  draft: ReadonlyMap<string, boolean>,
  key: string,
  want: boolean,
): Map<string, boolean> {
  const next = new Map(draft);
  const saved = stateOf(cells, key).kind === 'year';
  if (want === saved) next.delete(key);
  else next.set(key, want);
  return next;
}

export interface ChoiceBody {
  set: { studentId: string; subjectId: string; semesterId: null; source: 'choice' }[];
  remove: { studentId: string; subjectId: string }[];
  override?: true;
}

const split = (key: string) => {
  const i = key.indexOf(':');
  return { studentId: key.slice(0, i), subjectId: key.slice(i + 1) };
};

/** Isi PUT /subject-choices dari perubahan sementara: hanya sel yang benar-benar berubah, setahun penuh. */
export function buildChoiceBody(
  cells: ReadonlyMap<string, CellState>,
  draft: ReadonlyMap<string, boolean>,
  override = false,
): ChoiceBody {
  const body: ChoiceBody = { set: [], remove: [] };
  for (const [key, want] of draft) {
    const saved = stateOf(cells, key).kind;
    if (saved === 'partial') continue; // pilihan per semester diubah dari tempat lain
    const { studentId, subjectId } = split(key);
    if (want && saved === 'none') body.set.push({ studentId, subjectId, semesterId: null, source: 'choice' });
    if (!want && saved === 'year') body.remove.push({ studentId, subjectId });
  }
  if (override) body.override = true;
  return body;
}

export const countChanges = (body: Pick<ChoiceBody, 'set' | 'remove'>) =>
  body.set.length + body.remove.length;

/* ---------- Penanda "hanya murid yang memilih" ---------- */

export interface ParticipationSubject {
  subjectId: string;
  mode: 'all' | 'selected';
  scoredStudents: number;
}

/** Mapel yang modenya berubah dari keadaan tersimpan; `draft` berisi mode yang dipilih pengguna. */
export function participationChanges(
  subjects: readonly ParticipationSubject[],
  draft: ReadonlyMap<string, 'all' | 'selected'>,
): { subjectId: string; mode: 'all' | 'selected' }[] {
  const out: { subjectId: string; mode: 'all' | 'selected' }[] = [];
  for (const s of subjects) {
    const want = draft.get(s.subjectId);
    if (want && want !== s.mode) out.push({ subjectId: s.subjectId, mode: want });
  }
  return out;
}

/** Mapel yang akan dinyalakan dan sudah punya nilai murid; perlu konfirmasi sebelum disimpan. */
export function scoredWhenEnabling(
  subjects: readonly ParticipationSubject[],
  changes: readonly { subjectId: string; mode: 'all' | 'selected' }[],
): { subjectId: string; scoredStudents: number }[] {
  const by = new Map(subjects.map((s) => [s.subjectId, s]));
  return changes
    .filter((c) => c.mode === 'selected' && (by.get(c.subjectId)?.scoredStudents ?? 0) > 0)
    .map((c) => ({ subjectId: c.subjectId, scoredStudents: by.get(c.subjectId)?.scoredStudents ?? 0 }));
}

/* ---------- Ringkasan peringatan ---------- */

export interface RuleResultLike {
  ruleId: string;
  groupKey: string;
  label: string;
  enforce: boolean;
  count: number;
  minChoices: number | null;
  maxChoices: number | null;
  status: 'ok' | 'below_min' | 'above_max';
}

export interface StudentSummaryLike {
  studentId: string;
  name: string;
  nis: string | null;
  results: readonly RuleResultLike[];
}

/**
 * Satu masalah aturan pada satu murid. `notChosen` = belum memilih apa pun dari kelompok yang mewajibkan paling sedikit
 * satu; `tooFew`/`tooMany` = di luar rentang.
 */
export interface ChoiceProblem {
  kind: 'notChosen' | 'tooFew' | 'tooMany';
  label: string;
  groupKey: string;
  count: number;
  min: number | null;
  max: number | null;
  enforce: boolean;
}

export function problemOf(r: RuleResultLike): ChoiceProblem | null {
  if (r.status === 'ok') return null;
  const kind = r.status === 'above_max' ? 'tooMany' : r.count === 0 ? 'notChosen' : 'tooFew';
  return {
    kind,
    label: r.label,
    groupKey: r.groupKey,
    count: r.count,
    min: r.minChoices,
    max: r.maxChoices,
    enforce: r.enforce,
  };
}

export interface StudentWarning {
  studentId: string;
  name: string;
  nis: string | null;
  problems: ChoiceProblem[];
}

/** Murid yang punya masalah aturan, urut nama; murid tanpa masalah dibuang. */
export function summarizeWarnings(students: readonly StudentSummaryLike[]): StudentWarning[] {
  return students
    .map((s) => ({
      studentId: s.studentId,
      name: s.name,
      nis: s.nis,
      problems: s.results.map(problemOf).filter((p): p is ChoiceProblem => p !== null),
    }))
    .filter((s) => s.problems.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Kalimat rentang yang ramah: "4 sampai 5", "minimal 1", "paling banyak 2", "tepat 1". */
export function rangeKind(
  min: number | null,
  max: number | null,
): 'none' | 'exact' | 'between' | 'atLeast' | 'atMost' {
  if (min === null && max === null) return 'none';
  if (min !== null && max !== null) return min === max ? 'exact' : 'between';
  return min !== null ? 'atLeast' : 'atMost';
}

/* ---------- Isi dari agama ---------- */

export const UNMATCHED_REASONS = [
  'no_religion',
  'no_matching_subject',
  'ambiguous_subject',
  'has_other_religion_choice',
] as const;
export type UnmatchedReason = (typeof UNMATCHED_REASONS)[number];

/** Alasan dari API dipetakan ke alasan yang dikenal; selain itu memakai alasan umum "tidak cocok". */
export function normalizeUnmatchedReason(reason: string | null | undefined): UnmatchedReason {
  return (UNMATCHED_REASONS as readonly string[]).includes(reason ?? '')
    ? (reason as UnmatchedReason)
    : 'no_matching_subject';
}

/* ---------- Galat penguncian ---------- */

export const isChoiceLocked = (e: unknown): boolean =>
  e instanceof ApiError && e.status === 409 && e.code === 'choice_locked';

/* ---------- Aturan sekolah ---------- */

/** Jenis aturan bawaan: kunci kelompok tetap; "other" memakai kunci turunan dari nama. */
export const RULE_KINDS = ['elective', 'arts', 'religion', 'other'] as const;
export type RuleKind = (typeof RULE_KINDS)[number];
export const PRESET_KEYS = ['elective', 'arts', 'religion'] as const;
export const GROUP_KEY_MAX = 40;

/** Jenis aturan dari kunci kelompok tersimpan. */
export const kindOfKey = (key: string): RuleKind =>
  (PRESET_KEYS as readonly string[]).includes(key) ? (key as RuleKind) : 'other';

/** Kunci kelompok dari nama: huruf kecil, hanya a-z 0-9 dan tanda hubung, paling panjang 40, tidak kosong. */
export function slugGroupKey(label: string): string {
  const slug = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, GROUP_KEY_MAX)
    .replace(/-+$/g, '');
  return slug || 'rule';
}

/** Kunci yang dikirim: jenis bawaan memakai kuncinya; "other" mempertahankan kunci lama (ubah) atau diturunkan dari nama. */
export function groupKeyFor(kind: RuleKind, label: string, existingKey?: string): string {
  if (kind !== 'other') return kind;
  if (existingKey && kindOfKey(existingKey) === 'other') return existingKey;
  return slugGroupKey(label);
}

export interface RuleDraft {
  kind: RuleKind;
  existingKey?: string;
  levelCode: string;
  programId: string;
  label: string;
  minOffered: string;
  minChoices: string;
  maxChoices: string;
  enforce: boolean;
  lockedFromSemesterId: string;
  subjectIds: string[];
}

export const EMPTY_RULE: RuleDraft = {
  kind: 'elective',
  levelCode: '',
  programId: '',
  label: '',
  minOffered: '',
  minChoices: '',
  maxChoices: '',
  enforce: false,
  lockedFromSemesterId: '',
  subjectIds: [],
};

/** Bilangan bulat 0..100 dari isian teks; kosong = null; tidak valid = undefined. */
export function parseCount(raw: string): number | null | undefined {
  const s = raw.trim();
  if (s === '') return null;
  if (!/^\d{1,3}$/.test(s)) return undefined;
  const n = Number(s);
  return n >= 0 && n <= 100 ? n : undefined;
}

export type RuleField = 'level' | 'label' | 'minOffered' | 'minChoices' | 'maxChoices';
export type RuleIssue = 'required' | 'invalidNumber' | 'rangeOrder';

/** Galat isian aturan; kosong bila valid. */
export function validateRule(d: RuleDraft): Partial<Record<RuleField, RuleIssue>> {
  const errors: Partial<Record<RuleField, RuleIssue>> = {};
  if (!d.levelCode.trim()) errors.level = 'required';
  if (!d.label.trim()) errors.label = 'required';
  const min = parseCount(d.minChoices);
  const max = parseCount(d.maxChoices);
  if (parseCount(d.minOffered) === undefined) errors.minOffered = 'invalidNumber';
  if (min === undefined) errors.minChoices = 'invalidNumber';
  if (max === undefined) errors.maxChoices = 'invalidNumber';
  if (typeof min === 'number' && typeof max === 'number' && min > max) errors.maxChoices = 'rangeOrder';
  return errors;
}

export interface RuleBody {
  academicYearId: string;
  levelCode: string;
  programId: string | null;
  groupKey: string;
  label: string;
  minChoices: number | null;
  maxChoices: number | null;
  minOffered: number | null;
  enforce: boolean;
  lockedFromSemesterId: string | null;
  subjectIds: string[];
}

/** Isi POST/PUT aturan dari isian; panggil setelah `validateRule` kosong. */
export function buildRuleBody(yearId: string, d: RuleDraft): RuleBody {
  const label = d.label.trim();
  return {
    academicYearId: yearId,
    levelCode: d.levelCode.trim(),
    programId: d.programId || null,
    groupKey: groupKeyFor(d.kind, label, d.existingKey),
    label,
    minChoices: parseCount(d.minChoices) ?? null,
    maxChoices: parseCount(d.maxChoices) ?? null,
    minOffered: parseCount(d.minOffered) ?? null,
    enforce: d.enforce,
    lockedFromSemesterId: d.lockedFromSemesterId || null,
    subjectIds: [...new Set(d.subjectIds)],
  };
}

/** Isian bawaan menurut jenis: seni dan agama = tepat satu; mapel pilihan umum = kosong. */
export function presetFor(kind: RuleKind): Pick<RuleDraft, 'minChoices' | 'maxChoices'> {
  return kind === 'arts' || kind === 'religion'
    ? { minChoices: '1', maxChoices: '1' }
    : { minChoices: '', maxChoices: '' };
}

export interface RuleLike {
  groupKey: string;
  label: string;
  levelCode: string;
  programId: string | null;
  minChoices: number | null;
  maxChoices: number | null;
  minOffered: number | null;
  enforce: boolean;
  lockedFromSemesterId: string | null;
  subjectIds: readonly string[];
}

export function ruleToDraft(r: RuleLike): RuleDraft {
  return {
    kind: kindOfKey(r.groupKey),
    existingKey: r.groupKey,
    levelCode: r.levelCode,
    programId: r.programId ?? '',
    label: r.label,
    minOffered: r.minOffered === null ? '' : String(r.minOffered),
    minChoices: r.minChoices === null ? '' : String(r.minChoices),
    maxChoices: r.maxChoices === null ? '' : String(r.maxChoices),
    enforce: r.enforce,
    lockedFromSemesterId: r.lockedFromSemesterId ?? '',
    subjectIds: [...r.subjectIds],
  };
}
