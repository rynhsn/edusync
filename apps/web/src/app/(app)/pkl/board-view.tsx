'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ClipboardList,
  FileSpreadsheet,
  LayoutGrid,
  Rows3,
  Search,
  UserRoundCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useEffect, useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PlaceDialog } from './place-dialog';
import {
  PersonAvatar,
  type PklPlacement,
  pklKey,
  ScoreBadge,
  STATUS_ORDER,
  STATUS_STYLE,
  StatusChip,
  shortDate,
  usePklPartners,
  usePklPeriods,
} from './shared';

type View = 'board' | 'table';
const VIEW_KEY = 'edusync.pkl.view';

/** Papan penempatan PKL: ringkasan, filter, dan tampilan kanban atau tabel. */
export function BoardView() {
  const t = useTranslations('pkl');
  const { school, can } = useSchool();
  const manage = can('pkl:manage');
  const header = { header: schoolHeader(school.schoolId) };

  const [periodChoice, setPeriodChoice] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const [view, setView] = useState<View>('board');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'board' || saved === 'table') setView(saved);
    } catch {
      // Penyimpanan tidak tersedia: pakai bawaan.
    }
  }, []);
  function changeView(v: View) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Abaikan.
    }
  }

  const periods = usePklPeriods();
  const partners = usePklPartners();
  // Bawaan: periode terbaru (API mengurutkan terbaru dahulu).
  const periodId = periodChoice ?? periods.data?.[0]?.id ?? '';
  const allPeriods = periodChoice === 'all';

  const placements = useQuery({
    queryKey: pklKey(school.schoolId, 'placements', { periodId, partnerId, q }),
    enabled: periods.isSuccess,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/pkl/placements', {
          params: {
            ...header,
            query: {
              ...(periodId && !allPeriods ? { periodId } : {}),
              ...(partnerId ? { partnerId } : {}),
              ...(q ? { q } : {}),
              limit: 200,
            },
          },
        }),
      ),
  });

  const all = (placements.data?.items ?? []) as PklPlacement[];
  const shown = status ? all.filter((p) => p.status === status) : all;
  const counts = Object.fromEntries(
    STATUS_ORDER.map((s) => [s, all.filter((p) => p.status === s).length]),
  ) as Record<(typeof STATUS_ORDER)[number], number>;
  const scorable = all.filter((p) => p.status !== 'cancelled');
  const scored = scorable.filter((p) => p.finalScore !== null);
  const average = scored.length
    ? Math.round((scored.reduce((s, p) => s + (p.finalScore ?? 0), 0) / scored.length) * 100) / 100
    : null;
  const unscored = scorable.length - scored.length;

  const noPeriods = periods.isSuccess && periods.data.length === 0;

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <>
            {can('pkl:read') && (
              <Link
                href={periodId && !allPeriods ? `/pkl/report?periodId=${periodId}` : '/pkl/report'}
                className={buttonVariants({ variant: 'outline' })}
              >
                <FileSpreadsheet className="size-4" aria-hidden /> {t('reportLink')}
              </Link>
            )}
            {manage && <PlaceDialog defaultPeriodId={allPeriods ? '' : periodId} />}
          </>
        }
      />

      {noPeriods ? (
        <EmptyHero manage={manage} />
      ) : (
        <>
          {/* Ringkasan */}
          <section aria-label={t('summaryLabel')} className="grid gap-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {STATUS_ORDER.map((s) => {
                const on = status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setStatus(on ? '' : s)}
                    className={cn(
                      'bg-card focus-visible:ring-ring/50 group relative overflow-hidden rounded-xl border p-3.5 text-left transition-all outline-none hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                      on && 'ring-primary ring-2',
                    )}
                  >
                    <span aria-hidden className={cn('absolute inset-x-0 top-0 h-1', STATUS_STYLE[s].bar)} />
                    <span className="text-muted-foreground block text-xs font-medium">
                      {t(`status.${s}`)}
                    </span>
                    {placements.isPending ? (
                      <Skeleton className="mt-1.5 h-8 w-10" />
                    ) : (
                      <span className="font-heading mt-0.5 block text-3xl font-semibold tabular-nums">
                        {counts[s]}
                      </span>
                    )}
                  </button>
                );
              })}
              <div className="relative overflow-hidden rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-3.5 dark:border-orange-500/30 dark:from-orange-500/10 dark:to-amber-500/5">
                <span className="text-muted-foreground block text-xs font-medium">{t('averageScore')}</span>
                {placements.isPending ? (
                  <Skeleton className="mt-1.5 h-8 w-14" />
                ) : (
                  <span className="font-heading mt-0.5 block text-3xl font-semibold text-orange-800 tabular-nums dark:text-orange-200">
                    {average ?? '-'}
                  </span>
                )}
              </div>
              <div className="bg-card rounded-xl border p-3.5">
                <span className="text-muted-foreground block text-xs font-medium">{t('unscoredCount')}</span>
                {placements.isPending ? (
                  <Skeleton className="mt-1.5 h-8 w-10" />
                ) : (
                  <span
                    className={cn(
                      'font-heading mt-0.5 block text-3xl font-semibold tabular-nums',
                      unscored > 0 && 'text-amber-700 dark:text-amber-300',
                    )}
                  >
                    {unscored}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-52">
              <SelectField
                aria-label={t('period')}
                value={periodChoice ?? periodId}
                onChange={(e) => setPeriodChoice(e.target.value)}
              >
                <option value="all">{t('allPeriods')}</option>
                {(periods.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="w-full sm:w-52">
              <SelectField
                aria-label={t('partner')}
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
              >
                <option value="">{t('allPartners')}</option>
                {(partners.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="w-full sm:w-44">
              <SelectField
                aria-label={t('statusLabel')}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">{t('allStatuses')}</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="relative w-full sm:w-60">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                className="pl-8"
                value={search}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchPlaceholder')}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {/* biome-ignore lint/a11y/useSemanticElements: kelompok tombol sakelar, bukan isian formulir */}
            <div
              role="group"
              aria-label={t('viewLabel')}
              className="bg-muted ml-auto inline-flex rounded-lg p-0.5"
            >
              {(
                [
                  ['board', LayoutGrid],
                  ['table', Rows3],
                ] as const
              ).map(([v, Icon]) => (
                <Button
                  key={v}
                  type="button"
                  size="sm"
                  variant={view === v ? 'default' : 'ghost'}
                  aria-pressed={view === v}
                  onClick={() => changeView(v)}
                >
                  <Icon className="size-4" aria-hidden /> {t(`view_${v}`)}
                </Button>
              ))}
            </div>
          </div>

          {placements.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {t('loadError')}{' '}
                <button type="button" className="underline" onClick={() => placements.refetch()}>
                  {t('retry')}
                </button>
              </AlertDescription>
            </Alert>
          )}

          {placements.isPending ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-64 w-full rounded-xl" />
              ))}
            </div>
          ) : all.length === 0 ? (
            <EmptyHero manage={manage} hasPeriod />
          ) : view === 'board' ? (
            <Kanban items={all} statusFilter={status} />
          ) : (
            <PlacementTable items={shown} />
          )}
          {placements.data && placements.data.total > 200 && (
            <p className="text-muted-foreground text-xs">
              {t('truncated', { total: placements.data.total })}
            </p>
          )}
        </>
      )}
    </PageBody>
  );
}

