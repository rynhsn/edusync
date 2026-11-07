'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Mail, RotateCw, Trash2, UserCog, UserPlus, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
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
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyPanel, PersonCell, ToneBadge } from '@/components/ui-kit';
import { api, unwrap } from '@/lib/api';
import { type StaffRole, staffErrorKey } from '@/lib/platform-staff';
import { useStaff } from '../../platform-shell';
import { QueryError } from '../platform-kit';

interface Issued {
  email: string;
  inviteUrl: string;
}

export function StaffView() {
  const t = useTranslations('platformStaff');
  const te = useTranslations();
  const format = useFormatter();
  const { role: myRole } = useStaff();
  const isAdmin = myRole === 'admin';
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<StaffRole>('read_only');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);

  const list = useQuery({
    queryKey: ['platform-staff'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/staff')),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['platform-staff'] });
    queryClient.invalidateQueries({ queryKey: ['platform-audit'] });
  };
  const fail = (e: unknown) => toast.error(te(staffErrorKey(e) as never));

  const invite = useMutation({
    mutationFn: async (v: { email: string; role: StaffRole }) =>
      unwrap(await api.POST('/v1/platform/staff/invitations', { body: v })),
    onSuccess: (r) => {
      setDialogError(null);
      setIssued({ email: r.email, inviteUrl: r.inviteUrl });
      toast.success(t('sent', { email: r.email }));
      refresh();
    },
    onError: (e) => setDialogError(te(staffErrorKey(e) as never)),
  });
  const resend = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.POST('/v1/platform/staff/invitations/{id}/resend', { params: { path: { id } } })),
    onSuccess: (r) => {
      setIssued({ email: r.email, inviteUrl: r.inviteUrl });
      toast.success(t('resent'));
      refresh();
    },
    onError: fail,
  });
  const revoke = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/platform/staff/invitations/{id}', { params: { path: { id } } })),
    onSuccess: () => {
      toast.success(t('revoked'));
      refresh();
    },
    onError: fail,
  });
  const changeRole = useMutation({
    mutationFn: async (v: { userId: string; role: StaffRole }) =>
      unwrap(
        await api.PATCH('/v1/platform/staff/{userId}', {
          params: { path: { userId: v.userId } },
          body: { role: v.role },
        }),
      ),
    onSuccess: () => {
      toast.success(t('roleChanged'));
      refresh();
    },
    onError: (e) => {
      fail(e);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: async (userId: string) =>
      unwrap(await api.DELETE('/v1/platform/staff/{userId}', { params: { path: { userId } } })),
    onSuccess: () => {
      toast.success(t('removed'));
      refresh();
    },
    onError: fail,
  });

  const roleLabel = (r: StaffRole) => (r === 'admin' ? t('roleAdmin') : t('roleReadOnly'));
  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('copied'));
    } catch {
      toast.error(t('copyFailed'));
    }
  }

  return (
    <PageBody>
      <PageHeader
        icon={UserCog}
        tone="violet"
        title={t('title')}
        description={t('subtitle')}
        actions={
          isAdmin && (
            <Button
              onClick={() => {
                setEmail('');
                setInviteRole('read_only');
                setDialogError(null);
                setInviteOpen(true);
              }}
            >
              <UserPlus /> {t('invite')}
            </Button>
          )
        }
      />

      {list.isPending && <Skeleton className="h-40 w-full rounded-2xl" />}
      {list.isError && <QueryError error={list.error} onRetry={() => list.refetch()} />}

      {list.data && (
        <>
          <section className="grid gap-3" aria-labelledby="staff-active">
            <h2 id="staff-active" className="font-heading text-lg font-semibold">
              {t('staffTitle')}
            </h2>
            {list.data.staff.length === 0 ? (
              <EmptyPanel icon={UserCog} tone="slate" title={t('empty')} />
            ) : (
              <div className="bg-card overflow-x-auto rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('colPerson')}</TableHead>
                      <TableHead>{t('colRole')}</TableHead>
                      <TableHead>{t('colLastSeen')}</TableHead>
                      {isAdmin && <TableHead className="text-right">{t('colActions')}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.data.staff.map((s) => (
                      <TableRow key={s.userId}>
                        <TableCell>
                          <PersonCell name={s.name} sub={s.email} />
                        </TableCell>
                        <TableCell>
                          {isAdmin && !s.isSelf ? (
                            <SelectField
                              value={s.role}
                              aria-label={t('changeRole', { name: s.name })}
                              disabled={changeRole.isPending}
                              className="w-40"
                              onChange={(e) =>
                                changeRole.mutate({ userId: s.userId, role: e.target.value as StaffRole })
                              }
                            >
                              <option value="admin">{t('roleAdmin')}</option>
                              <option value="read_only">{t('roleReadOnly')}</option>
                            </SelectField>
                          ) : (
                            <span className="flex items-center gap-2">
                              <ToneBadge tone={s.role === 'admin' ? 'emerald' : 'slate'}>
                                {roleLabel(s.role)}
                              </ToneBadge>
                              {s.isSelf && <ToneBadge tone="violet">{t('you')}</ToneBadge>}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap text-sm tabular-nums">
                          {s.lastSeenAt ? when(s.lastSeenAt) : t('never')}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            {!s.isSelf && (
                              <ConfirmDialog
                                destructive
                                title={t('removeTitle', { name: s.name })}
                                description={t('removeBody', { email: s.email })}
                                confirmLabel={t('removeConfirm')}
                                onConfirm={() => remove.mutateAsync(s.userId)}
                                trigger={
                                  <Button size="sm" variant="outline">
                                    <Trash2 /> {t('remove')}
                                  </Button>
                                }
                              />
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section className="grid gap-3" aria-labelledby="staff-pending">
            <h2 id="staff-pending" className="font-heading text-lg font-semibold">
              {t('pendingTitle')}
            </h2>
            {list.data.invitations.length === 0 ? (
              <EmptyPanel icon={Mail} tone="slate" title={t('pendingEmpty')} />
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2">
                {list.data.invitations.map((i) => (
                  <li key={i.id} className="bg-card grid gap-3 rounded-2xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{i.email}</p>
                        <p className="text-muted-foreground text-xs">
                          {i.invitedByName ? `${t('invitedBy', { name: i.invitedByName })} · ` : ''}
                          {t('expiresOn', { date: when(i.expiresAt) })}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        <ToneBadge tone={i.role === 'admin' ? 'emerald' : 'slate'}>
                          {roleLabel(i.role)}
                        </ToneBadge>
                        {i.expired && <ToneBadge tone="rose">{t('expired')}</ToneBadge>}
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={resend.isPending}
                          onClick={() => resend.mutate(i.id)}
                        >
                          <RotateCw /> {t('resend')}
                        </Button>
                        <ConfirmDialog
                          destructive
                          title={t('revokeTitle', { email: i.email })}
                          description={t('revokeBody')}
                          confirmLabel={t('revokeConfirm')}
                          onConfirm={() => revoke.mutateAsync(i.id)}
                          trigger={
                            <Button size="sm" variant="ghost">
                              <X /> {t('revoke')}
                            </Button>
                          }
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {!isAdmin && <p className="text-muted-foreground text-sm">{t('readOnly')}</p>}

      <FormDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title={t('inviteTitle')}
        description={t('inviteHelp')}
        submitLabel={t('send')}
        error={dialogError}
        disabled={!email.includes('@')}
        onSubmit={() => invite.mutateAsync({ email: email.trim(), role: inviteRole })}
      >
        <div className="grid content-start gap-2">
          <Label htmlFor="staff-email">{t('emailLabel')}</Label>
          <Input
            id="staff-email"
            type="email"
            required
            autoFocus
            maxLength={254}
            autoComplete="off"
            value={email}
            placeholder={t('emailPlaceholder')}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="staff-role">{t('roleLabel')}</Label>
          <SelectField
            id="staff-role"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as StaffRole)}
          >
            <option value="read_only">{t('roleReadOnly')}</option>
            <option value="admin">{t('roleAdmin')}</option>
          </SelectField>
          <p className="text-muted-foreground text-xs">
            {inviteRole === 'admin' ? t('roleAdminHelp') : t('roleReadOnlyHelp')}
          </p>
        </div>
      </FormDialog>

      <Dialog open={!!issued} onOpenChange={(open) => !open && setIssued(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">{t('linkTitle')}</DialogTitle>
            <DialogDescription>{t('linkHelp')}</DialogDescription>
          </DialogHeader>
          {issued && (
            <div className="grid content-start gap-2">
              <Label htmlFor="staff-link">{issued.email}</Label>
              <Input id="staff-link" readOnly value={issued.inviteUrl} onFocus={(e) => e.target.select()} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => issued && copy(issued.inviteUrl)}>
              <Copy /> {t('copyLink')}
            </Button>
            <Button type="button" onClick={() => setIssued(null)}>
              {t('done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageBody>
  );
}
