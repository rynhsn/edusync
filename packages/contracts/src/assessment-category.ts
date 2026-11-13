import { COMPONENT_CATEGORIES, type ComponentCategory, FROZEN_COMPONENT_DEFAULTS } from './grading-config';

/**
 * Kategori asesmen (rancangan: docs/rancangan-fase-3-asesmen-rapor.md, bagian 3.1). Murni, tanpa database.
 *
 * - Kategori (`formative` | `summative`) melekat pada KOMPONEN nilai, bukan pada penilaian (keputusan K1). Penilaian mewarisinya.
 * - Komponen formatif tidak pernah masuk nilai akhir (`includeInFinal` terkunci false) dan bobotnya diabaikan (disimpan 0).
 * - Penilaian membawa tanda, bukan jenis: `purpose` (asesmen awal/diagnostik), `summativeScope`, `technique`.
 * - Nilai bawaan (sumatif, ikut nilai akhir, tanpa tanda) = perilaku sebelum fase 3.
 */

/** Tujuan penilaian. Hanya `initial` (asesmen awal/diagnostik); `null` = penilaian biasa. Berlaku hanya pada komponen formatif. */
export const ASSESSMENT_PURPOSES = ['initial'] as const;
export type AssessmentPurpose = (typeof ASSESSMENT_PURPOSES)[number];

/** Lingkup sumatif. `null` = tidak ditandai. Berlaku hanya pada komponen sumatif. */
export const SUMMATIVE_SCOPES = ['material', 'end_of_semester'] as const;
export type SummativeScope = (typeof SUMMATIVE_SCOPES)[number];

/** Teknik asesmen. Disimpan sebagai teks tanpa CHECK di DB (daftar acuan bisa berubah); divalidasi di API dengan daftar ini. */
export const ASSESSMENT_TECHNIQUES = [
  'test',
  'observation',
  'performance',
  'practice',
  'product',
  'project',
  'portfolio',
  'assignment',
  'other',
] as const;
export type AssessmentTechnique = (typeof ASSESSMENT_TECHNIQUES)[number];

/** Bawaan teknik untuk penilaian yang dibuat dari ujian CBT (hanya saat penilaian pertama kali dibuat). */
export const EXAM_DEFAULT_TECHNIQUE: AssessmentTechnique = 'test';

export const isComponentCategory = (v: unknown): v is ComponentCategory =>
  (COMPONENT_CATEGORIES as readonly unknown[]).includes(v);

/** Kode galat 400 untuk validasi kategori dan tanda. */
export const CATEGORY_ERROR_CODES = [
  'invalid_component_category',
  'initial_requires_formative',
  'scope_requires_summative',
] as const;
export type CategoryErrorCode = (typeof CATEGORY_ERROR_CODES)[number];

export interface CategoryError {
  code: CategoryErrorCode;
  message: string;
}

/** Komponen dihitung ke nilai akhir bila sumatif DAN `includeInFinal`. Kunci yang hilang = bawaan (sumatif, ikut). */
export function componentCounts(c: {
  category?: string | undefined;
  includeInFinal?: boolean | undefined;
}): boolean {
  return (
    (c.category ?? FROZEN_COMPONENT_DEFAULTS.category) === 'summative' &&
    (c.includeInFinal ?? FROZEN_COMPONENT_DEFAULTS.includeInFinal) === true
  );
}

/** Jumlah bobot komponen yang dihitung saja (dasar pemeriksaan `weights_sum_invalid` mode persentase). */
export function countedWeightSum(
  components: readonly {
    weight: number;
    category?: string | undefined;
    includeInFinal?: boolean | undefined;
  }[],
): number {
  return components.filter(componentCounts).reduce((n, c) => n + c.weight, 0);
}

export interface ComponentCategoryInput {
  category?: ComponentCategory | undefined;
  includeInFinal?: boolean | undefined;
  weight?: number | undefined;
}

