'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, MailPlus, Search, Trash2, UserCheck, UserRoundPlus, UsersRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { type InviteTarget, PortalInviteFlow } from '@/components/portal-invite-flow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyPanel, PersonCell, StatCard, StatGrid, ToneBadge } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { PORTAL_PATHS, type PortalAccount, type PortalInviteRow, portalRequest } from '@/lib/portal-api';

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
  const [target, setTarget] = useState<InviteTarget | null>(null);

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

  const items = invites.data ?? [];
  const accountItems = accounts.data ?? [];
  const targets: InviteTarget[] = student
    ? [
        { kind: 'student', id: student.id, name: student.name },
        ...(guardians.data ?? []).map((g) => ({ kind: 'guardian' as const, id: g.guardianId, name: g.name })),
      ]
    : [];
  const relationOf = (id: string) => guardians.data?.find((g) => g.guardianId === id)?.relation;

  return (
    <PageBody>
      <PageHeader icon={UsersRound} tone="violet" title={t('title')} description={t('subtitle')} />

      <StatGrid className="lg:grid-cols-2">
        <StatCard
          label={t('statPending')}
          value={items.filter((i) => !i.expired).length}
          icon={MailPlus}
          tone="amber"
        />
        <StatCard
          label={t('statAccounts')}
          value={accountItems.filter((a) => a.status === 'active').length}
          icon={UserCheck}
          tone="emerald"
        />
      </StatGrid>

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
          <div className="grid content-start gap-2">
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
          <ul className="grid content-start gap-2">
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
                <Button size="sm" variant="outline" onClick={() => setTarget(tg)}>
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
        {invites.data && items.length === 0 && (
          <EmptyPanel icon={MailPlus} tone="amber" title={t('emptyTitle')} body={t('emptyBody')} />
        )}
        {items.length > 0 && (
          <ul className="bg-card divide-y overflow-hidden rounded-2xl border">
            {items.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <PersonCell
                  name={inv.targetName}
                  sub={`${inv.email ? `${inv.email} · ` : ''}${t('expiresOn', { date: formatCalendarDate(locale, inv.expiresAt.slice(0, 10)) })}`}
                />
                <div className="flex items-center gap-2">
                  <ToneBadge tone="slate" dot={false}>
                    {t(`kind.${inv.kind}`)}
                  </ToneBadge>
                  <ToneBadge tone={inv.expired ? 'slate' : 'amber'}>
                    {t(inv.expired ? 'status.expired' : 'status.pending')}
                  </ToneBadge>
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
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="pa-accounts">
        <h2 id="pa-accounts" className="font-heading text-lg font-semibold">
          {t('accountsTitle')}
        </h2>
        {accounts.isError && <p className="text-destructive text-sm">{t('loadError')}</p>}
        {accounts.data && accountItems.length === 0 && (
          <EmptyPanel
            icon={UserCheck}
            tone="emerald"
            title={t('accountsEmptyTitle')}
            body={t('accountsEmptyBody')}
          />
        )}
        {accountItems.length > 0 && (
          <ul className="bg-card divide-y overflow-hidden rounded-2xl border">
            {accountItems.map((acc) => (
              <li key={acc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <PersonCell
                  name={acc.userName}
                  sub={`${acc.userEmail} · ${t('linkedTo', { name: acc.targetName })}`}
                />
                <div className="flex items-center gap-2">
                  <ToneBadge tone="slate" dot={false}>
                    {t(`kind.${acc.kind}`)}
                  </ToneBadge>
                  <ToneBadge tone={acc.status === 'active' ? 'emerald' : 'slate'}>
                    {t(`accountStatus.${acc.status}`)}
                  </ToneBadge>
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
        )}
      </section>

      <PortalInviteFlow
        target={target}
        onClose={() => setTarget(null)}
        onCreated={() => queryClient.invalidateQueries({ queryKey: listKey })}
      />
    </PageBody>
  );
}
