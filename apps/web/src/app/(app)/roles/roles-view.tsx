'use client';

import { PERMISSIONS } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionMenu, ENTER, roleTone, stagger } from '@/components/access-kit';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, IconTile, MODULE_TONE, StatCard, StatGrid, TONES, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';

interface Draft {
  name: string;
  permissions: string[];
}

/** Izin berbentuk `sumberdaya:aksi`; dikelompokkan per sumber daya mengikuti urutan PERMISSIONS. */
function groupPermissions(perms: readonly string[]): { resource: string; actions: string[] }[] {
  const have = new Set(perms);
  const map = new Map<string, string[]>();
  for (const p of PERMISSIONS) {
    if (!have.has(p)) continue;
    const [resource = p, action = ''] = p.split(':');
    map.set(resource, [...(map.get(resource) ?? []), action]);
  }
  return [...map.entries()].map(([resource, actions]) => ({ resource, actions }));
}

/** Daftar sumber daya (urut) beserta aksi yang tersedia untuk tiap sumber daya, dari seluruh PERMISSIONS. */
function allGroups(): { resource: string; actions: string[] }[] {
  return groupPermissions(PERMISSIONS);
}

/** Nama sumber daya / aksi dengan cadangan ke kunci mentah bila terjemahan belum ada. */
function useLabels() {
  const t = useTranslations('rolesPage');
  const tp = useTranslations('permissions');
  return {
    resource: (r: string) => (t.has(`resource.${r}` as never) ? t(`resource.${r}` as never) : r),
    action: (a: string) => (t.has(`action.${a}` as never) ? t(`action.${a}` as never) : a),
    full: (p: string) => (tp.has(p.replace(':', '_') as never) ? tp(p.replace(':', '_') as never) : p),
  };
}

