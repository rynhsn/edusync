'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  PartyPopper,
  Plus,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { ConfirmDelete, ListSkeleton, REVEAL, RowMenu } from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import {
  EmptyPanel,
  MODULE_TONE,
  StatCard,
  StatGrid,
  TONES,
  type Tone,
  ToneBadge,
  Toolbar,
} from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';

const TYPES = ['holiday', 'break', 'exam', 'activity'] as const;
type EventType = (typeof TYPES)[number];

interface Draft {
  type: EventType;
  title: string;
  startsOn: string;
  endsOn: string;
  classId: string;
}
const EMPTY: Draft = { type: 'holiday', title: '', startsOn: '', endsOn: '', classId: '' };

/** Warna tiap jenis acara: libur merah, jeda kuning, ujian ungu, kegiatan biru. */
const TYPE_TONE_KEY: Record<EventType, Tone> = {
  holiday: 'rose',
  break: 'amber',
  exam: 'violet',
  activity: 'sky',
};
const TYPE_TONE = {
  holiday: TONES.rose,
  break: TONES.amber,
  exam: TONES.violet,
  activity: TONES.sky,
} as const;

/** Tanggal lokal sebagai YYYY-MM-DD. */
function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Sel grid bulan (YYYY-MM), pekan mulai Senin, selalu kelipatan 7 hari. */
function monthGrid(month: string): { iso: string; day: number; inMonth: boolean; weekend: boolean }[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const count = Math.ceil((lead + new Date(Date.UTC(y, m, 0)).getUTCDate()) / 7) * 7;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1, 1 - lead + i));
    return {
      iso: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === m - 1,
      weekend: i % 7 >= 5,
    };
  });
}

