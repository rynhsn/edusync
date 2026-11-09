'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IdCard, KeyRound, MailCheck, Pencil, Trash2, UserRoundCheck, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { CompletenessBadge } from '@/components/completeness-badge';
import { EmptyState } from '@/components/empty-state';
import { FormDialog } from '@/components/form-dialog';
import { useFormValidation } from '@/components/form-field-error';
import { EMPTY_GUARDIAN_VALUES, GuardianFields, guardianPayload } from '@/components/guardian-form';
import {
  ConfirmDelete,
  DataRows,
  ListSkeleton,
  MonoText,
  REVEAL,
  RowMenu,
  SearchBox,
} from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { type InviteTarget, PortalInviteFlow } from '@/components/portal-invite-flow';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  EmptyPanel,
  MODULE_TONE,
  PersonCell,
  StatCard,
  StatGrid,
  type Tone,
  ToneBadge,
  Toolbar,
} from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import {
  canDeleteGuardian,
  canInviteGuardian,
  filterQuery,
  GUARDIAN_FILTERS,
  type GuardianFilter,
  hiddenChildren,
  type PortalStatus,
  studentSearchHref,
} from '@/lib/guardian-directory';
import {
  GUARDIAN_ORDER,
  type GuardianField,
  type GuardianValues,
  validateGuardian,
} from '../students/guardian-validation';

const PAGE = 25;
const PORTAL_TONE: Record<PortalStatus, Tone> = { active: 'emerald', invited: 'amber', none: 'slate' };
const FILTER_KEY = {
  all: 'filterAll',
  missingNik: 'filterNoNik',
  noPortal: 'filterNoPortal',
  hasAccount: 'filterHasAccount',
} as const;

