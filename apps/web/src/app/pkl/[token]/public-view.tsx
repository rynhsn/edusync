'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CalendarRange,
  CheckCircle2,
  ClipboardPen,
  Eye,
  LinkIcon,
  NotebookPen,
  Star,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { parseScore, todayIso } from '@/app/(app)/pkl/lib';
import { PersonAvatar } from '@/app/(app)/pkl/shared';
import { Textarea } from '@/app/(app)/report-cards/textarea';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { ApiError, api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';

interface Draft {
  value: string;
  note: string;
}

/** Halaman pembimbing industri: sederhana dan hangat, ramah ponsel; jurnal dan penilaian lewat tautan. */
export function PklPublicView({ token }: { token: string }) {
  const t = useTranslations('pklPublic');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const key = ['pkl-public', token];

  const view = useQuery({
    queryKey: key,
    retry: (n, e) => !(e instanceof ApiError && (e.status === 404 || e.status === 429)) && n < 1,
    queryFn: async () => unwrap(await api.GET('/v1/public/pkl/{token}', { params: { path: { token } } })),
  });
  const data = view.data;

  const [date, setDate] = useState(todayIso());
  const [activity, setActivity] = useState('');
  const [present, setPresent] = useState(true);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [scoreSaved, setScoreSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setDrafts(
      Object.fromEntries(
        data.aspects.map((a) => [
          a.id,
          { value: a.industry ? String(a.industry.value) : '', note: a.industry?.note ?? '' },
        ]),
      ),
    );
  }, [data]);

  const addJournal = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/public/pkl/{token}/journal', {
          params: { path: { token } },
          body: { date, activity: activity.trim(), present },
        }),
      ),
    onSuccess: () => {
      toast.success(t('journalSaved'));
      setActivity('');
      setJournalError(null);
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => setJournalError(te(errorKey(e))),
  });

  const saveScores = useMutation({
    mutationFn: async () => {
      const records = Object.entries(drafts).flatMap(([aspectId, d]) => {
        const value = parseScore(d.value);
        return value === null ? [] : [{ aspectId, value, note: d.note.trim() || null }];
      });
      return unwrap(
        await api.PUT('/v1/public/pkl/{token}/scores', { params: { path: { token } }, body: { records } }),
      );
    },
    onSuccess: () => {
      toast.success(t('scoresSaved'));
      setScoreError(null);
      setScoreSaved(true);
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => setScoreError(te(errorKey(e))),
  });

  const invalidLink = view.error instanceof ApiError && view.error.status === 404;
  const scoreInvalid = Object.values(drafts).some(
    (d) => d.value.trim() !== '' && parseScore(d.value) === null,
  );

  return (
    <div className="min-h-dvh bg-gradient-to-b from-orange-50 via-background to-teal-50/60 dark:from-orange-500/[0.07] dark:to-teal-500/[0.05]">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between gap-2 px-4 py-4">
        <Logo />
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-2xl gap-5 px-4 pt-2 pb-16">
        {view.isPending && (
          <div className="grid gap-4">
            <Skeleton className="h-36 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        )}

        {view.isError && (
          <div className="bg-card grid justify-items-center gap-3 rounded-2xl border px-6 py-12 text-center shadow-sm">
            <LinkIcon className="text-muted-foreground size-10" aria-hidden />
            <h1 className="font-heading text-xl font-semibold">
              {invalidLink ? t('invalidTitle') : t('loadErrorTitle')}
            </h1>
            <p className="text-muted-foreground max-w-sm text-sm">
              {invalidLink ? t('invalidBody') : t('loadErrorBody')}
            </p>
            {!invalidLink && (
              <Button variant="outline" onClick={() => view.refetch()}>
                {t('retry')}
              </Button>
            )}
          </div>
        )}

        {data && (
          <>
            <section className="relative overflow-hidden rounded-2xl border border-orange-200 bg-card p-5 shadow-sm dark:border-orange-500/30">
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-orange-400 via-amber-400 to-teal-500"
              />
              <p className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase">
                {data.school.name}
              </p>
              <div className="mt-3 flex items-center gap-4">
                <PersonAvatar name={data.student.name} size="lg" />
                <div className="min-w-0">
                  <p className="text-muted-foreground text-sm">{t('welcome')}</p>
                  <h1 className="font-heading text-2xl leading-tight font-semibold">{data.student.name}</h1>
                  <p className="text-muted-foreground text-sm">{data.student.className ?? ''}</p>
                </div>
              </div>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div className="flex items-start gap-2">
                  <Building2
                    className="mt-0.5 size-4 shrink-0 text-orange-600 dark:text-orange-300"
                    aria-hidden
                  />
                  <div>
                    <dt className="text-muted-foreground text-xs">{t('partner')}</dt>
                    <dd className="font-medium">{data.partner.name}</dd>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CalendarRange
                    className="mt-0.5 size-4 shrink-0 text-orange-600 dark:text-orange-300"
                    aria-hidden
                  />
                  <div>
                    <dt className="text-muted-foreground text-xs">{t('period')}</dt>
                    <dd className="font-medium">{data.period.name}</dd>
                    <dd className="text-muted-foreground text-xs">
                      {formatCalendarDate(locale, data.period.startsOn)} –{' '}
                      {formatCalendarDate(locale, data.period.endsOn)}
                    </dd>
                  </div>
                </div>
              </dl>
            </section>

            {!data.canWrite && (
              <Alert role="status">
                <Eye className="size-4" aria-hidden />
                <AlertDescription>{t('readOnlyBanner')}</AlertDescription>
              </Alert>
            )}

            {data.canWrite && (
              <form
                className="bg-card grid gap-3 rounded-2xl border p-5 shadow-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (date && activity.trim()) addJournal.mutate();
                }}
              >
                <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
                  <NotebookPen className="size-5 text-orange-600 dark:text-orange-300" aria-hidden />{' '}
                  {t('journalFormTitle')}
                </h2>
                <div className="grid gap-2">
                  <Label htmlFor="pj-date">{t('date')}</Label>
                  <DatePicker id="pj-date" value={date} onChange={setDate} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pj-activity">{t('activity')}</Label>
                  <Textarea
                    id="pj-activity"
                    rows={4}
                    maxLength={2000}
                    value={activity}
                    placeholder={t('activityPlaceholder')}
                    onChange={(e) => setActivity(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pj-present"
                    checked={present}
                    onCheckedChange={(v) => setPresent(v === true)}
                  />
                  <Label htmlFor="pj-present">{t('present')}</Label>
                </div>
                {journalError && (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{journalError}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" size="lg" disabled={!date || !activity.trim() || addJournal.isPending}>
                  <ClipboardPen className="size-4" aria-hidden /> {t('saveJournal')}
                </Button>
              </form>
            )}

            <section className="grid gap-2" aria-labelledby="pj-list">
              <h2 id="pj-list" className="font-heading text-lg font-semibold">
                {t('recentJournals')}
              </h2>
              {data.journals.length === 0 ? (
                <p className="text-muted-foreground bg-card rounded-2xl border border-dashed px-4 py-8 text-center text-sm">
                  {t('noJournals')}
                </p>
              ) : (
                data.journals.map((j) => (
                  <article key={j.date} className="bg-card flex gap-3 rounded-xl border p-3.5">
                    <span
                      className={
                        j.present
                          ? 'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-200'
                          : 'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200'
                      }
                    >
                      {j.present ? (
                        <UserCheck className="size-4" aria-label={t('presentLabel')} />
                      ) : (
                        <UserX className="size-4" aria-label={t('absentLabel')} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{formatCalendarDate(locale, j.date)}</p>
                      <p className="mt-1 text-sm break-words whitespace-pre-wrap">{j.activity}</p>
                    </div>
                  </article>
                ))
              )}
            </section>

            {data.aspects.length > 0 && (
              <form
                className="bg-card grid gap-4 rounded-2xl border p-5 shadow-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!scoreInvalid) saveScores.mutate();
                }}
              >
                <div>
                  <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
                    <Star className="size-5 text-teal-600 dark:text-teal-300" aria-hidden />{' '}
                    {t('scoresTitle')}
                  </h2>
                  <p className="text-muted-foreground text-sm">{t('scoresHint')}</p>
                </div>
                {data.aspects.map((a) => {
                  const d = drafts[a.id] ?? { value: '', note: '' };
                  const n = parseScore(d.value);
                  return (
                    <div key={a.id} className="grid gap-2 rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor={`sc-${a.id}`} className="font-medium">
                          {a.name}
                        </Label>
                        <span className="text-muted-foreground text-xs">
                          {t('weight', { weight: a.weight })}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          aria-label={a.name}
                          disabled={!data.canWrite}
                          value={n ?? 0}
                          onChange={(e) => setDrafts({ ...drafts, [a.id]: { ...d, value: e.target.value } })}
                          className="h-2 flex-1 accent-orange-500"
                        />
                        <Input
                          id={`sc-${a.id}`}
                          inputMode="numeric"
                          maxLength={3}
                          className="w-16 text-center"
                          aria-invalid={d.value.trim() !== '' && n === null}
                          disabled={!data.canWrite}
                          value={d.value}
                          onChange={(e) => setDrafts({ ...drafts, [a.id]: { ...d, value: e.target.value } })}
                        />
                      </div>
                      <Input
                        maxLength={500}
                        aria-label={`${t('note')}: ${a.name}`}
                        placeholder={t('note')}
                        disabled={!data.canWrite}
                        value={d.note}
                        onChange={(e) => setDrafts({ ...drafts, [a.id]: { ...d, note: e.target.value } })}
                      />
                    </div>
                  );
                })}
                {scoreInvalid && <p className="text-destructive text-xs">{t('scoreRange')}</p>}
                {scoreError && (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{scoreError}</AlertDescription>
                  </Alert>
                )}
                {scoreSaved && !scoreError && (
                  <p
                    className="flex items-center gap-1.5 text-sm text-teal-700 dark:text-teal-300"
                    role="status"
                  >
                    <CheckCircle2 className="size-4" aria-hidden /> {t('scoresSaved')}
                  </p>
                )}
                {data.canWrite && (
                  <Button type="submit" size="lg" disabled={scoreInvalid || saveScores.isPending}>
                    {t('saveScores')}
                  </Button>
                )}
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}