/** Ilustrasi ringan: kotak kerja dengan helm. */
function WorkIllustration() {
  return (
    <svg viewBox="0 0 160 110" className="mx-auto h-28 w-40" aria-hidden>
      <rect
        x="22"
        y="44"
        width="116"
        height="56"
        rx="10"
        className="fill-orange-200 dark:fill-orange-500/30"
      />
      <rect
        x="62"
        y="30"
        width="36"
        height="20"
        rx="6"
        className="fill-none stroke-orange-500"
        strokeWidth="5"
      />
      <rect x="22" y="64" width="116" height="6" className="fill-orange-300 dark:fill-orange-500/50" />
      <rect x="72" y="60" width="16" height="14" rx="3" className="fill-teal-600" />
      <path d="M52 22a28 20 0 0 1 56 0z" className="fill-teal-500" />
      <rect x="46" y="21" width="68" height="6" rx="3" className="fill-teal-700" />
    </svg>
  );
}

function EmptyHero({ manage, hasPeriod }: { manage: boolean; hasPeriod?: boolean }) {
  const t = useTranslations('pkl');
  return (
    <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-orange-300 bg-orange-50/50 px-6 py-12 text-center dark:border-orange-500/30 dark:bg-orange-500/5">
      <WorkIllustration />
      <h2 className="font-heading text-lg font-semibold">
        {hasPeriod ? t('emptyPlacementsTitle') : t('emptyPeriodsTitle')}
      </h2>
      <p className="text-muted-foreground max-w-md text-sm">
        {hasPeriod ? t('emptyPlacementsBody') : t('emptyPeriodsBody')}
      </p>
      {manage && !hasPeriod && (
        <Link href="/pkl/settings" className={buttonVariants()}>
          <CalendarClock className="size-4" aria-hidden /> {t('createPeriod')}
        </Link>
      )}
    </div>
  );
}

