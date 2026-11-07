import {
  SITE_MAX_FEATURES,
  type SiteContent,
  type SiteFeature,
  type SiteIcon,
  type SiteLocale,
  type SiteLocaleContent,
} from '@edusync/contracts';

/*
 * Logika murni formulir "Situs" di konsol platform: semua pembaruan mengembalikan salinan baru (state React),
 * tidak mengubah masukan.
 */

/** Pindahkan elemen satu langkah (-1 naik, 1 turun). Di tepi daftar, daftar dikembalikan apa adanya. */
export function moveItem<T>(list: readonly T[], index: number, step: -1 | 1): T[] {
  const target = index + step;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item as T);
  return next;
}

export function removeItem<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

export const canAddFeature = (content: SiteContent) => content.features.length < SITE_MAX_FEATURES;

/** Fitur baru kosong; judul diisi staf. Tidak menambah bila sudah mencapai batas. */
export function addFeature(content: SiteContent, icon: SiteIcon = 'Star'): SiteContent {
  if (!canAddFeature(content)) return content;
  const blank = { title: '', description: '' };
  const feature: SiteFeature = { icon, text: { id: { ...blank }, en: { ...blank }, su: { ...blank } } };
  return { ...content, features: [...content.features, feature] };
}

export function updateFeature(content: SiteContent, index: number, patch: Partial<SiteFeature>): SiteContent {
  return {
    ...content,
    features: content.features.map((f, i) => (i === index ? { ...f, ...patch } : f)),
  };
}

export function updateFeatureText(
  content: SiteContent,
  index: number,
  locale: SiteLocale,
  patch: Partial<SiteFeature['text'][SiteLocale]>,
): SiteContent {
  return {
    ...content,
    features: content.features.map((f, i) =>
      i === index ? { ...f, text: { ...f.text, [locale]: { ...f.text[locale], ...patch } } } : f,
    ),
  };
}

export function updateLocale(
  content: SiteContent,
  locale: SiteLocale,
  patch: Partial<SiteLocaleContent>,
): SiteContent {
  return { ...content, locales: { ...content.locales, [locale]: { ...content.locales[locale], ...patch } } };
}

/** Bahasa yang masih punya kolom wajib kosong (setelah dipangkas), untuk menandai tab sebelum menyimpan. */
export function localesWithMissingRequired(content: SiteContent): SiteLocale[] {
  const required = ['metaTitle', 'heroTitle', 'ctaPrimary', 'ctaSecondary', 'featuresTitle'] as const;
  return (['id', 'en', 'su'] as const).filter((locale) => {
    const l = content.locales[locale];
    const featureMissing = content.features.some((f) => !f.text[locale].title.trim());
    return featureMissing || required.some((key) => !l[key].trim());
  });
}

/** Sama persis (abaikan urutan kunci)? Dipakai untuk menandai "ada perubahan belum disimpan". */
export function sameContent(a: SiteContent, b: SiteContent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Ukuran berkas untuk tampilan: 12 KB, 1,5 MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
