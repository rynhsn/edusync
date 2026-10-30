'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, NotebookPen, Trash2, UserCheck, UserX } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { Textarea } from '../report-cards/textarea';
import { monthGrid, shiftMonth, todayIso } from './lib';
import { type PklPlacement, pklKey } from './shared';

interface Period {
  startsOn: string;
  endsOn: string;
}

/** Bulan awal kalender: bulan hari ini bila dalam periode, selain itu bulan mulai atau akhir periode. */
function initialMonth(period: Period | null): string {
  const today = todayIso();
  const pick = period ? ([period.startsOn, today, period.endsOn].sort()[1] ?? today) : today;
  return pick.slice(0, 7);
}

/** Jurnal harian: kalender bulanan bertitik, formulir tambah, dan daftar entri. */
export function JournalPanel({ placement, period }: { placement: PklPlacement; period: Period | null }) {
  const t = useTranslations('pkl');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const writable = placement.canWrite && placement.status !== 'cancelled';

  const [month, setMonth] = useState(() => initialMonth(period));
  const [date, setDate] = useState(() => {
    const today = todayIso();
    return period && (today < period.startsOn || today > period.endsOn) ? '' : today;
  });
  const [activity, setActivity] = useState('');
  const [present, setPresent] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const journals = useQuery({
    queryKey: pklKey(school.schoolId, 'journals', placement.id),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/pkl/placements/{id}/journals', {
          params: { ...header, path: { id: placement.id } },
        }),
      ),
  });
  const list = journals.data ?? [];
  const byDate = new Map(list.map((j) => [j.date, j]));
  const refresh = () => queryClient.invalidateQueries({ queryKey: pklKey(school.schoolId) });

  const add = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/pkl/placements/{id}/journals', {
          params: { ...header, path: { id: placement.id } },
          body: { date, activity: activity.trim(), present },
        }),
      ),
    onSuccess: () => {
      toast.success(t('journalSaved'));
      setActivity('');
      setError(null);
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const remove = useMutation({
    mutationFn: async (jid: string) =>
      unwrap(await api.DELETE('/v1/pkl/journals/{id}', { params: { ...header, path: { id: jid } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const weeks = monthGrid(month);
  const today = todayIso();
  const [yy, mm] = month.split('-').map(Number) as [number, number];
  const monthTitle = new Intl.DateTimeFormat(locale === 'su' ? 'id' : locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(yy, mm - 1, 1)));
  // Nama hari Senin..Minggu; 2026-10-05 adalah Senin.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale === 'su' ? 'id' : locale, { weekday: 'narrow', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2026, 9, 5 + i)),
    ),
  );
  const presentDays = list.filter((j) => j.present).length;

  return (
    <div className="grid gap-5 lg:grid-cols-[19rem_1fr]">
      {/* Kalender */}
      <section className="bg-card h-fit rounded-xl border p-4" aria-label={t('calendarLabel')}>
        <div className="mb-2 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('prevMonth')}
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <h2 className="font-heading text-sm font-semibold capitalize">{monthTitle}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('nextMonth')}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {weekdays.map((w, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: urutan hari tetap
            <span key={i} className="text-muted-foreground py-1 text-[11px] font-medium uppercase">
              {w}
            </span>
          ))}
          {weeks.flat().map((iso, i) => {
            // biome-ignore lint/suspicious/noArrayIndexKey: sel kosong kisi kalender tidak punya identitas lain
            if (!iso) return <span key={`e${i}`} />;
            const entry = byDate.get(iso);
            const inPeriod = !period || (iso >= period.startsOn && iso <= period.endsOn);
            const selected = date === iso;
            return (
              <button
                key={iso}
                type="button"
                disabled={!writable && !entry}
                aria-label={`${formatCalendarDate(locale, iso)}${entry ? ` · ${entry.present ? t('present') : t('absent')}` : ''}`}
                aria-pressed={selected}
                onClick={() => setDate(iso)}
                className={cn(
                  'focus-visible:ring-ring/50 relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs tabular-nums transition-colors outline-none focus-visible:ring-3 disabled:cursor-default',
                  inPeriod ? 'hover:bg-orange-50 dark:hover:bg-orange-500/10' : 'text-muted-foreground/50',
                  iso === today && 'ring-1 ring-orange-400',
                  selected && 'bg-orange-100 font-semibold dark:bg-orange-500/25',
                )}
              >
                {Number(iso.slice(8))}
                {entry && (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute bottom-1 size-1.5 rounded-full',
                      entry.present ? 'bg-teal-600' : 'bg-rose-500',
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-teal-600" aria-hidden /> {t('present')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-rose-500" aria-hidden /> {t('absent')}
          </span>
          <span className="ml-auto tabular-nums">
            {t('journalTally', { present: presentDays, total: list.length })}
          </span>
        </div>
      </section>

      <div className="grid content-start gap-4">
        {writable && (
          <form
            className="bg-card grid gap-3 rounded-xl border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (date && activity.trim()) add.mutate();
            }}
          >
            <h2 className="font-heading flex items-center gap-2 text-sm font-semibold">
              <NotebookPen className="size-4 text-orange-600 dark:text-orange-300" aria-hidden />{' '}
              {t('addJournal')}
            </h2>
            <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
              <div className="grid content-start gap-2">
                <Label htmlFor="jn-date">{t('date')}</Label>
                <DatePicker id="jn-date" value={date} onChange={setDate} />
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="jn-present"
                    checked={present}
                    onCheckedChange={(v) => setPresent(v === true)}
                  />
                  <Label htmlFor="jn-present">{t('presentToday')}</Label>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="jn-activity">{t('activity')}</Label>
                <Textarea
                  id="jn-activity"
                  rows={4}
                  maxLength={2000}
                  value={activity}
                  placeholder={t('activityPlaceholder')}
                  onChange={(e) => setActivity(e.target.value)}
                />
              </div>
            </div>
            {byDate.has(date) && (
              <p className="text-xs text-amber-700 dark:text-amber-300">{t('journalOverwrite')}</p>
            )}
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div>
              <Button type="submit" disabled={!date || !activity.trim() || add.isPending}>
                {t('saveJournal')}
              </Button>
            </div>
          </form>
        )}

        <section aria-label={t('journalList')} className="grid gap-2">
          {journals.isPending ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : list.length === 0 ? (
            <div className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
              {t('journalEmpty')}
            </div>
          ) : (
            list.map((j) => (
              <article
                key={j.id}
                className={cn(
                  'bg-card flex gap-3 rounded-xl border p-3.5 transition-colors',
                  date === j.date &&
                    'border-orange-300 bg-orange-50/60 dark:border-orange-500/40 dark:bg-orange-500/5',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
                    j.present
                      ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-200'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200',
                  )}
                >
                  {j.present ? (
                    <UserCheck className="size-4" aria-label={t('present')} />
                  ) : (
                    <UserX className="size-4" aria-label={t('absent')} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
                    {formatCalendarDate(locale, j.date)}
                    <span className="text-muted-foreground text-xs font-normal">
                      {j.source === 'industry' ? t('byIndustry') : (j.recordedBy ?? t('byStaff'))}
                    </span>
                  </p>
                  <p className="mt-1 text-sm break-words whitespace-pre-wrap">{j.activity}</p>
                </div>
                {writable && (
                  <ConfirmDialog
                    destructive
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={t('deleteJournal')}>
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    }
                    title={t('confirm.journalTitle')}
                    description={formatCalendarDate(locale, j.date)}
                    confirmLabel={t('deleteJournal')}
                    pending={remove.isPending}
                    onConfirm={() => remove.mutateAsync(j.id)}
                  />
                )}
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