export function CalendarView() {
  const t = useTranslations('calendar');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('academic_year:manage');

  const [yearChoice, setYearChoice] = useState('');
  const [daysPerWeek, setDaysPerWeek] = useState<5 | 6>(5);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const yearId = yearChoice || years.data?.find((y) => y.isActive)?.id || years.data?.[0]?.id || '';

  const calendar = useQuery({
    queryKey: ['calendar', school.schoolId, yearId, daysPerWeek],
    enabled: !!yearId,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/academic-years/{id}/calendar', {
          params: { ...header, path: { id: yearId }, query: { daysPerWeek } },
        }),
      ),
  });
  const classes = useQuery({
    queryKey: ['classes', school.schoolId, yearId],
    enabled: !!yearId && can('class:read'),
    queryFn: async () =>
      unwrap(await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: yearId } } })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['calendar', school.schoolId] });

  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/academic-years/{id}/events', {
          params: { ...header, path: { id: yearId } },
          body: {
            type: draft.type,
            title: draft.title,
            startsOn: draft.startsOn,
            endsOn: draft.endsOn || draft.startsOn,
            scope: draft.classId ? 'class' : 'school',
            classId: draft.classId || null,
            programId: null,
          },
        }),
      ),
    onSuccess: () => {
      setDraft({ ...EMPTY, type: draft.type });
      toast.success(t('created'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/events/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const show = (iso: string) => formatCalendarDate(locale, iso);
  const range = (a: string, b: string) => (a === b ? show(a) : `${show(a)} – ${show(b)}`);
  const classList = classes.data ?? [];
  const className = (id: string | null) => classList.find((c) => c.id === id)?.name;
  const hasYears = (years.data?.length ?? 0) > 0;
  const classScoped = draft.type === 'exam' || draft.type === 'activity';

  // Grid bulan: bulan yang ditampilkan, hari terpilih, dan mode agenda (bulan ini atau semua).
  const [cursor, setCursor] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [agendaAll, setAgendaAll] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const yearRow = years.data?.find((y) => y.id === yearId);
  const todayIso = isoOf(new Date());
  const defaultMonth = (() => {
    const today = todayIso.slice(0, 7);
    if (yearRow && today >= yearRow.startsOn.slice(0, 7) && today <= yearRow.endsOn.slice(0, 7)) return today;
    return (yearRow?.startsOn ?? todayIso).slice(0, 7);
  })();
  const month = cursor ?? defaultMonth;
  const events = calendar.data?.events ?? [];
  const monthDays = monthGrid(month);
  const monthEvents = events.filter((e) => e.startsOn.slice(0, 7) <= month && e.endsOn.slice(0, 7) >= month);
  const covering = (iso: string) => events.filter((e) => e.startsOn <= iso && e.endsOn >= iso);
  const agenda = picked ? covering(picked) : agendaAll ? events : monthEvents;
  const dateLocale = locale === 'su' ? 'id' : locale;
  const monthTitle = new Intl.DateTimeFormat(dateLocale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(dateLocale, { weekday: 'short', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2024, 0, 1 + i)),
    ),
  );
  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number) as [number, number];
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setCursor(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    setPicked(null);
  };

  const addButton = manage ? (
    <FormDialog
      trigger={
        <Button>
          <Plus className="size-4" /> {t('addTitle')}
        </Button>
      }
      title={t('addTitle')}
      submitLabel={t('add')}
      error={error}
      disabled={!draft.title.trim() || !draft.startsOn}
      onOpenChange={() => {
        setDraft(EMPTY);
        setError(null);
      }}
      onSubmit={() => create.mutateAsync()}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="ev-type">{t('type')}</Label>
          <SelectField
            id="ev-type"
            value={draft.type}
            onChange={(e) => {
              const type = e.target.value as EventType;
              // Libur dan jeda selalu berlaku untuk seluruh sekolah.
              setDraft({
                ...draft,
                type,
                classId: type === 'holiday' || type === 'break' ? '' : draft.classId,
              });
            }}
          >
            {TYPES.map((x) => (
              <option key={x} value={x}>
                {t(x)}
              </option>
            ))}
          </SelectField>
        </div>
        {classScoped && classList.length > 0 ? (
          <div className="grid gap-2">
            <Label htmlFor="ev-scope">{t('scope')}</Label>
            <SelectField
              id="ev-scope"
              value={draft.classId}
              onChange={(e) => setDraft({ ...draft, classId: e.target.value })}
            >
              <option value="">{t('scopeSchool')}</option>
              {classList.map((c) => (
                <option key={c.id} value={c.id}>
                  {t('scopeClass')}: {c.name}
                </option>
              ))}
            </SelectField>
          </div>
        ) : (
          <div />
        )}
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="ev-title">{t('eventTitle')}</Label>
          <Input
            id="ev-title"
            required
            maxLength={120}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ev-start">{t('starts')}</Label>
          <DatePicker
            id="ev-start"
            value={draft.startsOn}
            onChange={(v) => setDraft({ ...draft, startsOn: v })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ev-end">{t('ends')}</Label>
          <DatePicker
            id="ev-end"
            clearable
            value={draft.endsOn}
            onChange={(v) => setDraft({ ...draft, endsOn: v })}
          />
        </div>
      </div>
    </FormDialog>
  ) : null;

  return (
    <PageBody>
      <PageHeader
        icon={CalendarDays}
        tone={MODULE_TONE.master}
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${t('readOnly')}`}
        actions={
          hasYears && (
            <>
              <Button variant="outline" nativeButton={false} render={<Link href="/calendar/year" />}>
                <CalendarRange className="size-4" /> {t('yearView')}
              </Button>
              {addButton}
            </>
          )
        }
      />

      {years.isPending && <ListSkeleton rows={4} stats={4} />}
      {years.data?.length === 0 && (
        <EmptyPanel
          icon={CalendarDays}
          tone={MODULE_TONE.master}
          title={t('noYearsTitle')}
          body={t('noYears')}
          action={
            <Button variant="outline" nativeButton={false} render={<Link href="/academic-years" />}>
              <CalendarDays className="size-4" /> {t('goYears')}
            </Button>
          }
        />
      )}

      {hasYears && (
        <>
          <Toolbar>
            <SelectField
              aria-label={t('year')}
              className="sm:w-52"
              value={yearId}
              onChange={(e) => {
                setYearChoice(e.target.value);
                setCursor(null);
                setPicked(null);
              }}
            >
              {years.data?.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              aria-label={t('workweek')}
              className="sm:w-52"
              value={String(daysPerWeek)}
              onChange={(e) => setDaysPerWeek(e.target.value === '6' ? 6 : 5)}
            >
              <option value="5">{t('days5')}</option>
              <option value="6">{t('days6')}</option>
            </SelectField>
          </Toolbar>

          {calendar.isPending && <ListSkeleton rows={4} stats={4} />}
          {calendar.data && (
            <StatGrid className={REVEAL}>
              <StatCard
                icon={CheckCircle2}
                tone="emerald"
                label={t('effective')}
                value={calendar.data.days.effective}
                progress={
                  calendar.data.days.workdays
                    ? (calendar.data.days.effective / calendar.data.days.workdays) * 100
                    : 0
                }
              />
              <StatCard
                icon={Briefcase}
                tone="sky"
                label={t('workdays')}
                value={calendar.data.days.workdays}
              />
              <StatCard
                icon={PartyPopper}
                tone="rose"
                label={t('closures')}
                value={calendar.data.days.nonEffective}
              />
              <StatCard
                icon={CalendarDays}
                tone="slate"
                label={t('totalDays')}
                value={calendar.data.days.total}
              />
            </StatGrid>
          )}

          {calendar.data && (
            <div
              className={cn('grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]', REVEAL)}
            >
              <section className="bg-card rounded-2xl border p-3 sm:p-4" aria-label={monthTitle}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label={t('prevMonth')}
                    onClick={() => shiftMonth(-1)}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <h2 className="font-heading text-base font-semibold capitalize" aria-live="polite">
                    {monthTitle}
                  </h2>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label={t('nextMonth')}
                    onClick={() => shiftMonth(1)}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {weekdays.map((w, i) => (
                    <div
                      key={w}
                      className={cn(
                        'text-muted-foreground pb-1 text-[11px] font-medium uppercase',
                        i >= 5 && 'text-rose-600/80 dark:text-rose-300/80',
                      )}
                    >
                      {w}
                    </div>
                  ))}
                  {monthDays.map((d) => {
                    const evs = covering(d.iso);
                    const types = [...new Set(evs.map((e) => e.type))].slice(0, 3);
                    const closed = evs.some(
                      (e) => (e.type === 'holiday' || e.type === 'break') && e.scope === 'school',
                    );
                    const selected = picked === d.iso;
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        aria-pressed={selected}
                        aria-label={`${show(d.iso)}${evs.length ? `, ${t('eventCount', { count: evs.length })}` : ''}`}
                        onClick={() => setPicked(selected ? null : d.iso)}
                        className={cn(
                          'focus-visible:ring-ring relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-sm tabular-nums transition-colors outline-none focus-visible:ring-2',
                          d.inMonth ? 'hover:bg-muted' : 'text-muted-foreground/40',
                          d.weekend && d.inMonth && 'text-rose-700 dark:text-rose-300',
                          closed && d.inMonth && 'bg-rose-50 dark:bg-rose-500/10',
                          d.iso === todayIso && 'ring-1 ring-teal-500 font-semibold',
                          selected && 'bg-primary text-primary-foreground hover:bg-primary',
                        )}
                      >
                        <span>{d.day}</span>
                        <span className="flex h-1.5 gap-0.5">
                          {types.map((ty) => (
                            <span
                              key={ty}
                              aria-hidden
                              className={cn(
                                'size-1.5 rounded-full',
                                selected ? 'bg-primary-foreground' : TYPE_TONE[ty].bar,
                              )}
                            />
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs">
                  {TYPES.map((ty) => (
                    <span key={ty} className="text-muted-foreground inline-flex items-center gap-1.5">
                      <span aria-hidden className={cn('size-2 rounded-full', TYPE_TONE[ty].bar)} />
                      {t(ty)}
                    </span>
                  ))}
                </div>
              </section>

              <section className="bg-card rounded-2xl border p-3 sm:p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-heading text-base font-semibold">
                    {picked ? show(picked) : agendaAll ? t('eventsTitle') : t('agendaMonth')}
                  </h2>
                  <div className="bg-muted inline-flex rounded-lg p-0.5 text-xs">
                    {[false, true].map((all) => (
                      <button
                        key={String(all)}
                        type="button"
                        aria-pressed={!picked && agendaAll === all}
                        onClick={() => {
                          setPicked(null);
                          setAgendaAll(all);
                        }}
                        className={cn(
                          'rounded-md px-2.5 py-1 font-medium transition-colors',
                          !picked && agendaAll === all ? 'bg-card shadow-sm' : 'text-muted-foreground',
                        )}
                      >
                        {all ? t('agendaAll') : t('agendaMonthShort')}
                      </button>
                    ))}
                  </div>
                </div>
                {agenda.length === 0 ? (
                  <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm">
                    <CalendarDays className="size-6 opacity-50" aria-hidden />
                    <p>{events.length === 0 ? t('empty') : t('emptyAgenda')}</p>
                    {events.length === 0 && addButton}
                  </div>
                ) : (
                  <ul className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1">
                    {agenda.map((e) => (
                      <li key={e.id} className="flex items-start gap-3 rounded-xl border p-2.5">
                        <span
                          aria-hidden
                          className={cn('mt-1.5 h-8 w-1 shrink-0 rounded-full', TYPE_TONE[e.type].bar)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{e.title}</p>
                          <p className="text-muted-foreground text-xs">
                            {range(e.startsOn, e.endsOn)}
                            {className(e.classId) && ` · ${className(e.classId)}`}
                          </p>
                          <div className="mt-1">
                            <ToneBadge tone={TYPE_TONE_KEY[e.type]}>{t(e.type)}</ToneBadge>
                          </div>
                        </div>
                        {manage && (
                          <RowMenu
                            label={t('actionsFor', { name: e.title })}
                            actions={[
                              {
                                label: t('delete'),
                                icon: Trash2,
                                destructive: true,
                                onSelect: () => setDeleting({ id: e.id, name: e.title }),
                              },
                            ]}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </>
      )}

      <ConfirmDelete
        name={deleting?.name ?? null}
        onClose={() => setDeleting(null)}
        pending={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </PageBody>
  );
}
