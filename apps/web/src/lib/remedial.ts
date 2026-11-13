import {
  DEFAULT_REMEDIAL_POLICY,
  effectiveScore,
  LEARNING_SUPPORT_KINDS,
  type LearningSupportKind,
  MAX_REMEDIAL_ATTEMPTS,
  REMEDIAL_POLICIES,
  type RemedialPolicy,
  SUPPORT_PARTICIPANT_STATUSES,
  type SupportParticipantStatus,
} from '@edusync/contracts';

/**
 * Logika murni layar "Remedial dan pengayaan" (tahap 3.5): kebijakan nilai remedial beserta contohnya, batas nilai, penyaringan
 * murid yang perlu remedial, usulan peserta, dan susunan isi permintaan. Tanpa React dan tanpa jaringan, supaya mudah diuji.
 * Skor asli tidak pernah diubah oleh remedial; hanya nilai efektif yang bergantung pada kebijakan.
 */

export type { LearningSupportKind, RemedialPolicy, SupportParticipantStatus };
export { LEARNING_SUPPORT_KINDS, MAX_REMEDIAL_ATTEMPTS, SUPPORT_PARTICIPANT_STATUSES };

/* ---------- Kebijakan nilai remedial ---------- */

export const REMEDIAL_POLICY_KEYS: readonly RemedialPolicy[] = REMEDIAL_POLICIES;

/** Kebijakan dari API; tanpa nilai (bawaan sekolah) = hanya dicatat. */
export function policyOrDefault(v: RemedialPolicy | null | undefined): RemedialPolicy {
  return v ?? DEFAULT_REMEDIAL_POLICY;
}

/** Kebijakan dikirim hanya bila berubah, supaya menyimpan KKM saja tidak ikut menyentuhnya. */
export function policyChange(
  saved: RemedialPolicy | null | undefined,
  picked: RemedialPolicy,
): { remedialPolicy?: RemedialPolicy } {
  return picked !== policyOrDefault(saved) ? { remedialPolicy: picked } : {};
}

/** Angka contoh yang dipakai teks penjelasan tiap kebijakan: nilai asli 60, remedial 80, KKM 75, skor maksimum 100. */
export const REMEDIAL_EXAMPLE = { original: 60, attempt: 80, kkm: 75, max: 100 } as const;

/** Nilai efektif contoh di atas untuk satu kebijakan, dari rumus yang sama dengan server. */
export function remedialExampleResult(policy: RemedialPolicy): number {
  const r = effectiveScore(policy, {
    original: REMEDIAL_EXAMPLE.original,
    max: REMEDIAL_EXAMPLE.max,
    attempts: [{ attemptNo: 1, value: REMEDIAL_EXAMPLE.attempt }],
    kkmPercent: REMEDIAL_EXAMPLE.kkm,
  });
  return r.value ?? REMEDIAL_EXAMPLE.original;
}

/** Kebijakan yang menggantikan angka di nilai akhir (selain `record_only`). */
export const policyAffectsGrades = (p: RemedialPolicy): boolean => p !== 'record_only';

/* ---------- Batas dan isian nilai remedial ---------- */

