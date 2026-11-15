'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Paperclip, RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatSize } from './attachment-logic';
import { type MessageStatus, OK_BADGE, useMessagingCtx } from './shared';

const PAGE_SIZE = 10;

type Counts = { queued: number; sent: number; failed: number; skipped: number };
const BAR: { key: keyof Counts; className: string }[] = [
  { key: 'sent', className: 'bg-emerald-500' },
  { key: 'queued', className: 'bg-sky-500' },
  { key: 'failed', className: 'bg-destructive' },
  { key: 'skipped', className: 'bg-muted-foreground/40' },
];

/** Bilah status terkirim/antre/gagal/dilewati; teks alternatif memuat angkanya. */
function StatusBar({ counts, total }: { counts: Counts; total: number }) {
  const t = useTranslations('messaging.direct');
  const denom = Math.max(total, counts.queued + counts.sent + counts.failed + counts.skipped, 1);
  return (
    <div
      role="img"
      aria-label={t('progress', {
        sent: counts.sent,
        queued: counts.queued,
        failed: counts.failed,
        skipped: counts.skipped,
      })}
      className="bg-muted flex h-2 w-full overflow-hidden rounded-full"
    >
      {BAR.map((b) => (
        <div key={b.key} className={b.className} style={{ width: `${(counts[b.key] / denom) * 100}%` }} />
      ))}
    </div>
  );
}

