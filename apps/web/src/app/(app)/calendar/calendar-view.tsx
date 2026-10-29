'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';

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

const TONE: Record<EventType, 'destructive' | 'secondary' | 'outline'> = {
  holiday: 'destructive',
  break: 'destructive',
  exam: 'secondary',
  activity: 'outline',
};

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="gap-1 p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`font-heading text-3xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
    </Card>
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

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${t('readOnly')}`}
        actions={
          hasYears && (
            <>
              <Button variant="outline" nativeButton={false} render={<Link href="/calendar/year" />}>
                <CalendarRange className="size-4" /> {t('yearView')}
              </Button>
              {manage && (
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
              )}
            </>
          )
        }
      />

      {years.isPending && <Skeleton className="h-24 w-full" />}
      {years.data?.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('noYears')}</Card>
      )}

      {hasYears && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <SelectField
              aria-label={t('year')}
              className="sm:w-52"
              value={yearId}
              onChange={(e) => setYearChoice(e.target.value)}
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
          </div>

          {calendar.data && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label={t('effective')} value={calendar.data.days.effective} tone="text-primary" />
              <Stat label={t('workdays')} value={calendar.data.days.workdays} />
              <Stat label={t('closures')} value={calendar.data.days.nonEffective} tone="text-destructive" />
              <Stat label={t('totalDays')} value={calendar.data.days.total} />
            </div>
          )}

          {calendar.data?.events.length === 0 && (
            <Card className="text-muted-foreground p-10 text-center text-sm">{t('empty')}</Card>
          )}
          {calendar.data && calendar.data.events.length > 0 && (
            <Card className="overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('eventTitle')}</TableHead>
                    <TableHead>{t('type')}</TableHead>
                    <TableHead>{t('period')}</TableHead>
                    {manage && <TableHead className="w-16" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calendar.data.events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">
                        {e.title}
                        {className(e.classId) && (
                          <span className="text-muted-foreground font-normal"> · {className(e.classId)}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={TONE[e.type]}>{t(e.type)}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{range(e.startsOn, e.endsOn)}</TableCell>
                      {manage && (
                        <TableCell className="text-right">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t('delete')}
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(e.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </PageBody>
  );
}
