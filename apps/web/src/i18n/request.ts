import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, isLocale, LOCALE_COOKIE, matchAcceptLanguage } from './config';

/**
 * Bahasa tanpa awalan URL (dashboard berada di balik login, jadi tidak perlu SEO per bahasa).
 * Urutan: cookie pilihan pengguna → Accept-Language browser → bawaan.
 */
export default getRequestConfig(async () => {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored)
    ? stored
    : (matchAcceptLanguage((await headers()).get('accept-language')) ?? defaultLocale);
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
