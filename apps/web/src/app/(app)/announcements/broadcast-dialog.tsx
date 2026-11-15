'use client';

import { composeMessage } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { TOUCH_INPUT } from '@/components/form-field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { AttachmentPicker, type PickedAttachment } from '../messaging/attachment-picker';
import { StatusBar } from '../messaging/batch-history';
import { estimateMinutes } from '../messaging/direct-logic';
import { WaBubble } from '../messaging/wa-bubble';

export interface BroadcastTarget {
  id: string;
  title: string;
}

/**
 * "Siarkan lewat WhatsApp" untuk pengumuman terbit: pratinjau penerima, isi pesan, lampiran opsional, lalu konfirmasi
 * (> 30 penerima wajib mengetik jumlahnya). Bila sudah pernah disiarkan, menampilkan status siaran saja.
 */
export function BroadcastDialog({
  target,
  onOpenChange,
}: {
  target: BroadcastTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('announcements.broadcast');
  const td = useTranslations('messaging.direct');
  const tc = useTranslations('common');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const id = target?.id ?? '';
  const [includeStaff, setIncludeStaff] = useState(false);
  const [attachment, setAttachment] = useState<PickedAttachment | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const open = target !== null;
  const statusKey = ['announcement-broadcast', school.schoolId, id];

  const status = useQuery({
    queryKey: statusKey,
    enabled: open,
    refetchInterval: (q) => (q.state.data?.batch?.status === 'sending' ? 5000 : false),
    queryFn: async () =>
      unwrap(await api.GET('/v1/announcements/{id}/broadcast', { params: { ...header, path: { id } } })),
  });
  const already = status.data?.batch ?? null;
  const settings = useQuery({
    queryKey: ['messaging-settings', school.schoolId],
    enabled: open,
    queryFn: async () => unwrap(await api.GET('/v1/messaging/settings', { params: header })),
  });
  const review = useQuery({
    queryKey: ['announcement-broadcast-preview', school.schoolId, id, includeStaff],
    enabled: open && status.isSuccess && !already,
    placeholderData: (prev) => prev,
    queryFn: async () =>
      unwrap(
        await api.POST('/v1/announcements/{id}/broadcast/preview', {
          params: { ...header, path: { id } },
          body: includeStaff ? { includeStaff: true } : {},
        }),
      ),
  });
  const r = review.data;

  const changeAttachment = (next: PickedAttachment | null) => {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(next);
  };
  const close = (o: boolean) => {
    if (o) return;
    changeAttachment(null);
    setIncludeStaff(false);
    setTyped('');
    setError(null);
    onOpenChange(false);
  };

  const send = useMutation({
    mutationFn: async () => {
      if (!r) throw new Error('no_preview');
      return unwrap(
        await api.POST('/v1/announcements/{id}/broadcast', {
          params: { ...header, path: { id } },
          body: {
            expectedTotal: r.total,
            ...(includeStaff ? { includeStaff: true } : {}),
            ...(attachment ? { attachmentId: attachment.id } : {}),
          },
        }),
      );
    },
    onSuccess: (res) => {
      toast.success(t('sentToast', { total: res.total }));
      setTyped('');
      setError(null);
      changeAttachment(null);
      queryClient.invalidateQueries({ queryKey: statusKey });
      queryClient.invalidateQueries({ queryKey: ['messaging-batches', school.schoolId] });
    },
    onError: (e) => {
      setTyped('');
      setError(te(errorKey(e)));
      if (errorKey(e) === 'errors.attachment_invalid') changeAttachment(null);
      queryClient.invalidateQueries({ queryKey: ['announcement-broadcast-preview', school.schoolId, id] });
      queryClient.invalidateQueries({ queryKey: statusKey });
    },
  });

  const total = r?.total ?? 0;
  const overLimit = r ? total > r.dailyRemaining : false;
  const overQueue = r ? total > r.queueRemaining : false;
  const blocked = !r || total === 0 || !r.enabled || overLimit || overQueue || attachmentBusy;
  const typedOk = !r?.confirmTyping || typed.trim() === String(total);
  const bubble = r ? composeMessage(r.message, { ...settings.data, schoolName: school.schoolName }) : '';

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{target ? t('intro', { title: target.title }) : ''}</DialogDescription>
        </DialogHeader>

        {(status.isPending || (!already && review.isPending && !r)) && <Skeleton className="h-40 w-full" />}
        {(status.isError || review.isError) && (
          <Alert variant="destructive">
            <AlertDescription>{te(errorKey(status.error ?? review.error))}</AlertDescription>
          </Alert>
        )}

        {already && (
          <div className="grid gap-3" aria-live="polite">
            <p className="text-sm font-medium">{t('alreadyTitle')}</p>
            <StatusBar counts={already.counts} total={already.recipientCount} />
            <p className="text-muted-foreground text-sm">
              {td('progress', already.counts)} · {t(`state.${already.status}`)}
            </p>
            {already.cancelledAt && <p className="text-muted-foreground text-xs">{t('cancelledNote')}</p>}
            <p className="text-muted-foreground text-xs">{t('oneOnly')}</p>
            <Button
              variant="outline"
              className="w-fit"
              nativeButton={false}
              render={<Link href="/messaging" />}
            >
              {t('openHistory')}
            </Button>
          </div>
        )}

        {!already && r && (
          <div className="grid gap-4" aria-live="polite">
            <p className="text-muted-foreground text-sm">{t(`target.${r.audience}`)}</p>
            {r.staffMode === 'optional' && (
              <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={includeStaff}
                  onChange={(e) => {
                    setIncludeStaff(e.target.checked);
                    setTyped('');
                  }}
                />
                {t('includeStaff')}
              </label>
            )}

            <div className="grid gap-1">
              <p className="text-muted-foreground text-xs font-medium">{t('messageLabel')}</p>
              <WaBubble body={bubble} attachment={attachment} />
              {r.truncated && <p className="text-muted-foreground text-xs">{t('truncated')}</p>}
            </div>

            <AttachmentPicker value={attachment} onChange={changeAttachment} onBusy={setAttachmentBusy} />

            <div className="grid gap-2 rounded-lg border p-3">
              <p className="text-base font-medium">
                {total === 0 ? td('noRecipients') : td('recipientsLine', { total })}
              </p>
              {(r.excluded.noPhone > 0 ||
                r.excluded.invalid > 0 ||
                r.excluded.duplicate > 0 ||
                r.excluded.optedOut > 0) && (
                <p className="text-muted-foreground text-sm">
                  {t('excludedLine', {
                    noPhone: r.excluded.noPhone,
                    invalid: r.excluded.invalid,
                    duplicate: r.excluded.duplicate,
                    optedOut: r.excluded.optedOut,
                  })}
                </p>
              )}
              <p className="text-muted-foreground text-sm">
                {td('dailyLine', { remaining: r.dailyRemaining, limit: r.dailyLimit })}
                {total > 0 &&
                  ` ${td('durationLine', { minutes: estimateMinutes(total, r.avgDelaySeconds) })}`}
              </p>
              {r.sample.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  <span className="font-medium">{td('sampleTitle')}: </span>
                  {r.sample.map((s) => `${s.name} (${s.phone})`).join(', ')}
                  {total > r.sample.length && ` ${td('andMore', { n: total - r.sample.length })}`}
                </p>
              )}
            </div>

            {!r.enabled && (
              <Alert variant="destructive">
                <AlertDescription>{td('warn.disabled')}</AlertDescription>
              </Alert>
            )}
            {r.enabled && !r.accountReady && (
              <Alert>
                <AlertDescription>{td('warn.notReady')}</AlertDescription>
              </Alert>
            )}
            {overLimit && (
              <Alert variant="destructive">
                <AlertDescription>{td('warn.overLimit', { remaining: r.dailyRemaining })}</AlertDescription>
              </Alert>
            )}
            {overQueue && !overLimit && (
              <Alert variant="destructive">
                <AlertDescription>{td('warn.queueFull', { remaining: r.queueRemaining })}</AlertDescription>
              </Alert>
            )}
            {r.newNumber && (
              <p className="text-muted-foreground text-xs">{td('warn.newNumber', { limit: r.dailyLimit })}</p>
            )}
            <p className="text-muted-foreground text-xs">{t('pace')}</p>
            <p className="text-muted-foreground text-xs">{td('warn.risk')}</p>

            {r.confirmTyping && (
              <div className="grid gap-1.5">
                <Label htmlFor="broadcast-confirm-count">{td('confirmType', { total })}</Label>
                <Input
                  id="broadcast-confirm-count"
                  className={TOUCH_INPUT}
                  inputMode="numeric"
                  autoComplete="off"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                />
              </div>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={send.isPending} onClick={() => close(false)}>
            {already ? tc('close') : tc('cancel')}
          </Button>
          {!already && (
            <Button disabled={blocked || !typedOk || send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? td('sending') : t('confirmButton', { total })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