function PlacementCard({ p }: { p: PklPlacement }) {
  const t = useTranslations('pkl');
  const locale = useLocale();
  return (
    <Link
      href={`/pkl/placements/${p.id}`}
      className="bg-card focus-visible:ring-ring/50 group grid gap-2.5 rounded-xl border p-3 shadow-xs transition-all outline-none hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-center gap-2.5">
        <PersonAvatar name={p.studentName} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{p.studentName}</p>
          <p className="text-muted-foreground truncate text-xs">{p.className ?? '-'}</p>
        </div>
        <ScoreBadge score={p.finalScore} predicate={p.predicate} className="ml-auto" />
      </div>
      <div className="grid gap-1 text-xs">
        <p className="flex items-center gap-1.5">
          <Building2 className="size-3.5 shrink-0 text-orange-600 dark:text-orange-300" aria-hidden />
          <span className="truncate font-medium">{p.partnerName}</span>
        </p>
        <p className="text-muted-foreground flex items-center gap-1.5">
          <UserRoundCheck className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{p.supervisorName ?? t('noSupervisor')}</span>
        </p>
        <p className="text-muted-foreground flex items-center gap-1.5">
          <ClipboardList className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {p.journalCount > 0 && p.lastJournalDate
              ? t('lastJournal', { count: p.journalCount, date: shortDate(locale, p.lastJournalDate) })
              : t('noJournalYet')}
          </span>
        </p>
      </div>
    </Link>
  );
}

function Kanban({ items, statusFilter }: { items: PklPlacement[]; statusFilter: string }) {
  const t = useTranslations('pkl');
  const columns = STATUS_ORDER.filter((s) => !statusFilter || s === statusFilter);
  return (
    <div
      className={cn(
        'grid items-start gap-3',
        columns.length > 1 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2 xl:grid-cols-3',
      )}
    >
      {columns.map((s) => {
        const list = items.filter((p) => p.status === s);
        return (
          <section
            key={s}
            aria-label={t(`status.${s}`)}
            className={cn('rounded-xl border p-2.5', STATUS_STYLE[s].column)}
          >
            <h2
              className={cn('mb-2 flex items-center gap-2 px-1 text-sm font-semibold', STATUS_STYLE[s].head)}
            >
              <span aria-hidden className={cn('size-2 rounded-full', STATUS_STYLE[s].dot)} />
              {t(`status.${s}`)}
              <span className="bg-background/70 ml-auto rounded-full px-2 text-xs tabular-nums">
                {list.length}
              </span>
            </h2>
            <div className="grid gap-2">
              {list.length === 0 ? (
                <p className="text-muted-foreground px-1 py-4 text-center text-xs">{t('columnEmpty')}</p>
              ) : (
                list.map((p) => <PlacementCard key={p.id} p={p} />)
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PlacementTable({ items }: { items: PklPlacement[] }) {
  const t = useTranslations('pkl');
  const locale = useLocale();
  if (items.length === 0) {
    return <p className="text-muted-foreground py-10 text-center text-sm">{t('noMatch')}</p>;
  }
  return (
    <div className="bg-card overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('student')}</TableHead>
            <TableHead>{t('partner')}</TableHead>
            <TableHead className="hidden lg:table-cell">{t('supervisor')}</TableHead>
            <TableHead>{t('statusLabel')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('journal')}</TableHead>
            <TableHead className="text-right">{t('finalScore')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => (
            <TableRow key={p.id} className="hover:bg-muted/50">
              <TableCell>
                <Link href={`/pkl/placements/${p.id}`} className="flex items-center gap-2.5 hover:underline">
                  <PersonAvatar name={p.studentName} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.studentName}</span>
                    <span className="text-muted-foreground block truncate text-xs">{p.className ?? '-'}</span>
                  </span>
                </Link>
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5">
                  <BriefcaseBusiness className="size-3.5 text-orange-600 dark:text-orange-300" aria-hidden />
                  {p.partnerName}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground hidden lg:table-cell">
                {p.supervisorName ?? '-'}
              </TableCell>
              <TableCell>
                <StatusChip status={p.status} />
              </TableCell>
              <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                {p.journalCount > 0 && p.lastJournalDate
                  ? t('lastJournal', { count: p.journalCount, date: shortDate(locale, p.lastJournalDate) })
                  : t('noJournalYet')}
              </TableCell>
              <TableCell className="text-right">
                <ScoreBadge score={p.finalScore} predicate={p.predicate} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
