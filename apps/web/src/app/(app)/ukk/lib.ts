import { type UkkBand, type UkkWeights, ukkBandOf, ukkFinalScore } from '@edusync/contracts';
import type { paths } from '../../../lib/api-types';
import { parseNumber } from '../../../lib/graduation';

/**
 * Logika murni UKK (tahap 5.5, tanpa React): bentuk data, isian nilai per murid, kategori dan nilai akhir yang dihitung langsung
 * dari skala dan bobot yang dikirim server, dan butir permintaan simpan. Aturan yang sama dihitung ulang oleh server saat simpan.
 */

export type UkkEventRow =
  paths['/v1/ukk/events']['get']['responses'][200]['content']['application/json'][number];
export type UkkEvent = paths['/v1/ukk/events/{id}']['get']['responses'][200]['content']['application/json'];
export type UkkResults =
  paths['/v1/ukk/events/{id}/results']['get']['responses'][200]['content']['application/json'];
export type UkkStudent = UkkResults['students'][number];
export type UkkAttempt = UkkStudent['attempts'][number];
export type UkkSetting =
  paths['/v1/vocational/settings/ukk']['get']['responses'][200]['content']['application/json'];
export type UkkResultItem = NonNullable<
  paths['/v1/ukk/events/{id}/results']['put']['requestBody']
>['content']['application/json']['items'][number];

export const UKK_PATTERN_LIST = ['lsp', 'industry', 'independent'] as const;
export const UKK_STATUS_LIST = ['draft', 'active', 'closed'] as const;

/** Kunci query UKK satu sekolah; `invalidateQueries({ queryKey: ukkKey(id) })` menyegarkan semuanya. */
export const ukkKey = (schoolId: string, ...rest: unknown[]) => ['ukk', schoolId, ...rest];

/* ---------- Isian nilai ---------- */

export type ScoreField = 'practice' | 'theory' | 'final';
const FIELDS: readonly ScoreField[] = ['practice', 'theory', 'final'];
/** Isian yang diubah pengguna (teks); kunci yang tidak ada = tidak diubah. */
export type RowDraft = Partial<Record<ScoreField, string>>;
export type Edits = Record<string, RowDraft>;

const text = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

/** Percobaan yang diisi di baris murid: yang terbesar nomornya, atau percobaan 1 bila belum ada. */
export const lastAttempt = (s: UkkStudent): UkkAttempt | null =>
  s.attempts.reduce<UkkAttempt | null>(
    (best, a) => (best === null || a.attemptNo > best.attemptNo ? a : best),
    null,
  );
export const editingAttemptNo = (s: UkkStudent): number => lastAttempt(s)?.attemptNo ?? 1;

const saved = (s: UkkStudent, field: ScoreField): string => {
  const a = lastAttempt(s);
  return text(field === 'practice' ? a?.practiceScore : field === 'theory' ? a?.theoryScore : a?.finalScore);
};

/** Teks isian yang tampil: perubahan pengguna, selain itu nilai tersimpan. */
export const fieldText = (s: UkkStudent, d: RowDraft | undefined, field: ScoreField): string =>
  d?.[field] ?? saved(s, field);

/** Isian tak sah: bukan angka atau di luar 0-100 (koma desimal diterima). Kosong sah. */
export function scoreInvalid(v: string): boolean {
  const n = parseNumber(v);
  return n !== null && (Number.isNaN(n) || n > 100);
}

const numberOf = (v: string): number | null => {
  const n = parseNumber(v);
  return n === null || Number.isNaN(n) ? null : n;
};

/** Apakah baris ini punya perubahan yang belum disimpan. */
export function isDirty(s: UkkStudent, d: RowDraft | undefined): boolean {
  if (!d) return false;
  return FIELDS.some((f) => d[f] !== undefined && (d[f] as string).trim() !== saved(s, f));
}

export interface LiveResult {
  final: number | null;
  band: UkkBand | null;
  invalid: boolean;
}

