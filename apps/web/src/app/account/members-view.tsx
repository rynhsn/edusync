'use client';

import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageBody, PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, PersonCell, ToneBadge } from '@/components/ui-kit';
import { api, unwrap } from '@/lib/api';
import { useAccount } from './account-context';

export function MembersView() {
  const t = useTranslations('account');
  const { foundation: f, date } = useAccount();
  const owners = useQuery({
    queryKey: ['account-owners', f.id],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/account/foundations/{foundationId}/owners', {
          params: { path: { foundationId: f.id } },
        }),
      ),
  });
  return (
    <PageBody>
      <PageHeader icon={Users} tone="violet" title={t('nav.members')} description={t('membersSubtitle')} />
      {owners.isPending && <Skeleton className="h-40 w-full rounded-2xl" />}
      {owners.isError && <EmptyPanel icon={Users} tone="rose" title={t('loadError')} />}
      {owners.data && (
        <ul className="bg-card divide-y rounded-2xl border">
          {owners.data.owners.map((o) => (
            <li key={o.userId} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <PersonCell name={o.name} sub={o.email} />
              <ToneBadge tone="violet">{t('ownerSince', { date: date(o.since) })}</ToneBadge>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-xs">{t('membersNote')}</p>
    </PageBody>
  );
}
