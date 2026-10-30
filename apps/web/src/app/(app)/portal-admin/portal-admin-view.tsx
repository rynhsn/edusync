'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Search, Trash2, UserRoundPlus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import {
  PORTAL_PATHS,
  type PortalAccount,
  type PortalInviteCreated,
  type PortalInviteRow,
  type PortalKind,
  portalRequest,
} from '@/lib/portal-api';
import { cn } from '@/lib/utils';
import { EmptyState } from '../portal/ui-bits';

interface Target {
  kind: PortalKind;
  id: string;
  name: string;
}

function useDebounced(value: string, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function PortalAdminView() {
  const t = useTranslations('portalAdmin');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const listKey = ['portal-admin', school.schoolId, 'invites'];
  const accountsKey = ['portal-admin', school.schoolId, 'accounts'];

  const [q, setQ] = useState('');
  const debounced = useDebounced(q.trim());
  const [student, setStudent] = useState<{ id: string; name: string; className: string | null } | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ link: string; name: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const invites = useQuery({
    queryKey: listKey,
    queryFn: () =>
      portalRequest<PortalInviteRow[]>('GET', PORTAL_PATHS.invites, { schoolId: school.schoolId }),
  });
  const accounts = useQuery({
    queryKey: accountsKey,
    queryFn: () =>
      portalRequest<PortalAccount[]>('GET', PORTAL_PATHS.accounts, { schoolId: school.schoolId }),
  });
  const found = useQuery({
    queryKey: ['portal-admin', school.schoolId, 'students', debounced],
    enabled: debounced.length >= 2 && !student,
    queryFn: async () =>
      unwrap(await api.GET('/v1/students', { params: { ...header, query: { q: debounced, limit: 8 } } })),
  });
  const guardians = useQuery({
    queryKey: ['portal-admin', school.schoolId, 'guardians', student?.id],
    enabled: !!student,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/students/{id}/guardians', {
          params: { ...header, path: { id: student?.id ?? '' } },
        }),
      ),
  });

  const create = useMutation({
    mutationFn: async (v: { target: Target; email: string }) =>
      portalRequest<PortalInviteCreated>('POST', PORTAL_PATHS.invites, {
        schoolId: school.schoolId,
        body: {
          kind: v.target.kind,
          ...(v.target.kind === 'guardian' ? { guardianId: v.target.id } : { studentId: v.target.id }),
          ...(v.email.trim() ? { email: v.email.trim() } : {}),
        },
      }),
    onSuccess: (res, v) => {
      setError(null);
      setCopied(false);
      setCreated({
        link: res.link,
        name: v.target.name,
        expiresAt: res.expiresAt,
      });
      queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) =>
      portalRequest<void>('DELETE', PORTAL_PATHS.invite(id), { schoolId: school.schoolId }),
    onSuccess: () => {
      toast.success(t('revoked'));
      queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const revokeAccount = useMutation({
    mutationFn: async (id: string) =>
      portalRequest<void>('DELETE', PORTAL_PATHS.account(id), { schoolId: school.schoolId }),
    onSuccess: () => {
      toast.success(t('accountRevoked'));
      queryClient.invalidateQueries({ queryKey: accountsKey });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      toast.error(t('copyFailed'));
    }
  }

  const items = invites.data ?? [];
  const accountItems = accounts.data ?? [];
  const targets: Target[] = student
    ? [
        { kind: 'student', id: student.id, name: student.name },
        ...(guardians.data ?? []).map((g) => ({ kind: 'guardian' as const, id: g.guardianId, name: g.name })),
      ]
    : [];
  const relationOf = (id: string) => guardians.data?.find((g) => g.guardianId === id)?.relation;

  return (
    <PageBody className="max-w-4xl">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <section className="bg-card grid gap-4 rounded-2xl border p-4 sm:p-5" aria-labelledby="pa-new">
        <div className="flex items-center gap-3">
          <span className="bg-accent text-accent-foreground grid size-10 place-items-center rounded-xl">
            <UserRoundPlus className="size-5" aria-hidden />
          </span>
          <div>
            <h2 id="pa-new" className="font-heading font-semibold">
              {t('newTitle')}
            </h2>
            <p className="text-muted-foreground text-sm">{t('newHint')}</p>
          </div>
        </div>

        {student ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2">
            <p className="text-sm font-medium">
              {student.name}
              {student.className && (
                <span className="text-muted-foreground font-normal"> · {student.className}</span>
              )}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setStudent(null)}>
              {t('changeStudent')}
            </Button>
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="pa-search">{t('searchLabel')}</Label>
            <div className="relative max-w-md">
              <Search
                className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                id="pa-search"
                className="pl-9"
                value={q}
                placeholder={t('searchPlaceholder')}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {found.data?.items.length === 0 && (
              <p className="text-muted-foreground text-sm">{t('noStudent')}</p>
            )}
            <ul className="grid max-w-md gap-1">
              {found.data?.items.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:ring-3"
                    onClick={() => setStudent({ id: s.id, name: s.name, className: s.className })}
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {[s.className, s.nis].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {student && (
          <ul className="grid gap-2">
            {targets.map((tg) => (
              <li
                key={`${tg.kind}-${tg.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{tg.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {tg.kind === 'student'
                      ? t('kind.student')
                      : `${t('kind.guardian')}${relationOf(tg.id) ? ` · ${t(`relation.${relationOf(tg.id) as 'father'}`)}` : ''}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEmail('');
                    setError(null);
                    setTarget(tg);
                  }}
                >
                  <KeyRound className="size-3.5" aria-hidden /> {t('invite')}
                </Button>
              </li>
            ))}
            {guardians.data?.length === 0 && (
              <p className="text-muted-foreground text-sm">{t('noGuardians')}</p>
            )}
          </ul>
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="pa-list">
        <h2 id="pa-list" className="font-heading text-lg font-semibold">
          {t('listTitle')}
        </h2>
        {invites.isError && <p className="text-destructive text-sm">{t('loadError')}</p>}
        {invites.data && items.length === 0 && <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />}
        <ul className="grid gap-2">
          {items.map((inv) => (
            <li
              key={inv.id}
              className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {inv.targetName}{' '}
                  <Badge variant="outline" className="ml-1">
                    {t(`kind.${inv.kind}`)}
                  </Badge>
                </p>
                <p className="text-muted-foreground text-xs">
                  {inv.email ? `${inv.email} · ` : ''}
                  {t('expiresOn', { date: formatCalendarDate(locale, inv.expiresAt.slice(0, 10)) })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-medium',
                    inv.expired ? 'bg-muted text-muted-foreground' : 'bg-chart-2/25',
                  )}
                >
                  {t(inv.expired ? 'status.expired' : 'status.pending')}
                </span>
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon" aria-label={t('revoke')}>
                      <Trash2 className="size-4" />
                    </Button>
                  }
                  title={t('revokeTitle')}
                  description={t('revokeBody', { name: inv.targetName })}
                  confirmLabel={t('revoke')}
                  destructive
                  pending={revoke.isPending}
                  onConfirm={() => revoke.mutateAsync(inv.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3" aria-labelledby="pa-accounts">
        <h2 id="pa-accounts" className="font-heading text-lg font-semibold">
          {t('accountsTitle')}
        </h2>
        {accounts.isError && <p className="text-destructive text-sm">{t('loadError')}</p>}
        {accounts.data && accountItems.length === 0 && (
          <EmptyState title={t('accountsEmptyTitle')} body={t('accountsEmptyBody')} />
        )}
        <ul className="grid gap-2">
          {accountItems.map((acc) => (
            <li
              key={acc.id}
              className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {acc.userName}{' '}
                  <Badge variant="outline" className="ml-1">
                    {t(`kind.${acc.kind}`)}
                  </Badge>
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {acc.userEmail} · {t('linkedTo', { name: acc.targetName })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-medium',
                    acc.status === 'active' ? 'bg-chart-5/20' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {t(`accountStatus.${acc.status}`)}
                </span>
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon" aria-label={t('revokeAccount')}>
                      <Trash2 className="size-4" />
                    </Button>
                  }
                  title={t('revokeAccountTitle')}
                  description={t('revokeAccountBody', { name: acc.userName })}
                  confirmLabel={t('revokeAccount')}
                  destructive
                  pending={revokeAccount.isPending}
                  onConfirm={() => revokeAccount.mutateAsync(acc.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <FormDialog
        open={!!target}
        title={t('createTitle', { name: target?.name ?? '' })}
        description={t('createBody')}
        submitLabel={t('create')}
        error={error}
        onOpenChange={(o) => !o && setTarget(null)}
        onSubmit={async () => {
          if (!target) return;
          await create.mutateAsync({ target, email });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="pa-email">{t('emailLabel')}</Label>
          <Input
            id="pa-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
          <p className="text-muted-foreground text-xs">{t('emailHint')}</p>
        </div>
      </FormDialog>

      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">{t('linkTitle')}</DialogTitle>
            <DialogDescription>{t('linkBody', { name: created?.name ?? '' })}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="pa-link">{t('linkLabel')}</Label>
            <div className="flex gap-2">
              <Input
                id="pa-link"
                readOnly
                value={created?.link ?? ''}
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button onClick={() => created && copy(created.link)} aria-live="polite">
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? t('copied') : t('copy')}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">{t('linkOnce')}</p>
          </div>
        </DialogContent>
      </Dialog>
    </PageBody>
  );
}
