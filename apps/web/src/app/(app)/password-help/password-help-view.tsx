'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Phone, ShieldAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { EmptyPanel, type Tone, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import type { paths } from '@/lib/api-types';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { type CreatedResetLink, formatDateTime, ResetLinkDialog } from './reset-link-dialog';

type List = paths['/v1/password-help/requests']['get']['responses'][200]['content']['application/json'];
type Item = List['items'][number];
type Status = Item['status'];

const STATUSES: Status[] = ['new', 'in_progress', 'done', 'rejected'];
const STATUS_TONE: Record<Status, Tone> = {
  new: 'amber',
  in_progress: 'sky',
  done: 'emerald',
  rejected: 'slate',
};
const STATUS_KEY = {
  new: 'statusNew',
  in_progress: 'statusInProgress',
  done: 'statusDone',
  rejected: 'statusRejected',
} as const;
const LINK_KEY = {
  active: 'linkActive',
  used: 'linkUsed',
  revoked: 'linkRevoked',
  expired: 'linkExpired',
} as const;

export function PasswordHelpView() {
  const t = useTranslations('passwordHelp');
  const locale = useLocale();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [filter, setFilter] = useState<Status | 'all'>('new');
  const [openId, setOpenId] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedResetLink | null>(null);

  const listKey = ['password-help', school.schoolId];
  const list = useQuery({
    queryKey: [...listKey, 'all'],
    refetchInterval: 60_000,
    queryFn: async () =>
      unwrap(await api.GET('/v1/password-help/requests', { params: { ...header, query: {} } })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: listKey });

  const items = (list.data?.items ?? []).filter((i) => filter === 'all' || i.status === filter);
  const counts = list.data?.counts;
  const open = list.data?.items.find((i) => i.id === openId) ?? null;

  return (
    <PageBody>
      <PageHeader icon={KeyRound} tone="amber" title={t('title')} description={t('subtitle')} />

      <div role="tablist" aria-label={t('title')} className="flex flex-wrap gap-2">
        {(['all', ...STATUSES] as const).map((s) => {
          const n = s === 'all' ? Object.values(counts ?? {}).reduce((a, b) => a + b, 0) : (counts?.[s] ?? 0);
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={filter === s}
              onClick={() => setFilter(s)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition-colors',
                filter === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card hover:bg-accent',
              )}
            >
              {s === 'all' ? t('all') : t(STATUS_KEY[s])} <span className="opacity-70">({n})</span>
            </button>
          );
        })}
      </div>

      {list.isPending ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : list.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      ) : items.length === 0 ? (
        <EmptyPanel icon={KeyRound} tone="amber" title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => setOpenId(i.id)}
                className="bg-card hover:bg-accent/40 grid w-full gap-2 rounded-2xl border p-4 text-left transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{i.claimedName}</p>
                  <ToneBadge tone={STATUS_TONE[i.status]}>{t(STATUS_KEY[i.status])}</ToneBadge>
                </div>
                {i.claimedInfo && (
                  <p className="text-muted-foreground line-clamp-2 text-sm">{i.claimedInfo}</p>
                )}
                <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                  <Phone className="size-3.5" aria-hidden />
                  {i.contactPhone}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('reportedAt', { date: formatDateTime(locale, i.createdAt) })}
                  {i.matched && ` · ${i.matched.name}`}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <RequestDialog
        key={open?.id ?? 'none'}
        item={open}
        onClose={() => setOpenId(null)}
        onCreated={(link) => {
          setCreated(link);
          refresh();
        }}
        onChanged={refresh}
      />
      <ResetLinkDialog link={created} onClose={() => setCreated(null)} onChanged={refresh} />
    </PageBody>
  );
}

