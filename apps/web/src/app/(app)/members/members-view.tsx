'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
            <input
              id={id}
              type="checkbox"
              className="accent-primary size-4"
              checked={checked}
              disabled={!canGrant(r)}
              onChange={() => onChange(checked ? value.filter((k) => k !== r.key) : [...value, r.key])}
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
  const [editing, setEditing] = useState<{ id: string; roles: string[] } | null>(null);
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

  const add = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/members', { params: header, body: { email: email.trim(), roles: newRoles } }),
      ),
    onSuccess: () => {
      setFormError(null);
      setEmail('');
      setNewRoles([]);
      toast.success(t('added'));
      refresh();
    },
    onError: (e) => setFormError(te(errorKey(e))),
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
      setEditing(null);
      toast.success(t('saved'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
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

  function onAdd(event: React.FormEvent) {
    event.preventDefault();
    if (newRoles.length === 0) return setFormError(t('needRole'));
    setFormError(null);
    add.mutate();
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div>
        <p className="text-primary text-sm font-medium">{school.schoolName}</p>
        <h1 className="font-heading mt-1 text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        {!manage && <p className="text-muted-foreground mt-1 text-sm">{t('readOnly')}</p>}
      </div>

      {manage && roles.data && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">{t('addTitle')}</CardTitle>
            <CardDescription>{t('addHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onAdd} className="grid max-w-xl content-start gap-4">
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
              {formError && (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
              <div>
                <Button type="submit" disabled={add.isPending}>
                  {t('add')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {members.isPending && <Skeleton className="h-40 w-full" />}
      {members.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}
      {members.data?.length === 0 && <p className="text-muted-foreground text-sm">{t('empty')}</p>}

      {members.data && members.data.length > 0 && (
        <Card>
          <CardContent>
            <ul className="divide-y">
              {members.data.map((m) => {
                const open = editing?.id === m.id;
                const self = m.userId === userId;
                return (
                  <li key={m.id} className="grid gap-3 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-medium">{m.name}</span>
                        {self && <span className="text-muted-foreground"> ({t('you')})</span>}
                        <p className="text-muted-foreground text-xs">{m.email}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={m.status === 'active' ? 'secondary' : 'outline'}>
                          {m.status === 'active' ? t('active') : t('disabled')}
                        </Badge>
                        {manage && !open && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditing({ id: m.id, roles: m.roles })}
                            >
                              {t('edit')}
                            </Button>
                            {!self && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={setStatus.isPending}
                                onClick={() =>
                                  setStatus.mutate({
                                    id: m.id,
                                    status: m.status === 'active' ? 'disabled' : 'active',
                                  })
                                }
                              >
                                {m.status === 'active' ? t('disable') : t('enable')}
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {!open && (
                      <div className="flex flex-wrap gap-1.5">
                        {m.roles.map((k) => (
                          <Badge key={k} variant="outline">
                            {roleName(k)}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {open && editing && roles.data && (
                      <div className="grid gap-3">
                        <RolePicker
                          idPrefix={`edit-${m.id}`}
                          roles={roles.data}
                          value={editing.roles}
                          onChange={(next) => setEditing({ id: m.id, roles: next })}
                          canGrant={(r) =>
                            canGrant(r) || m.roles.includes(r.key) === editing.roles.includes(r.key)
                          }
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={editing.roles.length === 0 || saveRoles.isPending}
                            onClick={() => saveRoles.mutate(editing)}
                          >
                            {t('save')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            {t('cancel')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
