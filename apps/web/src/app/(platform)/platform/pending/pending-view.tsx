'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Gift, PartyPopper } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageBody, PageHeader } from '@/components/page-header';
import { RowMenu } from '@/components/row-menu';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, PersonCell, ToneBadge } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { useStaff } from '../../platform-shell';
import { QueryError, ReasonDialog } from '../platform-kit';

export function PendingView() {
  const t = useTranslations('platform');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { role } = useStaff();
  const queryClient = useQueryClient();
  const [acting, setActing] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['platform-pending'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/registrations/pending')),
  });

  const activate = useMutation({
    mutationFn: async (v: { id: string; reason: string }) =>
      unwrap(
        await api.POST('/v1/platform/registrations/{id}/complimentary', {
          params: { path: { id: v.id } },
          body: { reason: v.reason },
        }),
      ),
    onSuccess: () => {
      toast.success(t('saved'));
      setError(null);
      for (const key of ['pending', 'foundations', 'overview', 'audit']) {
        queryClient.invalidateQueries({ queryKey: [`platform-${key}`] });
      }
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const day = (iso: string) => formatCalendarDate(locale, iso.slice(0, 10));
  const ask = (id: string, name: string) => {
    setError(null);
    setActing({ id, name });
  };

  return (
    <PageBody>
      <PageHeader icon={ClipboardList} tone="sky" title={t('pending')} description={t('pendingSubtitle')} />
      {list.isPending && <Skeleton className="h-32 w-full rounded-2xl" />}
      {list.isError && <QueryError error={list.error} onRetry={() => list.refetch()} />}
      {list.data?.length === 0 && (
        <EmptyPanel
          icon={PartyPopper}
          tone="emerald"
          title={t('pendingEmpty')}
          body={t('pendingEmptyHint')}
        />
      )}
      {list.data && list.data.length > 0 && (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.data.map((r) => (
            <li key={r.id} className="bg-card grid gap-3 rounded-2xl border p-4">
              <div className="flex items-start justify-between gap-2">
                <PersonCell name={r.foundationName} sub={t('unitsCount', { count: r.units })} />
                {role === 'admin' && (
                  <RowMenu
                    label={t('actionsFor', { name: r.foundationName })}
                    items={[
                      {
                        key: 'comp',
                        label: t('complimentary'),
                        icon: Gift,
                        onSelect: () => ask(r.id, r.foundationName),
                      },
                    ]}
                  />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <ToneBadge tone="sky">
                  {r.period === 'yearly' ? t('periodYearly') : t('periodMonthly')}
                </ToneBadge>
                <ToneBadge tone={new Date(r.expiresAt) < new Date() ? 'rose' : 'amber'}>
                  {t('expires', { date: day(r.expiresAt) })}
                </ToneBadge>
                <span className="text-muted-foreground">{t('createdOn', { date: day(r.createdAt) })}</span>
              </div>
              {role === 'admin' && (
                <div>
                  <Button size="sm" variant="outline" onClick={() => ask(r.id, r.foundationName)}>
                    <Gift /> {t('complimentary')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {role === 'read_only' && <p className="text-muted-foreground text-sm">{t('readOnly')}</p>}

      <ReasonDialog
        open={!!acting}
        onOpenChange={(next) => !next && setActing(null)}
        title={acting ? t('complimentaryTitle', { name: acting.name }) : ''}
        description={t('complimentaryHelp')}
        submitLabel={t('confirm')}
        error={error}
        onConfirm={(reason) => (acting ? activate.mutateAsync({ id: acting.id, reason }) : Promise.resolve())}
      />
    </PageBody>
  );
}