function RequestDialog({
  item,
  onClose,
  onCreated,
  onChanged,
}: {
  item: Item | null;
  onClose: () => void;
  onCreated: (link: CreatedResetLink) => void;
  onChanged: () => void;
}) {
  const t = useTranslations('passwordHelp');
  const te = useTranslations();
  const locale = useLocale();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const roleLabel = (key: string) => (te.has(`roles.${key}` as never) ? te(`roles.${key}` as never) : key);
  const blockedText = (code: string | null) => {
    if (code === 'protected_account') return t('blockedProtected');
    if (code === 'multi_school_account') return t('blockedMulti');
    return t('blockedOther');
  };
  const [note, setNote] = useState(item?.note ?? '');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<{ userId: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ['members', school.schoolId],
    enabled: !!item,
    queryFn: async () => unwrap(await api.GET('/v1/members', { params: header })),
  });
  const q = search.trim().toLowerCase();
  const candidates =
    q.length < 2
      ? []
      : (members.data ?? [])
          .filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
          .slice(0, 6);

  const patch = useMutation({
    mutationFn: async (body: { status?: Status; note?: string | null }) =>
      unwrap(
        await api.PATCH('/v1/password-help/requests/{id}', {
          params: { ...header, path: { id: (item as Item).id } },
          body,
        }),
      ),
    onSuccess: () => {
      setError(null);
      toast.success(t('saved'));
      onChanged();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const makeLink = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/password-help/requests/{id}/link', {
          params: { ...header, path: { id: (item as Item).id } },
          body: picked ? { userId: picked.userId } : {},
        }),
      ),
    onSuccess: (link) => {
      setError(null);
      onClose();
      onCreated(link);
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const matched = item?.matched ?? null;
  const target = picked ?? (matched?.resettable ? { userId: matched.userId, name: matched.name } : null);
  const closed = item?.status === 'rejected';

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {item && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading text-lg">{item.claimedName}</DialogTitle>
              <DialogDescription>
                {t('reportedAt', { date: formatDateTime(locale, item.createdAt) })}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <section className="grid content-start gap-2 rounded-xl border p-3 text-sm">
                <Field label={t('claimedName')} value={item.claimedName} />
                <Field label={t('claimedInfo')} value={item.claimedInfo} empty={t('notFilled')} />
                <Field label={t('contactPhone')} value={item.contactPhone} />
                <Field label={t('identifier')} value={item.identifierGiven} empty={t('notFilled')} />
              </section>
              <section className="grid content-start gap-2 rounded-xl border p-3 text-sm">
                <p className="text-muted-foreground text-xs font-medium">{t('matchTitle')}</p>
                {matched ? (
                  <>
                    <p className="font-medium">{matched.name}</p>
                    <p>{matched.emailMasked}</p>
                    {matched.phoneMasked && <p>{matched.phoneMasked}</p>}
                    <p className="text-muted-foreground">
                      {t('matchRoles', { roles: matched.roles.map(roleLabel).join(', ') })}
                    </p>
                    <p className="text-muted-foreground">
                      {matched.lastLoginAt
                        ? t('lastLogin', { date: formatDateTime(locale, matched.lastLoginAt) })
                        : t('neverLogin')}
                    </p>
                    {!matched.resettable && (
                      <p className="text-destructive flex items-start gap-1.5 text-xs">
                        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        {blockedText(matched.blockedCode)}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">{t('noMatch')}</p>
                )}
              </section>
            </div>

            <Alert>
              <AlertDescription>{t('verifyHint')}</AlertDescription>
            </Alert>

            {item.links.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {item.links.map((l) => (
                  <ToneBadge key={l.id} tone={l.state === 'active' ? 'emerald' : 'slate'}>
                    {t(LINK_KEY[l.state])} · {formatDateTime(locale, l.createdAt)}
                  </ToneBadge>
                ))}
              </div>
            )}

            {!closed && (
              <div className="grid gap-2">
                <Label htmlFor="ph-pick">{t('pickOther')}</Label>
                <Input
                  id="ph-pick"
                  className="h-10"
                  placeholder={t('pickSearch')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {q.length >= 2 && candidates.length === 0 && (
                  <p className="text-muted-foreground text-sm">{t('pickNone')}</p>
                )}
                {candidates.map((m) => (
                  <button
                    key={m.userId}
                    type="button"
                    onClick={() => {
                      setPicked({ userId: m.userId, name: m.name });
                      setSearch('');
                    }}
                    className="hover:bg-accent flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm"
                  >
                    <span className="truncate">
                      {m.name} · <span className="text-muted-foreground">{m.email}</span>
                    </span>
                    <span className="text-primary shrink-0 text-xs">{t('pickUse')}</span>
                  </button>
                ))}
                {picked && <p className="text-sm font-medium">{picked.name}</p>}
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="ph-note">{t('note')}</Label>
              <Textarea
                id="ph-note"
                rows={2}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={patch.isPending || note === (item.note ?? '')}
                  onClick={() => patch.mutate({ note: note.trim() || null })}
                >
                  {t('saveNote')}
                </Button>
                {item.status === 'new' && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={patch.isPending}
                    onClick={() => patch.mutate({ status: 'in_progress' })}
                  >
                    {t('markInProgress')}
                  </Button>
                )}
                {(item.status === 'new' || item.status === 'in_progress') && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={patch.isPending}
                    onClick={() => patch.mutate({ status: 'done' })}
                  >
                    {t('markDone')}
                  </Button>
                )}
                {(item.status === 'done' || item.status === 'rejected') && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={patch.isPending}
                    onClick={() => patch.mutate({ status: 'new' })}
                  >
                    {t('reopen')}
                  </Button>
                )}
                {item.status !== 'rejected' && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive"
                    disabled={patch.isPending}
                    onClick={() => patch.mutate({ status: 'rejected' })}
                  >
                    {t('reject')}
                  </Button>
                )}
              </div>
              {!closed && (
                <Button
                  type="button"
                  disabled={!target || makeLink.isPending}
                  onClick={() => makeLink.mutate()}
                >
                  <KeyRound className="size-4" />
                  {makeLink.isPending ? t('creating') : t('createLink')}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, empty }: { label: string; value: string | null; empty?: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="break-words">{value || empty || ''}</p>
    </div>
  );
}
