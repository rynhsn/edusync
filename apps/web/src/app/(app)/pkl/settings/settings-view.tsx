'use client';

import { DEFAULT_PKL_ASPECTS } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarRange, Pencil, Plus, Scale, Sparkles, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import { periodProgress, todayIso, weightTotal } from '../lib';
import { pklKey, usePklPeriods } from '../shared';
import { ThresholdsCard } from './thresholds-card';

interface PeriodDraft {
  id: string | null;
  academicYearId: string;
  name: string;
  startsOn: string;
  endsOn: string;
}
interface AspectDraft {
  id: string | null;
  name: string;
  weight: string;
}

/** Pengaturan PKL: periode (dengan bar waktu) dan aspek penilaian (bobot). */
export function SettingsView() {
  const t = useTranslations('pkl');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const manage = can('pkl:manage');
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const refresh = () => queryClient.invalidateQueries({ queryKey: pklKey(school.schoolId) });

  const periods = usePklPeriods();
  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const aspects = useQuery({
    queryKey: pklKey(school.schoolId, 'aspects'),
    queryFn: async () => unwrap(await api.GET('/v1/pkl/aspects', { params: header })),
  });

  const [pOpen, setPOpen] = useState(false);
  const [pDraft, setPDraft] = useState<PeriodDraft>({
    id: null,
    academicYearId: '',
    name: '',
    startsOn: '',
    endsOn: '',
  });
  const [aOpen, setAOpen] = useState(false);
  const [aDraft, setADraft] = useState<AspectDraft>({ id: null, name: '', weight: '' });
  const [error, setError] = useState<string | null>(null);

  const yearOf = (id: string) => years.data?.find((y) => y.id === id)?.name ?? '';

  const savePeriod = useMutation({
    mutationFn: async (d: PeriodDraft) => {
      const body = {
        academicYearId: d.academicYearId,
        name: d.name.trim(),
        startsOn: d.startsOn,
        endsOn: d.endsOn,
      };
      if (d.id)
        return unwrap(
          await api.PUT('/v1/pkl/periods/{id}', { params: { ...header, path: { id: d.id } }, body }),
        );
      return unwrap(await api.POST('/v1/pkl/periods', { params: header, body }));
    },
    onSuccess: (_r, d) => {
      toast.success(d.id ? t('saved') : t('created'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const removePeriod = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/pkl/periods/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const saveAspect = useMutation({
    mutationFn: async (d: AspectDraft) => {
      const body = { name: d.name.trim(), weight: Number(d.weight) };
      if (d.id)
        return unwrap(
          await api.PUT('/v1/pkl/aspects/{id}', { params: { ...header, path: { id: d.id } }, body }),
        );
      return unwrap(await api.POST('/v1/pkl/aspects', { params: header, body }));
    },
    onSuccess: (_r, d) => {
      toast.success(d.id ? t('saved') : t('created'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const removeAspect = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/pkl/aspects/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const installDefaults = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/pkl/aspects/defaults', { params: header })),
    onSuccess: () => {
      toast.success(t('defaultsInstalled'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const aspectList = aspects.data ?? [];
  const total = weightTotal(aspectList);
  const today = todayIso();
  const weightValid =
    /^\d{1,3}$/.test(aDraft.weight) && Number(aDraft.weight) >= 1 && Number(aDraft.weight) <= 100;

  return (
    <PageBody>
      <PageHeader
        title={t('settingsTitle')}
        description={manage ? t('settingsSubtitle') : `${t('settingsSubtitle')} ${t('readOnly')}`}
      />

      {/* Periode */}
      <section className="grid gap-3" aria-labelledby="pkl-periods">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pkl-periods" className="font-heading flex items-center gap-2 text-lg font-semibold">
            <CalendarRange className="size-5 text-orange-600 dark:text-orange-300" aria-hidden />{' '}
            {t('periodsTitle')}
          </h2>
          {manage && (
            <Button
              size="sm"
              onClick={() => {
                const y = years.data?.find((x) => x.isActive) ?? years.data?.[0];
                setPDraft({ id: null, academicYearId: y?.id ?? '', name: '', startsOn: '', endsOn: '' });
                setError(null);
                setPOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden /> {t('addPeriod')}
            </Button>
          )}
        </div>

        <FormDialog
          open={pOpen}
          onOpenChange={setPOpen}
          title={pDraft.id ? t('editPeriod') : t('addPeriod')}
          submitLabel={t('save')}
          error={error}
          disabled={!pDraft.name.trim() || !pDraft.academicYearId || !pDraft.startsOn || !pDraft.endsOn}
          onSubmit={() => savePeriod.mutateAsync(pDraft)}
        >
          <div className="grid gap-2">
            <Label htmlFor="pp-name">{t('periodName')}</Label>
            <Input
              id="pp-name"
              required
              maxLength={120}
              value={pDraft.name}
              onChange={(e) => setPDraft({ ...pDraft, name: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pp-year">{t('academicYear')}</Label>
            <SelectField
              id="pp-year"
              value={pDraft.academicYearId}
              onChange={(e) => setPDraft({ ...pDraft, academicYearId: e.target.value })}
            >
              {(years.data ?? []).map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pp-start">{t('startsOn')}</Label>
              <DatePicker
                id="pp-start"
                value={pDraft.startsOn}
                onChange={(v) => setPDraft({ ...pDraft, startsOn: v })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pp-end">{t('endsOn')}</Label>
              <DatePicker
                id="pp-end"
                value={pDraft.endsOn}
                onChange={(v) => setPDraft({ ...pDraft, endsOn: v })}
              />
            </div>
          </div>
        </FormDialog>

        {periods.isPending ? (
          <Skeleton className="h-28 w-full rounded-xl" />
        ) : (periods.data ?? []).length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">
            {t('emptyPeriodsBody')}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(periods.data ?? []).map((p) => {
              const prog = periodProgress(p.startsOn, p.endsOn, today);
              return (
                <article key={p.id} className="bg-card grid gap-3 rounded-xl border p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-heading truncate font-semibold">{p.name}</h3>
                      <p className="text-muted-foreground text-xs">{yearOf(p.academicYearId)}</p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        prog.state === 'running' &&
                          'bg-orange-100 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200',
                        prog.state === 'upcoming' &&
                          'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
                        prog.state === 'done' &&
                          'bg-teal-100 text-teal-900 dark:bg-teal-500/20 dark:text-teal-200',
                      )}
                    >
                      {t(`periodState.${prog.state}`)}
                    </span>
                  </div>
                  <div>
                    <div
                      role="progressbar"
                      aria-label={p.name}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={prog.pct}
                      className="bg-muted h-2.5 overflow-hidden rounded-full"
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-orange-400 to-teal-500 transition-all motion-reduce:transition-none"
                        style={{ width: `${prog.pct}%` }}
                      />
                    </div>
                    <p className="text-muted-foreground mt-1.5 flex justify-between text-xs">
                      <span>{formatCalendarDate(locale, p.startsOn)}</span>
                      <span>{formatCalendarDate(locale, p.endsOn)}</span>
                    </p>
                  </div>
                  <div className="flex items-center justify-between border-t pt-2.5">
                    <span className="text-muted-foreground text-xs">
                      {t('placementsTotal', { count: p.placementCount })}
                    </span>
                    {manage && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${t('editPeriod')}: ${p.name}`}
                          onClick={() => {
                            setPDraft({
                              id: p.id,
                              academicYearId: p.academicYearId,
                              name: p.name,
                              startsOn: p.startsOn,
                              endsOn: p.endsOn,
                            });
                            setError(null);
                            setPOpen(true);
                          }}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                        <ConfirmDialog
                          destructive
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`${t('deletePeriod')}: ${p.name}`}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          }
                          title={t('confirm.periodTitle')}
                          description={p.name}
                          confirmLabel={t('deletePeriod')}
                          pending={removePeriod.isPending}
                          onConfirm={() => removePeriod.mutateAsync(p.id)}
                        />
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Aspek */}
      <section className="grid gap-3" aria-labelledby="pkl-aspects">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pkl-aspects" className="font-heading flex items-center gap-2 text-lg font-semibold">
            <Scale className="size-5 text-teal-600 dark:text-teal-300" aria-hidden /> {t('aspectsTitle')}
          </h2>
          {manage && (
            <div className="flex gap-2">
              {aspects.isSuccess && aspectList.length === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={installDefaults.isPending}
                  onClick={() => installDefaults.mutate()}
                >
                  <Sparkles className="size-4" aria-hidden /> {t('installDefaults')}
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  setADraft({ id: null, name: '', weight: '' });
                  setError(null);
                  setAOpen(true);
                }}
              >
                <Plus className="size-4" aria-hidden /> {t('addAspect')}
              </Button>
            </div>
          )}
        </div>

        <FormDialog
          open={aOpen}
          onOpenChange={setAOpen}
          title={aDraft.id ? t('editAspect') : t('addAspect')}
          submitLabel={t('save')}
          error={error}
          disabled={!aDraft.name.trim() || !weightValid}
          onSubmit={() => saveAspect.mutateAsync(aDraft)}
        >
          <div className="grid gap-2">
            <Label htmlFor="as-name">{t('aspect')}</Label>
            <Input
              id="as-name"
              required
              maxLength={120}
              value={aDraft.name}
              onChange={(e) => setADraft({ ...aDraft, name: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="as-weight">{t('weight')} (1-100)</Label>
            <Input
              id="as-weight"
              inputMode="numeric"
              maxLength={3}
              value={aDraft.weight}
              onChange={(e) => setADraft({ ...aDraft, weight: e.target.value })}
            />
          </div>
        </FormDialog>

        {aspects.isPending ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : aspectList.length === 0 ? (
          <div className="rounded-xl border border-dashed px-4 py-8 text-center">
            <p className="text-muted-foreground text-sm">{t('noAspects')}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {t('defaultsHint', {
                list: DEFAULT_PKL_ASPECTS.map((a) => `${a.name} ${a.weight}`).join(', '),
              })}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-card overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('aspect')}</TableHead>
                    <TableHead className="w-48">{t('weight')}</TableHead>
                    {manage && <TableHead className="w-24" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aspectList.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                            <div
                              className="h-full rounded-full bg-orange-500"
                              style={{ width: `${Math.min(100, a.weight)}%` }}
                            />
                          </div>
                          <span className="w-8 text-right text-sm tabular-nums">{a.weight}</span>
                        </div>
                      </TableCell>
                      {manage && (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`${t('editAspect')}: ${a.name}`}
                              onClick={() => {
                                setADraft({ id: a.id, name: a.name, weight: String(a.weight) });
                                setError(null);
                                setAOpen(true);
                              }}
                            >
                              <Pencil className="size-4" aria-hidden />
                            </Button>
                            <ConfirmDialog
                              destructive
                              trigger={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`${t('deleteAspect')}: ${a.name}`}
                                >
                                  <Trash2 className="size-4" aria-hidden />
                                </Button>
                              }
                              title={t('confirm.aspectTitle')}
                              description={a.name}
                              confirmLabel={t('deleteAspect')}
                              pending={removeAspect.isPending}
                              onConfirm={() => removeAspect.mutateAsync(a.id)}
                            />
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell>{t('weightTotal')}</TableCell>
                    <TableCell className="tabular-nums">{total}</TableCell>
                    {manage && <TableCell />}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            {total !== 100 && (
              <Alert role="status">
                <AlertTriangle className="size-4" aria-hidden />
                <AlertDescription>{t('weightWarning', { total })}</AlertDescription>
              </Alert>
            )}
          </>
        )}
      </section>

      <ThresholdsCard />
    </PageBody>
  );
}
