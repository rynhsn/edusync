'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, LibraryBig, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { EmptyState } from '@/components/empty-state';
import { FormDialog } from '@/components/form-dialog';
import {
  FieldError,
  type FormValidation,
  TOUCH_INPUT,
  TOUCH_SELECT,
  useFormValidation,
} from '@/components/form-field-error';
import { ConfirmDelete, ListSkeleton, REVEAL, RowMenu, SearchBox } from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import {
  EmptyPanel,
  MODULE_TONE,
  StatCard,
  StatGrid,
  TONES,
  type Tone,
  ToneBadge,
  Toolbar,
} from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey, errorKeyIn } from '@/lib/errors';
import { SUBJECT_ORDER, type SubjectField, validateSubject } from '@/lib/form-validation';
import {
  groupsForPicker,
  isReligionGroup,
  RELIGION_VARIANT_KEYS,
  type ReligionVariantKey,
  religionVariantFor,
  SUBJECT_KIND_KEYS,
  type SubjectKindKey,
} from '@/lib/subject-groups';
import { useSubjectGroups } from '@/lib/use-subject-groups';
import { cn } from '@/lib/utils';

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
  /** Kunci kelompok mapel dari acuan platform; '' = tanpa kelompok. */
  subjectGroup: string;
  /** Jenis mapel (peran di struktur kurikulum). */
  kind: SubjectKindKey;
  /** Varian agama; hanya berlaku bila kelompoknya agama. */
  religionVariant: ReligionVariantKey | '';
  isLocalContent: boolean;
  /** Urutan tampil sebagai teks isian; '' = bawaan. */
  sortOrder: string;
  active: boolean;
}
const EMPTY: Draft = {
  code: '',
  name: '',
  subjectGroup: '',
  kind: 'compulsory',
  religionVariant: '',
  isLocalContent: false,
  sortOrder: '',
  active: true,
};

/** Badan permintaan POST/PUT dari isian formulir. Urutan kosong tidak dikirim (server memakai nilai yang ada atau bawaan). */
function toBody(d: Draft) {
  const order = d.sortOrder.trim();
  return {
    code: d.code,
    name: d.name,
    subjectGroup: d.subjectGroup === '' ? null : d.subjectGroup,
    kind: d.kind,
    religionVariant: religionVariantFor(d),
    isLocalContent: d.isLocalContent,
    active: d.active,
    ...(order === '' ? {} : { sortOrder: Number(order) }),
  };
}