export interface NormalizedComponent {
  category: ComponentCategory;
  includeInFinal: boolean;
  weight: number;
}

/**
 * Tetapkan kategori, `includeInFinal`, dan bobot sebuah komponen dari masukan API. `current` = nilai komponen yang sedang diubah
 * (kunci yang dihilangkan dipertahankan); tanpa `current` bawaannya sumatif dan ikut nilai akhir.
 *
 * - Formatif: `includeInFinal` dipaksa false dan bobot disimpan 0 (bobot yang dikirim diabaikan).
 * - Sumatif yang ikut nilai akhir: bobot wajib bilangan bulat 1..100 (galat `invalid_component_category` bila hilang atau di luar rentang).
 * - Sumatif yang dikeluarkan dari nilai akhir: bobot 0..100 (bawaan: bobot saat ini atau 0).
 */
export function normalizeComponentInput(
  input: ComponentCategoryInput,
  current?: { category: ComponentCategory; includeInFinal: boolean; weight: number },
): { ok: true; value: NormalizedComponent } | { ok: false; error: CategoryError } {
  const category = input.category ?? current?.category ?? FROZEN_COMPONENT_DEFAULTS.category;
  if (!isComponentCategory(category)) {
    return fail('invalid_component_category', 'Kategori komponen harus formative atau summative.');
  }
  if (category === 'formative') {
    return { ok: true, value: { category, includeInFinal: false, weight: 0 } };
  }
  // Dari formatif ke sumatif, `includeInFinal` kembali ke bawaan (true) karena false pada formatif adalah paksaan.
  const inherited =
    current && current.category === 'summative'
      ? current.includeInFinal
      : FROZEN_COMPONENT_DEFAULTS.includeInFinal;
  const includeInFinal = input.includeInFinal ?? inherited;
  const weight = input.weight ?? (current && current.category === 'summative' ? current.weight : undefined);
  if (includeInFinal) {
    if (weight === undefined || !Number.isInteger(weight) || weight < 1 || weight > 100) {
      return fail(
        'invalid_component_category',
        'Bobot komponen sumatif yang ikut nilai akhir harus bilangan bulat 1..100.',
      );
    }
    return { ok: true, value: { category, includeInFinal, weight } };
  }
  const w = weight ?? 0;
  if (!Number.isInteger(w) || w < 0 || w > 100) {
    return fail('invalid_component_category', 'Bobot komponen harus bilangan bulat 0..100.');
  }
  return { ok: true, value: { category, includeInFinal, weight: w } };
}

/**
 * Periksa tanda penilaian terhadap kategori komponennya. `initial` hanya pada komponen formatif; `summativeScope` hanya pada
 * komponen sumatif. Mengembalikan null bila sah.
 */
export function validateAssessmentTags(
  tags: { purpose?: string | null | undefined; summativeScope?: string | null | undefined },
  componentCategory: ComponentCategory,
): CategoryError | null {
  if (tags.purpose && componentCategory !== 'formative') {
    return {
      code: 'initial_requires_formative',
      message: 'Asesmen awal (diagnostik) hanya boleh pada komponen formatif.',
    };
  }
  if (tags.summativeScope && componentCategory !== 'summative') {
    return {
      code: 'scope_requires_summative',
      message: 'Lingkup sumatif hanya boleh pada komponen sumatif.',
    };
  }
  return null;
}

/** Sebuah penilaian ikut nilai akhir bila komponennya dihitung dan tujuannya bukan asesmen awal (sabuk pengaman). */
export function assessmentCounts(
  a: { purpose?: string | null | undefined },
  component: { category?: string | undefined; includeInFinal?: boolean | undefined },
): boolean {
  return componentCounts(component) && a.purpose !== 'initial';
}

function fail(code: CategoryErrorCode, message: string): { ok: false; error: CategoryError } {
  return { ok: false, error: { code, message } };
}
