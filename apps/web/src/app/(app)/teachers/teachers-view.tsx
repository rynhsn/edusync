'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  KeyRound,
  Pencil,
  Plus,
  Presentation,
  Trash2,
  Upload,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import {
  EmptyPanel,
  MODULE_TONE,
  PersonCell,
  StatCard,
  StatGrid,
  ToneBadge,
  Toolbar,
} from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { buildExport, saveBlob } from '@/lib/sheet';

interface Draft {
  name: string;
  nip: string;
  status: 'active' | 'inactive';
}
const EMPTY: Draft = { name: '', nip: '', status: 'active' };

function TeacherFields({
  idPrefix,
  draft,
  onChange,
}: {
  idPrefix: string;
  draft: Draft;
  onChange: (d: Draft) => void;
}) {
  const t = useTranslations('teachers');
  const tm = useTranslations('masterData');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-name`}>{tm('name')}</Label>
        <Input
          id={`${idPrefix}-name`}
          required
          maxLength={120}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-nip`}>{t('nip')}</Label>
        <Input
          id={`${idPrefix}-nip`}
          maxLength={30}
          value={draft.nip}
          onChange={(e) => onChange({ ...draft, nip: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-status`}>{t('status')}</Label>
        <SelectField
          id={`${idPrefix}-status`}
          value={draft.status}
          onChange={(e) => onChange({ ...draft, status: e.target.value as Draft['status'] })}
        >
          <option value="active">{t('active')}</option>
          <option value="inactive">{t('inactive')}</option>
        </SelectField>
      </div>
    </div>
  );
}

export function TeachersView() {
  const t = useTranslations('teachers');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('teacher:manage');

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<({ id: string } & Draft) | null>(null);

  const list = useQuery({
    queryKey: ['teachers', school.schoolId, q],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/teachers', { params: { ...header, query: q.trim() ? { q: q.trim() } : {} } }),
      ),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['teachers', school.schoolId] });

  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/teachers', { params: header, body: { ...draft, nip: draft.nip.trim() || null } }),
      ),
    onSuccess: () => {
      setError(null);
      setDraft(EMPTY);
      toast.success(tm('created'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const save = useMutation({
    mutationFn: async (v: { id: string } & Draft) =>
      unwrap(
        await api.PUT('/v1/teachers/{id}', {
          params: { ...header, path: { id: v.id } },
          body: { name: v.name, nip: v.nip.trim() || null, status: v.status },
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
      unwrap(await api.DELETE('/v1/teachers/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(tm('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  async function exportExcel() {
    const rows = list.data ?? [];
    if (rows.length === 0) return void toast.info(tm('exportEmpty'));
    const blob = await buildExport(
      'Guru',
      ['Nama', 'NIP', 'Status'],
      rows.map((r) => [r.name, r.nip, r.status === 'active' ? t('active') : t('inactive')]),
      { textColumns: [2], widths: [30, 24, 14] },
    );
    saveBlob(blob, `guru-${school.schoolSlug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // Ringkasan memakai daftar tanpa saringan (kunci yang sama dengan pemilih guru di halaman kelas).
  const all = useQuery({
    queryKey: ['teachers', school.schoolId, ''],
    queryFn: async () => unwrap(await api.GET('/v1/teachers', { params: { ...header, query: {} } })),
  });
  const allRows = all.data ?? [];
  const activeCount = allRows.filter((r) => r.status === 'active').length;
  const linkedCount = allRows.filter((r) => r.memberId).length;
  const activePercent = allRows.length ? Math.round((activeCount / allRows.length) * 100) : 0;
  const rows = (list.data ?? []).filter((r) => !statusFilter || r.status === statusFilter);
  const hasFilters = !!(q.trim() || statusFilter);

  const openEdit = (r: NonNullable<typeof list.data>[number]) => {
    setError(null);
    setEditing({ id: r.id, name: r.name, nip: r.nip ?? '', status: r.status });
  };

  const addButton = (
    <FormDialog
      trigger={
        <Button>
          <Plus className="size-4" /> {t('addTitle')}
        </Button>
      }
      title={t('addTitle')}
      submitLabel={tm('add')}
      error={error}
      onOpenChange={() => {
        setDraft(EMPTY);
        setError(null);
      }}
      onSubmit={() => create.mutateAsync()}
    >
      <TeacherFields idPrefix="new" draft={draft} onChange={setDraft} />
    </FormDialog>
  );

  return (
    <PageBody>
      <PageHeader
        icon={Presentation}
        tone={MODULE_TONE.master}
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${tm('readOnly')}`}
        actions={
          <>
            <Button variant="outline" onClick={exportExcel}>
              <Download className="size-4" /> {tm('export')}
            </Button>
            {manage && (
              <>
                <Button variant="outline" nativeButton={false} render={<Link href="/teachers/import" />}>
                  <Upload className="size-4" /> {t('importLink')}
                </Button>
                {addButton}
              </>
            )}
          </>
        }
      />

      <StatGrid className={REVEAL}>
        <StatCard
          icon={Users}
          tone="teal"
          label={t('statTotal')}
          value={all.data ? allRows.length : '…'}
          hint={t('statTotalHint')}
        />
        <StatCard
          icon={UserCheck}
          tone="emerald"
          label={t('active')}
          value={all.data ? activeCount : '…'}
          progress={activePercent}
          hint={all.data ? t('statActiveHint', { percent: activePercent }) : undefined}
        />
        <StatCard
          icon={UserX}
          tone="slate"
          label={t('inactive')}
          value={all.data ? allRows.length - activeCount : '…'}
          hint={t('statInactiveHint')}
        />
        <StatCard
          icon={KeyRound}
          tone="sky"
          label={t('statLinked')}
          value={all.data ? linkedCount : '…'}
          hint={t('statLinkedHint')}
        />
      </StatGrid>

      <Toolbar>
        <SearchBox value={q} placeholder={t('searchPlaceholder')} onChange={setQ} />
        <SelectField
          aria-label={t('status')}
          className="sm:w-44"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">{t('allStatus')}</option>
          <option value="active">{t('active')}</option>
          <option value="inactive">{t('inactive')}</option>
        </SelectField>
        {list.data && (
          <span className="text-muted-foreground ml-auto px-1 text-sm tabular-nums">
            {t('total', { count: rows.length })}
          </span>
        )}
      </Toolbar>

      {list.isPending && <ListSkeleton rows={6} />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{tm('loadError')}</AlertDescription>
        </Alert>
      )}
      {list.data &&
        rows.length === 0 &&
        (hasFilters ? (
          <EmptyPanel
            icon={Users}
            tone={MODULE_TONE.master}
            title={t('emptyFilteredTitle')}
            body={t('emptyFilteredBody')}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQ('');
                  setStatusFilter('');
                }}
              >
                {t('clearFilters')}
              </Button>
            }
          />
        ) : (
          <EmptyPanel
            icon={Presentation}
            tone={MODULE_TONE.master}
            title={t('emptyTitle')}
            body={manage ? t('emptyBody') : tm('empty')}
            action={
              manage && (
                <div className="flex flex-wrap justify-center gap-2">
                  {addButton}
                  <Button variant="outline" nativeButton={false} render={<Link href="/teachers/import" />}>
                    <Upload className="size-4" /> {t('importLink')}
                  </Button>
                </div>
              )
            }
          />
        ))}

      {rows.length > 0 && (
        <DataRows
          rows={rows}
          rowKey={(r) => r.id}
          actionsHeader={tm('actions')}
          onRowClick={manage ? openEdit : undefined}
          columns={[
            {
              key: 'name',
              header: tm('name'),
              cell: (r) => <PersonCell name={r.name} sub={r.memberId ? t('hasAccount') : t('noAccount')} />,
            },
            { key: 'nip', header: t('nip'), cell: (r) => <MonoText>{r.nip ?? tm('none')}</MonoText> },
            {
              key: 'status',
              header: t('status'),
              cell: (r) => (
                <ToneBadge tone={r.status === 'active' ? 'emerald' : 'slate'}>
                  {r.status === 'active' ? t('active') : t('inactive')}
                </ToneBadge>
              ),
            },
          ]}
          actions={
            manage
              ? (r) => (
                  <RowMenu
                    label={tm('actionsFor', { name: r.name })}
                    actions={[
                      { label: tm('edit'), icon: Pencil, onSelect: () => openEdit(r) },
                      {
                        label: tm('delete'),
                        icon: Trash2,
                        destructive: true,
                        separated: true,
                        onSelect: () => setDeleting({ id: r.id, name: r.name }),
                      },
                    ]}
                  />
                )
              : undefined
          }
        />
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
        open={!!editing}
        title={tm('edit')}
        submitLabel={tm('save')}
        error={error}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={() => (editing ? save.mutateAsync(editing) : Promise.resolve())}
      >
        {editing && (
          <TeacherFields
            idPrefix="edit"
            draft={editing}
            onChange={(d) => setEditing({ id: editing.id, ...d })}
          />
        )}
      </FormDialog>
    </PageBody>
  );
}
