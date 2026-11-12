import {
  type CriteriaMode,
  checkCriteria,
  effectiveThreshold,
  findOverlap,
  type KkmScope,
  MAX_RUBRIC_LEVELS,
  type RubricLevelInput,
} from '@edusync/contracts';

/**
 * Logika murni KKTP di klien: isian dialog menjadi isi permintaan, validasi yang sama dengan server
 * (`checkCriteria` dan `findOverlap` dari kontrak), format nilai KKM desimal, dan pemilihan KKM mapel terhadap KKM
 * sekolah. Tanpa React dan tanpa jaringan supaya mudah diuji.
 */

export type { CriteriaMode, KkmScope };
export { MAX_RUBRIC_LEVELS };

export const MODES: readonly CriteriaMode[] = ['numeric', 'interval', 'descriptor', 'rubric'];

/** Satu level di editor: angka disimpan sebagai teks apa adanya dari kolom isian ('' = kosong). */
export interface LevelDraft {
  /** Kunci React yang stabil selama penyuntingan; bukan id server. */
  key: string;
  label: string;
  descriptor: string;
  min: string;
  max: string;
  isAchieved: boolean;
}

export interface CriteriaDraft {
  mode: CriteriaMode;
  threshold: string;
  note: string;
  active: boolean;
  levels: LevelDraft[];
}

export interface CriteriaScope {
  subjectId: string;
  levelCode: string | null;
  programId: string | null;
  objectiveId: string | null;
}

export interface CriteriaRowLike {
  mode: CriteriaMode;
  threshold: number | null;
  note: string | null;
  active: boolean;
  levels?: {
    label: string;
    descriptor: string | null;
    minScore: number | null;
    maxScore: number | null;
    isAchieved: boolean;
  }[];
}

export interface CriteriaBody {
  subjectId: string;
  levelCode: string | null;
  programId: string | null;
  objectiveId: string | null;
  mode: CriteriaMode;
  threshold: number | null;
  note: string | null;
  active: boolean;
  levels: {
    label: string;
    descriptor: string | null;
    minScore: number | null;
    maxScore: number | null;
    isAchieved: boolean;
  }[];
}

let seq = 0;
const nextKey = () => `lv-${++seq}`;

export function emptyLevel(): LevelDraft {
  return { key: nextKey(), label: '', descriptor: '', min: '', max: '', isAchieved: false };
}

export function emptyDraft(mode: CriteriaMode = 'numeric'): CriteriaDraft {
  return {
    mode,
    threshold: '',
    note: '',
    active: true,
    levels: mode === 'numeric' ? [] : [emptyLevel()],
  };
}

/** Teks angka menjadi nilai: '' = null; koma atau titik desimal; 0..100 dengan paling banyak dua desimal. */
export function parseScore(text: string): number | null | 'invalid' {
  const s = text.trim().replace(',', '.');
  if (s === '') return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return 'invalid';
  const n = Number(s);
  return n >= 0 && n <= 100 ? n : 'invalid';
}

/** Angka menjadi teks isian (koma desimal gaya Indonesia tidak dipakai di isian agar aman dikirim ulang). */
export const scoreToText = (n: number | null | undefined): string =>
  n === null || n === undefined ? '' : String(n);

/**
 * Nilai/KKM untuk tampilan: koma desimal, 0 sampai 2 desimal ("75", "72,5", "72,25"), tanpa membulatkan ke bilangan
 * bulat; '-' bila kosong. Server menyimpan paling banyak dua desimal, jadi tidak ada yang terpotong.
 */
export function formatKkm(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return String(Math.round(value * 100) / 100).replace('.', ',');
}

/** KKM yang dipakai satu mapel: KKM mapel (KKTP) bila ada, kalau tidak KKM sekolah. */
export function pickKkm(subjectKkm: number | null | undefined, schoolKkm: number): number {
  return typeof subjectKkm === 'number' && Number.isFinite(subjectKkm) ? subjectKkm : schoolKkm;
}

