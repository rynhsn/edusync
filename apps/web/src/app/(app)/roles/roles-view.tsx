'use client';

import { PERMISSIONS } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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
      <div className="grid gap-2">
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
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<
    ({ id: string; original: string[]; system: boolean } & Draft) | null
  >(null);

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
      setCreating({ name: '', permissions: [] });
      toast.success(t('created'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
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
      toast.success(t('saved'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
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

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${t('readOnly')}`}
        actions={
          manage && (
            <FormDialog
              size="wide"
              trigger={
                <Button>
                  <Plus className="size-4" /> {t('createTitle')}
                </Button>
              }
              title={t('createTitle')}
              submitLabel={t('create')}
              error={error}
              disabled={creating.name.trim().length < 2 || creating.permissions.length === 0}
              onOpenChange={() => {
                setCreating({ name: '', permissions: [] });
                setError(null);
              }}
              onSubmit={() => create.mutateAsync()}
            >
              <RoleForm
                idPrefix="new"
                draft={creating}
                original={[]}
                nameLocked={false}
                onChange={setCreating}
              />
            </FormDialog>
          )
        }
      />

      {roles.isPending && <Skeleton className="h-40 w-full" />}
      {roles.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {roles.data?.map((r) => {
          const locked = r.key === 'school_admin';
          return (
            <Card key={r.id} className="gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-heading text-base font-semibold">{label(r)}</h2>
                  <Badge variant="outline">{r.isSystem ? t('system') : t('custom')}</Badge>
                  {locked && <Badge variant="secondary">{t('locked')}</Badge>}
                </div>
                {manage && !locked && (
                  <div className="flex gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('edit')}
                      onClick={() => {
                        setError(null);
                        setEditing({
                          id: r.id,
                          name: r.name,
                          permissions: r.permissions,
                          original: r.permissions,
                          system: r.isSystem,
                        });
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    {!r.isSystem && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('delete')}
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(r.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.permissions.map((p) => (
                  <Badge key={p} variant="secondary">
                    {permLabel(p)}
                  </Badge>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <FormDialog
        size="wide"
        open={!!editing}
        title={t('edit')}
        submitLabel={t('save')}
        error={error}
        disabled={!editing || editing.permissions.length === 0 || editing.name.trim().length < 2}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={() => (editing ? save.mutateAsync(editing) : Promise.resolve())}
      >
        {editing && (
          <RoleForm
            idPrefix="edit"
            draft={editing}
            original={editing.original}
            nameLocked={editing.system}
            onChange={(next) => setEditing({ ...editing, ...next })}
          />
        )}
      </FormDialog>
    </PageBody>
  );
}