function Detail({ id, canSend, status }: { id: string; canSend: boolean; status: 'sending' | 'done' }) {
  const t = useTranslations('messaging.direct');
  const tm = useTranslations('messaging');
  const te = useTranslations();
  const { school, header } = useMessagingCtx();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['messaging-batch', school.schoolId, id],
    // Selama masih ada pesan antre, muat ulang berkala supaya progres terlihat.
    refetchInterval: status === 'sending' ? 5000 : false,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/messaging/batches/{id}', {
          params: { ...header, path: { id }, query: { limit: 500, offset: 0 } },
        }),
      ),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['messaging-batches', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['messaging-batch', school.schoolId, id] });
    queryClient.invalidateQueries({ queryKey: ['messaging-messages', school.schoolId] });
  };
  const cancel = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/v1/messaging/batches/{id}/cancel', { params: { ...header, path: { id } } })),
    onSuccess: (res) => {
      toast.success(t('cancelledToast', { n: res.cancelled }));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const retry = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/messaging/batches/{id}/retry-failed', { params: { ...header, path: { id } } }),
      ),
    onSuccess: (res) => {
      toast.success(t('retriedToast', { n: res.requeued }));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  // Unduh lewat fetch karena API butuh header x-school-id (tautan biasa tidak bisa membawanya).
  const download = async (attachmentId: string) => {
    try {
      const res = await fetch(`/v1/messaging/attachments/${attachmentId}/content`, {
        credentials: 'include',
        headers: header.header,
      });
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error(t('attachmentDownloadFailed'));
    }
  };

  const d = detail.data;
  if (detail.isPending) return <Skeleton className="h-24 w-full" />;
  if (!d) return null;
  const retryable = d.counts.failed > 0 || d.counts.skipped > 0;
  return (
    <div className="grid gap-3 border-t pt-3">
      <div className="grid gap-1">
        <p className="text-muted-foreground text-xs font-medium">{t('bodyLabel')}</p>
        <p className="bg-muted/50 rounded-lg p-2.5 text-sm break-words whitespace-pre-wrap">{d.body}</p>
      </div>
      {d.attachment && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Paperclip className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <span className="min-w-0 font-medium break-all">{d.attachment.fileName}</span>
          <span className="text-muted-foreground text-xs">({formatSize(d.attachment.size)})</span>
          {d.attachment.purged ? (
            <Badge variant="outline">{t('attachmentPurged')}</Badge>
          ) : (
            canSend && (
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 md:min-h-8"
                onClick={() => download((d.attachment as { id: string }).id)}
              >
                {t('attachmentDownload')}
              </Button>
            )
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {canSend && d.counts.queued > 0 && !d.cancelledAt && (
          <ConfirmDialog
            destructive
            title={t('cancelConfirmTitle')}
            description={t('cancelConfirmBody')}
            confirmLabel={t('cancel')}
            pending={cancel.isPending}
            onConfirm={() => cancel.mutateAsync()}
            trigger={
              <Button size="sm" variant="outline" className="min-h-11 md:min-h-8">
                {t('cancel')}
              </Button>
            }
          />
        )}
        {canSend && retryable && !d.cancelledAt && (
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 md:min-h-8"
            disabled={retry.isPending}
            onClick={() => retry.mutate()}
          >
            <RotateCw className="size-3.5" /> {t('retryFailed')}
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('colRecipient')}</TableHead>
              <TableHead>{tm('colPhone')}</TableHead>
              <TableHead>{tm('colStatus')}</TableHead>
              <TableHead>{tm('colDetail')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.recipients.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {r.name ?? '-'}{' '}
                  <span className="text-muted-foreground text-xs">({t(`type.${r.recipientType}`)})</span>
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">{r.phone}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      r.status === 'failed' ? 'destructive' : r.status === 'skipped' ? 'outline' : 'secondary'
                    }
                    className={r.status === 'sent' ? OK_BADGE : undefined}
                  >
                    {tm(`msgStatus.${r.status as MessageStatus}`)}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground max-w-56 text-xs break-words whitespace-normal">
                  {r.detail
                    ? t.has(`detail.${r.detail}` as never)
                      ? t(`detail.${r.detail}` as never)
                      : r.detail
                    : ''}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Riwayat batch pesan langsung: kartu per batch dengan bilah status, rincian per penerima, batalkan, kirim ulang. */
export function BatchHistory() {
  const t = useTranslations('messaging.direct');
  const tm = useTranslations('messaging');
  const te = useTranslations();
  const { school, header, canSend } = useMessagingCtx();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['messaging-batches', school.schoolId, limit],
    placeholderData: (prev) => prev,
    refetchInterval: 10_000,
    queryFn: async () =>
      unwrap(await api.GET('/v1/messaging/batches', { params: { ...header, query: { limit, offset: 0 } } })),
  });
  const data = list.data;

  return (
    <div className="grid gap-3">
      {list.isPending && <Skeleton className="h-40 w-full" />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(list.error))}</AlertDescription>
        </Alert>
      )}
      {data?.items.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('batchesEmpty')}</Card>
      )}
      {data?.items.map((b) => {
        const expanded = open === b.id;
        return (
          <Card key={b.id} className="grid gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium break-words">
                  {b.attachment && (
                    <Paperclip className="mr-1 inline size-3.5" aria-label={t('hasAttachment')} />
                  )}
                  {b.title}
                </p>
                <p className="text-muted-foreground text-xs">
                  {new Date(b.createdAt).toLocaleString()}
                  {b.createdBy ? ` · ${t('by', { name: b.createdBy })}` : ''} ·{' '}
                  {t('recipientCount', { n: b.recipientCount })}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {b.cancelledAt && <Badge variant="outline">{t('cancelledBadge')}</Badge>}
                <Badge variant="secondary">{t(`status.${b.status}`)}</Badge>
              </div>
            </div>
            <StatusBar counts={b.counts} total={b.recipientCount} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {(['sent', 'queued', 'failed', 'skipped'] as const).map((s) => (
                <span key={s} className="text-muted-foreground">
                  {tm(`msgStatus.${s}`)}: <strong className="text-foreground">{b.counts[s]}</strong>
                </span>
              ))}
            </div>
            <div>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11 md:min-h-8"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : b.id)}
              >
                {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                {expanded ? t('hideDetail') : t('showDetail')}
              </Button>
            </div>
            {expanded && <Detail id={b.id} canSend={canSend} status={b.status} />}
          </Card>
        );
      })}
      {data && data.total > data.items.length && (
        <div>
          <Button variant="outline" onClick={() => setLimit(limit + PAGE_SIZE)} disabled={list.isFetching}>
            {t('loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
