'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailPlus, Pencil, UserCheck, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';

interface RoleOption {
  key: string;
  name: string;
  permissions: string[];
}

/** Pilihan peran. Peran yang izinnya melebihi izin pengguna dinonaktifkan (server tetap memeriksa). */
function RolePicker({
  idPrefix,
  roles,
  value,
  onChange,
  canGrant,
}: {
  idPrefix: string;
  roles: RoleOption[];
  value: string[];
  onChange: (next: string[]) => void;
  canGrant: (role: RoleOption) => boolean;
}) {
  const tr = useTranslations('roles');
  const label = (r: RoleOption) => (tr.has(r.key as never) ? tr(r.key as never) : r.name);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {roles.map((r) => {
        const checked = value.includes(r.key);
        const id = `${idPrefix}-${r.key}`;
        return (
          <label key={r.key} htmlFor={id} className="flex items-center gap-2 text-sm">
            <Checkbox
              id={id}
              checked={checked}
              disabled={!canGrant(r)}
              onCheckedChange={() => onChange(checked ? value.filter((k) => k !== r.key) : [...value, r.key])}
            />
            {label(r)}
          </label>
        );
      })}
    </div>
  );
}

export function MembersView() {
  const t = useTranslations('members');
  const te = useTranslations();
  const tr = useTranslations('roles');
  const { school, can, userId } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const membersKey = ['members', school.schoolId];
  const manage = can('member:manage');

  const [email, setEmail] = useState('');
  const [newRoles, setNewRoles] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: string; name: string; roles: string[] } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const roles = useQuery({
    queryKey: ['roles', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/roles', { params: header })),
  });
  const members = useQuery({
    queryKey: membersKey,
    queryFn: async () => unwrap(await api.GET('/v1/members', { params: header })),
  });

  const roleName = (key: string) => (tr.has(key as never) ? tr(key as never) : key);
  const canGrant = (r: RoleOption) => r.permissions.every((p) => can(p));
  const refresh = () => queryClient.invalidateQueries({ queryKey: membersKey });
  const invitationsKey = ['invitations', school.schoolId];
  const refreshInvitations = () => queryClient.invalidateQueries({ queryKey: invitationsKey });
  const invitations = useQuery({
    queryKey: invitationsKey,
    queryFn: async () => unwrap(await api.GET('/v1/invitations', { params: header })),
  });

  const add = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/invitations', { params: header, body: { email: email.trim(), roles: newRoles } }),
      ),
    onSuccess: () => {
      setFormError(null);
      setEmail('');
      setNewRoles([]);
      toast.success(t('invited'));
      refreshInvitations();
    },
    onError: (e) => setFormError(te(errorKey(e))),
  });

  const resend = useMutation({
    mutationFn: async (v: { email: string; roles: string[] }) =>
      unwrap(await api.POST('/v1/invitations', { params: header, body: v })),
    onSuccess: () => {
      toast.success(t('invited'));
      refreshInvitations();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/invitations/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('revoked'));
      refreshInvitations();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const saveRoles = useMutation({
    mutationFn: async (v: { id: string; roles: string[] }) =>
      unwrap(
        await api.PUT('/v1/members/{id}/roles', {
          params: { ...header, path: { id: v.id } },
          body: { roles: v.roles },
        }),
      ),
    onSuccess: () => {
      toast.success(t('saved'));
      refresh();
    },
    onError: (e) => setFormError(te(errorKey(e))),
  });

  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: 'active' | 'disabled' }) =>
      unwrap(
        await api.PATCH('/v1/members/{id}', {
          params: { ...header, path: { id: v.id } },
          body: { status: v.status },
        }),
      ),
    onSuccess: () => {
      toast.success(t('saved'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const pending = invitations.data ?? [];

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${t('readOnly')}`}
        actions={
          manage &&
          roles.data && (
            <FormDialog
              trigger={
                <Button>
                  <MailPlus className="size-4" /> {t('addTitle')}
                </Button>
              }
              title={t('addTitle')}
              description={t('addHint')}
              submitLabel={t('add')}
              error={formError}
              disabled={newRoles.length === 0}
              onOpenChange={() => {
                setEmail('');
                setNewRoles([]);
                setFormError(null);
              }}
              onSubmit={() => add.mutateAsync()}
            >
              <div className="grid gap-2">
                <Label htmlFor="member-email">{t('email')}</Label>
                <Input
                  id="member-email"
                  type="email"
                  required
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">{t('roles')}</legend>
                <RolePicker
                  idPrefix="new"
                  roles={roles.data}
                  value={newRoles}
                  onChange={setNewRoles}
                  canGrant={canGrant}
                />
              </fieldset>
            </FormDialog>
          )
        }
      />

      {members.isPending && <Skeleton className="h-40 w-full" />}
      {members.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}
      {members.data?.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('empty')}</Card>
      )}

      {members.data && members.data.length > 0 && (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('member')}</TableHead>
                <TableHead>{t('roles')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                {manage && <TableHead className="w-28" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data.map((m) => {
                const self = m.userId === userId;
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="font-medium">
                        {m.name}
                        {self && <span className="text-muted-foreground font-normal"> ({t('you')})</span>}
                      </div>
                      <div className="text-muted-foreground text-xs">{m.email}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {m.roles.map((k) => (
                          <Badge key={k} variant="outline">
                            {roleName(k)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.status === 'active' ? 'secondary' : 'outline'}>
                        {m.status === 'active' ? t('active') : t('disabled')}
                      </Badge>
                    </TableCell>
                    {manage && (
                      <TableCell className="text-right whitespace-nowrap">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t('edit')}
                          title={t('edit')}
                          onClick={() => {
                            setFormError(null);
                            setEditing({ id: m.id, name: m.name, roles: m.roles });
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        {!self && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={m.status === 'active' ? t('disable') : t('enable')}
                            title={m.status === 'active' ? t('disable') : t('enable')}
                            disabled={setStatus.isPending}
                            onClick={() =>
                              setStatus.mutate({
                                id: m.id,
                                status: m.status === 'active' ? 'disabled' : 'active',
                              })
                            }
                          >
                            {m.status === 'active' ? (
                              <UserX className="size-4" />
                            ) : (
                              <UserCheck className="size-4" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {pending.length > 0 && (
        <section className="grid gap-3">
          <h2 className="font-heading text-lg font-semibold">{t('pendingTitle')}</h2>
          <Card className="overflow-hidden p-0">
            <Table>
              <TableBody>
                {pending.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {i.roles.map((k) => (
                          <Badge key={k} variant="outline">
                            {roleName(k)}
                          </Badge>
                        ))}
                        {i.expired && <Badge variant="destructive">{t('expiredBadge')}</Badge>}
                      </div>
                    </TableCell>
                    {manage && (
                      <TableCell className="text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={resend.isPending}
                          onClick={() => resend.mutate({ email: i.email, roles: i.roles })}
                        >
                          {t('resend')}
                        </Button>{' '}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(i.id)}
                        >
                          {t('revoke')}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </section>
      )}

      <FormDialog
        open={!!editing}
        title={`${t('edit')} · ${editing?.name ?? ''}`}
        submitLabel={t('save')}
        error={formError}
        disabled={!editing || editing.roles.length === 0}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={() => (editing ? saveRoles.mutateAsync(editing) : Promise.resolve())}
      >
        {editing && roles.data && (
          <RolePicker
            idPrefix="edit"
            roles={roles.data}
            value={editing.roles}
            onChange={(next) => setEditing({ ...editing, roles: next })}
            canGrant={(r) =>
              canGrant(r) || members.data?.find((m) => m.id === editing.id)?.roles.includes(r.key) === true
            }
          />
        )}
      </FormDialog>
    </PageBody>
  );
}