/** Nilai akhir dan kategori dari isian saat ini: dengan bobot dihitung dari praktik dan teori, tanpa bobot dari isian nilai akhir. */
export function liveResult(
  s: UkkStudent,
  d: RowDraft | undefined,
  weights: UkkWeights | null,
  bands: readonly UkkBand[],
): LiveResult {
  const p = fieldText(s, d, 'practice');
  const t = fieldText(s, d, 'theory');
  const f = fieldText(s, d, 'final');
  const invalid = scoreInvalid(p) || scoreInvalid(t) || (!weights && scoreInvalid(f));
  if (invalid) return { final: null, band: null, invalid };
  const final = weights ? ukkFinalScore(numberOf(p), numberOf(t), weights) : numberOf(f);
  return { final, band: final === null ? null : ukkBandOf(bands, final), invalid };
}

export interface SaveBuild {
  items: UkkResultItem[];
  invalid: boolean;
}

/** Butir simpan untuk baris yang berubah; hanya kolom yang diubah dikirim (kosong = hapus nilai). `invalid` bila ada isian tak sah. */
export function buildItems(
  students: readonly UkkStudent[],
  edits: Edits,
  weights: UkkWeights | null,
): SaveBuild {
  const items: UkkResultItem[] = [];
  let invalid = false;
  for (const s of students) {
    const d = edits[s.studentId];
    if (!d || !isDirty(s, d)) continue;
    const item: UkkResultItem = { studentId: s.studentId, attemptNo: editingAttemptNo(s) };
    for (const f of FIELDS) {
      const v = d[f];
      if (v === undefined || v.trim() === saved(s, f)) continue;
      if (f === 'final' && weights) continue;
      if (scoreInvalid(v)) {
        invalid = true;
        continue;
      }
      const n = numberOf(v);
      if (f === 'practice') item.practiceScore = n;
      else if (f === 'theory') item.theoryScore = n;
      else item.finalScore = n;
    }
    // Nilai akhir yang diketik saat bobot aktif diabaikan server: butir kosong tidak dikirim.
    if (Object.keys(item).length > 2) items.push(item);
  }
  return { items, invalid };
}

/** Uji ulang boleh dibuat bila percobaan terakhir sudah tersimpan bernilai dan belum mencapai batas. */
export function canRetake(s: UkkStudent, d: RowDraft | undefined, max: number): boolean {
  const a = lastAttempt(s);
  return a !== null && a.finalScore !== null && a.attemptNo < max && !isDirty(s, d);
}

/** Nomor dokumen murid dari percobaan terakhir bernilai: sertifikat (kompeten) atau surat keterangan. */
export function documentOf(s: UkkStudent): { kind: 'certificate' | 'statement'; number: string } | null {
  const a = s.attempts.find((x) => x.attemptNo === s.latestAttemptNo);
  if (!a) return null;
  if (a.certificateNo) return { kind: 'certificate', number: a.certificateNo };
  if (a.statementNo) return { kind: 'statement', number: a.statementNo };
  return null;
}

/* ---------- Pengaturan: skala ---------- */

export interface BandDraft {
  /** Kunci tampilan baris (isian bebas, tidak dikirim ke server). */
  uid: string;
  code: string;
  label: string;
  min: string;
  competent: boolean;
}

let draftSeq = 0;
export const newBandDraft = (over: Partial<BandDraft> = {}): BandDraft => ({
  uid: `band-${++draftSeq}`,
  code: '',
  label: '',
  min: '',
  competent: false,
  ...over,
});

export const bandsToDraft = (bands: readonly UkkBand[]): BandDraft[] =>
  bands.map((b) =>
    newBandDraft({ code: b.code, label: b.label, min: String(b.min), competent: b.competent }),
  );

/** Skala dari isian; null bila ada isian kosong atau bukan angka (aturan skala tetap diperiksa `validUkkBands`). */
export function draftToBands(draft: readonly BandDraft[]): UkkBand[] | null {
  const out: UkkBand[] = [];
  for (const d of draft) {
    const min = parseNumber(d.min);
    const code = d.code.trim();
    const label = d.label.trim();
    if (min === null || Number.isNaN(min) || min > 100 || !code || !label) return null;
    out.push({ code, label, min, competent: d.competent });
  }
  return out;
}