type Editing = { id: string; nikMasked: string | null } & GuardianValues;

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Data wali: daftar induk seluruh wali sekolah dengan anak, kelengkapan data, dan status akun portal. */
export function GuardiansView() {
  const t = useTranslations('guardianDirectory');
  const tm = useTranslations('masterData');
  const tg = useTranslations('guardians');
  const te = useTranslations();
  const { school, can, hasModule } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('student:manage');
  const portalOn = hasModule('parent_portal');
  const listKey = ['guardian-directory', school.schoolId];

  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 250);
  const [filter, setFilter] = useState<GuardianFilter>('all');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [inviting, setInviting] = useState<InviteTarget | null>(null);
  const validation = useFormValidation<GuardianField>({
    errors: validateGuardian(editing ?? EMPTY_GUARDIAN_VALUES),
    order: GUARDIAN_ORDER,
    idPrefix: 'gd-edit',
  });

  // Kata kunci baru mengembalikan ke halaman pertama.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `q` adalah pemicunya
  useEffect(() => setPage(0), [q]);

  const query = {
    ...(q ? { q } : {}),
    ...filterQuery(filter),
    page: page + 1,
    limit: PAGE,
  };
  const list = useQuery({
    queryKey: [...listKey, query],
    queryFn: async () => unwrap(await api.GET('/v1/guardians/directory', { params: { ...header, query } })),
    placeholderData: (previous) => previous,
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: listKey });
    queryClient.invalidateQueries({ queryKey: ['guardians', school.schoolId] });
  };

  const save = useMutation({
    mutationFn: async (v: Editing) =>
      unwrap(
        await api.PUT('/v1/guardians/{id}', {
          params: { ...header, path: { id: v.id } },
          body: guardianPayload(v),
        }),
      ),
    onSuccess: () => {
      toast.success(tm('saved'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/guardians/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(tm('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  type Row = NonNullable<typeof list.data>['items'][number];
  const openEdit = (g: Row) => {
    setError(null);
    validation.reset();
    setEditing({
      id: g.id,
      nikMasked: g.nikMasked,
      name: g.name,
      // NIK utuh hanya ada bagi pengelola; bila null, jangan diisi dari bentuk tersamar.
      nik: g.nik ?? '',
      phone: g.phone ?? '',
      email: g.email ?? '',
      occupation: g.occupation ?? '',
      address: g.address ?? '',
    });
  };

  const totals = list.data?.totals;
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const hasFilters = !!(q || filter !== 'all');

  return (
    <PageBody>
      <PageHeader
        icon={UsersRound}
        tone={MODULE_TONE.master}
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${tm('readOnly')}`}
      />

      <StatGrid className={`${REVEAL} lg:grid-cols-3`}>
        <StatCard
          icon={UsersRound}
          tone="teal"
          label={t('statTotal')}
          value={totals?.total ?? '…'}
          hint={t('statTotalHint')}
        />
        <StatCard
          icon={IdCard}
          tone="amber"
          label={t('statNoNik')}
          value={totals?.withoutNik ?? '…'}
          hint={t('statNoNikHint')}
        />
        <StatCard
          icon={UserRoundCheck}
          tone="violet"
          label={t('statNoPortal')}
          value={totals?.withoutPortal ?? '…'}
          hint={totals ? t('statNoPortalHint', { invited: totals.invited }) : undefined}
        />
      </StatGrid>

      <Toolbar>
        <SearchBox value={search} placeholder={t('searchPlaceholder')} onChange={setSearch} />
        {GUARDIAN_FILTERS.map((f) => (
          <Button
            key={f}
            type="button"
            variant={filter === f ? 'default' : 'outline'}
            aria-pressed={filter === f}
            onClick={() => {
              setFilter(f);
              setPage(0);
            }}
          >
            {t(FILTER_KEY[f])}
          </Button>
        ))}
        {list.data && (
          <span className="text-muted-foreground ml-auto px-1 text-sm tabular-nums">
            {t('total', { count: total })}
          </span>
        )}
      </Toolbar>

      {list.isPending && <ListSkeleton rows={6} />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{tm('loadError')}</AlertDescription>
        </Alert>
      )}
      {list.data?.items.length === 0 &&
        (hasFilters ? (
          <EmptyPanel
            icon={UsersRound}
            tone={MODULE_TONE.master}
            title={t('emptyFilteredTitle')}
            body={t('emptyFilteredBody')}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('');
                  setFilter('all');
                  setPage(0);
                }}
              >
                {t('clearFilters')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={UsersRound}
            tone={MODULE_TONE.master}
            title={t('emptyTitle')}
            body={t('emptyBody')}
            action={
              <Button variant="outline" nativeButton={false} render={<Link href="/students" />}>
                {t('goStudents')}
              </Button>
            }
          />
        ))}

      {list.data && list.data.items.length > 0 && (
        <DataRows
          rows={list.data.items}
          rowKey={(g) => g.id}
          actionsHeader={tm('actions')}
          onRowClick={manage ? openEdit : undefined}
          columns={[
            {
              key: 'name',
              header: t('colName'),
              cell: (g) => (
                <div className="grid min-w-0 gap-1">
                  <PersonCell name={g.name} sub={g.occupation} />
                  <div>
                    <CompletenessBadge person={g} />
                  </div>
                </div>
              ),
            },
            {
              key: 'nik',
              header: t('colNik'),
              cell: (g) => <MonoText>{g.nik ?? g.nikMasked ?? tm('none')}</MonoText>,
            },
            {
              key: 'phone',
              header: t('colPhone'),
              cell: (g) => <MonoText>{g.phone ?? tm('none')}</MonoText>,
            },
            {
              key: 'email',
              header: t('colEmail'),
              cell: (g) => <span className="text-sm break-all">{g.email ?? tm('none')}</span>,
            },
            {
              key: 'children',
              header: t('colChildren'),
              cell: (g) =>
                g.children.length === 0 ? (
                  <span className="text-muted-foreground text-xs">{t('noChildren')}</span>
                ) : (
                  <ul className="grid gap-0.5 text-sm">
                    {g.children.map((c) => (
                      <li key={c.studentId} className="min-w-0">
                        <Link
                          href={studentSearchHref(c.name)}
                          title={t('openChild', { name: c.name })}
                          className="hover:text-primary focus-visible:ring-ring/50 rounded-sm underline-offset-2 outline-none hover:underline focus-visible:ring-3"
                        >
                          {c.name}
                        </Link>
                        {c.className && (
                          <span className="text-muted-foreground text-xs"> · {c.className}</span>
                        )}
                      </li>
                    ))}
                    {hiddenChildren(g.childCount, g.children.length) > 0 && (
                      <li className="text-muted-foreground text-xs">
                        {t('childrenMore', { count: hiddenChildren(g.childCount, g.children.length) })}
                      </li>
                    )}
                  </ul>
                ),
            },
            {
              key: 'portal',
              header: t('colPortal'),
              cell: (g) => (
                <div className="grid gap-0.5">
                  <div>
                    <ToneBadge tone={PORTAL_TONE[g.portalStatus]}>{t(`portal.${g.portalStatus}`)}</ToneBadge>
                  </div>
                  {g.portalEmailMasked && (
                    <span className="text-muted-foreground text-xs break-all">{g.portalEmailMasked}</span>
                  )}
                </div>
              ),
            },
          ]}
          actions={
            manage
              ? (g) => (
                  <RowMenu
                    label={tm('actionsFor', { name: g.name })}
                    actions={[
                      { label: tm('edit'), icon: Pencil, onSelect: () => openEdit(g) },
                      ...(canInviteGuardian(g, portalOn)
                        ? [
                            {
                              label: t('invite'),
                              icon: g.portalStatus === 'invited' ? MailCheck : KeyRound,
                              onSelect: () =>
                                setInviting({ kind: 'guardian' as const, id: g.id, name: g.name }),
                            },
                          ]
                        : []),
                      ...(canDeleteGuardian(g)
                        ? [
                            {
                              label: tm('delete'),
                              icon: Trash2,
                              destructive: true,
                              separated: true,
                              onSelect: () => setDeleting({ id: g.id, name: g.name }),
                            },
                          ]
                        : []),
                    ]}
                  />
                )
              : undefined
          }
        />
      )}

      {list.data && pages > 1 && (
        <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
            {t('prev')}
          </Button>
          <span className="text-muted-foreground tabular-nums">
            {page + 1} / {pages}
          </span>
          <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
            {t('next')}
          </Button>
        </div>
      )}

      <ConfirmDelete
        name={deleting?.name ?? null}
        onClose={() => setDeleting(null)}
        pending={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />

      <FormDialog
        size="wide"
        open={!!editing}
        title={tg('editTitle')}
        submitLabel={tm('save')}
        error={error}
        validation={validation}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={() => (editing ? save.mutateAsync(editing) : Promise.resolve())}
      >
        {editing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <GuardianFields
              values={editing}
              onChange={(next) => setEditing({ ...editing, ...next })}
              v={validation}
              nikPlaceholder={editing.nik ? null : editing.nikMasked}
            />
            <p className="text-muted-foreground text-xs sm:col-span-2">{t('editSharedHint')}</p>
          </div>
        )}
      </FormDialog>

      <PortalInviteFlow target={inviting} onClose={() => setInviting(null)} onCreated={refresh} />
    </PageBody>
  );
}
