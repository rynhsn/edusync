'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight, Target, Users } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { fmtPercent, GeoPattern, MiniBar, ProgressRing, STALE_DAYS, shiftIso, todayIso } from '../shared';

type Sort = 'stale' | 'name' | 'progress';

/** Papan progres anggota: cincin persen Al-Quran, setoran pada rentang, terakhir setor, dan penanda tertinggal. */
export function ProgressPanel({ halaqahId }: { halaqahId: string; canWrite: boolean }) {
  const t = useTranslations('tahfidz');
  const locale = useLocale() as Locale;
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const today = todayIso();
  const [from, setFrom] = useState(shiftIso(today, -29));
  const [to, setTo] = useState(today);
  const [sort, setSort] = useState<Sort>('stale');

  const summary = useQuery({
    queryKey: ['tahfidz-summary', school.schoolId, halaqahId, from, to],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/tahfidz/halaqah/{id}/summary', {
          params: { ...header, path: { id: halaqahId }, query: { from, to } },
        }),
      ),
  });

  const rows = [...(summary.data?.students ?? [])].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'progress') return b.percent - a.percent;
    // Paling tertinggal dahulu: belum pernah setor (null) paling atas.
    return (b.daysSinceLast ?? 10_000) - (a.daysSinceLast ?? 10_000);
  });
  const maxRange = Math.max(1, ...rows.map((r) => r.ziyadahInRange + r.murajaahInRange));

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="th-from">{t('from')}</Label>
          <DatePicker id="th-from" className="w-44" value={from} onChange={(v) => v <= to && setFrom(v)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="th-to">{t('to')}</Label>
          <DatePicker id="th-to" className="w-44" value={to} onChange={(v) => v >= from && setTo(v)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="th-sort">{t('sortLabel')}</Label>
          <SelectField
            id="th-sort"
            className="w-48"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
          >
            <option value="stale">{t('sortStale')}</option>
            <option value="progress">{t('sortProgress')}</option>
            <option value="name">{t('sortName')}</option>
          </SelectField>
        </div>
      </div>

      {summary.isPending && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      )}
      {summary.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('noProgress')}</AlertDescription>
        </Alert>
      )}
      {summary.data && rows.length === 0 && (
        <Card className="relative items-center overflow-hidden px-6 py-12 text-center">
          <GeoPattern className="text-chart-5 opacity-[0.07]" />
          <Users className="text-chart-5 relative size-8" />
          <p className="text-muted-foreground relative text-sm">{t('noProgress')}</p>
        </Card>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r, i) => {
          const stale = r.daysSinceLast === null || r.daysSinceLast >= STALE_DAYS;
          const inRange = r.ziyadahInRange + r.murajaahInRange;
          return (
            <li
              key={r.studentId}
              className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both motion-reduce:animate-none"
              style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
            >
              <Card
                className={cn(
                  'group relative h-full gap-3 p-4 transition-shadow hover:shadow-md',
                  stale && 'border-destructive/30 bg-destructive/5',
                )}
              >
                <div className="flex items-center gap-3">
                  <ProgressRing
                    percent={r.percent}
                    size={56}
                    stroke={6}
                    tone={stale ? 'rose' : 'emerald'}
                    label={t('percentOfQuran')}
                  >
                    <span className="text-xs font-semibold tabular-nums">{fmtPercent(r.percent)}%</span>
                  </ProgressRing>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/tahfidz/siswa/${r.studentId}`}
                      className="after:absolute after:inset-0 after:content-[''] block truncate font-medium hover:underline focus-visible:outline-none"
                    >
                      {r.name}
                    </Link>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {t('ayahsMemorized', { count: r.ayahsTotal })}
                    </p>
                  </div>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="grid gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t('rangeAyahs')}</span>
                    <span className="tabular-nums">
                      <span className="text-chart-5 font-medium">{r.ziyadahInRange}</span>
                      {' + '}
                      <span className="font-medium">{r.murajaahInRange}</span>
                    </span>
                  </div>
                  <MiniBar percent={(inRange / maxRange) * 100} tone={stale ? 'rose' : 'gold'} />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {stale ? (
                    <Badge className="bg-destructive/10 text-destructive gap-1 border-transparent">
                      <AlertTriangle className="size-3" />
                      {r.lastEntryDate ? t('daysAgo', { count: r.daysSinceLast ?? 0 }) : t('neverEntry')}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">
                      {t('lastEntry')}:{' '}
                      {r.daysSinceLast === 0
                        ? t('today')
                        : r.lastEntryDate
                          ? formatCalendarDate(locale, r.lastEntryDate)
                          : ''}
                    </span>
                  )}
                  {r.onTarget !== null && (
                    <Badge
                      variant="outline"
                      className={cn('gap-1', r.onTarget ? 'border-chart-5/60' : 'border-chart-2/70')}
                    >
                      <Target className="size-3" />
                      {t('targetShort')}
                      <span className="sr-only">{r.onTarget ? ': ✓' : ': ✗'}</span>
                      <span aria-hidden="true">{r.onTarget ? '✓' : '!'}</span>
                    </Badge>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