function SubjectFields({
  idPrefix,
  draft,
  onChange,
  v,
  usedGroupKeys,
}: {
  idPrefix: string;
  draft: Draft;
  onChange: (d: Draft) => void;
  /** Validasi galat-merah; id isian = `${idPrefix}-${field}`. */
  v: FormValidation<SubjectField>;
  /** Kunci kelompok yang sudah dipakai mapel sekolah (kelompok lama tetap tampil bila dipakai). */
  usedGroupKeys: ReadonlySet<string>;
}) {
  const tm = useTranslations('masterData');
  const t = useTranslations('subjects');
  const { groups, labelOf, profileKey } = useSubjectGroups();
  const pickable = groupsForPicker(groups, {
    profileKey,
    usedKeys: usedGroupKeys,
    currentKey: draft.subjectGroup,
  });
  // Kunci yang tidak ada di acuan tetap harus terlihat supaya tidak hilang diam-diam saat disimpan.
  const unknownCurrent = draft.subjectGroup !== '' && !groups.some((g) => g.key === draft.subjectGroup);
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <div className="grid content-start gap-2">
          <Label htmlFor={`${idPrefix}-code`}>{tm('code')}</Label>
          <Input
            {...v.fieldProps('code')}
            className={TOUCH_INPUT}
            aria-required="true"
            autoComplete="off"
            maxLength={20}
            value={draft.code}
            onChange={(e) => onChange({ ...draft, code: e.target.value })}
          />
          <FieldError id={v.idOf('code')} issue={v.issue('code')} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={`${idPrefix}-name`}>{tm('name')}</Label>
          <Input
            {...v.fieldProps('name')}
            className={TOUCH_INPUT}
            aria-required="true"
            autoComplete="off"
            maxLength={80}
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
          />
          <FieldError id={v.idOf('name')} issue={v.issue('name')} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div className="grid content-start gap-2">
          <Label htmlFor={`${idPrefix}-group`}>{t('groupLabel')}</Label>
          <SelectField
            id={`${idPrefix}-group`}
            className={TOUCH_SELECT}
            value={draft.subjectGroup}
            onChange={(e) =>
              onChange({
                ...draft,
                subjectGroup: e.target.value,
                religionVariant: isReligionGroup(e.target.value) ? draft.religionVariant : '',
              })
            }
          >
            <option value="">{t('groupNone')}</option>
            {unknownCurrent && <option value={draft.subjectGroup}>{draft.subjectGroup}</option>}
            {pickable.map((g) => (
              <option key={g.key} value={g.key}>
                {labelOf(g.key)}
              </option>
            ))}
          </SelectField>
          <p className="text-muted-foreground text-xs">{t('groupHint')}</p>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={`${idPrefix}-sortOrder`}>{t('sortOrder')}</Label>
          <Input
            {...v.fieldProps('sortOrder')}
            className={TOUCH_INPUT}
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={draft.sortOrder}
            onChange={(e) => onChange({ ...draft, sortOrder: e.target.value })}
          />
          <FieldError id={v.idOf('sortOrder')} issue={v.issue('sortOrder')} />
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">{t('sortOrderHint')}</p>
      <div className={cn('grid gap-4', isReligionGroup(draft.subjectGroup) && 'sm:grid-cols-2')}>
        <div className="grid content-start gap-2">
          <Label htmlFor={`${idPrefix}-kind`}>{t('kindLabel')}</Label>
          <SelectField
            id={`${idPrefix}-kind`}
            className={TOUCH_SELECT}
            value={draft.kind}
            onChange={(e) => onChange({ ...draft, kind: e.target.value as SubjectKindKey })}
          >
            {SUBJECT_KIND_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </SelectField>
          <p className="text-muted-foreground text-xs">{t('kindHint')}</p>
        </div>
        {isReligionGroup(draft.subjectGroup) && (
          <div className="grid content-start gap-2">
            <Label htmlFor={`${idPrefix}-religion`}>{t('religionLabel')}</Label>
            <SelectField
              id={`${idPrefix}-religion`}
              className={TOUCH_SELECT}
              value={draft.religionVariant}
              onChange={(e) =>
                onChange({ ...draft, religionVariant: e.target.value as Draft['religionVariant'] })
              }
            >
              <option value="">{t('religionNone')}</option>
              {RELIGION_VARIANT_KEYS.map((r) => (
                <option key={r} value={r}>
                  {t(`religions.${r}`)}
                </option>
              ))}
            </SelectField>
            <p className="text-muted-foreground text-xs">{t('religionHint')}</p>
          </div>
        )}
      </div>
      <div className="flex items-start gap-3">
        <Checkbox
          id={`${idPrefix}-local`}
          className="mt-0.5"
          checked={draft.isLocalContent}
          onCheckedChange={(c) => onChange({ ...draft, isLocalContent: c === true })}
        />
        <Label htmlFor={`${idPrefix}-local`} className="grid cursor-pointer gap-0.5">
          <span className="text-sm font-medium">{t('localContent')}</span>
          <span className="text-muted-foreground text-xs font-normal">{t('localContentHint')}</span>
        </Label>
      </div>
      <div className="flex items-start gap-3">
        <Checkbox
          id={`${idPrefix}-active`}
          className="mt-0.5"
          checked={draft.active}
          onCheckedChange={(c) => onChange({ ...draft, active: c === true })}
        />
        <Label htmlFor={`${idPrefix}-active`} className="grid cursor-pointer gap-0.5">
          <span className="text-sm font-medium">{t('active')}</span>
          <span className="text-muted-foreground text-xs font-normal">{t('activeHint')}</span>
        </Label>
      </div>
    </div>
  );
}

