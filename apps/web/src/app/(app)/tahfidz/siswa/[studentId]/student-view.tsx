'use client';

import { SURAHS, TOTAL_JUZ } from '@edusync/contracts';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Flame, Plus, Target } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { DayBars, JuzMap } from '../../charts';
import { EntryDialog } from '../../entry-form';
import {
  Arabic,
  diffDays,
  fmtPercent,
  juzFractions,
  MiniBar,
  ProgressRing,
  surahLabel,
  TahfidzBanner,
  todayIso,
} from '../../shared';

export function StudentProgressView({ studentId }: { studentId: string }) {
  const t = useTranslations('tahfidz');
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };

  const progress = useQuery({
    queryKey: ['tahfidz-progress', school.schoolId, studentId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/tahfidz/students/{studentId}/progress', {
          params: { ...header, path: { studentId }, query: {} },
        }),
      ),
  });

  const data = progress.data;
  const halaqahList = useQuery({
    queryKey: ['tahfidz-halaqah', school.schoolId, 'all'],
    queryFn: async () => unwrap(await api.GET('/v1/tahfidz/halaqah', { params: { ...header, query: {} } })),
  });
  const myHalaqah = halaqahList.data?.find((h) => h.id === data?.halaqah?.id);
  const fractions = useMemo(
    () => (data ? juzFractions(data.coverage.perSurah, data.coverage.juzCompleteList) : []),
    [data],
  );

  const back = (
    <Button
      variant="outline"
      nativeButton={false}
      render={<Link href={data?.halaqah ? `/tahfidz/${data.halaqah.id}` : '/tahfidz'} />}
    >
      <ArrowLeft className="size-4" /> {t('back')}
    </Button>
  );

  if (progress.isPending) {
    return (
      <PageBody>
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </PageBody>
    );
  }
  if (!data) {
    return (
      <PageBody>
        <PageHeader title={t('title')} actions={back} />
        <Alert variant="destructive">
          <AlertDescription>{t('studentNotFound')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  const today = todayIso();
  const { coverage, semester } = data;
  const juzCount = coverage.juzComplete;
  const days = data.last30Days.map((d) => ({
    date: d.date,
    ziyadah: d.ziyadahAyahs,
    murajaah: d.murajaahAyahs,
  }));
  const monthTotal = days.reduce((s, d) => s + d.ziyadah + d.murajaah, 0);
  const sinceLast = data.lastEntryDate ? diffDays(data.lastEntryDate, today) : null;
  const surahCoverage = new Map(coverage.perSurah.map((s) => [s.surah, s]));
  const done = coverage.perSurah.filter((s) => s.complete).length;
  const percentOfTarget = semester.percentOfTarget;
  const hasTarget = semester.target.ziyadahAyahs + semester.target.murajaahAyahs > 0;
  const canWrite = can('tahfidz:manage') || (myHalaqah?.canManage ?? false);

  return (
    <PageBody>
      <TahfidzBanner>
        <PageHeader
          title={data.student.name}
          description={[data.student.className, data.halaqah?.name].filter(Boolean).join(' · ')}
          actions={
            <>
              {back}
              {canWrite && (
                <EntryDialog
                  idPrefix="student-entry"
                  trigger={
                    <Button>
                      <Plus className="size-4" /> {t('newEntry')}
                    </Button>
                  }
                  title={t('newEntry')}
                  description={data.student.name}
                  students={[{ id: studentId, name: data.student.name }]}
                  studentId={studentId}
                  lockStudent
                />
              )}
            </>
          }
        />
      </TahfidzBanner>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Card className="relative items-center gap-5 overflow-hidden p-6 text-center">
          <div className="bg-chart-2/20 pointer-events-none absolute -bottom-10 left-1/2 size-48 -translate-x-1/2 rounded-full blur-3xl" />
          <ProgressRing percent={coverage.percent} size={176} stroke={14} label={t('quranPercent')}>
            <div className="grid gap-0.5">
              <span className="font-heading text-4xl font-semibold tabular-nums">
                {fmtPercent(coverage.percent)}
                <span className="text-muted-foreground text-xl">%</span>
              </span>
              <span className="text-muted-foreground text-xs">{t('ofQuran')}</span>
            </div>
          </ProgressRing>
          <div className="relative grid gap-1">
            <p className="font-heading text-xl font-semibold">
              {t('juzOf', { count: juzCount, total: TOTAL_JUZ })}
            </p>
            <p className="text-muted-foreground text-sm">{t('ayahsMemorized', { count: coverage.ayahs })}</p>
          </div>
          {data.next && (
            <div className="bg-chart-5/10 relative w-full rounded-xl border px-4 py-3 text-start">
              <p className="text-muted-foreground text-xs">{t('nextUp')}</p>
              <p className="flex items-baseline justify-between gap-2 font-medium">
                <span>
                  {surahLabel(data.next.surah)}: {data.next.ayah}
                </span>
                <Arabic className="text-lg">{SURAHS[data.next.surah - 1]?.arabic}</Arabic>
              </p>
            </div>
          )}
        </Card>

        <div className="grid content-start gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="gap-1 p-4">
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Flame className="text-chart-2 size-4" /> {t('streak')}
              </p>
              <p className="font-heading text-3xl font-semibold tabular-nums">
                {data.streakDays}
                <span className="text-muted-foreground ml-1 text-sm font-normal">{t('days')}</span>
              </p>
            </Card>
            <Card className="gap-1 p-4">
              <p className="text-muted-foreground text-xs">{t('lastEntry')}</p>
              <p className="font-medium">
                {data.lastEntryDate ? formatCalendarDate(locale, data.lastEntryDate) : t('neverEntry')}
              </p>
              {sinceLast !== null && (
                <p className={cn('text-xs', sinceLast >= 7 ? 'text-destructive' : 'text-muted-foreground')}>
                  {sinceLast === 0 ? t('today') : t('daysAgo', { count: sinceLast })}
                </p>
              )}
            </Card>
            <Card className="gap-1 p-4">
              <p className="text-muted-foreground text-xs">{t('last30')}</p>
              <p className="font-heading text-3xl font-semibold tabular-nums">
                {monthTotal}
                <span className="text-muted-foreground ml-1 text-sm font-normal">{t('ayahUnit')}</span>
              </p>
            </Card>
          </div>

          <Card className="gap-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading font-semibold">{t('last30Title')}</h2>
              <span className="text-muted-foreground text-xs">{t('ayahPerDay')}</span>
            </div>
            <DayBars points={days} todayDate={today} unit={t('ayahUnit')} />
          </Card>

          <Card className="gap-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading flex items-center gap-2 font-semibold">
                <Target className="text-chart-2 size-4" /> {t('semesterTarget')}
                {semester.name && (
                  <span className="text-muted-foreground text-xs font-normal">{semester.name}</span>
                )}
              </h2>
              {percentOfTarget !== null && (
                <span className="text-sm font-medium tabular-nums">{fmtPercent(percentOfTarget)}%</span>
              )}
            </div>
            {hasTarget ? (
              <div className="grid gap-3">
                {(['ziyadah', 'murajaah'] as const).map((k) => {
                  const target = semester.target[`${k}Ayahs`];
                  const done = semester.done[`${k}Ayahs`];
                  if (target === 0) return null;
                  return (
                    <div key={k} className="grid gap-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t(`kindName.${k}`)}</span>
                        <span className="tabular-nums">{t('targetProgress', { done, target })}</span>
                      </div>
                      <MiniBar
                        percent={(done / target) * 100}
                        tone={done >= target ? 'emerald' : 'gold'}
                        className="h-2.5"
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{t('noTarget')}</p>
            )}
          </Card>
        </div>
      </div>

      <Card className="gap-4 p-5">
        <h2 className="font-heading font-semibold">{t('juzMap')}</h2>
        <JuzMap
          fraction={(j) => fractions[j - 1] ?? 0}
          labelFor={(j, p) => t('juzTip', { juz: j, percent: p })}
        />
        <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="bg-chart-5 size-3 rounded-sm" /> {t('legendFull')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="bg-chart-5/35 size-3 rounded-sm" /> {t('legendPartial')}
          </span>
        </div>
      </Card>

      <Card className="gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading font-semibold">{t('surahsCovered')}</h2>
          <span className="text-muted-foreground text-xs">
            {t('surahSummary', { complete: done, partial: coverage.perSurah.length - done })}
          </span>
        </div>
        {coverage.perSurah.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{t('noSurahsYet')}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...surahCoverage.values()].map((c) => {
              const s = SURAHS[c.surah - 1];
              if (!s) return null;
              return (
                <li
                  key={c.surah}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-xl border px-3 py-2',
                    c.complete ? 'border-chart-5/50 bg-chart-5/10' : 'border-chart-2/50 bg-chart-2/10',
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {s.number}. {s.name}
                    </p>
                    <Badge variant="outline" className="mt-0.5 text-[11px]">
                      {c.complete ? t('surahComplete') : `${c.ayahs}/${s.ayahCount}`}
                    </Badge>
                  </div>
                  <Arabic className="text-xl">{s.arabic}</Arabic>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </PageBody>
  );
}
