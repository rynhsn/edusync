'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  Clock,
  LayoutGrid,
  Plus,
  Shapes,
  Trash2,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, MODULE_TONE, StatCard, StatGrid, TONES, type Tone, Toolbar } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';

const WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;
type Weekday = (typeof WEEKDAYS)[number];
const TONE = MODULE_TONE.academic;

/** Warna mata pelajaran yang stabil menurut namanya, supaya satu mapel selalu sewarna di seluruh jadwal. */
const SUBJECT_TONES: Tone[] = ['violet', 'sky', 'teal', 'amber', 'rose', 'emerald'];
function subjectTone(name: string): Tone {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SUBJECT_TONES[h % SUBJECT_TONES.length] ?? 'violet';
}

/** Hari ini (Senin=1 ... Sabtu=6) menurut zona waktu sekolah; null pada hari Minggu. */
function todayWeekday(): Weekday | null {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short' }).format(
    new Date(),
  );
  const n = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short) + 1;
  return n > 0 ? (n as Weekday) : null;
}

/** Dialog pengaturan jam pelajaran: buat otomatis, tambah, dan hapus. */
function PeriodsDialog({
  open,
  onOpenChange,
  periods,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periods: { id: string; number: number; startsAt: string; endsAt: string }[];
}) {
  const t = useTranslations('schedule');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['lesson-periods', school.schoolId] });

  const [gen, setGen] = useState({
    firstStart: '07:00',
    count: '8',
    minutes: '40',
    breakAfter: '',
    breakMinutes: '15',
  });
  const [add, setAdd] = useState({ number: '', startsAt: '', endsAt: '' });
  const [error, setError] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/lesson-periods/generate', {
          params: header,
          body: {
            firstStart: gen.firstStart,
            count: Number(gen.count),
            minutes: Number(gen.minutes),
            ...(gen.breakAfter
              ? { breakAfter: Number(gen.breakAfter), breakMinutes: Number(gen.breakMinutes) }
              : {}),
          },
        }),
      ),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/lesson-periods', {
          params: header,
          body: { number: Number(add.number), startsAt: add.startsAt, endsAt: add.endsAt },
        }),
      ),
    onSuccess: () => {
      setError(null);
      setAdd({ number: '', startsAt: '', endsAt: '' });
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/lesson-periods/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => refresh(),
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const nextNumber = String((periods.at(-1)?.number ?? 0) + 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">{t('periods')}</DialogTitle>
          <DialogDescription>{t('periodsHint')}</DialogDescription>
        </DialogHeader>

        {periods.length > 0 ? (
          <ul className="divide-y rounded-lg border text-sm">
            {periods.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>
                  <span className="font-medium">{p.number}</span>
                  <span className="text-muted-foreground ml-3 tabular-nums">
                    {p.startsAt} – {p.endsAt}
                  </span>
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('delete')}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(p.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <form
            className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              generate.mutate();
            }}
          >
            <p className="text-muted-foreground text-sm sm:col-span-3">{t('generateHint')}</p>
            <div className="grid gap-1.5">
              <Label htmlFor="gen-start">{t('firstStart')}</Label>
              <Input
                id="gen-start"
                type="time"
                required
                value={gen.firstStart}
                onChange={(e) => setGen({ ...gen, firstStart: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="gen-count">{t('count')}</Label>
              <Input
                id="gen-count"
                type="number"
                min={1}
                max={14}
                required
                value={gen.count}
                onChange={(e) => setGen({ ...gen, count: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="gen-min">{t('minutes')}</Label>
              <Input
                id="gen-min"
                type="number"
                min={10}
                max={120}
                required
                value={gen.minutes}
                onChange={(e) => setGen({ ...gen, minutes: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="gen-break">{t('breakAfter')}</Label>
              <Input
                id="gen-break"
                type="number"
                min={1}
                max={13}
                placeholder={t('noBreak')}
                value={gen.breakAfter}
                onChange={(e) => setGen({ ...gen, breakAfter: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="gen-breakmin">{t('breakMinutes')}</Label>
              <Input
                id="gen-breakmin"
                type="number"
                min={5}
                max={90}
                value={gen.breakMinutes}
                onChange={(e) => setGen({ ...gen, breakMinutes: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={generate.isPending}>
                {t('generate')}
              </Button>
            </div>
          </form>
        )}

        <form
          className="grid gap-3 sm:grid-cols-[5rem_1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="pd-number">{t('number')}</Label>
            <Input
              id="pd-number"
              type="number"
              min={1}
              max={20}
              required
              placeholder={nextNumber}
              value={add.number}
              onChange={(e) => setAdd({ ...add, number: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pd-start">{t('starts')}</Label>
            <Input
              id="pd-start"
              type="time"
              required
              value={add.startsAt}
              onChange={(e) => setAdd({ ...add, startsAt: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pd-end">{t('ends')}</Label>
            <Input
              id="pd-end"
              type="time"
              required
              value={add.endsAt}
              onChange={(e) => setAdd({ ...add, endsAt: e.target.value })}
            />
          </div>
          <Button type="submit" variant="outline" disabled={create.isPending}>
            <Plus className="size-4" /> {t('addPeriod')}
          </Button>
        </form>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ScheduleView() {
  const t = useTranslations('schedule');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('schedule:manage');

  const [mode, setMode] = useState<'class' | 'teacher'>('class');
  const today = todayWeekday();
  const [dayPick, setDayPick] = useState<Weekday>(today ?? 1);
  const [classChoice, setClassChoice] = useState('');
  const [teacherChoice, setTeacherChoice] = useState('');
  const [periodsOpen, setPeriodsOpen] = useState(false);
  const [cell, setCell] = useState<{
    weekday: Weekday;
    periodId: string;
    label: string;
    subjectId: string;
  } | null>(null);

  const periods = useQuery({
    queryKey: ['lesson-periods', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/lesson-periods', { params: header })),
  });
  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const activeYear = years.data?.find((y) => y.isActive);
  const classes = useQuery({
    queryKey: ['classes', school.schoolId, activeYear?.id],
    enabled: !!activeYear && can('class:read'),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: activeYear?.id } } }),
      ),
  });
  const teachers = useQuery({
    queryKey: ['teachers', school.schoolId, ''],
    enabled: can('teacher:read'),
    queryFn: async () => unwrap(await api.GET('/v1/teachers', { params: { ...header, query: {} } })),
  });

  const classList = classes.data ?? [];
  const teacherList = (teachers.data ?? []).filter((x) => x.status === 'active');
  const classId = classChoice || classList[0]?.id || '';
  const teacherId = teacherChoice || teacherList[0]?.id || '';
  const target = mode === 'class' ? classId : teacherId;

  const schedule = useQuery({
    queryKey: ['schedule', school.schoolId, mode, target],
    enabled: !!target,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/schedule', {
          params: { ...header, query: mode === 'class' ? { classId: target } : { teacherId: target } },
        }),
      ),
  });
  const assignments = useQuery({
    queryKey: ['assignments', school.schoolId, classId],
    enabled: mode === 'class' && !!classId && can('class:read'),
    queryFn: async () =>
      unwrap(await api.GET('/v1/classes/{id}/assignments', { params: { ...header, path: { id: classId } } })),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['schedule', school.schoolId] });
  const [cellError, setCellError] = useState<string | null>(null);

  const setCellMutation = useMutation({
    mutationFn: async (v: { weekday: Weekday; periodId: string; subjectId: string }) =>
      unwrap(await api.PUT('/v1/schedule/cell', { params: header, body: { classId, ...v } })),
    onSuccess: () => {
      toast.success(t('saved'));
      setCell(null);
      refresh();
    },
    onError: (e) => setCellError(te(errorKey(e))),
  });
  const clearCell = useMutation({
    mutationFn: async (v: { weekday: Weekday; periodId: string }) =>
      unwrap(await api.DELETE('/v1/schedule/cell', { params: { ...header, query: { classId, ...v } } })),
    onSuccess: () => {
      toast.success(t('cleared'));
      setCell(null);
      refresh();
    },
    onError: (e) => setCellError(te(errorKey(e))),
  });

  const entryAt = (weekday: number, periodId: string) =>
    schedule.data?.find((e) => e.weekday === weekday && e.periodId === periodId);
  const noPeriods = periods.data?.length === 0;

  const entries = schedule.data ?? [];
  const periodList = periods.data ?? [];
  const slotCount = periodList.length * WEEKDAYS.length;
  const distinct = (pick: (e: (typeof entries)[number]) => string) => new Set(entries.map(pick)).size;
  const todayCount = today ? entries.filter((e) => e.weekday === today).length : 0;
  const editable = manage && mode === 'class';
  const showGrid = periodList.length > 0 && !!target;

  const openCell = (d: Weekday, p: (typeof periodList)[number]) => {
    const e = entryAt(d, p.id);
    setCellError(null);
    setCell({
      weekday: d,
      periodId: p.id,
      label: `${t(`days.${d}`)} · ${p.number}`,
      subjectId: e?.subjectId ?? '',
    });
  };

  /** Isi satu sel jadwal: kartu berwarna menurut mata pelajaran, atau slot kosong yang bisa diisi. */
  const renderLesson = (d: Weekday, p: (typeof periodList)[number]) => {
    const e = entryAt(d, p.id);
    const inner = e ? (
      <span
        className={cn(
          'relative block h-full min-h-14 overflow-hidden rounded-lg py-2 pr-2.5 pl-3.5 text-left',
          TONES[subjectTone(e.subjectName)].soft,
        )}
      >
        <span
          aria-hidden
          className={cn('absolute inset-y-0 left-0 w-1', TONES[subjectTone(e.subjectName)].bar)}
        />
        <span className="block text-sm leading-tight font-semibold break-words">
          {mode === 'class' ? e.subjectName : e.className}
        </span>
        <span className="mt-0.5 block text-xs leading-tight break-words opacity-80">
          {mode === 'class' ? e.teacherName : e.subjectName}
        </span>
      </span>
    ) : (
      <span
        className={cn(
          'text-muted-foreground/70 grid h-full min-h-14 place-items-center rounded-lg border border-dashed text-xs',
          editable && 'group-hover/cell:border-violet-400 group-hover/cell:text-violet-600',
        )}
      >
        {editable ? <Plus aria-hidden className="size-4" /> : <span aria-hidden>·</span>}
      </span>
    );
    if (!editable) {
      return e ? inner : <span className="sr-only">{t('free')}</span>;
    }
    return (
      <button
        type="button"
        aria-label={`${t(e ? 'editCell' : 'fillCell')}: ${t(`days.${d}`)} · ${p.number}`}
        className="group/cell focus-visible:ring-ring/60 block h-full w-full rounded-lg outline-none transition-transform focus-visible:ring-2 motion-safe:active:scale-[0.98]"
        onClick={() => openCell(d, p)}
      >
        {inner}
      </button>
    );
  };

  return (
    <PageBody>
      <PageHeader
        icon={CalendarDays}
        tone={TONE}
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${t('readOnly')}`}
        actions={
          manage && (
            <Button variant="outline" onClick={() => setPeriodsOpen(true)}>
              <Clock className="size-4" /> {t('periods')}
            </Button>
          )
        }
      />

      {showGrid && !schedule.isPending && (
        <StatGrid className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">
          <StatCard
            icon={BookOpen}
            tone={TONE}
            label={t('statLessons')}
            value={entries.length}
            hint={t('statLessonsHint', { periods: periodList.length })}
          />
          <StatCard
            icon={CalendarCheck}
            tone="sky"
            label={t('statToday')}
            value={todayCount}
            hint={today ? t(`days.${today as Weekday}`) : t('statWeekend')}
          />
          <StatCard
            icon={mode === 'class' ? Shapes : Users}
            tone="emerald"
            label={mode === 'class' ? t('statSubjects') : t('statClasses')}
            value={distinct((e) => (mode === 'class' ? e.subjectName : e.className))}
          />
          <StatCard
            icon={LayoutGrid}
            tone="amber"
            label={t('statFill')}
            value={`${slotCount ? Math.round((entries.length / slotCount) * 100) : 0}%`}
            hint={t('statFillHint', { filled: entries.length, total: slotCount })}
            progress={slotCount ? (entries.length / slotCount) * 100 : 0}
          />
        </StatGrid>
      )}

      <Toolbar>
        {can('teacher:read') && (
          <fieldset
            aria-label={t('view')}
            className="bg-muted m-0 inline-flex min-w-0 rounded-xl border-0 p-0.5"
          >
            {(['class', 'teacher'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'focus-visible:ring-ring/60 rounded-[10px] px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2',
                  mode === m
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(m === 'class' ? 'byClass' : 'byTeacher')}
              </button>
            ))}
          </fieldset>
        )}
        {mode === 'class' ? (
          <SelectField
            aria-label={t('class')}
            className="sm:w-52"
            value={classId}
            onChange={(e) => setClassChoice(e.target.value)}
          >
            {classList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <SelectField
            aria-label={t('teacher')}
            className="sm:w-64"
            value={teacherId}
            onChange={(e) => setTeacherChoice(e.target.value)}
          >
            {teacherList.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </SelectField>
        )}
      </Toolbar>

      {(periods.isPending || years.isPending || (!!target && schedule.isPending)) && (
        <div className="grid gap-3" aria-busy>
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
            {['a', 'b', 'c', 'd', 'e', 'f'].slice(0, 6).map((k) => (
              <Skeleton key={k} className="h-16 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      )}
      {noPeriods && (
        <EmptyPanel
          icon={Clock}
          tone={TONE}
          title={t('noPeriodsTitle')}
          body={t('noPeriods')}
          action={
            manage && (
              <Button onClick={() => setPeriodsOpen(true)}>
                <Clock className="size-4" /> {t('periods')}
              </Button>
            )
          }
        />
      )}
      {!periods.isPending && !years.isPending && classList.length === 0 && mode === 'class' && !noPeriods && (
        <EmptyPanel icon={Shapes} tone={TONE} title={t('noClassesTitle')} body={t('noClasses')} />
      )}

      {showGrid && !schedule.isPending && (
        <>
          {/* Layar lebar: grid mingguan, kolom hari ini disorot. */}
          <div className="bg-card hidden overflow-hidden rounded-2xl border lg:block motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
            <table className="w-full table-fixed border-collapse text-sm">
              <caption className="sr-only">{t('title')}</caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="text-muted-foreground w-24 border-b px-3 py-3 text-left text-xs font-medium"
                  >
                    {t('period')}
                  </th>
                  {WEEKDAYS.map((d) => (
                    <th
                      key={d}
                      scope="col"
                      aria-current={d === today ? 'date' : undefined}
                      className={cn(
                        'border-b border-l px-3 py-3 text-left text-xs font-semibold',
                        d === today ? cn(TONES[TONE].soft) : 'text-muted-foreground',
                      )}
                    >
                      {t(`days.${d}`)}
                      {d === today && (
                        <span className="ml-1.5 rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-medium text-white dark:bg-violet-400 dark:text-violet-950">
                          {t('today')}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periodList.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" className="border-b px-3 py-2 text-left align-middle font-normal">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="font-heading bg-muted grid size-7 shrink-0 place-items-center rounded-lg text-sm font-semibold"
                        >
                          {p.number}
                        </span>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {p.startsAt}
                          <br />
                          {p.endsAt}
                        </span>
                      </span>
                    </th>
                    {WEEKDAYS.map((d) => (
                      <td
                        key={d}
                        className={cn(
                          'h-[4.5rem] border-b border-l p-1.5 align-top',
                          d === today && 'bg-violet-50/70 dark:bg-violet-500/[0.06]',
                        )}
                      >
                        {renderLesson(d, p)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Layar sempit: agenda harian dengan pemilih hari. */}
          <div className="grid gap-3 lg:hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
            <div
              role="tablist"
              aria-label={t('view')}
              className="bg-card flex gap-1 overflow-x-auto rounded-2xl border p-1"
            >
              {WEEKDAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={dayPick === d}
                  onClick={() => setDayPick(d)}
                  className={cn(
                    'focus-visible:ring-ring/60 flex min-w-14 flex-1 flex-col items-center rounded-xl px-2 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2',
                    dayPick === d ? TONES[TONE].solid : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <span>{t(`days.${d}`).slice(0, 3)}</span>
                  {d === today && (
                    <span
                      aria-hidden
                      className={cn(
                        'mt-0.5 size-1 rounded-full',
                        dayPick === d ? 'bg-current' : 'bg-violet-500',
                      )}
                    />
                  )}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground px-1 text-xs">
              {t(`days.${dayPick}`)}
              {dayPick === today && ` · ${t('today')}`} ·{' '}
              {t('lessonsCount', { count: entries.filter((e) => e.weekday === dayPick).length })}
            </p>
            <ul className="grid gap-2">
              {periodList.map((p) => (
                <li key={p.id} className="flex items-stretch gap-3">
                  <div className="w-14 shrink-0 pt-1 text-right">
                    <p className="font-heading text-sm font-semibold">{p.number}</p>
                    <p className="text-muted-foreground text-[11px] leading-tight tabular-nums">
                      {p.startsAt}
                      <br />
                      {p.endsAt}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">{renderLesson(dayPick, p)}</div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <PeriodsDialog open={periodsOpen} onOpenChange={setPeriodsOpen} periods={periods.data ?? []} />

      <Dialog open={!!cell} onOpenChange={(open) => !open && setCell(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">{cell?.label}</DialogTitle>
            <DialogDescription>{t('pickSubjectHint')}</DialogDescription>
          </DialogHeader>
          {assignments.data?.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('noSubjects')}</p>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="cell-subject">{t('pickSubject')}</Label>
              <SelectField
                id="cell-subject"
                value={cell?.subjectId ?? ''}
                onChange={(e) => cell && setCell({ ...cell, subjectId: e.target.value })}
              >
                <option value="">{t('choose')}</option>
                {assignments.data?.map((a) => (
                  <option key={a.subjectId} value={a.subjectId}>
                    {a.subjectName} · {a.teacherName}
                  </option>
                ))}
              </SelectField>
            </div>
          )}
          {cellError && (
            <Alert variant="destructive">
              <AlertDescription>{cellError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            {cell && entryAt(cell.weekday, cell.periodId) && (
              <Button
                variant="ghost"
                className="sm:mr-auto"
                disabled={clearCell.isPending}
                onClick={() => cell && clearCell.mutate({ weekday: cell.weekday, periodId: cell.periodId })}
              >
                {t('clear')}
              </Button>
            )}
            <Button
              disabled={!cell?.subjectId || setCellMutation.isPending}
              onClick={() =>
                cell &&
                setCellMutation.mutate({
                  weekday: cell.weekday,
                  periodId: cell.periodId,
                  subjectId: cell.subjectId,
                })
              }
            >
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageBody>
  );
}
