'use client';

import { canPlacementTransition, type PklPlacementStatus } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  CalendarRange,
  CheckCheck,
  ClipboardList,
  Footprints,
  Link2,
  Pencil,
  Play,
  Star,
  Trash2,
  UserRoundCheck,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { ApiError, api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { JournalPanel } from '../../journal-panel';
import { LinkPanel } from '../../link-panel';
import { ScoresPanel } from '../../scores-panel';
import {
  PersonAvatar,
  type PklPlacement,
  pklKey,
  STATUS_STYLE,
  StatusChip,
  usePklPartners,
  usePklPeriods,
} from '../../shared';
import { VisitsPanel } from '../../visits-panel';

type Tab = 'journal' | 'visits' | 'scores' | 'link';

const TRANSITION_ICON = { active: Play, completed: CheckCheck, cancelled: XCircle } as const;
const ALL = ['active', 'completed', 'cancelled'] as const;

/** Detail satu penempatan PKL: kepala siswa dan mitra, ubah status, dan tab jurnal, kunjungan, penilaian, tautan. */
export function PlacementDetail({ id }: { id: string }) {
  const t = useTranslations('pkl');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [tab, setTab] = useState<Tab>('journal');
  const [editError, setEditError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: pklKey(school.schoolId, 'placement', id),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
    queryFn: async () =>
      unwrap(await api.GET('/v1/pkl/placements/{id}', { params: { ...header, path: { id } } })),
  });
  const periods = usePklPeriods();
  const p = query.data as PklPlacement | undefined;
  const period = periods.data?.find((x) => x.id === p?.periodId);
  const refresh = () => queryClient.invalidateQueries({ queryKey: pklKey(school.schoolId) });

  const setStatus = useMutation({
    mutationFn: async (status: PklPlacementStatus) =>
      unwrap(
        await api.PUT('/v1/pkl/placements/{id}', { params: { ...header, path: { id } }, body: { status } }),
      ),
    onSuccess: () => {
      toast.success(t('statusChanged'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const remove = useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/v1/pkl/placements/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      refresh();
      router.replace('/pkl');
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <PageBody>
        <Link href="/pkl" className={cn(buttonVariants({ variant: 'ghost' }), 'w-fit')}>
          <ArrowLeft className="size-4" aria-hidden /> {t('backToBoard')}
        </Link>
        <Alert variant="destructive" role="alert">
          <AlertDescription>{missing ? t('notFound') : te(errorKey(query.error))}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  if (!p) {
    return (
      <PageBody>
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </PageBody>
    );
  }

  const manage = can('pkl:manage');
  const transitions = ALL.filter((s) => canPlacementTransition(p.status, s));
  const tabs: { key: Tab; label: string; icon: typeof ClipboardList }[] = [
    { key: 'journal', label: t('tabJournal'), icon: ClipboardList },
    { key: 'visits', label: t('tabVisits'), icon: Footprints },
    { key: 'scores', label: t('tabScores'), icon: Star },
    ...(p.canWrite ? [{ key: 'link' as const, label: t('tabLink'), icon: Link2 }] : []),
  ];

  return (
    <PageBody>
      <Link href="/pkl" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-fit')}>
        <ArrowLeft className="size-4" aria-hidden /> {t('backToBoard')}
      </Link>

      {/* Kepala */}
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-orange-50 via-card to-teal-50 p-5 dark:from-orange-500/10 dark:to-teal-500/10">
        <span aria-hidden className={cn('absolute inset-x-0 top-0 h-1.5', STATUS_STYLE[p.status].bar)} />
        <div className="flex flex-wrap items-start gap-4">
          <PersonAvatar name={p.studentName} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">{p.studentName}</h1>
              <StatusChip status={p.status} />
            </div>
            <p className="text-muted-foreground text-sm">{p.className ?? t('noClass')}</p>
            <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
              <Fact icon={Building2} label={t('partner')}>
                {p.partnerName}
              </Fact>
              <Fact icon={CalendarRange} label={t('period')}>
                {p.periodName}
                {period && (
                  <span className="text-muted-foreground">
                    {' '}
                    · {formatCalendarDate(locale, period.startsOn)} –{' '}
                    {formatCalendarDate(locale, period.endsOn)}
                  </span>
                )}
              </Fact>
              <Fact icon={UserRoundCheck} label={t('supervisor')}>
                {p.supervisorName ?? t('noSupervisor')}
              </Fact>
              <Fact icon={Building2} label={t('industrySupervisor')}>
                {p.industrySupervisorName ?? '-'}
                {p.industrySupervisorPhone ? ` · ${p.industrySupervisorPhone}` : ''}
              </Fact>
            </dl>
          </div>
        </div>

        {manage && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
            {transitions.map((s) => {
              const Icon = TRANSITION_ICON[s as keyof typeof TRANSITION_ICON];
              return (
                <ConfirmDialog
                  key={s}
                  trigger={
                    <Button variant={s === 'cancelled' ? 'outline' : 'default'} size="sm">
                      {Icon && <Icon className="size-4" aria-hidden />} {t(`action.${s}`)}
                    </Button>
                  }
                  destructive={s === 'cancelled'}
                  title={t(`confirm.${s}Title`)}
                  description={t(`confirm.${s}Body`)}
                  confirmLabel={t(`action.${s}`)}
                  pending={setStatus.isPending}
                  onConfirm={() => setStatus.mutateAsync(s)}
                />
              );
            })}
            {transitions.length === 0 && (
              <span className="text-muted-foreground text-xs">{t('statusFinal')}</span>
            )}
            <div className="ml-auto flex items-center gap-1">
              {p.status !== 'completed' && p.status !== 'cancelled' && (
                <EditDialog p={p} error={editError} setError={setEditError} onSaved={refresh} />
              )}
              {p.status === 'planned' && p.journalCount === 0 && (
                <ConfirmDialog
                  destructive
                  trigger={
                    <Button variant="ghost" size="sm">
                      <Trash2 className="size-4" aria-hidden /> {t('deletePlacement')}
                    </Button>
                  }
                  title={t('confirm.deleteTitle')}
                  description={t('confirm.deleteBody')}
                  confirmLabel={t('deletePlacement')}
                  pending={remove.isPending}
                  onConfirm={() => remove.mutateAsync()}
                />
              )}
            </div>
          </div>
        )}
      </section>

      {/* Tab */}
      <div
        role="tablist"
        aria-label={t('tabsLabel')}
        className="bg-muted flex w-full gap-1 overflow-x-auto rounded-xl p-1 sm:w-fit"
      >
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            id={`tab-${key}`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            onClick={() => setTab(key)}
            className={cn(
              'focus-visible:ring-ring/50 inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3',
              tab === key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'journal' && <JournalPanel placement={p} period={period ?? null} />}
        {tab === 'visits' && <VisitsPanel placement={p} />}
        {tab === 'scores' && <ScoresPanel placement={p} period={period ?? null} />}
        {tab === 'link' && p.canWrite && <LinkPanel placement={p} />}
      </div>
    </PageBody>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Building2;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-orange-600 dark:text-orange-300" aria-hidden />
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs">{label}</dt>
        <dd className="font-medium">{children}</dd>
      </div>
    </div>
  );
}

/** Ubah mitra, guru pembimbing, dan pembimbing industri. */
function EditDialog({
  p,
  error,
  setError,
  onSaved,
}: {
  p: PklPlacement;
  error: string | null;
  setError: (e: string | null) => void;
  onSaved: () => void;
}) {
  const t = useTranslations('pkl');
  const te = useTranslations();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const partners = usePklPartners();
  const [open, setOpen] = useState(false);
  const [partnerId, setPartnerId] = useState(p.partnerId);
  const [teacherId, setTeacherId] = useState(p.supervisorTeacherId ?? '');
  const [indName, setIndName] = useState(p.industrySupervisorName ?? '');
  const [indPhone, setIndPhone] = useState(p.industrySupervisorPhone ?? '');
  const teachers = useQuery({
    queryKey: ['teachers', school.schoolId],
    enabled: open && can('teacher:read'),
    queryFn: async () => unwrap(await api.GET('/v1/teachers', { params: header })),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setError(null);
        if (o) {
          setPartnerId(p.partnerId);
          setTeacherId(p.supervisorTeacherId ?? '');
          setIndName(p.industrySupervisorName ?? '');
          setIndPhone(p.industrySupervisorPhone ?? '');
        }
      }}
      trigger={
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Pencil className="size-4" aria-hidden /> {t('editPlacement')}
        </Button>
      }
      title={t('editPlacement')}
      submitLabel={t('save')}
      error={error}
      onSubmit={async () => {
        try {
          unwrap(
            await api.PUT('/v1/pkl/placements/{id}', {
              params: { ...header, path: { id: p.id } },
              body: {
                partnerId,
                supervisorTeacherId: teacherId || null,
                industrySupervisorName: indName.trim() || null,
                industrySupervisorPhone: indPhone.trim() || null,
              },
            }),
          );
          toast.success(t('saved'));
          onSaved();
        } catch (e) {
          setError(te(errorKey(e)));
          throw e;
        }
      }}
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="ed-partner">{t('partner')}</Label>
          <SelectField id="ed-partner" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            {(partners.data ?? [])
              .filter((x) => x.active || x.id === p.partnerId)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </SelectField>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ed-teacher">{t('supervisor')}</Label>
          <SelectField
            id="ed-teacher"
            value={teacherId}
            disabled={!can('teacher:read')}
            onChange={(e) => setTeacherId(e.target.value)}
          >
            <option value="">{t('noSupervisor')}</option>
            {(teachers.data ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="ed-ind-name">{t('industrySupervisorName')}</Label>
            <Input
              id="ed-ind-name"
              maxLength={120}
              value={indName}
              onChange={(e) => setIndName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ed-ind-phone">{t('industrySupervisorPhone')}</Label>
            <Input
              id="ed-ind-phone"
              maxLength={30}
              value={indPhone}
              onChange={(e) => setIndPhone(e.target.value)}
            />
          </div>
        </div>
      </div>
    </FormDialog>
  );
}
