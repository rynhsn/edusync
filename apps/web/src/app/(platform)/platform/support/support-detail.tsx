'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, MessagesSquare, Send } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { BackLink } from '@/components/back-link';
import { FieldError, useFormValidation } from '@/components/form-field-error';
import { PageBody, PageHeader } from '@/components/page-header';
import { ChatThread } from '@/components/support/chat-thread';
import { POLL_MS } from '@/components/support/support-api';
import { PriorityBadge, StatusBadge } from '@/components/support/support-kit';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { EmptyPanel } from '@/components/ui-kit';
import { ApiError, api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import {
  CATEGORIES,
  PRIORITIES,
  STATUSES,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
  validateReply,
} from '@/lib/support';
import { cn } from '@/lib/utils';
import { useStaff } from '../../platform-shell';
import { QueryError } from '../platform-kit';

/** Nilai konteks otomatis ditampilkan sebagai teks polos (tidak pernah sebagai HTML). */
function show(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.length ? value.join(', ') : null;
  return String(value);
}

export function PlatformSupportDetail({ id }: { id: string }) {
  const t = useTranslations('platformSupport');
  const td = useTranslations('platformSupport.detail');
  const ts = useTranslations('support');
  const te = useTranslations();
  const format = useFormatter();
  const queryClient = useQueryClient();
  const { role } = useStaff();
  const isAdmin = role === 'admin';
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = ['platform-support', 'detail', id];
  const detail = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(await api.GET('/v1/platform/support/tickets/{id}', { params: { path: { id } } })),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: 'always',
    retry: (count, e) => !(e instanceof ApiError && e.status === 404) && count < 1,
  });
  const staff = useQuery({
    queryKey: ['platform-staff'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/staff')),
  });

  const validation = useFormValidation({
    errors: validateReply(body),
    order: ['body'],
    idPrefix: `platform-reply-${id}`,
  });

  const afterChange = (next: unknown) => {
    queryClient.setQueryData(key, next);
    queryClient.invalidateQueries({ queryKey: ['platform-support', 'list'] });
    queryClient.invalidateQueries({ queryKey: ['platform-support', 'unread'] });
    queryClient.invalidateQueries({ queryKey: ['platform-audit'] });
  };

  const send = useMutation({
    mutationFn: async (v: { body: string; internal: boolean }) =>
      unwrap(
        await api.POST('/v1/platform/support/tickets/{id}/messages', {
          params: { path: { id } },
          body: v,
        }),
      ),
    onSuccess: (next, v) => {
      setBody('');
      setError(null);
      validation.reset();
      afterChange(next);
      toast.success(v.internal ? td('noteSaved') : td('replySent'));
    },
    onError: (e) => setError(te(errorKey(e) as never)),
  });

  const patch = useMutation({
    mutationFn: async (v: {
      status?: TicketStatus;
      priority?: TicketPriority;
      category?: TicketCategory;
      assignedStaffId?: string | null;
    }) => unwrap(await api.PATCH('/v1/platform/support/tickets/{id}', { params: { path: { id } }, body: v })),
    onSuccess: (next) => {
      afterChange(next);
      toast.success(td('saved'));
    },
    onError: (e) => toast.error(te(errorKey(e) as never)),
  });

  const back = <BackLink href="/platform/support" label={td('back')} />;

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
        <PageHeader icon={MessagesSquare} tone="sky" title={t('title')} actions={back} />
        {missing ? (
          <EmptyPanel icon={MessagesSquare} tone="rose" title={ts('notFound')} />
        ) : (
          <QueryError error={detail.error} onRetry={() => detail.refetch()} />
        )}
      </PageBody>
    );
  }

  const ticket = detail.data;
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });
  const closed = ticket.status === 'closed';
  const bodyProps = validation.fieldProps('body');
  const ctx = ticket.context;
  const none = td('ctxNone');
  const ctxRows: [string, string][] = [
    [td('ctxSchool'), show(ctx.schoolName) ?? none],
    [td('ctxFoundation'), show(ctx.foundationName) ?? none],
    [td('ctxTier'), show(ctx.tier) ?? none],
    [
      td('ctxSubscription'),
      [show(ctx.subscriptionStatus), show(ctx.subscriptionPeriod)].filter(Boolean).join(' · ') || none,
    ],
    [td('ctxRoles'), show(ctx.roles) ?? none],
    [td('ctxPage'), show(ctx.page) ?? none],
    [td('ctxBrowser'), show(ctx.userAgent) ?? none],
  ];

  return (
    <PageBody>
      <PageHeader
        icon={MessagesSquare}
        tone="sky"
        title={ticket.subject}
        description={`${td('reporterLine', { name: ticket.creatorName, email: ticket.creatorEmail })} · ${td('createdAt', { date: date(ticket.createdAt) })}`}
        actions={back}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm font-medium tabular-nums">{ticket.ticketNo}</span>
        <StatusBadge status={ticket.status} platform />
        <PriorityBadge priority={ticket.priority} />
        <span className="text-muted-foreground text-sm">{ts(`category.${ticket.category}`)}</span>
        {ticket.resolvedAt && (
          <span className="text-muted-foreground text-xs">
            {td('resolvedAt', { date: date(ticket.resolvedAt) })}
          </span>
        )}
        {ticket.closedAt && (
          <span className="text-muted-foreground text-xs">
            {td('closedAt', { date: date(ticket.closedAt) })}
          </span>
        )}
      </div>

      {!isAdmin && (
        <Alert>
          <Lock aria-hidden />
          <AlertDescription>{td('readOnly')}</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="grid min-w-0 gap-4" aria-label={td('conversation')}>
          <ChatThread messages={ticket.messages} viewerSide="platform" />

          {isAdmin && (
            <form
              noValidate
              className={cn(
                'grid gap-3 rounded-2xl border p-4',
                internal ? 'border-amber-500/60 border-dashed bg-amber-500/10' : 'bg-card',
              )}
              onSubmit={(e) => {
                e.preventDefault();
                if (!validation.attempt()) return;
                send.mutate({ body: body.trim(), internal });
              }}
            >
              {closed && !internal && (
                <Alert>
                  <Lock aria-hidden />
                  <AlertDescription>{td('closedNotice')}</AlertDescription>
                </Alert>
              )}
              <label htmlFor="ps-internal" className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  id="ps-internal"
                  checked={internal}
                  onCheckedChange={(v) => setInternal(v === true)}
                />
                {td('internalToggle')}
              </label>
              <p className="text-muted-foreground text-xs">
                {internal ? td('internalHint') : td('publicHint')}
              </p>
              <Textarea
                {...bodyProps}
                rows={4}
                aria-label={internal ? td('notePlaceholder') : td('replyPlaceholder')}
                value={body}
                placeholder={internal ? td('notePlaceholder') : td('replyPlaceholder')}
                onChange={(e) => setBody(e.target.value)}
              />
              <FieldError id={bodyProps.id} issue={validation.issue('body')} />
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="flex justify-end">
                <Button
                  type="submit"
                  className="h-10 md:h-8"
                  disabled={send.isPending || (closed && !internal)}
                >
                  <Send /> {internal ? td('sendNote') : td('sendReply')}
                </Button>
              </div>
            </form>
          )}
        </section>

        <aside className="grid min-w-0 gap-4">
          <section className="bg-card grid gap-3 rounded-2xl border p-4" aria-label={td('controls')}>
            <h2 className="font-heading font-semibold">{td('controls')}</h2>
            <div className="grid gap-1.5">
              <Label htmlFor="ps-status">{td('status')}</Label>
              <SelectField
                id="ps-status"
                value={ticket.status}
                disabled={!isAdmin || patch.isPending}
                onChange={(e) => patch.mutate({ status: e.target.value as TicketStatus })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ps-priority">{td('priority')}</Label>
              <SelectField
                id="ps-priority"
                value={ticket.priority}
                disabled={!isAdmin || patch.isPending}
                onChange={(e) => patch.mutate({ priority: e.target.value as TicketPriority })}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {ts(`priority.${p}`)}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ps-category">{td('category')}</Label>
              <SelectField
                id="ps-category"
                value={ticket.category}
                disabled={!isAdmin || patch.isPending}
                onChange={(e) => patch.mutate({ category: e.target.value as TicketCategory })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {ts(`category.${c}`)}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ps-assignee">{td('assignee')}</Label>
              <SelectField
                id="ps-assignee"
                value={ticket.assignedStaffId ?? ''}
                disabled={!isAdmin || patch.isPending}
                onChange={(e) => patch.mutate({ assignedStaffId: e.target.value || null })}
              >
                <option value="">{t('unassigned')}</option>
                {staff.data?.staff.map((s) => (
                  <option key={s.userId} value={s.userId}>
                    {s.name}
                  </option>
                ))}
              </SelectField>
            </div>
          </section>

          <section className="bg-card grid gap-3 rounded-2xl border p-4" aria-label={td('contextTitle')}>
            <h2 className="font-heading font-semibold">{td('contextTitle')}</h2>
            <dl className="grid gap-2 text-sm">
              {ctxRows.map(([label, value]) => (
                <div key={label} className="grid gap-0.5">
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </PageBody>
  );
}
