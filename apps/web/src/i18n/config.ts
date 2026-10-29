export const locales = ['id', 'en', 'su'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'id';
export const LOCALE_COOKIE = 'edusync-locale';

/** Nama bahasa selalu ditulis dalam bahasanya sendiri agar bisa dikenali siapa pun. */
export const localeNames: Record<Locale, string> = {
  id: 'Bahasa Indonesia',
  en: 'English',
  su: 'Basa Sunda',
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

/** Pilih bahasa dari header Accept-Language. Hanya mencocokkan bagian bahasa (id-ID → id). */
export function matchAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const wanted = header
    .split(',')
    .map((part) => part.trim().split(';')[0]?.split('-')[0]?.toLowerCase())
    .filter(Boolean);
  for (const lang of wanted) if (isLocale(lang)) return lang;
  return null;
}
