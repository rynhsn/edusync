import {
  ASSESSMENT_TECHNIQUES,
  type AssessmentTechnique,
  componentCounts,
  countedWeightSum,
  SUMMATIVE_SCOPES,
  type SummativeScope,
} from '@edusync/contracts';

/**
 * Logika murni kategori asesmen (tahap 3.1). Tanpa React dan tanpa jaringan supaya mudah diuji.
 *
 * Istilah untuk pengguna: "Formatif" = umpan balik belajar, TIDAK masuk nilai rapor, kenaikan, atau kelulusan;
 * "Sumatif" = penilaian yang masuk nilai akhir. "Asesmen awal (diagnostik)" adalah TUJUAN sebuah penilaian formatif,
 * bukan jenis ketiga.
 */

export type Category = 'formative' | 'summative';

/** Bentuk komponen dari API; kunci yang hilang = bawaan (sumatif, ikut nilai akhir). */
export interface CategorizedComponent {
  category?: string | undefined;
  includeInFinal?: boolean | undefined;
}

export const categoryOf = (c: CategorizedComponent): Category =>
  c.category === 'formative' ? 'formative' : 'summative';

/** Komponen dihitung ke nilai akhir bila sumatif dan ikut nilai akhir (aturan sama dengan server). */
export const countsTowardFinal = (c: CategorizedComponent): boolean => componentCounts(c);

/**
 * Jenis lencana komponen: `formative` (umpan balik), `excluded` (sumatif yang dikeluarkan dari nilai akhir lewat API),
 * atau `summative` (biasa).
 */
export function componentBadgeKind(c: CategorizedComponent): 'formative' | 'excluded' | 'summative' {
  if (categoryOf(c) === 'formative') return 'formative';
  return countsTowardFinal(c) ? 'summative' : 'excluded';
}

/** Jumlah bobot hanya atas komponen yang dihitung (sumatif dan ikut nilai akhir); formatif tidak ikut. */
export function countedWeightTotal(items: readonly ({ weight: number } & CategorizedComponent)[]): number {
  return countedWeightSum(items);
}

/** Pisahkan komponen rekap menjadi yang dihitung ke nilai akhir dan yang hanya berupa umpan balik. */
export function splitComponents<T extends CategorizedComponent>(
  items: readonly T[],
): { counted: T[]; feedback: T[] } {
  const counted: T[] = [];
  const feedback: T[] = [];
  for (const c of items) (countsTowardFinal(c) ? counted : feedback).push(c);
  return { counted, feedback };
}

/** Rata-rata (dibulatkan 1 desimal) dari angka yang ada; null bila tidak ada satu pun. Dipakai ringkasan umpan balik. */
export function averageOf(values: readonly (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  if (v.length === 0) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
}

/** Nilai komponen yang boleh diwarnai merah (di bawah KKM): hanya yang dihitung ke nilai akhir. */
export function belowKkmApplies(
  c: CategorizedComponent,
  value: number | null | undefined,
  kkm: number,
): boolean {
  return countsTowardFinal(c) && typeof value === 'number' && value < kkm;
}

// ---------------------------------------------------------------------------------------------------------------
// Formulir komponen

export interface ComponentFormState {
  category: Category;
  weight: string;
}

/** Bobot tidak diisi untuk formatif (server memaksa 0). */
export const weightInputDisabled = (category: Category): boolean => category === 'formative';

/**
 * Badan permintaan komponen. Formatif: bobot tidak dikirim (server menyimpannya 0). Sumatif: bobot dikirim; `includeInFinal`
 * tidak dikirim, jadi komponen yang sudah ada mempertahankannya dan formatif yang diubah menjadi sumatif kembali ikut nilai akhir.
 */
export function componentBody(form: { name: string; category: Category; weight: number; sort: number }): {
  name: string;
  sort: number;
  category: Category;
  weight?: number;
} {
  const base = { name: form.name.trim(), sort: form.sort, category: form.category };
  return form.category === 'formative' ? base : { ...base, weight: form.weight };
}

/** Isian awal formulir komponen dari komponen yang sudah ada (bobot formatif ditampilkan kosong). */
export function componentFormFrom(c: { weight: number } & CategorizedComponent): ComponentFormState {
  const category = categoryOf(c);
  return { category, weight: category === 'formative' ? '' : String(c.weight) };
}

// ---------------------------------------------------------------------------------------------------------------
// Penilaian

export type ScopeValue = SummativeScope | '';
export type TechniqueValue = AssessmentTechnique | '';

export const SCOPE_OPTIONS: readonly SummativeScope[] = SUMMATIVE_SCOPES;
export const TECHNIQUE_OPTIONS: readonly AssessmentTechnique[] = ASSESSMENT_TECHNIQUES;

const isScope = (v: unknown): v is SummativeScope => (SUMMATIVE_SCOPES as readonly unknown[]).includes(v);
const isTechnique = (v: unknown): v is AssessmentTechnique =>
  (ASSESSMENT_TECHNIQUES as readonly unknown[]).includes(v);

/** Nilai teknik dari server dibersihkan: nilai asing (daftar acuan bisa bertambah) dianggap tidak dicatat di formulir. */
export const techniqueValue = (v: string | null | undefined): TechniqueValue => (isTechnique(v) ? v : '');
export const scopeValue = (v: string | null | undefined): ScopeValue => (isScope(v) ? v : '');

export interface AssessmentTagsInput {
  category: Category;
  initial: boolean;
  scope: ScopeValue;
  technique: TechniqueValue;
}

/**
 * Tanda penilaian untuk badan permintaan. Selalu mengirim ketiganya (null = kosongkan) supaya pergantian komponen antar kategori
 * membersihkan tanda yang tidak lagi sah (asesmen awal hanya formatif, lingkup hanya sumatif).
 */
export function assessmentTags(v: AssessmentTagsInput): {
  purpose: 'initial' | null;
  summativeScope: SummativeScope | null;
  technique: AssessmentTechnique | null;
} {
  return {
    purpose: v.category === 'formative' && v.initial ? 'initial' : null,
    summativeScope: v.category === 'summative' && v.scope !== '' ? v.scope : null,
    technique: v.technique !== '' ? v.technique : null,
  };
}

/** Kunci terjemahan (namespace `grades`) untuk teknik asesmen. Nilai asing jatuh ke `other`. */
export const techniqueKey = (v: string | null | undefined): `technique_${AssessmentTechnique}` =>
  `technique_${isTechnique(v) ? v : 'other'}`;

/** Kunci terjemahan (namespace `grades`) untuk lingkup sumatif. */
export const scopeKey = (v: SummativeScope): `scope_${SummativeScope}` => `scope_${v}`;