/** Nilai di bawah KKM (batas inklusif: nilai sama dengan KKM tuntas). */
export const isBelowKkm = (score: number | null | undefined, kkm: number): boolean =>
  typeof score === 'number' && score < kkm;

/** Kriteria dari server menjadi isian editor. */
export function toDraft(row: CriteriaRowLike): CriteriaDraft {
  return {
    mode: row.mode,
    threshold: scoreToText(row.threshold),
    note: row.note ?? '',
    active: row.active,
    levels: (row.levels ?? []).map((l) => ({
      key: nextKey(),
      label: l.label,
      descriptor: l.descriptor ?? '',
      min: scoreToText(l.minScore),
      max: scoreToText(l.maxScore),
      isAchieved: l.isAchieved,
    })),
  };
}

/** Pindah mode: numerik tidak memakai level, mode lain minimal satu level. Isian yang relevan dipertahankan. */
export function switchMode(draft: CriteriaDraft, mode: CriteriaMode): CriteriaDraft {
  if (mode === draft.mode) return draft;
  if (mode === 'numeric') return { ...draft, mode, levels: [] };
  return { ...draft, mode, threshold: '', levels: draft.levels.length > 0 ? draft.levels : [emptyLevel()] };
}

/** Geser level satu posisi (delta -1 naik, +1 turun). Di luar batas, daftar dikembalikan apa adanya. */
export function moveLevel<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(to, 0, moved as T);
  return next;
}

export type IssueCode =
  | 'threshold_required'
  | 'threshold_invalid'
  | 'levels_required'
  | 'too_many_levels'
  | 'label_required'
  | 'range_required'
  | 'number_invalid'
  | 'range_order'
  | 'overlap';

export interface Issue {
  code: IssueCode;
  /** Indeks level yang bermasalah (untuk menyorot baris). */
  index?: number;
  /** Indeks level lain pada tumpang tindih. */
  other?: number;
}

/**
 * Pemeriksaan isian: daftar masalah per isian (kosong bila sah). Aturannya sama dengan `checkCriteria` di server;
 * hasilnya dipisah per level agar baris bermasalah dapat disorot.
 */
export function validateDraft(draft: CriteriaDraft): Issue[] {
  const issues: Issue[] = [];
  if (draft.mode === 'numeric') {
    const t = parseScore(draft.threshold);
    if (t === null) issues.push({ code: 'threshold_required' });
    else if (t === 'invalid') issues.push({ code: 'threshold_invalid' });
    return issues;
  }
  const ranged = draft.mode === 'interval' || draft.mode === 'rubric';
  if (ranged && draft.levels.length === 0) issues.push({ code: 'levels_required' });
  if (draft.levels.length > MAX_RUBRIC_LEVELS) issues.push({ code: 'too_many_levels' });
  const parsed: { label: string; min: number | null; max: number | null; ok: boolean }[] = [];
  draft.levels.forEach((l, index) => {
    let ok = true;
    if (l.label.trim() === '') {
      issues.push({ code: 'label_required', index });
      ok = false;
    }
    const min = parseScore(l.min);
    const max = parseScore(l.max);
    if (min === 'invalid' || max === 'invalid') {
      issues.push({ code: 'number_invalid', index });
      ok = false;
    }
    const minN = min === 'invalid' ? null : min;
    const maxN = max === 'invalid' ? null : max;
    if (ranged && (minN === null || maxN === null) && min !== 'invalid' && max !== 'invalid') {
      issues.push({ code: 'range_required', index });
      ok = false;
    }
    if (minN !== null && maxN !== null && minN > maxN) {
      issues.push({ code: 'range_order', index });
      ok = false;
    }
    parsed.push({ label: l.label, min: minN, max: maxN, ok });
  });
  // Tumpang tindih hanya dinilai pada level yang rentangnya sendiri sudah sah.
  const overlap = overlapIndexes(parsed.map((p) => (p.ok ? p : { ...p, min: null, max: null })));
  if (overlap) issues.push({ code: 'overlap', index: overlap[0], other: overlap[1] });
  return issues;
}

