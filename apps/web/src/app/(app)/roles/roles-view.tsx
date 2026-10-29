'use client';

import { PERMISSIONS } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';

interface Draft {
  name: string;
  permissions: string[];
}

/**
 * Formulir nama + izin. Izin yang tidak dimiliki pengguna dinonaktifkan kecuali sudah terpilih
 * (server tetap memeriksa: hanya izin yang ditambah atau dicabut yang harus dimiliki pengguna).
 */
function RoleForm({
  idPrefix,
  draft,
  original,
  nameLocked,
  onChange,
}: {
  idPrefix: string;
  draft: Draft;
  original: string[];
  nameLocked: boolean;
  onChange: (next: Draft) => void;
}) {
  const t = useTranslations('rolesPage');
  const tp = useTranslations('permissions');
  const { can } = useSchool();

  return (
    <div className="grid gap-4">
      <div className="grid max-w-sm gap-2">
        <Label htmlFor={`${idPrefix}-name`}>{t('name')}</Label>
        <Input
          id={`${idPrefix}-name`}
          value={draft.name}
          disabled={nameLocked}
          maxLength={40}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t('permissions')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PERMISSIONS.map((p) => {
            const checked = draft.permissions.includes(p);
            const id = `${idPrefix}-${p}`;
            const wasChecked = original.includes(p);
            return (
              <label key={p} htmlFor={id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={id}
                  checked={checked}
                  disabled={!can(p) && checked === wasChecked}
                  onCheckedChange={() =>
                    onChange({
                      ...draft,
                      permissions: checked
                        ? draft.permissions.filter((x) => x !== p)
                        : [...draft.permissions, p],
                    })
                  }
                />
                {tp(p.replace(':', '_') as never)}
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

export function RolesView() {
  const t = useTranslations('rolesPage');
  const te = useTranslations();
  const tp = useTranslations('permissions');
  const tr = useTranslations('roles');
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const key = ['roles', school.schoolId];
  const manage = can('role:manage');

  const [creating, setCreating] = useState<Draft>({ name: '', permissions: [] });
  const [createError, setCreateError] = useState<string | null>(null);
  const [editing, setEditing] = useState<({ id: string } & Draft) | null>(null);

  const roles = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/roles', { params: header })),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['members', school.schoolId] });
  };

  const create = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/roles', { params: header, body: creating as never })),
    onSuccess: () => {
      setCreateError(null);
      setCreating({ name: '', permissions: [] });
      toast.success(t('created'));
      refresh();
    },
    onError: (e) => setCreateError(te(errorKey(e))),
  });

  const save = useMutation({
    mutationFn: async (v: { id: string } & Draft) =>
      unwrap(
        await api.PUT('/v1/roles/{id}', {
          params: { ...header, path: { id: v.id } },
          body: { name: v.name, permissions: v.permissions } as never,
        }),
      ),
    onSuccess: () => {
      setEditing(null);
      toast.success(t('saved'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/roles/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const label = (r: { key: string; name: string }) => (tr.has(r.key as never) ? tr(r.key as never) : r.name);
  const permLabel = (p: string) =>
    tp.has(p.replace(':', '_') as never) ? tp(p.replace(':', '_') as never) : p;

  function onCreate(event: React.FormEvent) {
    event.preventDefault();
    if (creating.permissions.length === 0) return setCreateError(t('noPermission'));
    setCreateError(null);
    create.mutate();
  }

  return (
    <div className="grid w-full gap-6">
      <div>
        <p className="text-primary text-sm font-medium">{school.schoolName}</p>
        <h1 className="font-heading mt-1 text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        {!manage && <p className="text-muted-foreground mt-1 text-sm">{t('readOnly')}</p>}
      </div>

      {manage && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">{t('createTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="grid gap-4">
              <RoleForm
                idPrefix="new"
                draft={creating}
                original={[]}
                nameLocked={false}
                onChange={setCreating}
              />
              {createError && (
                <Alert variant="destructive">
                  <AlertDescription>{createError}</AlertDescription>
                </Alert>
              )}
              <div>
                <Button type="submit" disabled={create.isPending || creating.name.trim().length < 2}>
                  {t('create')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {roles.isPending && <Skeleton className="h-40 w-full" />}
      {roles.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4">
        {roles.data?.map((r) => {
          const open = editing?.id === r.id;
          const locked = r.key === 'school_admin';
          return (
            <Card key={r.id}>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="font-heading text-lg">{label(r)}</CardTitle>
                  <Badge variant="outline">{r.isSystem ? t('system') : t('custom')}</Badge>
                  {locked && <Badge variant="secondary">{t('locked')}</Badge>}
                </div>
                {manage && !locked && !open && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing({ id: r.id, name: r.name, permissions: r.permissions })}
                    >
                      {t('edit')}
                    </Button>
                    {!r.isSystem && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(r.id)}
                      >
                        {t('delete')}
                      </Button>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent className="grid gap-3">
                {!open && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.permissions.map((p) => (
                      <Badge key={p} variant="secondary">
                        {permLabel(p)}
                      </Badge>
                    ))}
                  </div>
                )}
                {open && editing && (
                  <>
                    <RoleForm
                      idPrefix={`edit-${r.id}`}
                      draft={editing}
                      original={r.permissions}
                      nameLocked={r.isSystem}
                      onChange={(next) => setEditing({ id: r.id, ...next })}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={
                          save.isPending || editing.permissions.length === 0 || editing.name.trim().length < 2
                        }
                        onClick={() => save.mutate(editing)}
                      >
                        {t('save')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        {t('cancel')}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
