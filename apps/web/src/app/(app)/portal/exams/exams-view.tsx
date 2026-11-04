'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, CheckCircle2, Clock, FileQuestion, Play } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { ApiError, api, schoolHeader, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';
import { EmptyState } from '../ui-bits';
import { formatClock, formatWindow, useTick } from './clock';

type State = 'unscheduled' | 'upcoming' | 'open' | 'in_progress' | 'submitted' | 'closed';

const BADGE: Record<State, string> = {
  unscheduled: 'bg-muted text-muted-foreground',
  upcoming: 'bg-chart-2/15 text-chart-2',
  open: 'bg-chart-5/15 text-chart-5',
  in_progress: 'bg-primary/15 text-primary',
  submitted: 'bg-muted text-muted-foreground',
  closed: 'bg-destructive/10 text-destructive',
};

/** Daftar ujian di layar untuk siswa: jadwal, status, dan tombol mulai/lanjutkan. */
export function ExamsView() {
  const t = useTranslations('examCbt');
  const locale = useLocale() as Locale;
  const { school } = useSchool();
  const now = useTick();
  const tz = school.timezone ?? 'Asia/Jakarta';

  const exams = useQuery({
    queryKey: ['portal', school.schoolId, 'exams'],
    queryFn: async () =>
      unwrap(await api.GET('/v1/portal/exams', { params: { header: schoolHeader(school.schoolId) } })),
    refetchInterval: 30_000,
    retry: (count, error) => !(error instanceof ApiError && error.status === 403) && count < 2,
  });
  const notStudent = exams.error instanceof ApiError && exams.error.status === 403;

  return (
    <div className="mx-auto grid w-full max-w-3xl content-start gap-5 pb-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          nativeButton={false}
          render={<Link href="/portal" />}
          aria-label={t('back')}
        >
          <ArrowLeft />
        </Button>
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{t('listTitle')}</h1>
          <p className="text-muted-foreground text-sm">{t('listSubtitle')}</p>
        </div>
      </div>

      {exams.isPending && (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      )}
      {notStudent && <EmptyState title={t('studentOnlyTitle')} body={t('studentOnlyBody')} />}
      {exams.isError && !notStudent && (
        <Alert variant="destructive">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}
      {exams.data?.length === 0 && <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />}

      <ul className="grid gap-3">
        {exams.data?.map((x) => {
          const state = x.state as State;
          const untilStart = x.startsAt ? new Date(x.startsAt).getTime() - now : 0;
          return (
            <li key={x.id} className="bg-card grid gap-3 rounded-2xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', BADGE[state])}>
                  {t(`state.${state}`)}
                </span>
                <span className="bg-muted rounded-full px-2.5 py-0.5 text-xs font-medium">{x.typeShort}</span>
                <span className="text-muted-foreground text-xs">{x.subjectName}</span>
              </div>
              <h2 className="font-heading text-lg leading-snug font-semibold">{x.title}</h2>
              <ul className="text-muted-foreground grid gap-1 text-sm">
                {x.startsAt && (
                  <li className="flex items-start gap-2">
                    <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {formatWindow(locale, tz, x.startsAt, x.endsAt)}
                  </li>
                )}
                <li className="flex items-center gap-2">
                  <Clock className="size-4 shrink-0" aria-hidden />
                  {x.durationMinutes ? t('durationMinutes', { n: x.durationMinutes }) : t('noDuration')}
                  <span aria-hidden>·</span>
                  <FileQuestion className="size-4 shrink-0" aria-hidden />
                  {t('questionCount', { n: x.questionCount })}
                </li>
              </ul>

              {(state === 'open' || state === 'in_progress') && (
                <Button
                  nativeButton={false}
                  render={<Link href={`/portal/exams/${x.id}`} />}
                  className="w-full sm:w-fit"
                >
                  <Play /> {state === 'open' ? t('start') : t('resume')}
                </Button>
              )}
              {state === 'upcoming' && (
                <p className="text-chart-2 text-sm font-medium tabular-nums">
                  {t('opensIn', { time: formatClock(untilStart) })}
                </p>
              )}
              {state === 'submitted' && (
                <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="text-chart-5 size-4" aria-hidden /> {t('submittedNote')}
                </p>
              )}
              {state === 'closed' && <p className="text-muted-foreground text-sm">{t('closedNote')}</p>}
              {state === 'unscheduled' && (
                <p className="text-muted-foreground text-sm">{t('unscheduledNote')}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
