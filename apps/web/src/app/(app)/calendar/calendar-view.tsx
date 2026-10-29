'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { saveBlob } from '@/lib/sheet';

const TYPES = ['holiday', 'break', 'exam', 'activity'] as const;
type EventType = (typeof TYPES)[number];

interface Draft {
  type: EventType;
  title: string;
  startsOn: string;
  endsOn: string;
  scope: 'school' | 'class';
  classId: string;
}
const EMPTY: Draft = { type: 'holiday', title: '', startsOn: '', endsOn: '', scope: 'school', classId: '' };

const TONE: Record<EventType, 'destructive' | 'secondary' | 'outline'> = {
  holiday: 'destructive',
  break: 'destructive',
  exam: 'secondary',
  activity: 'outline',
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-heading text-2xl font-semibold">{value}</p>
    </div>
  );
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
            scope: draft.scope,
            classId: draft.scope === 'class' ? draft.classId || null : null,
            programId: null,
          },
        }),
      ),
    onSuccess: () => {
      setError(null);
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

  async function downloadIcs() {
    try {
      const res = await fetch(`/v1/academic-years/${yearId}/calendar.ics`, {
        credentials: 'include',
        headers: { 'x-school-id': school.schoolId },
      });
      if (!res.ok) throw new Error('unduhan gagal');
      saveBlob(await res.blob(), 'kalender-akademik.ics');
    } catch {
      toast.error(t('downloadError'));
    }
  }

  const show = (iso: string) => formatCalendarDate(locale, iso);
  const range = (a: string, b: string) => (a === b ? show(a) : `${show(a)} – ${show(b)}`);
  const classList = classes.data ?? [];
  const className = (id: string | null) => classList.find((c) => c.id === id)?.name;

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <div>
        <p className="text-primary text-sm font-medium">{school.schoolName}</p>
        <h1 className="font-heading mt-1 text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        {!manage && <p className="text-muted-foreground mt-1 text-sm">{t('readOnly')}</p>}
      </div>

      {years.isPending && <Skeleton className="h-24 w-full" />}
      {years.data?.length === 0 && <p className="text-muted-foreground text-sm">{t('noYears')}</p>}

      {years.data && years.data.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-2">
              <Label htmlFor="cal-year">{t('year')}</Label>
              <SelectField id="cal-year" value={yearId} onChange={(e) => setYearChoice(e.target.value)}>
                {years.data.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cal-week">{t('workweek')}</Label>
              <SelectField
                id="cal-week"
                value={String(daysPerWeek)}
                onChange={(e) => setDaysPerWeek(e.target.value === '6' ? 6 : 5)}
              >
                <option value="5">{t('days5')}</option>
                <option value="6">{t('days6')}</option>
              </SelectField>
            </div>
            <Button variant="outline" onClick={downloadIcs}>
              {t('download')}
            </Button>
          </div>

          {calendar.data && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t('effective')} value={calendar.data.days.effective} />
              <Stat label={t('workdays')} value={calendar.data.days.workdays} />
              <Stat label={t('closures')} value={calendar.data.days.nonEffective} />
              <Stat label={t('totalDays')} value={calendar.data.days.total} />
            </div>
          )}

          {manage && (
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg">{t('addTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    create.mutate();
                  }}
                >
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
                          scope: type === 'holiday' || type === 'break' ? 'school' : draft.scope,
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
                  <div className="grid gap-2 lg:col-span-2">
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
                      value={draft.endsOn}
                      onChange={(v) => setDraft({ ...draft, endsOn: v })}
                      clearable
                    />
                  </div>
                  {(draft.type === 'exam' || draft.type === 'activity') && classList.length > 0 && (
                    <div className="grid gap-2">
                      <Label htmlFor="ev-scope">{t('scope')}</Label>
                      <SelectField
                        id="ev-scope"
                        value={draft.scope === 'class' ? draft.classId : ''}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            scope: e.target.value ? 'class' : 'school',
                            classId: e.target.value,
                          })
                        }
                      >
                        <option value="">{t('scopeSchool')}</option>
                        {classList.map((c) => (
                          <option key={c.id} value={c.id}>
                            {t('scopeClass')}: {c.name}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                  )}
                  {error && (
                    <Alert variant="destructive" className="sm:col-span-2 lg:col-span-3">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <div>
                    <Button type="submit" disabled={create.isPending || !draft.startsOn}>
                      {t('add')}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {calendar.data?.events.length === 0 && (
            <p className="text-muted-foreground text-sm">{t('empty')}</p>
          )}
          {calendar.data && calendar.data.events.length > 0 && (
            <Card>
              <CardContent>
                <ul className="divide-y">
                  {calendar.data.events.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div>
                        <span className="font-medium">{e.title}</span>
                        <p className="text-muted-foreground text-xs">
                          {range(e.startsOn, e.endsOn)}
                          {e.classId && className(e.classId) ? ` · ${className(e.classId)}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={TONE[e.type]}>{t(e.type)}</Badge>
                        {manage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(e.id)}
                          >
                            {t('delete')}
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