/**
 * Formulir nama + izin, izin dikelompokkan per sumber daya. Izin yang tidak dimiliki pengguna dinonaktifkan kecuali
 * sudah terpilih (server tetap memeriksa: hanya izin yang ditambah atau dicabut yang harus dimiliki pengguna).
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
  const { can } = useSchool();
  const labels = useLabels();

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
        <div className="grid gap-2.5 sm:grid-cols-2">
          {allGroups().map((g) => (
            <div key={g.resource} className="rounded-xl border p-3">
              <p className="font-heading mb-2 text-sm font-semibold">{labels.resource(g.resource)}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {g.actions.map((a) => {
                  const p = `${g.resource}:${a}`;
                  const checked = draft.permissions.includes(p);
                  const id = `${idPrefix}-${p}`;
                  const wasChecked = original.includes(p);
                  return (
                    <label
                      key={p}
                      htmlFor={id}
                      className="flex items-center gap-2 text-sm"
                      title={labels.full(p)}
                    >
                      <Checkbox
                        id={id}
                        aria-label={labels.full(p)}
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
                      {labels.action(a)}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

const COLLAPSED_GROUPS = 4;

export function RolesView() {
  const t = useTranslations('rolesPage');
  const te = useTranslations();
  const tr = useTranslations('roles');
  const labels = useLabels();
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
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const roles = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/roles', { params: header })),
  });
  // Jumlah anggota per peran hanya tampil bila pengguna boleh melihat anggota.
  const members = useQuery({
    queryKey: ['members', school.schoolId],
    enabled: can('member:read'),
    queryFn: async () => unwrap(await api.GET('/v1/members', { params: header })),
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
  const list = roles.data ?? [];
  const memberCount = (roleKey: string) =>
    members.data ? members.data.filter((m) => m.roles.includes(roleKey)).length : null;
  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <PageBody>
      <PageHeader
        icon={ShieldCheck}
        tone={MODULE_TONE.access}
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

      {roles.isPending && (
        <div className="grid gap-4" aria-busy>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Skeleton className="h-56 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
        </div>
      )}
      {roles.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}

      {roles.data && (
        <StatGrid className={ENTER}>
          <StatCard label={t('statRoles')} value={list.length} icon={ShieldCheck} tone={MODULE_TONE.access} />
          <StatCard
            label={t('statSystem')}
            value={list.filter((r) => r.isSystem).length}
            icon={Lock}
            tone="violet"
          />
          <StatCard
            label={t('statCustom')}
            value={list.filter((r) => !r.isSystem).length}
            icon={Sparkles}
            tone="teal"
          />
          <StatCard label={t('statPerms')} value={PERMISSIONS.length} icon={KeyRound} tone="amber" />
        </StatGrid>
      )}

      {roles.data && list.length === 0 && (
        <EmptyPanel
          icon={ShieldCheck}
          tone={MODULE_TONE.access}
          title={t('emptyTitle')}
          body={t('emptyBody')}
        />
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {list.map((r, i) => {
          const locked = r.key === 'school_admin';
          const tone = roleTone(r.key);
          const groups = groupPermissions(r.permissions);
          const open = expanded.has(r.id);
          const visible = open ? groups : groups.slice(0, COLLAPSED_GROUPS);
          const pct = Math.round((r.permissions.length / PERMISSIONS.length) * 100);
          const count = memberCount(r.key);
          return (
            <article
              key={r.id}
              style={stagger(i)}
              className={cn(ENTER, 'bg-card grid content-start gap-4 rounded-2xl border p-5')}
            >
              <div className="flex items-start gap-3">
                <IconTile icon={locked ? Lock : ShieldCheck} tone={tone} className="size-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-heading text-base font-semibold">{label(r)}</h2>
                    <ToneBadge tone={r.isSystem ? 'violet' : 'teal'} dot={false}>
                      {r.isSystem ? t('system') : t('custom')}
                    </ToneBadge>
                    {locked && (
                      <ToneBadge tone="slate" dot={false}>
                        {t('locked')}
                      </ToneBadge>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-xs tabular-nums">
                    <span>{t('permCount', { count: r.permissions.length })}</span>
                    {count !== null && (
                      <span className="inline-flex items-center gap-1">
                        <Users aria-hidden className="size-3" />
                        {t('memberCount', { count })}
                      </span>
                    )}
                  </p>
                </div>
                {manage && !locked && (
                  <ActionMenu
                    label={t('actionsFor', { name: label(r) })}
                    items={[
                      {
                        label: t('edit'),
                        icon: Pencil,
                        onSelect: () => {
                          setError(null);
                          setEditing({
                            id: r.id,
                            name: r.name,
                            permissions: r.permissions,
                            original: r.permissions,
                            system: r.isSystem,
                          });
                        },
                      },
                      ...(r.isSystem
                        ? []
                        : [
                            {
                              label: t('delete'),
                              icon: Trash2,
                              destructive: true,
                              disabled: remove.isPending,
                              onSelect: () => setDeleting({ id: r.id, name: label(r) }),
                            },
                          ]),
                    ]}
                  />
                )}
              </div>

              <div>
                <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-500', TONES[tone].bar)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {locked ? t('lockedHint') : t('coverage', { pct })}
                </p>
              </div>

              <ul className="grid gap-2">
                {visible.map((g) => (
                  <li key={g.resource} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="w-36 shrink-0 truncate text-sm font-medium">
                      {labels.resource(g.resource)}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {g.actions.map((a) => (
                        <ToneBadge
                          key={a}
                          tone={a === 'read' ? 'slate' : tone === 'slate' ? 'teal' : tone}
                          dot={false}
                          className="px-2 py-0.5"
                        >
                          <span title={labels.full(`${g.resource}:${a}`)}>{labels.action(a)}</span>
                        </ToneBadge>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
              {groups.length > COLLAPSED_GROUPS && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-fit"
                  aria-expanded={open}
                  onClick={() => toggle(r.id)}
                >
                  <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
                  {open ? t('showLess') : t('showAll', { count: groups.length })}
                </Button>
              )}
            </article>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        destructive
        title={t('deleteTitle', { name: deleting?.name ?? '' })}
        description={t('deleteBody')}
        confirmLabel={t('delete')}
        pending={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />

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
