'use client';

import { Check, Languages } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LOCALE_COOKIE, type Locale, localeNames, locales } from '@/i18n/config';

export function LanguageSwitcher() {
  const t = useTranslations('language');
  const current = useLocale();
  const router = useRouter();

  function choose(locale: Locale) {
    // Satu tahun, berlaku untuk seluruh situs. refresh() membuat server membaca cookie baru.
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t('label')} />}>
        <Languages className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('label')}</DropdownMenuLabel>
          {locales.map((locale) => (
            <DropdownMenuItem key={locale} onClick={() => choose(locale)}>
              <span className="flex-1">{localeNames[locale]}</span>
              {current === locale && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