interface SubjectRow {
  id: string;
  code: string;
  name: string;
  refSubjectId?: string | null;
  subjectGroup?: string | null;
  kind?: SubjectKindKey;
  religionVariant?: ReligionVariantKey | null;
  isLocalContent?: boolean;
  sortOrder?: number;
  active?: boolean;
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
  const { labelOf } = useSubjectGroups();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<({ id: string } & Draft) | null>(null);
  const validation = useFormValidation<SubjectField>({
    errors: validateSubject(editing ?? draft),
    order: SUBJECT_ORDER,
    idPrefix: editing ? 'edit' : 'new',
  });

  const list = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/subjects', { params: header })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/subjects', { params: header, body: toBody(draft) })),
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
          body: toBody(v),
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
    onError: (e) => toast.error(te(errorKeyIn(e, 'subject'))),
  });

  const [q, setQ] = useState('');
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const needle = q.trim().toLowerCase();
  const rows = (list.data ?? [])
    .filter((s) => !needle || s.name.toLowerCase().includes(needle) || s.code.toLowerCase().includes(needle))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));

  const usedGroupKeys = new Set((list.data ?? []).flatMap((s) => (s.subjectGroup ? [s.subjectGroup] : [])));

  const openEdit = (s: SubjectRow) => {
    setError(null);
    validation.reset();
    setEditing({
      id: s.id,
      code: s.code,
      name: s.name,
      subjectGroup: s.subjectGroup ?? '',
      kind: s.kind ?? 'compulsory',
      religionVariant: s.religionVariant ?? '',
      isLocalContent: s.isLocalContent ?? false,
      sortOrder: s.sortOrder === undefined ? '' : String(s.sortOrder),
      active: s.active ?? true,
    });
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
      validation={validation}
      onOpenChange={() => {
        setDraft(EMPTY);
        setError(null);
      }}
      onSubmit={() => create.mutateAsync()}
    >
      <SubjectFields
        idPrefix="new"
        draft={draft}
        onChange={setDraft}
        v={validation}
        usedGroupKeys={usedGroupKeys}
      />
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
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/curriculum" />}>
              <LibraryBig className="size-4" /> {t('curriculumLink')}
            </Button>
            {manage && addButton}
          </>
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
        <EmptyState
          icon={BookOpen}
          tone={MODULE_TONE.master}
          title={t('emptyTitle')}
          body={t('emptyBody')}
          first={te('emptyState.pages.subjects')}
          canAct={manage}
          action={
            <>
              {addButton}
              <Button variant="outline" nativeButton={false} render={<Link href="/curriculum" />}>
                <LibraryBig className="size-4" /> {t('adoptLink')}
              </Button>
            </>
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
        <ul className={cn('grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3', REVEAL)}>
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
                {(s.subjectGroup ||
                  s.isLocalContent ||
                  s.active === false ||
                  s.refSubjectId ||
                  (s.kind && s.kind !== 'compulsory')) && (
                  <p className="mt-1 flex flex-wrap items-center gap-1">
                    {s.subjectGroup && (
                      <span className="text-muted-foreground text-xs">{labelOf(s.subjectGroup)}</span>
                    )}
                    {s.kind && s.kind !== 'compulsory' && (
                      <ToneBadge tone="violet" dot={false}>
                        {t(`kinds.${s.kind}`)}
                      </ToneBadge>
                    )}
                    {isReligionGroup(s.subjectGroup) && s.religionVariant && (
                      <ToneBadge tone="emerald" dot={false}>
                        {t(`religions.${s.religionVariant}`)}
                      </ToneBadge>
                    )}
                    {s.isLocalContent && <ToneBadge tone="amber">{t('localContent')}</ToneBadge>}
                    {s.active === false && <ToneBadge tone="slate">{t('inactive')}</ToneBadge>}
                    {s.refSubjectId && (
                      <ToneBadge tone="sky" dot={false}>
                        {t('linkedToReference')}
                      </ToneBadge>
                    )}
                  </p>
                )}
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
        validation={validation}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={() => (editing ? save.mutateAsync(editing) : Promise.resolve())}
      >
        {editing && (
          <SubjectFields
            idPrefix="edit"
            draft={editing}
            onChange={(d) => setEditing({ id: editing.id, ...d })}
            v={validation}
            usedGroupKeys={usedGroupKeys}
          />
        )}
      </FormDialog>
    </PageBody>
  );
}
