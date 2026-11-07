'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  ClipboardList,
  Copy,
  Eye,
  Landmark,
  Receipt,
  School,
  Search,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageBody, PageHeader } from '@/components/page-header';
import { RowMenu } from '@/components/row-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyPanel, PersonCell, StatCard, StatGrid, ToneBadge, Toolbar } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { FoundationDetail } from './foundation-detail';
import { type Foundation, QueryError, ReasonDialog, SUB_KEY, SUB_TONE, useMoney } from './platform-kit';
import { StaffOnboarding } from './staff-onboarding';

const FILTERS = ['all', 'active', 'past_due', 'suspended', 'canceled', 'none'] as const;
type Filter = (typeof FILTERS)[number];

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function FoundationsView() {
  const t = useTranslations('platform');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const money = useMoney();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [acting, setActing] = useState<{
    schoolId: string;
    name: string;
    action: 'suspend' | 'reactivate';
  } | null>(null);
  const [actError, setActError] = useState<string | null>(null);
  const dq = useDebounced(q.trim());

  const overview = useQuery({
    queryKey: ['platform-overview'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/overview')),
  });
  const list = useQuery({
    queryKey: ['platform-foundations', dq],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/platform/foundations', {
          params: { query: { limit: 200, ...(dq ? { q: dq } : {}) } },
        }),
      ),
    placeholderData: keepPreviousData,
  });

  const change = useMutation({
    mutationFn: async (v: { schoolId: string; action: 'suspend' | 'reactivate'; reason: string }) =>
      unwrap(
        v.action === 'suspend'
          ? await api.POST('/v1/platform/schools/{id}/suspend', {
              params: { path: { id: v.schoolId } },
              body: { reason: v.reason },
            })
          : await api.POST('/v1/platform/schools/{id}/reactivate', {
              params: { path: { id: v.schoolId } },
              body: { reason: v.reason },
            }),
      ),
    onSuccess: () => {
      toast.success(t('saved'));
      setActError(null);
      for (const key of ['foundations', 'foundation', 'overview', 'audit']) {
        queryClient.invalidateQueries({ queryKey: [`platform-${key}`] });
      }
    },
    onError: (e) => setActError(te(errorKey(e))),
  });

  const rows = (list.data ?? []).filter((f) => {
    if (filter === 'all') return true;
    if (filter === 'none') return f.subscription === null;
    return f.subscription?.status === filter;
  });
  const o = overview.data;
  const selected = list.data?.find((f) => f.id === openId) ?? null;
  const filtered = dq !== '' || filter !== 'all';

  const status = (f: Foundation) =>
    f.subscription ? (
      <ToneBadge tone={SUB_TONE[f.subscription.status]}>{t(SUB_KEY[f.subscription.status])}</ToneBadge>
    ) : (
      <ToneBadge tone="slate">{t('noSubscription')}</ToneBadge>
    );
  const suspendedUnits = (f: Foundation) => f.schools.filter((s) => s.status !== 'active').length;
  const end = (f: Foundation) =>
    f.subscription ? formatCalendarDate(locale, f.subscription.currentPeriodEnd.slice(0, 10)) : '-';

  function menu(f: Foundation) {
    return (
      <RowMenu
        label={t('actionsFor', { name: f.name })}
        items={[
          { key: 'detail', label: t('viewDetail'), icon: Eye, onSelect: () => setOpenId(f.id) },
          {
            key: 'copy',
            label: t('copySlug'),
            icon: Copy,
            onSelect: () => {
              navigator.clipboard.writeText(f.slug).then(() => toast.success(t('copied')));
            },
          },
        ]}
      />
    );
  }

  return (
    <PageBody>
      <PageHeader icon={Building2} tone="teal" title={t('dashTitle')} description={t('dashSubtitle')} />

      <StaffOnboarding />

      {overview.isError && <QueryError error={overview.error} onRetry={() => overview.refetch()} />}
      <StatGrid className="lg:grid-cols-3">
        {overview.isPending ? (
          ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => <Skeleton key={k} className="h-24 rounded-2xl" />)
        ) : o ? (
          <>
            <StatCard
              icon={Landmark}
              tone="teal"
              label={t('statFoundations')}
              value={o.foundations.toLocaleString(locale)}
              hint={t('statFoundationsHint', { count: o.activeSubscriptions })}
            />
            <StatCard
              icon={School}
              tone="emerald"
              label={t('statUnits')}
              value={o.activeUnits.toLocaleString(locale)}
              hint={t('statUnitsHint')}
            />
            <StatCard
              icon={ShieldAlert}
              tone={o.suspendedUnits > 0 ? 'rose' : 'slate'}
              label={t('statSuspended')}
              value={o.suspendedUnits.toLocaleString(locale)}
              hint={t('statSuspendedHint', { count: o.pastDueSubscriptions })}
            />
            <StatCard
              icon={Receipt}
              tone={o.openInvoices > 0 ? 'amber' : 'slate'}
              label={t('statOpenInvoices')}
              value={o.openInvoices.toLocaleString(locale)}
              hint={t('statOpenInvoicesHint')}
            />
            <StatCard
              icon={TrendingUp}
              tone="violet"
              label={t('statMrr')}
              value={money.format(o.mrr)}
              hint={t('statMrrHint')}
            />
            <Link
              href="/platform/pending"
              className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <StatCard
                className="hover:border-primary/40 h-full"
                icon={ClipboardList}
                tone={o.pendingRegistrations > 0 ? 'sky' : 'slate'}
                label={t('statPending')}
                value={o.pendingRegistrations.toLocaleString(locale)}
                hint={t('statPendingHint')}
              />
            </Link>
          </>
        ) : null}
      </StatGrid>

      <section className="grid grid-cols-[minmax(0,1fr)] gap-3" aria-labelledby="foundations-heading">
        <h2 id="foundations-heading" className="font-heading text-lg font-semibold">
          {t('foundations')}
        </h2>
        <Toolbar>
          <div className="relative min-w-52 flex-1 sm:max-w-sm">
            <Label htmlFor="q" className="sr-only">
              {t('search')}
            </Label>
            <Search
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              id="q"
              className="pl-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('searchPlaceholder')}
            />
          </div>
          <div className="w-full sm:w-52">
            <SelectField
              aria-label={t('filterStatus')}
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
            >
              {FILTERS.map((k) => (
                <option key={k} value={k}>
                  {k === 'all' ? t('filterAll') : k === 'none' ? t('noSubscription') : t(SUB_KEY[k])}
                </option>
              ))}
            </SelectField>
          </div>
          <p className="text-muted-foreground ml-auto px-2 text-xs tabular-nums" aria-live="polite">
            {t('foundationsCount', { count: rows.length })}
          </p>
        </Toolbar>

        {list.isPending && <Skeleton className="h-56 w-full rounded-2xl" />}
        {list.isError && <QueryError error={list.error} onRetry={() => list.refetch()} />}
        {list.data && rows.length === 0 && (
          <EmptyPanel
            icon={Building2}
            tone="teal"
            title={filtered ? t('emptyFiltered') : t('empty')}
            body={filtered ? t('emptyFilteredHint') : t('emptyHint')}
            action={
              filtered && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setQ('');
                    setFilter('all');
                  }}
                >
                  {t('clearFilters')}
                </Button>
              )
            }
          />
        )}

        {rows.length > 0 && (
          <>
            <div className="bg-card hidden overflow-hidden rounded-2xl border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('colFoundation')}</TableHead>
                    <TableHead>{t('colUnits')}</TableHead>
                    <TableHead>{t('colStatus')}</TableHead>
                    <TableHead>{t('colPeriodEnd')}</TableHead>
                    <TableHead>{t('colInvoices')}</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">{t('actions')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((f) => (
                    <TableRow key={f.id} className="hover:bg-muted/40">
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setOpenId(f.id)}
                          className="focus-visible:ring-ring -m-1 rounded-lg p-1 text-left outline-none focus-visible:ring-2"
                        >
                          <PersonCell name={f.name} sub={f.slug} />
                        </button>
                      </TableCell>
                      <TableCell>
                        <span className="tabular-nums">{t('unitsCount', { count: f.schools.length })}</span>
                        {suspendedUnits(f) > 0 && (
                          <ToneBadge tone="rose" className="ml-2">
                            {t('unitsSuspendedShort', { count: suspendedUnits(f) })}
                          </ToneBadge>
                        )}
                      </TableCell>
                      <TableCell>{status(f)}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{end(f)}</TableCell>
                      <TableCell>
                        {f.openInvoices > 0 ? (
                          <ToneBadge tone="amber">{t('openInvoices', { count: f.openInvoices })}</ToneBadge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{menu(f)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:hidden">
              {rows.map((f) => (
                <li
                  key={f.id}
                  className="bg-card grid grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setOpenId(f.id)}
                      className="focus-visible:ring-ring min-w-0 rounded-lg text-left outline-none focus-visible:ring-2"
                    >
                      <PersonCell name={f.name} sub={f.slug} />
                    </button>
                    {menu(f)}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {status(f)}
                    <span className="text-muted-foreground">
                      {t('unitsCount', { count: f.schools.length })}
                    </span>
                    {suspendedUnits(f) > 0 && (
                      <ToneBadge tone="rose">
                        {t('unitsSuspendedShort', { count: suspendedUnits(f) })}
                      </ToneBadge>
                    )}
                    {f.openInvoices > 0 && (
                      <ToneBadge tone="amber">{t('openInvoices', { count: f.openInvoices })}</ToneBadge>
                    )}
                    {f.subscription && (
                      <span className="text-muted-foreground">{t('periodEnd', { date: end(f) })}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <FoundationDetail
        foundation={selected}
        open={openId !== null && !acting}
        onOpenChange={(next) => !next && setOpenId(null)}
        onAct={(s, action) => {
          setActError(null);
          setActing({ schoolId: s.id, name: s.name, action });
        }}
      />
      <ReasonDialog
        open={!!acting}
        onOpenChange={(next) => {
          if (!next) {
            setActing(null);
            setActError(null);
          }
        }}
        title={
          acting
            ? t(acting.action === 'suspend' ? 'suspendTitle' : 'reactivateTitle', { name: acting.name })
            : ''
        }
        description={acting ? t(acting.action === 'suspend' ? 'suspendHelp' : 'reactivateHelp') : undefined}
        submitLabel={acting?.action === 'suspend' ? t('suspend') : t('reactivate')}
        {...(acting?.action === 'suspend' ? { maxLength: 300, notice: t('reasonVisibleNotice') } : {})}
        error={actError}
        onConfirm={(reason) =>
          acting
            ? change.mutateAsync({ schoolId: acting.schoolId, action: acting.action, reason })
            : Promise.resolve()
        }
      />
    </PageBody>
  );
}
