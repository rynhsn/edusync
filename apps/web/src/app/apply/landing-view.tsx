'use client';

import { CalendarClock, ClipboardCheck, FileUp, PenLine, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import type { Locale } from '@/i18n/config';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import {
  BookIllustration,
  daysBetween,
  SchoolIllustration,
  StudentIllustration,
  todayIso,
  useApply,
} from './shared';

const STEPS = [
  { key: 'step1', icon: PenLine },
  { key: 'step2', icon: FileUp },
  { key: 'step3', icon: ClipboardCheck },
  { key: 'step4', icon: Sparkles },
] as const;

/** Halaman mendarat: sambutan sekolah, periode yang dibuka, dan ajakan mendaftar atau mengecek status. */
export function LandingView() {
  const t = useTranslations('apply');
  const locale = useLocale() as Locale;
  const { info } = useApply();
  // Hari ini hanya diketahui di klien; sebelum itu hitung mundur tidak ditampilkan agar tidak beda dengan server.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(todayIso()), []);

  const open = info.periods.filter((p) => p.open);
  const upcoming = today ? info.periods.filter((p) => !p.open && p.opensOn > today) : [];

  return (
    <>
      <section className="ap-hero-bg border-b">
        <div className="mx-auto grid w-full max-w-5xl items-center gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.15fr_1fr] md:py-16">
          <div className="ap-rise">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ap-orange-soft)] px-3 py-1 text-xs font-medium text-[var(--ap-orange-ink)]">
              <Sparkles className="size-3.5" aria-hidden /> {t('badge')}
            </span>
            <h1 className="font-heading mt-4 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
              {t('heroTitle', { school: info.school.name })}
            </h1>
            <p className="text-muted-foreground mt-4 max-w-lg text-lg text-pretty">
              {open.length > 0 ? t('heroOpen') : t('heroClosed')}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {open.length > 0 && (
                <Link
                  href={`/apply/form?period=${open[0]?.id ?? ''}`}
                  className={cn(
                    buttonVariants({ size: 'lg' }),
                    'h-12 bg-[var(--ap-orange)] px-6 text-base text-white shadow-md hover:bg-[var(--ap-orange)]/90',
                  )}
                >
                  {t('registerNow')}
                </Link>
              )}
              <Link
                href="/apply/status"
                className={cn(buttonVariants({ size: 'lg', variant: 'outline' }), 'h-12 px-6 text-base')}
              >
                <Search className="size-4" aria-hidden /> {t('checkStatus')}
              </Link>
            </div>
          </div>
          <div className="ap-rise mx-auto w-full max-w-sm md:max-w-none" style={{ animationDelay: '0.12s' }}>
            <SchoolIllustration className="h-auto w-full" />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">{t('periodsTitle')}</h2>

        {open.length === 0 ? (
          <div className="ap-rise mt-6 grid items-center gap-6 rounded-3xl border border-dashed bg-[var(--ap-teal-soft)]/60 p-6 sm:grid-cols-[auto_1fr] sm:p-8">
            <StudentIllustration className="mx-auto w-40" />
            <div className="text-center sm:text-left">
              <h3 className="font-heading text-xl font-semibold">{t('closedTitle')}</h3>
              <p className="text-muted-foreground mt-1.5 text-pretty">{t('closedBody')}</p>
              {upcoming.length > 0 && (
                <ul className="mt-4 grid gap-2">
                  {upcoming.map((p) => (
                    <li
                      key={p.id}
                      className="bg-card inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                    >
                      <CalendarClock className="size-4 text-[var(--ap-orange)]" aria-hidden />
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground">
                        {t('opensOn', { date: formatCalendarDate(locale, p.opensOn) })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/apply/status" className={cn(buttonVariants({ variant: 'outline' }), 'mt-5')}>
                <Search className="size-4" aria-hidden /> {t('checkStatus')}
              </Link>
            </div>
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {open.map((p, i) => {
              const left = today ? daysBetween(today, p.closesOn) : null;
              const urgent = left !== null && left <= 7;
              return (
                <li
                  key={p.id}
                  className="ap-rise bg-card relative overflow-hidden rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-md"
                  style={{ animationDelay: `${0.05 * i}s` }}
                >
                  <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-[var(--ap-orange)]" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-heading text-lg font-semibold">{p.name}</h3>
                      <p className="text-muted-foreground text-sm">{t('levelLabel', { level: p.level })}</p>
                    </div>
                    {left !== null && (
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                          urgent
                            ? 'bg-[var(--ap-orange-soft)] text-[var(--ap-orange-ink)]'
                            : 'bg-accent text-accent-foreground',
                        )}
                      >
                        {left <= 0 ? t('lastDay') : t('daysLeft', { days: left })}
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-sm">
                    <CalendarClock className="size-4" aria-hidden />
                    {t('closesOn', { date: formatCalendarDate(locale, p.closesOn) })}
                  </p>
                  <Link href={`/apply/form?period=${p.id}`} className={cn(buttonVariants(), 'mt-4 w-full')}>
                    {t('registerThis')}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 pb-14 sm:px-6">
        <div className="grid items-center gap-8 rounded-3xl bg-[var(--ap-teal-soft)] p-6 sm:p-8 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight">{t('howTitle')}</h2>
            <ol className="mt-5 grid gap-4 sm:grid-cols-2">
              {STEPS.map((s, i) => (
                <li key={s.key} className="flex gap-3">
                  <span className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-xl">
                    <s.icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      {i + 1}. {t(`${s.key}Title`)}
                    </p>
                    <p className="text-muted-foreground text-sm text-pretty">{t(`${s.key}Body`)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <BookIllustration className="mx-auto hidden w-40 md:block" />
        </div>
      </section>
    </>
  );
}
