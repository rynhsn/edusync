'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, MailPlus, Pencil, Search, UserCheck, Users, UsersRound, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ActionMenu, ENTER, roleTone, stagger } from '@/components/access-kit';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import {
  EmptyPanel,
  MODULE_TONE,
  StatCard,
  StatGrid,
  ToneBadge,
  Toolbar,
  UserAvatar,
} from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';

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
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [roleFilter, setRoleFilter] = useState('');

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
  const all = members.data ?? [];
  const activeCount = all.filter((m) => m.status === 'active').length;
  const disabledCount = all.length - activeCount;
  const roleCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of all) for (const k of m.roles) map.set(k, (map.get(k) ?? 0) + 1);
    return [...map.entries()].sort((x, y) => y[1] - x[1]);
  }, [all]);
  const query = q.trim().toLowerCase();
  const filtered = all.filter(
    (m) =>
      (statusFilter === 'all' || m.status === statusFilter) &&
      (roleFilter === '' || m.roles.includes(roleFilter)) &&
      (query === '' || m.name.toLowerCase().includes(query) || m.email.toLowerCase().includes(query)),
  );
  const filtering = query !== '' || statusFilter !== 'all' || roleFilter !== '';
  const ROW_GRID = 'md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.5fr)_7rem_2rem]';

  return (
    <PageBody>
      <PageHeader
        icon={UsersRound}
        tone={MODULE_TONE.access}
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

      {members.isPending && (
        <div className="grid gap-4" aria-busy>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-14 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      )}
      {members.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}

      {members.data && (
        <StatGrid className={ENTER}>
          <StatCard label={t('statTotal')} value={all.length} icon={Users} tone={MODULE_TONE.access} />
          <StatCard
            label={t('statActive')}
            value={activeCount}
            icon={UserCheck}
            tone="emerald"
            progress={all.length ? (activeCount / all.length) * 100 : 0}
            hint={t('statActiveHint', { pct: all.length ? Math.round((activeCount / all.length) * 100) : 0 })}
          />
          <StatCard
            label={t('statDisabled')}
            value={disabledCount}
            icon={UserX}
            tone="rose"
            hint={t('statDisabledHint')}
          />
          <StatCard
            label={t('statInvites')}
            value={pending.length}
            icon={Mail}
            tone="amber"
            hint={t('statInvitesHint')}
          />
        </StatGrid>
      )}

      {members.data?.length === 0 && (
        <EmptyPanel
          icon={UsersRound}
          tone={MODULE_TONE.access}
          title={t('emptyTitle')}
          body={manage ? t('emptyBody') : t('empty')}
        />
      )}

      {members.data && members.data.length > 0 && (
        <section className="grid gap-3">
          <Toolbar className="gap-3">
            <div className="relative min-w-52 flex-1 sm:max-w-xs">
              <Search
                aria-hidden
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <Input
                aria-label={t('search')}
                placeholder={t('search')}
                className="pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <SelectField
              aria-label={t('status')}
              className="sm:w-44"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'disabled')}
            >
              <option value="all">{t('allStatus')}</option>
              <option value="active">{t('active')}</option>
              <option value="disabled">{t('disabled')}</option>
            </SelectField>
            <p className="text-muted-foreground ml-auto text-xs tabular-nums" aria-live="polite">
              {t('shown', { shown: filtered.length, total: all.length })}
            </p>
            <fieldset className="m-0 flex w-full min-w-0 flex-wrap gap-1.5 border-0 border-t p-0 pt-2.5">
              <legend className="sr-only">{t('roleFilter')}</legend>
              <Button
                size="sm"
                variant={roleFilter === '' ? 'secondary' : 'ghost'}
                aria-pressed={roleFilter === ''}
                onClick={() => setRoleFilter('')}
              >
                {t('allRoles')}
              </Button>
              {roleCounts.map(([k, n]) => (
                <Button
                  key={k}
                  size="sm"
                  variant={roleFilter === k ? 'secondary' : 'ghost'}
                  aria-pressed={roleFilter === k}
                  onClick={() => setRoleFilter(roleFilter === k ? '' : k)}
                >
                  {roleName(k)}
                  <span className="text-muted-foreground tabular-nums">{n}</span>
                </Button>
              ))}
            </fieldset>
          </Toolbar>

          {filtered.length === 0 ? (
            <EmptyPanel
              icon={Search}
              tone="slate"
              title={t('noMatch')}
              body={t('noMatchBody')}
              action={
                filtering && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQ('');
                      setStatusFilter('all');
                      setRoleFilter('');
                    }}
                  >
                    {t('clearFilters')}
                  </Button>
                )
              }
            />
          ) : (
            <ul className="bg-card divide-y overflow-hidden rounded-2xl border">
              <li
                aria-hidden
                className={cn(
                  'text-muted-foreground hidden gap-3 px-5 py-2.5 text-xs font-medium md:grid',
                  ROW_GRID,
                )}
              >
                <span>{t('member')}</span>
                <span>{t('roles')}</span>
                <span>{t('status')}</span>
                <span />
              </li>
              {filtered.map((m, i) => {
                const self = m.userId === userId;
                const active = m.status === 'active';
                return (
                  <li
                    key={m.id}
                    style={stagger(i)}
                    className={cn(
                      ENTER,
                      'hover:bg-muted/40 relative grid gap-3 p-4 transition-colors md:items-center md:px-5 md:py-3',
                      ROW_GRID,
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3 pr-9 md:pr-0">
                      <UserAvatar name={m.name} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {m.name}
                          {self && (
                            <ToneBadge tone="teal" dot={false} className="ml-2 align-middle">
                              {t('you')}
                            </ToneBadge>
                          )}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">{m.email}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {m.roles.length === 0 && (
                        <span className="text-muted-foreground text-xs">{t('noRoleAssigned')}</span>
                      )}
                      {m.roles.map((k) => (
                        <ToneBadge key={k} tone={roleTone(k)} dot={false}>
                          {roleName(k)}
                        </ToneBadge>
                      ))}
                    </div>
                    <div>
                      <ToneBadge tone={active ? 'emerald' : 'slate'}>
                        {active ? t('active') : t('disabled')}
                      </ToneBadge>
                    </div>
                    {manage && (
                      <div className="absolute top-3 right-3 md:static">
                        <ActionMenu
                          label={t('actionsFor', { name: m.name })}
                          items={[
                            {
                              label: t('edit'),
                              icon: Pencil,
                              onSelect: () => {
                                setFormError(null);
                                setEditing({ id: m.id, name: m.name, roles: m.roles });
                              },
                            },
                            ...(self
                              ? []
                              : [
                                  {
                                    label: active ? t('disable') : t('enable'),
                                    icon: active ? UserX : UserCheck,
                                    destructive: active,
                                    disabled: setStatus.isPending,
                                    onSelect: () =>
                                      setStatus.mutate({ id: m.id, status: active ? 'disabled' : 'active' }),
                                  },
                                ]),
                          ]}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {pending.length > 0 && (
        <section className="grid gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold">{t('pendingTitle')}</h2>
            <p className="text-muted-foreground text-sm">{t('pendingBody')}</p>
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {pending.map((i, idx) => (
              <li
                key={i.id}
                style={stagger(idx)}
                className={cn(ENTER, 'bg-card flex flex-wrap items-center gap-3 rounded-2xl border p-4')}
              >
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"
                >
                  <Mail className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.email}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {i.roles.map((k) => (
                      <ToneBadge key={k} tone={roleTone(k)} dot={false}>
                        {roleName(k)}
                      </ToneBadge>
                    ))}
                    {i.expired && <ToneBadge tone="rose">{t('expiredBadge')}</ToneBadge>}
                  </div>
                </div>
                {manage && (
                  <ActionMenu
                    label={t('inviteActionsFor', { email: i.email })}
                    items={[
                      {
                        label: t('resend'),
                        icon: MailPlus,
                        disabled: resend.isPending,
                        onSelect: () => resend.mutate({ email: i.email, roles: i.roles }),
                      },
                      {
                        label: t('revoke'),
                        icon: UserX,
                        destructive: true,
                        disabled: revoke.isPending,
                        onSelect: () => revoke.mutate(i.id),
                      },
                    ]}
                  />
                )}
              </li>
            ))}
          </ul>
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
