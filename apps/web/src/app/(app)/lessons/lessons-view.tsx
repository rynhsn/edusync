'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCheck, ClipboardList, Clock, Hourglass, UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ENTER, STATUS_TONE, stagger } from '@/components/access-kit';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, MODULE_TONE, PersonCell, StatCard, StatGrid, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { nowHm as schoolNowHm, todayIso } from '@/lib/school-time';
import { cn } from '@/lib/utils';

const STATUSES = ['present', 'excused', 'sick', 'absent'] as const;
type Status = (typeof STATUSES)[number];

const ACTIVE_STYLE: Record<Status, string> = {
  present: 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-600/90',
  excused: 'bg-sky-600 text-white border-sky-600 hover:bg-sky-600/90',
  sick: 'bg-amber-500 text-white border-amber-500 hover:bg-amber-500/90',
  absent: 'bg-red-600 text-white border-red-600 hover:bg-red-600/90',
};

function LessonSheet({ entryId, date, onClose }: { entryId: string; date: string; onClose: () => void }) {
  const t = useTranslations('gate');
  const ta = useTranslations('attendance');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [marks, setMarks] = useState<Record<string, Status | null>>({});
  const [dirty, setDirty] = useState(false);

  const sheet = useQuery({
    queryKey: ['lesson-sheet', school.schoolId, entryId, date],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/lesson-attendance', {
          params: { ...header, query: { scheduleEntryId: entryId, date } },
        }),
      ),
  });
  useEffect(() => {
    if (!sheet.data) return;
    setMarks(Object.fromEntries(sheet.data.students.map((s) => [s.studentId, s.status])));
    setDirty(false);
  }, [sheet.data]);

  const save = useMutation({
    mutationFn: async () => {
      const records = Object.entries(marks)
        .filter((entry): entry is [string, Status] => entry[1] !== null)
        .map(([studentId, status]) => ({ studentId, status, note: null }));
      return unwrap(
        await api.PUT('/v1/lesson-attendance', {
          params: header,
          body: { scheduleEntryId: entryId, date, records },
        }),
      );
    },
    onSuccess: (r) => {
      toast.success(
        r.substitute ? t('savedSubstitute', { count: r.saved }) : ta('saved', { count: r.saved }),
      );
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['lessons', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['lesson-sheet', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (sheet.isPending) return <Skeleton className="h-48 w-full" />;
  if (!sheet.data) return null;
  const { students, canRecord, substitute } = sheet.data;
  const filled = Object.values(marks).filter((m) => m !== null).length;
  const set = (id: string, status: Status) => {
    setMarks((m) => ({ ...m, [id]: status }));
    setDirty(true);
  };

  return (
    <section className={cn(ENTER, 'bg-card grid gap-4 rounded-2xl border p-4 sm:p-5')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            ← {t('back')}
          </Button>
          {substitute && canRecord && <ToneBadge tone="amber">{t('substituteBadge')}</ToneBadge>}
          <span className="text-muted-foreground text-xs tabular-nums">
            {t('markedCount', { filled, total: students.length })}
          </span>
        </div>
        {canRecord && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setMarks(Object.fromEntries(students.map((s) => [s.studentId, 'present' as Status])));
                setDirty(true);
              }}
            >
              <CheckCheck className="size-4" /> {ta('allPresent')}
            </Button>
            <Button disabled={!dirty || filled === 0 || save.isPending} onClick={() => save.mutate()}>
              {ta('save')}
            </Button>
          </div>
        )}
      </div>
      {!canRecord && (
        <Alert>
          <AlertDescription>{t('notYourLesson')}</AlertDescription>
        </Alert>
      )}
      <ul className="divide-y rounded-xl border">
        {students.map((s, i) => (
          <li
            key={s.studentId}
            style={stagger(i)}
            className={cn(
              ENTER,
              'grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4 sm:px-4',
            )}
          >
            <PersonCell name={s.name} sub={s.nis ? <span className="font-mono">{s.nis}</span> : undefined} />
            <div className="flex items-center gap-2 sm:justify-end">
              <span className="text-muted-foreground text-xs">{t('atGate')}</span>
              {s.gate ? (
                <ToneBadge tone={STATUS_TONE[s.gate as keyof typeof STATUS_TONE] ?? 'slate'}>
                  {t(`status_${s.gate}`)}
                </ToneBadge>
              ) : (
                <span className="text-muted-foreground text-xs">{t('noTap')}</span>
              )}
            </div>
            <fieldset className="m-0 inline-flex gap-1 border-0 p-0 sm:justify-end">
              <legend className="sr-only">{`${ta('status')} ${s.name}`}</legend>
              {STATUSES.map((st) => (
                <Button
                  key={st}
                  size="sm"
                  variant="outline"
                  disabled={!canRecord}
                  aria-pressed={marks[s.studentId] === st}
                  title={ta(st)}
                  className={cn('min-w-9 flex-1 sm:flex-none', marks[s.studentId] === st && ACTIVE_STYLE[st])}
                  onClick={() => set(s.studentId, st)}
                >
                  <span className="sm:hidden">{ta(`short.${st}`)}</span>
                  <span className="hidden sm:inline">{ta(st)}</span>
                </Button>
              ))}
            </fieldset>
          </li>
        ))}
      </ul>
      {dirty && <p className="text-muted-foreground text-sm">{ta('unsaved')}</p>}
    </section>
  );
}

/** Absensi per jam pelajaran: daftar jam pada satu tanggal, lalu lembar absensi satu jam. */
export function LessonsView() {
  const t = useTranslations('gate');
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [date, setDate] = useState(todayIso());
  const [open, setOpen] = useState<string | null>(null);

  const lessons = useQuery({
    queryKey: ['lessons', school.schoolId, date],
    queryFn: async () => unwrap(await api.GET('/v1/lessons', { params: { ...header, query: { date } } })),
  });

  const items = lessons.data?.lessons ?? [];
  const isToday = date === todayIso();
  const nowHm = schoolNowHm();
  const complete = items.filter((l) => l.total > 0 && l.filled >= l.total).length;

  return (
    <PageBody>
      <PageHeader
        icon={CalendarClock}
        tone={MODULE_TONE.attendance}
        title={t('lessonsTitle')}
        description={lessons.data?.canCover ? t('lessonsSubtitleCover') : t('lessonsSubtitle')}
        actions={
          <div className="w-52">
            <DatePicker
              aria-label={t('date')}
              value={date}
              onChange={(v) => {
                if (v) {
                  setDate(v);
                  setOpen(null);
                }
              }}
            />
          </div>
        }
      />
      {lessons.isPending && (
        <div className="grid gap-4" aria-busy>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        </div>
      )}
      {lessons.data?.closed && (
        <Alert>
          <AlertDescription>{t('closedToday', { title: lessons.data.closed.title })}</AlertDescription>
        </Alert>
      )}

      {lessons.data && items.length > 0 && !open && (
        <StatGrid className={ENTER}>
          <StatCard
            label={t('lessonsTotal')}
            value={items.length}
            icon={ClipboardList}
            tone={MODULE_TONE.attendance}
          />
          <StatCard
            label={t('lessonsComplete')}
            value={complete}
            icon={CheckCheck}
            tone="emerald"
            progress={(complete / items.length) * 100}
          />
          <StatCard label={t('lessonsOpen')} value={items.length - complete} icon={Hourglass} tone="amber" />
          <StatCard
            label={t('mine')}
            value={items.filter((l) => l.mine).length}
            icon={UserCheck}
            tone="violet"
          />
        </StatGrid>
      )}

      {lessons.data && items.length === 0 && (
        <EmptyPanel
          icon={CalendarClock}
          tone={MODULE_TONE.attendance}
          title={t('noLessonsTitle')}
          body={t('noLessons')}
        />
      )}
      {open ? (
        <LessonSheet entryId={open} date={date} onClose={() => setOpen(null)} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((l, i) => {
            const done = l.total > 0 && l.filled >= l.total;
            const partial = !done && l.filled > 0;
            const live = isToday && l.startsAt.slice(0, 5) <= nowHm && nowHm < l.endsAt.slice(0, 5);
            const pct = l.total > 0 ? (l.filled / l.total) * 100 : 0;
            return (
              <article
                key={l.id}
                style={stagger(i)}
                className={cn(
                  ENTER,
                  'bg-card relative grid content-start gap-3 overflow-hidden rounded-2xl border p-4',
                  live && 'ring-2 ring-sky-500/40',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-100 text-center text-sky-800 dark:bg-sky-500/15 dark:text-sky-200"
                    >
                      <span className="font-heading text-lg leading-none font-semibold">
                        {l.periodNumber}
                      </span>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.subjectName}</p>
                      <p className="text-muted-foreground truncate text-sm">{l.className}</p>
                    </div>
                  </div>
                  {l.mine && <ToneBadge tone="violet">{t('mine')}</ToneBadge>}
                </div>
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock aria-hidden className="size-3.5" />
                    {t('period', { n: l.periodNumber })} · {l.startsAt.slice(0, 5)}–{l.endsAt.slice(0, 5)}
                  </span>
                  <span className="truncate">{l.teacherName}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {live && <ToneBadge tone="sky">{t('statusNow')}</ToneBadge>}
                  <ToneBadge tone={done ? 'emerald' : partial ? 'amber' : 'slate'}>
                    {done ? t('statusDone') : partial ? t('statusPartial') : t('statusEmpty')}
                  </ToneBadge>
                </div>
                <div>
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width] duration-500',
                        done ? 'bg-emerald-500' : 'bg-amber-500',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                    {t('filled', { filled: l.filled, total: l.total })}
                  </p>
                </div>
                <Button variant={done ? 'outline' : 'default'} onClick={() => setOpen(l.id)}>
                  {l.mine ? t('fill') : t('cover')}
                </Button>
              </article>
            );
          })}
        </div>
      )}
    </PageBody>
  );
}
