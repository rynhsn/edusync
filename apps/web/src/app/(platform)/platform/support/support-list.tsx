'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, MessagesSquare } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useDeferredValue, useState } from 'react';
import { PageBody, PageHeader } from '@/components/page-header';
import { POLL_MS } from '@/components/support/support-api';
import { PriorityBadge, StatusBadge } from '@/components/support/support-kit';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, ToneBadge, Toolbar } from '@/components/ui-kit';
import { api, unwrap } from '@/lib/api';
import {
  CATEGORIES,
  PRIORITIES,
  STATUSES,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/support';
import { cn } from '@/lib/utils';
import { QueryError } from '../platform-kit';

const PAGE = 50;

/** Daftar laporan untuk staf: hitungan per status, saringan, pencarian, dan tanda laporan yang belum dibuka. */
export function PlatformSupportList() {
  const t = useTranslations('platformSupport');
  const ts = useTranslations('support');
  const format = useFormatter();
  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [category, setCategory] = useState<TicketCategory | ''>('');
  const [priority, setPriority] = useState<TicketPriority | ''>('');
  const [assignee, setAssignee] = useState('');
  const [unread, setUnread] = useState(false);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const q = useDeferredValue(search.trim());

  const staff = useQuery({
    queryKey: ['platform-staff'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/staff')),
  });

  const list = useQuery({
    queryKey: ['platform-support', 'list', { status, category, priority, assignee, unread, q, limit }],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/platform/support/tickets', {
          params: {
            query: {
              status: status || undefined,
              category: category || undefined,
              priority: priority || undefined,
              assignee: assignee || undefined,
              unread: unread ? 'true' : undefined,
              q: q || undefined,
              limit,
            },
          },
        }),
      ),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: 'always',
    placeholderData: (prev) => prev,
  });

  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });
  const reset = () => setLimit(PAGE);

  return (
    <PageBody>
      <PageHeader icon={MessagesSquare} tone="sky" title={t('title')} description={t('subtitle')} />

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => {
          const active = status === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setStatus(active ? '' : s);
                reset();
              }}
              className={cn(
                'focus-visible:ring-ring flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2',
                active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-accent/50',
              )}
            >
              {t(`status.${s}`)}
              <span className="tabular-nums font-semibold">{list.data?.counts[s] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <Toolbar className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          aria-label={t('search')}
          placeholder={t('search')}
          value={search}
          className="h-10 sm:col-span-2 md:h-8"
          onChange={(e) => {
            setSearch(e.target.value);
            reset();
          }}
        />
        <SelectField
          aria-label={t('allCategory')}
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as TicketCategory | '');
            reset();
          }}
        >
          <option value="">{t('allCategory')}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {ts(`category.${c}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          aria-label={t('allPriority')}
          value={priority}
          onChange={(e) => {
            setPriority(e.target.value as TicketPriority | '');
            reset();
          }}
        >
          <option value="">{t('allPriority')}</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {ts(`priority.${p}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          aria-label={t('allAssignee')}
          value={assignee}
          onChange={(e) => {
            setAssignee(e.target.value);
            reset();
          }}
        >
          <option value="">{t('allAssignee')}</option>
          <option value="me">{t('assigneeMe')}</option>
          <option value="none">{t('assigneeNone')}</option>
          {staff.data?.staff
            .filter((s) => !s.isSelf)
            .map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.name}
              </option>
            ))}
        </SelectField>
        <label htmlFor="ps-unread" className="flex items-center gap-2 text-sm">
          <Checkbox
            id="ps-unread"
            checked={unread}
            onCheckedChange={(v) => {
              setUnread(v === true);
              reset();
            }}
          />
          {t('onlyUnread')}
        </label>
      </Toolbar>

      {list.isPending && (
        <div className="grid gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      )}
      {list.isError && <QueryError error={list.error} onRetry={() => list.refetch()} />}

      {list.data && (
        <>
          <p className="text-muted-foreground text-sm">{t('total', { count: list.data.total })}</p>
          {list.data.tickets.length === 0 ? (
            <EmptyPanel icon={MessagesSquare} tone="slate" title={t('empty')} body={t('emptyBody')} />
          ) : (
            <ul className="grid gap-3">
              {list.data.tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link
                    href={`/platform/support/${ticket.id}`}
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
                        <StatusBadge status={ticket.status} platform />
                        <PriorityBadge priority={ticket.priority} />
                        <ToneBadge tone="slate" dot={false}>
                          {ts(`category.${ticket.category}`)}
                        </ToneBadge>
                        {ticket.unread && (
                          <ToneBadge tone="rose" dot={false}>
                            {t('newMarker')}
                          </ToneBadge>
                        )}
                      </div>
                      <p className={cn('truncate', ticket.unread ? 'font-semibold' : 'font-medium')}>
                        {ticket.subject}
                      </p>
                      <p className="text-muted-foreground text-xs break-words">
                        {ticket.schoolName ?? ticket.foundationName ?? '—'} ·{' '}
                        {ticket.origin === 'owner' ? t('ownerPortal') : t('schoolPanel')} ·{' '}
                        {ticket.creatorName} · {ticket.assignedStaffName ?? t('unassigned')} ·{' '}
                        {when(ticket.lastMessageAt)}
                      </p>
                    </div>
                    <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {list.data.total > list.data.tickets.length && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setLimit((n) => n + PAGE)}>
                {t('loadMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </PageBody>
  );
}
