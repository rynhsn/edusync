'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { EVENT_KEYS, type MessageStatus, maskPhone, OK_BADGE, STATUSES, useMessagingCtx } from './shared';

const PAGE_SIZE = 20;

const STATUS_STYLE: Record<
  MessageStatus,
  { variant: 'secondary' | 'destructive' | 'outline'; className?: string }
> = {
  queued: { variant: 'secondary' },
  sending: { variant: 'secondary' },
  sent: { variant: 'secondary', className: OK_BADGE },
  failed: { variant: 'destructive' },
  skipped: { variant: 'outline' },
};

export function HistoryPanel() {
  const t = useTranslations('messaging');
  const te = useTranslations();
  const { school, header, canManage } = useMessagingCtx();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [eventKey, setEventKey] = useState('');
  const [page, setPage] = useState(0);

  const list = useQuery({
    queryKey: ['messaging-messages', school.schoolId, status, eventKey, page],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/messaging/messages', {
          params: {
            ...header,
            query: {
              limit: PAGE_SIZE,
              offset: page * PAGE_SIZE,
              ...(status ? { status: status as never } : {}),
              ...(eventKey ? { eventKey: eventKey as never } : {}),
            },
          },
        }),
      ),
    placeholderData: (prev) => prev,
  });

  const retry = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.POST('/v1/messaging/messages/{id}/retry', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('retryQueued'));
      queryClient.invalidateQueries({ queryKey: ['messaging-messages', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-2 sm:w-48">
          <Label htmlFor="hist-status">{t('filterStatus')}</Label>
          <SelectField
            id="hist-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t('allStatuses')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`msgStatus.${s}`)}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid gap-2 sm:w-56">
          <Label htmlFor="hist-event">{t('filterEvent')}</Label>
          <SelectField
            id="hist-event"
            value={eventKey}
            onChange={(e) => {
              setEventKey(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t('allEvents')}</option>
            {EVENT_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`event.${k}`)}
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      {data && (
        <div className="flex flex-wrap gap-2 text-sm">
          {(['queued', 'sent', 'failed', 'skipped'] as const).map((s) => (
            <Badge key={s} variant={STATUS_STYLE[s].variant} className={STATUS_STYLE[s].className}>
              {t(`msgStatus.${s}`)}: {data.counts[s]}
            </Badge>
          ))}
        </div>
      )}

      {list.isPending && <Skeleton className="h-48 w-full" />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(list.error))}</AlertDescription>
        </Alert>
      )}
      {data?.items.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('noMessages')}</Card>
      )}
      {data && data.items.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('colTime')}</TableHead>
                <TableHead>{t('colEvent')}</TableHead>
                <TableHead>{t('colStudent')}</TableHead>
                <TableHead>{t('colPhone')}</TableHead>
                <TableHead>{t('colStatus')}</TableHead>
                <TableHead>{t('colDetail')}</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((m) => {
                const st = m.status as MessageStatus;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {new Date(m.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t.has(`event.${m.eventKey}` as never)
                          ? t(`event.${m.eventKey}` as never)
                          : m.eventKey}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{m.studentName ?? '-'}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {maskPhone(m.toPhone)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_STYLE[st].variant} className={STATUS_STYLE[st].className}>
                        {t(`msgStatus.${st}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-64 text-xs break-words whitespace-normal">
                      {m.detail ?? ''}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && (st === 'failed' || st === 'skipped') && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retry.isPending}
                          onClick={() => retry.mutate(m.id)}
                        >
                          <RotateCw className="size-3.5" /> {t('retry')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-sm">{t('pageOf', { page: page + 1, pages })}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              {t('prev')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pages}
              onClick={() => setPage(page + 1)}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
