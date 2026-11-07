'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, LifeBuoy, Lock, Send } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BackLink } from '@/components/back-link';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FieldError, useFormValidation } from '@/components/form-field-error';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { EmptyPanel } from '@/components/ui-kit';
import { ApiError } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { validateReply } from '@/lib/support';
import { ChatThread } from './chat-thread';
import { POLL_MS, type SupportApi } from './support-api';
import { PriorityBadge, StatusBadge } from './support-kit';

/** Percakapan satu laporan untuk pelapor: obrolan, kotak balasan, dan tombol Tutup laporan. */
export function TicketThread({ api, id }: { api: SupportApi; id: string }) {
  const t = useTranslations('support');
  const tc = useTranslations('common');
  const te = useTranslations();
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: [...api.key, 'detail', id],
    queryFn: () => api.get(id),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: 'always',
    retry: (count, e) => !(e instanceof ApiError && e.status === 404) && count < 1,
  });

  // Membuka laporan menandai balasan terbaca di server; segarkan lencana menu dan daftar.
  const loaded = detail.dataUpdatedAt;
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya bereaksi pada data baru
  useEffect(() => {
    if (loaded) {
      queryClient.invalidateQueries({ queryKey: [...api.key, 'unread'] });
      queryClient.invalidateQueries({ queryKey: [...api.key, 'list'] });
    }
  }, [loaded]);

  const validation = useFormValidation({
    errors: validateReply(body),
    order: ['body'],
    idPrefix: `support-reply-${id}`,
  });

  const refresh = (next: unknown) => {
    queryClient.setQueryData([...api.key, 'detail', id], next);
    queryClient.invalidateQueries({ queryKey: [...api.key, 'list'] });
  };

  const reply = useMutation({
    mutationFn: () => api.reply(id, body.trim()),
    onSuccess: (next) => {
      setBody('');
      setError(null);
      validation.reset();
      refresh(next);
      toast.success(t('thread.sent'));
    },
    onError: (e) => setError(te(errorKey(e) as never)),
  });

  const close = useMutation({
    mutationFn: () => api.close(id),
    onSuccess: () => {
      toast.success(t('thread.closedToast'));
      queryClient.invalidateQueries({ queryKey: [...api.key, 'detail', id] });
      queryClient.invalidateQueries({ queryKey: [...api.key, 'list'] });
    },
    onError: (e) => toast.error(te(errorKey(e) as never)),
  });

  const back = <BackLink href={api.basePath} label={t('thread.back')} />;

  if (detail.isPending) {
    return (
      <PageBody>
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </PageBody>
    );
  }

  if (detail.isError || !detail.data) {
    const missing = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <PageBody>
        <PageHeader icon={LifeBuoy} tone="sky" title={t('title')} actions={back} />
        <EmptyPanel
          icon={LifeBuoy}
          tone="rose"
          title={missing ? t('notFound') : t('loadError')}
          action={missing ? undefined : <Button onClick={() => detail.refetch()}>{tc('retry')}</Button>}
        />
      </PageBody>
    );
  }

  const ticket = detail.data;
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });
  const bodyProps = validation.fieldProps('body');

  return (
    <PageBody>
      <PageHeader
        icon={LifeBuoy}
        tone="sky"
        title={ticket.subject}
        description={t('thread.createdBy', { name: ticket.creatorName, date: date(ticket.createdAt) })}
        actions={back}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm font-medium tabular-nums">{ticket.ticketNo}</span>
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
        <span className="text-muted-foreground text-sm">{t(`category.${ticket.category}`)}</span>
      </div>

      {ticket.status === 'resolved' && (
        <Alert>
          <CheckCircle2 aria-hidden />
          <AlertDescription>{t('thread.resolvedNotice')}</AlertDescription>
        </Alert>
      )}

      <ChatThread messages={ticket.messages} viewerSide="school" />

      {ticket.canReply ? (
        <form
          noValidate
          className="bg-card grid gap-3 rounded-2xl border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!validation.attempt()) return;
            reply.mutate();
          }}
        >
          <label htmlFor={bodyProps.id} className="text-sm font-medium">
            {t('thread.replyLabel')}
          </label>
          <Textarea
            {...bodyProps}
            rows={4}
            value={body}
            placeholder={t('thread.replyPlaceholder')}
            onChange={(e) => setBody(e.target.value)}
          />
          <FieldError id={bodyProps.id} issue={validation.issue('body')} />
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <ConfirmDialog
              title={t('thread.closeTitle')}
              description={t('thread.closeBody')}
              confirmLabel={t('thread.closeConfirm')}
              pending={close.isPending}
              onConfirm={() => close.mutateAsync()}
              trigger={
                <Button type="button" variant="outline" className="h-10 md:h-8">
                  <Lock /> {t('thread.close')}
                </Button>
              }
            />
            <Button type="submit" className="h-10 md:h-8" disabled={reply.isPending}>
              <Send /> {t('thread.send')}
            </Button>
          </div>
        </form>
      ) : (
        <Alert>
          <Lock aria-hidden />
          <AlertDescription>{t('thread.closedNotice')}</AlertDescription>
        </Alert>
      )}
    </PageBody>
  );
}
