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
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FieldError, TOUCH_INPUT, TOUCH_SELECT, useFormValidation } from '@/components/form-field-error';
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
import { TimeField } from '@/components/ui/time-field';
import { EmptyPanel, MODULE_TONE, StatCard, StatGrid, TONES, type Tone, Toolbar } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { useSchoolSettings } from '@/lib/school-settings';
import { todayWeekdayNumber } from '@/lib/school-time';
import { semesterLabel } from '@/lib/semester-label';
import { cn } from '@/lib/utils';
import {
  GENERATE_ORDER,
  type GenerateField,
  PERIOD_ORDER,
  type PeriodField,
  validateGenerate,
  validatePeriod,
} from './schedule-validation';

type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const TONE = MODULE_TONE.academic;

/** Warna mata pelajaran yang stabil menurut namanya, supaya satu mapel selalu sewarna di seluruh jadwal. */
const SUBJECT_TONES: Tone[] = ['violet', 'sky', 'teal', 'amber', 'rose', 'emerald'];
function subjectTone(name: string): Tone {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SUBJECT_TONES[h % SUBJECT_TONES.length] ?? 'violet';
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
  const { settings } = useSchoolSettings();

  const [gen, setGen] = useState({
    firstStart: settings.lessonDefaultStart,
    count: '8',
    minutes: String(settings.lessonDefaultMinutes),
    breakAfter: '',
    breakMinutes: '15',
  });
  // Pengaturan sekolah baru tiba setelah dialog terpasang: selaraskan isian bawaan.
  useEffect(() => {
    setGen((g) => ({
      ...g,
      firstStart: settings.lessonDefaultStart,
      minutes: String(settings.lessonDefaultMinutes),
    }));
  }, [settings.lessonDefaultStart, settings.lessonDefaultMinutes]);
  const [add, setAdd] = useState({ number: '', startsAt: '', endsAt: '' });
  const [error, setError] = useState<string | null>(null);
  const tv = useTranslations('formValidation');
  const genValidation = useFormValidation<GenerateField>({
    errors: validateGenerate(gen),
    order: GENERATE_ORDER,
    idPrefix: 'gen',
  });
  const addValidation = useFormValidation<PeriodField>({
    errors: validatePeriod(add),
    order: PERIOD_ORDER,
    idPrefix: 'pd',
  });

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
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!genValidation.attempt()) return;
              generate.mutate();
            }}
          >
            <p className="text-muted-foreground text-sm sm:col-span-3">{t('generateHint')}</p>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="gen-firstStart">{t('firstStart')}</Label>
              <TimeField
                {...genValidation.fieldProps('firstStart')}
                className={TOUCH_INPUT}
                value={gen.firstStart}
                onChange={(v) => setGen({ ...gen, firstStart: v })}
              />
              <FieldError id={genValidation.idOf('firstStart')} issue={genValidation.issue('firstStart')} />
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="gen-count">{t('count')}</Label>
              <Input
                {...genValidation.fieldProps('count')}
                className={TOUCH_INPUT}
                type="number"
                inputMode="numeric"
                aria-required="true"
                value={gen.count}
                onChange={(e) => setGen({ ...gen, count: e.target.value })}
              />
              <FieldError id={genValidation.idOf('count')} issue={genValidation.issue('count')} />
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="gen-minutes">{t('minutes')}</Label>
              <Input
                {...genValidation.fieldProps('minutes')}
                className={TOUCH_INPUT}
                type="number"
                inputMode="numeric"
                aria-required="true"
                value={gen.minutes}
                onChange={(e) => setGen({ ...gen, minutes: e.target.value })}
              />
              <FieldError id={genValidation.idOf('minutes')} issue={genValidation.issue('minutes')} />
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="gen-breakAfter">{t('breakAfter')}</Label>
              <Input
                {...genValidation.fieldProps('breakAfter')}
                className={TOUCH_INPUT}
                type="number"
                inputMode="numeric"
                placeholder={t('noBreak')}
                value={gen.breakAfter}
                onChange={(e) => setGen({ ...gen, breakAfter: e.target.value })}
              />
              <FieldError id={genValidation.idOf('breakAfter')} issue={genValidation.issue('breakAfter')} />
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="gen-breakMinutes">{t('breakMinutes')}</Label>
              <Input
                {...genValidation.fieldProps('breakMinutes')}
                className={TOUCH_INPUT}
                type="number"
                inputMode="numeric"
                value={gen.breakMinutes}
                onChange={(e) => setGen({ ...gen, breakMinutes: e.target.value })}
              />
              <FieldError
                id={genValidation.idOf('breakMinutes')}
                issue={genValidation.issue('breakMinutes')}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="h-10 md:h-8" disabled={generate.isPending}>
                {t('generate')}
              </Button>
            </div>
            {genValidation.summary && (
              <p aria-live="polite" className="text-destructive text-sm sm:col-span-3">
                {tv('summary')}
              </p>
            )}
          </form>
        )}

        <form
          className="grid gap-3 sm:grid-cols-[5rem_1fr_1fr_auto] sm:items-start"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!addValidation.attempt()) return;
            create.mutate();
          }}
        >
          <div className="grid content-start gap-1.5">
            <Label htmlFor="pd-number">{t('number')}</Label>
            <Input
              {...addValidation.fieldProps('number')}
              className={TOUCH_INPUT}
              type="number"
              inputMode="numeric"
              aria-required="true"
              placeholder={nextNumber}
              value={add.number}
              onChange={(e) => setAdd({ ...add, number: e.target.value })}
            />
            <FieldError id={addValidation.idOf('number')} issue={addValidation.issue('number')} />
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="pd-startsAt">{t('starts')}</Label>
            <TimeField
              {...addValidation.fieldProps('startsAt')}
              className={TOUCH_INPUT}
              value={add.startsAt}
              onChange={(v) => setAdd({ ...add, startsAt: v })}
            />
            <FieldError id={addValidation.idOf('startsAt')} issue={addValidation.issue('startsAt')} />
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="pd-endsAt">{t('ends')}</Label>
            <TimeField
              {...addValidation.fieldProps('endsAt')}
              className={TOUCH_INPUT}
              value={add.endsAt}
              onChange={(v) => setAdd({ ...add, endsAt: v })}
            />
            <FieldError id={addValidation.idOf('endsAt')} issue={addValidation.issue('endsAt')} />
          </div>
          <Button
            type="submit"
            variant="outline"
            className="h-10 sm:mt-[1.625rem] md:h-8"
            disabled={create.isPending}
          >
            <Plus className="size-4" /> {t('addPeriod')}
          </Button>
          {addValidation.summary && (
            <p aria-live="polite" className="text-destructive text-sm sm:col-span-4">
              {tv('summary')}
            </p>
          )}
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
  const { settings } = useSchoolSettings();
  const weekdays = settings.workingDays as Weekday[];
  const todayNumber = todayWeekdayNumber() as Weekday;
  const today = weekdays.includes(todayNumber) ? todayNumber : null;
  const [dayPick, setDayPick] = useState<Weekday>(today ?? weekdays[0] ?? 1);
  const [classChoice, setClassChoice] = useState('');
  const [teacherChoice, setTeacherChoice] = useState('');
  const [scopeChoice, setScopeChoice] = useState('');
  const [periodsOpen, setPeriodsOpen] = useState(false);
  const [cell, setCell] = useState<{
    weekday: Weekday;
    periodId: string;
    label: string;
    subjectId: string;
  } | null>(null);
  // Sel yang sudah dicoba disimpan tanpa memilih mapel; pesan merah tampil untuk sel itu saja.
  const [cellTried, setCellTried] = useState<string | null>(null);
  const cellMissing = !!cell && !cell.subjectId && cellTried === `${cell.weekday}-${cell.periodId}`;

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

  // Cakupan jadwal: kosong = setahun penuh (bawaan); terisi = id semester pada tahun ajaran aktif.
  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, activeYear?.id],
    enabled: !!activeYear,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/semesters', { params: { ...header, query: { academicYearId: activeYear?.id } } }),
      ),
  });
  const semesterList = semesters.data ?? [];
  const scopeId = semesterList.some((s) => s.id === scopeChoice) ? scopeChoice : '';

  const classList = classes.data ?? [];
  const teacherList = (teachers.data ?? []).filter((x) => x.status === 'active');
  const classId = classChoice || classList[0]?.id || '';
  const teacherId = teacherChoice || teacherList[0]?.id || '';
  const target = mode === 'class' ? classId : teacherId;

  const schedule = useQuery({
    queryKey: ['schedule', school.schoolId, mode, target, scopeId],
    enabled: !!target,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/schedule', {
          params: {
            ...header,
            query: {
              ...(mode === 'class' ? { classId: target } : { teacherId: target }),
              ...(scopeId ? { semesterId: scopeId } : {}),
            },
          },
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
      unwrap(
        await api.PUT('/v1/schedule/cell', {
          params: header,
          body: { classId, ...v, ...(scopeId ? { semesterId: scopeId } : {}) },
        }),
      ),
    onSuccess: () => {
      toast.success(t('saved'));
      setCell(null);
      refresh();
    },
    onError: (e) => setCellError(te(errorKey(e))),
  });
  const clearCell = useMutation({
    mutationFn: async (v: { weekday: Weekday; periodId: string }) =>
      unwrap(
        await api.DELETE('/v1/schedule/cell', {
          params: { ...header, query: { classId, ...v, ...(scopeId ? { semesterId: scopeId } : {}) } },
        }),
      ),
    onSuccess: () => {
      toast.success(t('cleared'));
      setCell(null);
      refresh();
    },
    onError: (e) => setCellError(te(errorKey(e))),
  });

  const entryAt = (weekday: number, periodId: string) =>
    schedule.data?.find((e) => e.weekday === weekday && e.periodId === periodId);
  // Sel yang dimiliki cakupan terpilih (bisa diubah/dikosongkan); di cakupan semester, sel setahun penuh hanya tampil.
  const isOwn = (e: { semesterId: string | null }) => (e.semesterId ?? '') === scopeId;
  const ownEntryAt = (weekday: number, periodId: string) => {
    const e = entryAt(weekday, periodId);
    return e && isOwn(e) ? e : undefined;
  };
  const noPeriods = periods.data?.length === 0;

  const entries = schedule.data ?? [];
  const periodList = periods.data ?? [];
  const slotCount = periodList.length * weekdays.length;
  const distinct = (pick: (e: (typeof entries)[number]) => string) => new Set(entries.map(pick)).size;
  const todayCount = today ? entries.filter((e) => e.weekday === today).length : 0;
  const editable = manage && mode === 'class';
  const showGrid = periodList.length > 0 && !!target;

  const openCell = (d: Weekday, p: (typeof periodList)[number]) => {
    const e = ownEntryAt(d, p.id);
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
    // Sel setahun penuh yang tampil di cakupan semester: hanya baca (diredupkan).
    const inherited = !!e && !isOwn(e);
    const inner = e ? (
      <span
        title={inherited ? t('inheritedCell') : undefined}
        className={cn(
          'relative block h-full min-h-14 overflow-hidden rounded-lg py-2 pr-2.5 pl-3.5 text-left',
          TONES[subjectTone(e.subjectName)].soft,
          inherited && 'opacity-60',
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
    if (!editable || inherited) {
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
        {semesterList.length > 0 && (
          <SelectField
            aria-label={t('scope')}
            className="sm:w-56"
            value={scopeId}
            onChange={(e) => setScopeChoice(e.target.value)}
          >
            <option value="">{t('scopeYear')}</option>
            {semesterList.map((s) => (
              <option key={s.id} value={s.id}>
                {semesterLabel(s)}
              </option>
            ))}
          </SelectField>
        )}
      </Toolbar>
      {scopeId && <p className="text-muted-foreground -mt-2 px-1 text-xs">{t('scopeHint')}</p>}

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
                  {weekdays.map((d) => (
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
                    {weekdays.map((d) => (
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
              {weekdays.map((d) => (
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
            <ul className="grid content-start gap-2">
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
            <div className="grid content-start gap-2">
              <Label htmlFor="cell-subject">{t('pickSubject')}</Label>
              <SelectField
                id="cell-subject"
                aria-invalid={cellMissing}
                aria-describedby={cellMissing ? 'cell-subject-error' : undefined}
                className={TOUCH_SELECT}
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
              <FieldError id="cell-subject" issue={cellMissing ? { code: 'choose' } : undefined} />
            </div>
          )}
          {cellError && (
            <Alert variant="destructive">
              <AlertDescription>{cellError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            {cell && ownEntryAt(cell.weekday, cell.periodId) && (
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
              disabled={setCellMutation.isPending}
              onClick={() => {
                if (!cell) return;
                if (!cell.subjectId) {
                  setCellTried(`${cell.weekday}-${cell.periodId}`);
                  document.getElementById('cell-subject')?.focus();
                  return;
                }
                setCellMutation.mutate({
                  weekday: cell.weekday,
                  periodId: cell.periodId,
                  subjectId: cell.subjectId,
                });
              }}
            >
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageBody>
  );
}
