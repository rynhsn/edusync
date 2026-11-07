'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, LifeBuoy, Plus } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { PageBody, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, ToneBadge } from '@/components/ui-kit';
import { STATUSES, type TicketStatus } from '@/lib/support';
import { cn } from '@/lib/utils';
import { NewTicketDialog } from './new-ticket-dialog';
import { POLL_MS, type SupportApi } from './support-api';
import { PriorityBadge, StatusBadge } from './support-kit';

/** Daftar laporan dengan saringan status dan tombol Buat laporan. Dipakai panel sekolah dan portal pemilik. */
export function TicketList({
  api,
  units = [],
}: {
  api: SupportApi;
  /** Hanya portal pemilik: unit yang bisa dirujuk laporan. */
  units?: { id: string; name: string }[];
}) {
  const t = useTranslations('support');
  const tc = useTranslations('common');
  const format = useFormatter();
  const [status, setStatus] = useState<TicketStatus | ''>('');

  const list = useQuery({
    queryKey: [...api.key, 'list', status],
    queryFn: () => api.list(status || undefined),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: 'always',
  });

  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });
  const create = (
    <NewTicketDialog
      api={api}
      units={units}
      trigger={
        <Button>
          <Plus /> {t('newTicket')}
        </Button>
      }
    />
  );

  return (
    <PageBody>
      <PageHeader
        icon={LifeBuoy}
        tone="sky"
        title={t('title')}
        description={t('subtitle')}
        actions={create}
      />

      <div className="grid max-w-xs content-start gap-1.5">
        <Label htmlFor="support-status">{t('filterStatus')}</Label>
        <SelectField
          id="support-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as TicketStatus | '')}
        >
          <option value="">{t('all')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </SelectField>
      </div>

      {list.isPending && (
        <div className="grid gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {list.isError && (
        <EmptyPanel
          icon={LifeBuoy}
          tone="rose"
          title={t('loadError')}
          action={<Button onClick={() => list.refetch()}>{tc('retry')}</Button>}
        />
      )}

      {list.data && list.data.length === 0 && (
        <EmptyPanel
          icon={LifeBuoy}
          tone="sky"
          title={t('empty')}
          body={t('emptyBody')}
          action={status === '' ? create : undefined}
        />
      )}

      {list.data && list.data.length > 0 && (
        <ul className="grid gap-3">
          {list.data.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`${api.basePath}/${ticket.id}`}
                className={cn(
                  'bg-card hover:bg-accent/40 focus-visible:ring-ring flex items-center gap-3 rounded-2xl border p-4 transition-colors outline-none focus-visible:ring-2',
                  ticket.unread && 'border-destructive/40',
                )}
              >
                <div className="grid min-w-0 flex-1 gap-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-muted-foreground text-xs font-medium tabular-nums">
                      {ticket.ticketNo}
                    </span>
                    <StatusBadge status={ticket.status} />
                    <PriorityBadge priority={ticket.priority} />
                    {ticket.unread && (
                      <ToneBadge tone="rose" dot={false}>
                        {t('newReply')}
                      </ToneBadge>
                    )}
                  </div>
                  <p className={cn('truncate', ticket.unread ? 'font-semibold' : 'font-medium')}>
                    {ticket.subject}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t(`category.${ticket.category}`)} · {when(ticket.lastMessageAt)}
                  </p>
                </div>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageBody>
  );
}