/** Indeks pasangan level yang rentangnya bertumpuk (batas inklusif), logika sama dengan `findOverlap` server. */
function overlapIndexes(
  levels: { label: string; min: number | null; max: number | null }[],
): [number, number] | null {
  const asInput: RubricLevelInput[] = levels.map((l, i) => ({
    // Label dibuat unik per indeks supaya pasangan dapat dipetakan kembali ke posisinya.
    label: String(i),
    minScore: l.min,
    maxScore: l.max,
    isAchieved: false,
  }));
  const pair = findOverlap(asInput);
  return pair ? [Number(pair[0]), Number(pair[1])] : null;
}

export type BuildResult = { ok: true; body: CriteriaBody } | { ok: false; issues: Issue[] };

/** Isian menjadi isi permintaan POST/PUT; gagal dengan daftar masalah bila belum sah. */
export function buildBody(scope: CriteriaScope, draft: CriteriaDraft): BuildResult {
  const issues = validateDraft(draft);
  if (issues.length > 0) return { ok: false, issues };
  const levels =
    draft.mode === 'numeric'
      ? []
      : draft.levels.map((l) => ({
          label: l.label.trim(),
          descriptor: l.descriptor.trim() === '' ? null : l.descriptor.trim(),
          minScore: parseScore(l.min) as number | null,
          maxScore: parseScore(l.max) as number | null,
          isAchieved: l.isAchieved,
        }));
  const threshold = draft.mode === 'numeric' ? (parseScore(draft.threshold) as number) : null;
  // Pagar terakhir: aturan server yang sama (kontrak). Seharusnya tak pernah gagal bila validateDraft lolos.
  const problem = checkCriteria({ mode: draft.mode, threshold, levels });
  if (problem)
    return {
      ok: false,
      issues: [{ code: problem.code === 'overlapping_levels' ? 'overlap' : 'range_required' }],
    };
  return {
    ok: true,
    body: {
      subjectId: scope.subjectId,
      levelCode: scope.levelCode,
      programId: scope.programId,
      objectiveId: scope.objectiveId,
      mode: draft.mode,
      threshold,
      note: draft.note.trim() === '' ? null : draft.note.trim(),
      active: draft.active,
      levels,
    },
  };
}

/** Apakah dua isian setara (untuk mendeteksi perubahan). */
export function draftsEqual(a: CriteriaDraft, b: CriteriaDraft): boolean {
  const strip = (d: CriteriaDraft) => ({ ...d, levels: d.levels.map(({ key: _key, ...rest }) => rest) });
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

/** Rentang level untuk tampilan ringkas: "60 – 74,5", "≥ 60", atau '' bila tanpa angka. */
export function formatRange(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${formatKkm(min)} – ${formatKkm(max)}`;
  if (min !== null) return `≥ ${formatKkm(min)}`;
  if (max !== null) return `≤ ${formatKkm(max)}`;
  return '';
}

/** Apakah kriteria berlaku untuk tingkat/jurusan yang dipilih (kosong pada kriteria berarti berlaku semua). */
export function appliesTo(
  row: { levelCode: string | null; programId: string | null },
  filter: { levelCode: string; programId: string },
): boolean {
  if (filter.levelCode !== '' && row.levelCode !== null && row.levelCode !== filter.levelCode) return false;
  if (filter.programId !== '' && row.programId !== null && row.programId !== filter.programId) return false;
  return true;
}

/** KKM resultan dari level yang sudah diisi editor (nilai terkecil level tuntas); null bila belum dapat dihitung. */
export function draftKkm(draft: CriteriaDraft): number | null {
  if (draft.mode === 'numeric') {
    const t = parseScore(draft.threshold);
    return typeof t === 'number' ? t : null;
  }
  return effectiveThreshold({
    mode: draft.mode,
    levels: draft.levels.map((l) => {
      const min = parseScore(l.min);
      return { label: l.label, minScore: typeof min === 'number' ? min : null, isAchieved: l.isAchieved };
    }),
  });
}