/** Angka dari isian (koma desimal diterima); null bila kosong atau bukan angka. */
export function parseScore(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type ScoreIssue = 'required' | 'invalid' | 'range';

/** Isian nilai remedial: wajib angka antara 0 dan skor maksimum penilaian. */
export function scoreIssue(raw: string, max: number): ScoreIssue | null {
  if (raw.trim() === '') return 'required';
  const n = parseScore(raw);
  if (n === null) return 'invalid';
  return n < 0 || n > max ? 'range' : null;
}

/** Sisa percobaan yang masih boleh dicatat untuk satu murid pada satu penilaian. */
export const attemptsLeft = (used: number): number => Math.max(0, MAX_REMEDIAL_ATTEMPTS - used);

/** Tanggal lokal hari ini (TTTT-BB-HH), tanpa pergeseran zona waktu. */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export interface AttemptForm {
  value: string;
  takenOn: string;
  note: string;
  /** Pendampingan remedial yang ditautkan; '' = tanpa tautan. */
  supportId: string;
}

/** Isi permintaan "Catat percobaan remedial" untuk satu murid (satu catatan). */
export function buildAttemptBody(studentId: string, form: AttemptForm) {
  const value = parseScore(form.value);
  const note = form.note.trim();
  return {
    records: [
      {
        studentId,
        value,
        takenOn: form.takenOn,
        ...(note ? { note } : {}),
        ...(form.supportId ? { supportId: form.supportId } : {}),
      },
    ],
  };
}

/* ---------- Murid yang perlu remedial ---------- */

export interface CandidateItem {
  assessmentId: string;
  title: string;
  stillBelow: boolean;
  attempts: number;
}
export interface CandidateStudent<I extends CandidateItem = CandidateItem> {
  studentId: string;
  name: string;
  nis: string | null;
  items: I[];
}

const norm = (s: string) => s.trim().toLocaleLowerCase();

/**
 * Menyaring murid yang perlu remedial: `onlyStillBelow` menyisakan penilaian yang nilai efektifnya masih di bawah KKM (murid
 * tanpa penilaian tersisa dibuang); `query` mencari nama atau NIS.
 */
export function filterCandidates<S extends CandidateStudent>(
  students: readonly S[],
  opts: { onlyStillBelow?: boolean; query?: string },
): S[] {
  const q = norm(opts.query ?? '');
  const out: S[] = [];
  for (const s of students) {
    if (q !== '' && !norm(s.name).includes(q) && !norm(s.nis ?? '').includes(q)) continue;
    const items = opts.onlyStillBelow ? s.items.filter((i) => i.stillBelow) : s.items;
    if (items.length > 0) out.push({ ...s, items });
  }
  return out;
}

export function candidateStats(students: readonly CandidateStudent[]) {
  const items = students.flatMap((s) => s.items);
  return {
    students: students.length,
    items: items.length,
    stillBelowStudents: students.filter((s) => s.items.some((i) => i.stillBelow)).length,
  };
}

/* ---------- Pendampingan dan peserta ---------- */

export interface RosterEntry {
  studentId: string;
  final: number | null;
  belowKkm: boolean;
}

/**
 * Usulan peserta. Remedial: murid yang punya penilaian di bawah KKM atau nilai akhirnya di bawah KKM. Pengayaan: murid yang
 * sudah punya nilai akhir dan tuntas, dan tidak punya penilaian di bawah KKM. Hanya usulan; guru bebas mengubah pilihan.
 */
export function suggestParticipantIds(
  kind: LearningSupportKind,
  roster: readonly RosterEntry[],
  candidateIds: ReadonlySet<string>,
): string[] {
  if (kind === 'remedial') {
    return roster.filter((r) => candidateIds.has(r.studentId) || r.belowKkm).map((r) => r.studentId);
  }
  return roster
    .filter((r) => r.final !== null && !r.belowKkm && !candidateIds.has(r.studentId))
    .map((r) => r.studentId);
}

export interface ParticipantDraft {
  studentId: string;
  status: SupportParticipantStatus;
  outcomeNote?: string | null | undefined;
}

/** Menambah atau melepas satu murid dari pilihan. */
export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/**
 * Isi permintaan "Ganti peserta": menggantikan seluruh himpunan. Murid yang sudah jadi peserta mempertahankan status dan catatan
 * hasilnya; yang baru berstatus "direncanakan". Urutan mengikuti `order` (daftar kelas).
 */
export function buildParticipants(
  selected: readonly string[],
  existing: readonly ParticipantDraft[],
  order: readonly string[],
  statusOverride: Readonly<Record<string, SupportParticipantStatus>> = {},
) {
  const chosen = new Set(selected);
  const prior = new Map(existing.map((p) => [p.studentId, p]));
  return order
    .filter((id) => chosen.has(id))
    .map((studentId) => {
      const was = prior.get(studentId);
      const note = was?.outcomeNote?.trim();
      return {
        studentId,
        status: statusOverride[studentId] ?? was?.status ?? ('planned' as SupportParticipantStatus),
        ...(note ? { outcomeNote: note } : {}),
      };
    });
}

export interface SupportForm {
  title: string;
  description: string;
  startsOn: string;
  endsOn: string;
}

export type SupportIssue = 'title_required' | 'dates_order';

export function supportIssues(f: SupportForm): SupportIssue[] {
  const out: SupportIssue[] = [];
  if (f.title.trim() === '') out.push('title_required');
  if (f.startsOn !== '' && f.endsOn !== '' && f.startsOn > f.endsOn) out.push('dates_order');
  return out;
}

/** Bagian isi permintaan buat/ubah pendampingan yang sama untuk keduanya; kosong dikirim null supaya terhapus. */
export function buildSupportFields(f: SupportForm, objectiveIds: readonly string[]) {
  return {
    title: f.title.trim(),
    description: f.description.trim() === '' ? null : f.description.trim(),
    startsOn: f.startsOn === '' ? null : f.startsOn,
    endsOn: f.endsOn === '' ? null : f.endsOn,
    objectiveIds: [...objectiveIds],
  };
}

/** Banyaknya peserta menurut status (untuk ringkasan di kartu pendampingan). */
export function countByStatus(
  participants: readonly { status: SupportParticipantStatus }[],
): Record<SupportParticipantStatus, number> {
  const out: Record<SupportParticipantStatus, number> = {
    planned: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const p of participants) out[p.status] += 1;
  return out;
}

/* ---------- Penanda di rekap dan portal ---------- */

export interface RemedialMark {
  attempts: number;
  effectiveSource: 'original' | 'remedial';
}

/** `used` = nilai yang tampil sudah memakai hasil remedial; `recorded` = remedial hanya tercatat, skor asli dipakai. */
export function remedialMarkState(mark: RemedialMark | null | undefined): 'used' | 'recorded' | null {
  if (!mark || mark.attempts <= 0) return null;
  return mark.effectiveSource === 'remedial' ? 'used' : 'recorded';
}
