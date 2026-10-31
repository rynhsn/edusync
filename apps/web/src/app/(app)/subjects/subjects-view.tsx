'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { ConfirmDelete, ListSkeleton, REVEAL, RowMenu, SearchBox } from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyPanel, MODULE_TONE, StatCard, StatGrid, TONES, type Tone, Toolbar } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { CurriculumBank } from './curriculum-bank';

const CODE_TONES: Tone[] = ['teal', 'sky', 'violet', 'amber', 'rose', 'emerald'];

/** Warna lencana kode yang stabil menurut kode. */
function toneFor(code: string): Tone {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CODE_TONES[h % CODE_TONES.length] ?? 'teal';
}

interface Draft {
  code: string;
  name: string;
}
const EMPTY: Draft = { code: '', name: '' };

function SubjectFields({
  idPrefix,
  draft,
  onChange,
}: {
  idPrefix: string;
  draft: Draft;
  onChange: (d: Draft) => void;
}) {
  const tm = useTranslations('masterData');
  return (
    <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-code`}>{tm('code')}</Label>
        <Input
          id={`${idPrefix}-code`}
          required
          maxLength={20}
          value={draft.code}
          onChange={(e) => onChange({ ...draft, code: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-name`}>{tm('name')}</Label>
        <Input
          id={`${idPrefix}-name`}
          required
          maxLength={80}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </div>
    </div>
  );
}

export function SubjectsView() {
  const t = useTranslations('subjects');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const key = ['subjects', school.schoolId];
  const manage = can('subject:manage');

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<({ id: string } & Draft) | null>(null);

  const list = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/subjects', { params: header })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/subjects', { params: header, body: draft })),
    onSuccess: () => {
      setDraft(EMPTY);
      toast.success(tm('created'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const save = useMutation({
    mutationFn: async (v: { id: string } & Draft) =>
      unwrap(
        await api.PUT('/v1/subjects/{id}', {
          params: { ...header, path: { id: v.id } },
          body: { code: v.code, name: v.name },
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
      unwrap(await api.DELETE('/v1/subjects/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(tm('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const [q, setQ] = useState('');
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const needle = q.trim().toLowerCase();
  const rows = (list.data ?? []).filter(
    (s) => !needle || s.name.toLowerCase().includes(needle) || s.code.toLowerCase().includes(needle),
  );

  const openEdit = (s: { id: string; code: string; name: string }) => {
    setError(null);
    setEditing({ id: s.id, code: s.code, name: s.name });
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
      <SubjectFields idPrefix="new" draft={draft} onChange={setDraft} />
    </FormDialog>
  );

  return (
    <PageBody>
      <PageHeader
        icon={BookOpen}
        tone={MODULE_TONE.master}
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${tm('readOnly')}`}
        actions={
          manage && (
            <>
              <CurriculumBank />
              {addButton}
            </>
          )
        }
      />

      <StatGrid className={cn(REVEAL, 'grid-cols-1 sm:max-w-xs lg:grid-cols-1')}>
        <StatCard
          icon={BookOpen}
          tone="teal"
          label={t('statTotal')}
          value={list.data ? list.data.length : '…'}
          hint={t('statTotalHint')}
        />
      </StatGrid>

      <Toolbar>
        <SearchBox value={q} placeholder={t('searchPlaceholder')} onChange={setQ} />
        {list.data && (
          <span className="text-muted-foreground ml-auto px-1 text-sm tabular-nums">
            {t('shown', { count: rows.length })}
          </span>
        )}
      </Toolbar>

      {list.isPending && <ListSkeleton rows={5} />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{tm('loadError')}</AlertDescription>
        </Alert>
      )}
      {list.data && list.data.length === 0 && (
        <EmptyPanel
          icon={BookOpen}
          tone={MODULE_TONE.master}
          title={t('emptyTitle')}
          body={manage ? t('emptyBody') : tm('empty')}
          action={
            manage && (
              <div className="flex flex-wrap justify-center gap-2">
                {addButton}
                <CurriculumBank />
              </div>
            )
          }
        />
      )}
      {list.data && list.data.length > 0 && rows.length === 0 && (
        <EmptyPanel
          icon={BookOpen}
          tone={MODULE_TONE.master}
          title={t('emptyFilteredTitle')}
          body={t('emptyFilteredBody')}
          action={
            <Button variant="outline" onClick={() => setQ('')}>
              {t('clearFilters')}
            </Button>
          }
        />
      )}

      {rows.length > 0 && (
        <ul className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-3', REVEAL)}>
          {rows.map((s) => (
            <li
              key={s.id}
              className={cn(
                'bg-card group flex items-center gap-3 rounded-2xl border p-3.5 transition-shadow hover:shadow-sm',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'grid h-11 min-w-14 shrink-0 place-items-center rounded-xl px-2 font-mono text-xs font-semibold',
                  TONES[toneFor(s.code)].soft,
                )}
              >
                {s.code}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.name}</p>
              </div>
              {manage && (
                <RowMenu
                  label={tm('actionsFor', { name: s.name })}
                  actions={[
                    { label: tm('edit'), icon: Pencil, onSelect: () => openEdit(s) },
                    {
                      label: tm('delete'),
                      icon: Trash2,
                      destructive: true,
                      separated: true,
                      onSelect: () => setDeleting({ id: s.id, name: s.name }),
                    },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
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
          <SubjectFields
            idPrefix="edit"
            draft={editing}
            onChange={(d) => setEditing({ id: editing.id, ...d })}
          />
        )}
      </FormDialog>
    </PageBody>
  );
}
