'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@/i18n/config';

/** Jam dinding yang berdetak tiap `ms` milidetik (untuk hitung mundur). */
export function useTick(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** 3725000 -> "1:02:05"; di bawah satu jam "02:05". Nilai negatif dianggap 0. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** Intl belum punya data Sunda di banyak peramban, jadi jatuh ke Indonesia. */
export const intlLocale = (locale: Locale) => (locale === 'su' ? 'id' : locale);

export function formatWindow(locale: Locale, tz: string, startsAt: string, endsAt: string | null): string {
  const loc = intlLocale(locale);
  const day = new Intl.DateTimeFormat(loc, { dateStyle: 'full', timeZone: tz }).format(new Date(startsAt));
  const time = (iso: string) =>
    new Intl.DateTimeFormat(loc, { timeStyle: 'short', timeZone: tz }).format(new Date(iso));
  return `${day}, ${time(startsAt)}${endsAt ? ` - ${time(endsAt)}` : ''}`;
}
