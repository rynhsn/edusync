/**
 * Logika murni narasi rapor dari tujuan pembelajaran (tahap 3.4, tanpa React): label asal teks, validasi dan contoh
 * templat kalimat, isian pengaturan, dan penyaringan deskripsi suntingan yang mungkin usang.
 */
import {
  DEFAULT_NARRATIVE_HIGH_TEMPLATE,
  DEFAULT_NARRATIVE_LOW_TEMPLATE,
  DEFAULT_NARRATIVE_MAX_ITEMS,
  isValidNarrativeTemplate,
  NARRATIVE_MAX_ITEMS_LIMIT,
  NARRATIVE_TEMPLATE_MAX_LENGTH,
  NARRATIVE_TP_PLACEHOLDER,
} from '@edusync/contracts';
import type { FieldIssue } from './form-validation';

export {
  DEFAULT_NARRATIVE_HIGH_TEMPLATE,
  DEFAULT_NARRATIVE_LOW_TEMPLATE,
  DEFAULT_NARRATIVE_MAX_ITEMS,
  NARRATIVE_MAX_ITEMS_LIMIT,
  NARRATIVE_TEMPLATE_MAX_LENGTH,
  NARRATIVE_TP_PLACEHOLDER,
};

export type NarrativeSource = 'manual' | 'objectives' | 'predicate';
export type NarrativeSide = 'high' | 'low';

/** Kunci pesan (di bawah `reportCards`) untuk asal teks; null bila tidak ada teks sama sekali. */
export function narrativeSourceKey(
  source: NarrativeSource | null | undefined,
): 'sourceManual' | 'sourceObjectives' | 'sourcePredicate' | null {
  if (source === 'manual') return 'sourceManual';
  if (source === 'objectives') return 'sourceObjectives';
  if (source === 'predicate') return 'sourcePredicate';
  return null;
}

/** Asal teks otomatis (bukan suntingan guru). */
export function generatedSourceKey(
  source: 'objectives' | 'predicate' | null | undefined,
): 'sourceObjectives' | 'sourcePredicate' | null {
  if (source === 'objectives') return 'sourceObjectives';
  if (source === 'predicate') return 'sourcePredicate';
  return null;
}

export const defaultTemplate = (side: NarrativeSide) =>
  side === 'high' ? DEFAULT_NARRATIVE_HIGH_TEMPLATE : DEFAULT_NARRATIVE_LOW_TEMPLATE;

/**
 * Galat templat: kosong sah (memakai templat bawaan); selain itu wajib memuat `{tp}` dan maksimal 300 karakter.
 * Hasilnya FieldIssue untuk komponen FieldError.
 */
export function templateIssue(value: string): FieldIssue | undefined {
  const v = value.trim();
  if (v === '') return undefined;
  if (v.length > NARRATIVE_TEMPLATE_MAX_LENGTH)
    return { code: 'tooLong', max: NARRATIVE_TEMPLATE_MAX_LENGTH };
  return isValidNarrativeTemplate(v)
    ? undefined
    : { code: 'custom', key: 'reportCards.templateNeedsTp', values: { tp: NARRATIVE_TP_PLACEHOLDER } };
}

/** Contoh kalimat: templat yang diisi (atau bawaan bila kosong/tidak sah) dengan contoh TP. */
export function exampleSentence(value: string, side: NarrativeSide, sampleTp: string): string {
  const v = value.trim();
  const template = v !== '' && isValidNarrativeTemplate(v) ? v : defaultTemplate(side);
  return template.split(NARRATIVE_TP_PLACEHOLDER).join(sampleTp);
}

/** Jumlah TP per sisi dari isian pilihan; di luar 1-5 atau bukan angka kembali ke bawaan. */
export function parseMaxItems(value: string): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= NARRATIVE_MAX_ITEMS_LIMIT ? n : DEFAULT_NARRATIVE_MAX_ITEMS;
}

/** Isian templat untuk dikirim: kosong menjadi null (templat bawaan). */
export const templateForSave = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/** Templat tersimpan menjadi isian: null = kosong (memakai bawaan). */
export const templateToField = (saved: string | null | undefined): string => saved ?? '';

/** Baris suntingan yang teks otomatisnya berubah sejak disunting (rapor belum final). */
export function staleRows<T extends { stale?: boolean; locked?: boolean }>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.stale === true && !r.locked);
}

/** Teks ringkas satu TP untuk chip: kode bila ada, diikuti teks. */
export function objectiveLabel(o: { code: string | null; text: string }): string {
  return o.code ? `${o.code} ${o.text}` : o.text;
}
