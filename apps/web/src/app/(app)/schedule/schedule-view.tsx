'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';

const WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;
type Weekday = (typeof WEEKDAYS)[number];

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

  return (
    <PageBody>
      <PageHeader
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

      <div className="flex flex-wrap items-center gap-3">
        {can('teacher:read') && (
          <SelectField
            aria-label={t('view')}
            className="sm:w-40"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'class' | 'teacher')}
          >
            <option value="class">{t('byClass')}</option>
            <option value="teacher">{t('byTeacher')}</option>
          </SelectField>
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
      </div>

      {(periods.isPending || years.isPending) && <Skeleton className="h-64 w-full" />}
      {noPeriods && (
        <Card className="text-muted-foreground p-10 text-center text-sm">
          {t('noPeriods')}
          {manage && (
            <div className="mt-4">
              <Button onClick={() => setPeriodsOpen(true)}>
                <Clock className="size-4" /> {t('periods')}
              </Button>
            </div>
          )}
        </Card>
      )}
      {!periods.isPending && !years.isPending && classList.length === 0 && mode === 'class' && !noPeriods && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('noClasses')}</Card>
      )}

      {periods.data && periods.data.length > 0 && target && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs">
                <th className="w-28 border-b px-3 py-2 text-left font-medium">{t('period')}</th>
                {WEEKDAYS.map((d) => (
                  <th key={d} className="border-b border-l px-3 py-2 text-left font-medium">
                    {t(`days.${d}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.data.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="border-b px-3 py-2 text-left align-top font-normal">
                    <span className="font-medium">{p.number}</span>
                    <span className="text-muted-foreground block text-xs tabular-nums">
                      {p.startsAt}–{p.endsAt}
                    </span>
                  </th>
                  {WEEKDAYS.map((d) => {
                    const e = entryAt(d, p.id);
                    const editable = manage && mode === 'class';
                    const content = e ? (
                      <>
                        <span className="block font-medium">
                          {mode === 'class' ? e.subjectName : e.className}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {mode === 'class' ? e.teacherName : e.subjectName}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground/60 text-xs">{editable ? '+' : ''}</span>
                    );
                    return (
                      <td key={d} className="h-14 border-b border-l p-0 align-top">
                        {editable ? (
                          <button
                            type="button"
                            className="hover:bg-accent/60 focus-visible:ring-ring/50 h-full w-full px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
                            onClick={() => {
                              setCellError(null);
                              setCell({
                                weekday: d,
                                periodId: p.id,
                                label: `${t(`days.${d}`)} · ${p.number}`,
                                subjectId: e?.subjectId ?? '',
                              });
                            }}
                          >
                            {content}
                          </button>
                        ) : (
                          <div className="px-3 py-2">{content}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
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
