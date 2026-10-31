'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, Hourglass, Layers, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { ListSkeleton, REVEAL } from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyPanel, MODULE_TONE, StatCard, StatGrid, TONES, ToneBadge } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { SemestersPanel } from './semesters-panel';

interface Draft {
  name: string;
  startsOn: string;
  endsOn: string;
}
const EMPTY: Draft = { name: '', startsOn: '', endsOn: '' };

export function AcademicYearsView() {
  const t = useTranslations('academicYears');
  const ts = useTranslations('semesters');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const key = ['academic-years', school.schoolId];
  const manage = can('academic_year:manage');

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [semestersFor, setSemestersFor] = useState<{ id: string; name: string } | null>(null);

  const show = (iso: string) => formatCalendarDate(locale, iso);

  const list = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });

  const create = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/academic-years', { params: header, body: draft })),
    onSuccess: (row) => {
      setDraft(EMPTY);
      toast.success(t('created', { name: row.name }));
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => setFormError(te(errorKey(e))),
  });

  const activate = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.PUT('/v1/academic-years/{id}/activate', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('activated'));
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['classes', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['students', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const years = list.data ?? [];
  const activeYear = years.find((y) => y.isActive);
  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, activeYear?.id],
    enabled: !!activeYear,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/semesters', {
          params: { ...header, query: { academicYearId: activeYear?.id ?? '' } },
        }),
      ),
  });
  const activeSemester = semesters.data?.find((s) => s.isActive);

  /** Persentase waktu berjalan (0..100) untuk sebuah rentang tanggal ISO; dihitung dari jam peramban. */
  const elapsed = (startsOn: string, endsOn: string) => {
    const a = Date.parse(`${startsOn}T00:00:00Z`);
    const b = Date.parse(`${endsOn}T23:59:59Z`);
    if (!(b > a)) return 0;
    return Math.max(0, Math.min(100, ((Date.now() - a) / (b - a)) * 100));
  };
  const activeElapsed = activeYear ? Math.round(elapsed(activeYear.startsOn, activeYear.endsOn)) : 0;

  const createButton = manage ? (
    <FormDialog
      trigger={
        <Button>
          <Plus className="size-4" /> {t('createTitle')}
        </Button>
      }
      title={t('createTitle')}
      description={t('createDescription')}
      submitLabel={t('save')}
      error={formError}
      disabled={!draft.name.trim() || !draft.startsOn || !draft.endsOn}
      onOpenChange={() => {
        setDraft(EMPTY);
        setFormError(null);
      }}
      onSubmit={() => create.mutateAsync()}
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="ay-name">{t('name')}</Label>
          <Input
            id="ay-name"
            placeholder="2026/2027"
            required
            maxLength={40}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="ay-starts">{t('startsOn')}</Label>
            <DatePicker
              id="ay-starts"
              value={draft.startsOn}
              onChange={(v) => setDraft({ ...draft, startsOn: v })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ay-ends">{t('endsOn')}</Label>
            <DatePicker
              id="ay-ends"
              value={draft.endsOn}
              onChange={(v) => setDraft({ ...draft, endsOn: v })}
            />
          </div>
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
        description={t('subtitle')}
        actions={createButton}
      />

      {list.data && years.length > 0 && (
        <StatGrid className={REVEAL}>
          <StatCard
            icon={CalendarDays}
            tone="teal"
            label={t('statTotal')}
            value={years.length}
            hint={t('statTotalHint')}
          />
          <StatCard
            icon={CheckCircle2}
            tone="emerald"
            label={t('statActiveYear')}
            value={activeYear?.name ?? '-'}
            hint={
              activeYear ? `${show(activeYear.startsOn)} – ${show(activeYear.endsOn)}` : t('statNoActive')
            }
          />
          <StatCard
            icon={Layers}
            tone="violet"
            label={t('statSemester')}
            value={activeSemester?.name ?? '-'}
            hint={
              activeSemester
                ? `${show(activeSemester.startsOn)} – ${show(activeSemester.endsOn)}`
                : t('statNoSemester')
            }
          />
          <StatCard
            icon={Hourglass}
            tone="amber"
            label={t('statProgress')}
            value={activeYear ? `${activeElapsed}%` : '-'}
            progress={activeYear ? activeElapsed : 0}
            hint={t('statProgressHint')}
          />
        </StatGrid>
      )}

      {list.isPending && <ListSkeleton rows={3} stats={4} />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(list.error))}</AlertDescription>
        </Alert>
      )}
      {list.data?.length === 0 && (
        <EmptyPanel
          icon={CalendarDays}
          tone={MODULE_TONE.master}
          title={t('empty')}
          body={manage ? t('emptyManage') : t('emptyReadonly')}
          action={createButton}
        />
      )}

      {list.data && years.length > 0 && (
        <ul className={cn('grid gap-3 md:grid-cols-2 xl:grid-cols-3', REVEAL)}>
          {years.map((y) => {
            const pct = Math.round(elapsed(y.startsOn, y.endsOn));
            return (
              <li
                key={y.id}
                className={cn(
                  'bg-card relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-4 transition-shadow hover:shadow-sm',
                  y.isActive && 'ring-2 ring-teal-500/30',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-heading truncate text-lg font-semibold tracking-tight">{y.name}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {show(y.startsOn)} – {show(y.endsOn)}
                    </p>
                  </div>
                  {y.isActive ? (
                    <ToneBadge tone="emerald">{t('active')}</ToneBadge>
                  ) : (
                    <ToneBadge tone="slate" dot={false}>
                      {t('inactive')}
                    </ToneBadge>
                  )}
                </div>
                <div>
                  <div className="text-muted-foreground mb-1 flex justify-between text-[11px]">
                    <span>{t('timeline')}</span>
                    <span className="tabular-nums">{pct}%</span>
                  </div>
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        y.isActive ? TONES.teal.bar : 'bg-muted-foreground/40',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSemestersFor({ id: y.id, name: y.name })}
                  >
                    <Layers className="size-4" /> {ts('toggle')}
                  </Button>
                  {manage && !y.isActive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={activate.isPending}
                      onClick={() => activate.mutate(y.id)}
                    >
                      <CheckCircle2 className="size-4" /> {t('activate')}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!semestersFor} onOpenChange={(open) => !open && setSemestersFor(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">
              {ts('title')} · {semestersFor?.name}
            </DialogTitle>
          </DialogHeader>
          {semestersFor && <SemestersPanel yearId={semestersFor.id} />}
        </DialogContent>
      </Dialog>
    </PageBody>
  );
}
