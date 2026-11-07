'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  CalendarClock,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  Trophy,
  UserRound,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { FormDialog } from '@/components/form-dialog';
import { FORM_GRID } from '@/components/form-field';
import {
  FieldError,
  type FormValidation,
  TOUCH_INPUT,
  TOUCH_SELECT,
  useFormValidation,
} from '@/components/form-field-error';
import { PageBody, PageHeader } from '@/components/page-header';
import { RowMenu } from '@/components/row-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { TimeField } from '@/components/ui/time-field';
import {
  IconTile,
  MODULE_TONE,
  PersonCell,
  StatCard,
  StatGrid,
  TONES,
  ToneBadge,
  Toolbar,
} from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { CategoriesManager } from './categories-manager';
import {
  EXTRACURRICULAR_ORDER,
  type ExtracurricularField,
  validateExtracurricular,
} from './extracurricular-validation';
import { categoryMeta, hhmm, WEEKDAYS } from './shared';
import { useExtracurricularCategories } from './use-categories';

type CoachType = 'none' | 'teacher' | 'external';

interface Draft {
  name: string;
  category: string;
  description: string;
  coachType: CoachType;
  coachTeacherId: string;
  externalCoach: string;
  weekday: string;
  startsAt: string;
  endsAt: string;
  location: string;
  active: boolean;
}

const EMPTY: Draft = {
  name: '',
  category: '',
  description: '',
  coachType: 'none',
  coachTeacherId: '',
  externalCoach: '',
  weekday: '',
  startsAt: '',
  endsAt: '',
  location: '',
  active: true,
};

/** Isian formulir ekskul, dipakai dialog tambah dan ubah. */
function ExtracurricularFields({
  idPrefix,
  draft,
  onChange,
  v,
}: {
  idPrefix: string;
  draft: Draft;
  onChange: (d: Draft) => void;
  /** Validasi galat-merah; id isian = `${idPrefix}-${field}`. */
  v: FormValidation<ExtracurricularField>;
}) {
  const t = useTranslations('extracurricular');
  const tm = useTranslations('masterData');
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const categories = useExtracurricularCategories();
  const teachers = useQuery({
    queryKey: ['teachers', school.schoolId, ''],
    enabled: can('teacher:read'),
    queryFn: async () => unwrap(await api.GET('/v1/teachers', { params: { ...header, query: {} } })),
  });

  return (
    <div className={FORM_GRID}>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-name`}>{tm('name')}</Label>
        <Input
          {...v.fieldProps('name')}
          className={TOUCH_INPUT}
          aria-required="true"
          autoComplete="off"
          maxLength={100}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
        <FieldError id={v.idOf('name')} issue={v.issue('name')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-category`}>{t('categoryLabel')}</Label>
        <SelectField
          id={`${idPrefix}-category`}
          value={draft.category || categories.data?.find((c) => c.active)?.key || ''}
          onChange={(e) => onChange({ ...draft, category: e.target.value })}
        >
          {categories.data
            ?.filter((c) => c.active || c.key === draft.category)
            .map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
        </SelectField>
      </div>
      <div className="grid content-start gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-description`}>{t('description')}</Label>
        <Input
          {...v.fieldProps('description')}
          className={TOUCH_INPUT}
          autoComplete="off"
          maxLength={500}
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
        />
        <FieldError id={v.idOf('description')} issue={v.issue('description')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-coach-type`}>{t('coachType')}</Label>
        <SelectField
          id={`${idPrefix}-coach-type`}
          value={draft.coachType}
          onChange={(e) => onChange({ ...draft, coachType: e.target.value as CoachType })}
        >
          <option value="none">{t('coachNone')}</option>
          <option value="teacher">{t('coachTeacher')}</option>
          <option value="external">{t('coachExternal')}</option>
        </SelectField>
      </div>
      {draft.coachType === 'teacher' && (
        <div className="grid content-start gap-2">
          <Label htmlFor={`${idPrefix}-coachTeacherId`}>{t('coach')}</Label>
          <SelectField
            {...v.fieldProps('coachTeacherId')}
            className={TOUCH_SELECT}
            value={draft.coachTeacherId}
            onChange={(e) => onChange({ ...draft, coachTeacherId: e.target.value })}
          >
            <option value="">{t('chooseTeacher')}</option>
            {teachers.data
              ?.filter((x) => x.status === 'active' || x.id === draft.coachTeacherId)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </SelectField>
          <FieldError id={v.idOf('coachTeacherId')} issue={v.issue('coachTeacherId')} />
        </div>
      )}
      {draft.coachType === 'external' && (
        <div className="grid content-start gap-2">
          <Label htmlFor={`${idPrefix}-externalCoach`}>{t('externalName')}</Label>
          <Input
            {...v.fieldProps('externalCoach')}
            className={TOUCH_INPUT}
            aria-required="true"
            autoComplete="off"
            maxLength={100}
            value={draft.externalCoach}
            onChange={(e) => onChange({ ...draft, externalCoach: e.target.value })}
          />
          <FieldError id={v.idOf('externalCoach')} issue={v.issue('externalCoach')} />
        </div>
      )}
      <div className="grid content-start gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-weekday`}>{t('weekday')}</Label>
        <SelectField
          id={`${idPrefix}-weekday`}
          value={draft.weekday}
          onChange={(e) => onChange({ ...draft, weekday: e.target.value })}
        >
          <option value="">{t('noWeekday')}</option>
          {WEEKDAYS.map((d) => (
            <option key={d} value={d}>
              {t(`weekdays.${d}`)}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-starts`}>{t('startsAt')}</Label>
        <TimeField
          id={`${idPrefix}-starts`}
          value={draft.startsAt}
          onChange={(v) => onChange({ ...draft, startsAt: v })}
        />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-endsAt`}>{t('endsAt')}</Label>
        <TimeField
          {...v.fieldProps('endsAt')}
          className={TOUCH_INPUT}
          value={draft.endsAt}
          onChange={(val) => onChange({ ...draft, endsAt: val })}
        />
        <FieldError id={v.idOf('endsAt')} issue={v.issue('endsAt')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-location`}>{t('location')}</Label>
        <Input
          {...v.fieldProps('location')}
          className={TOUCH_INPUT}
          autoComplete="off"
          maxLength={100}
          value={draft.location}
          onChange={(e) => onChange({ ...draft, location: e.target.value })}
        />
        <FieldError id={v.idOf('location')} issue={v.issue('location')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${idPrefix}-active`}>{t('status')}</Label>
        <SelectField
          id={`${idPrefix}-active`}
          value={draft.active ? 'active' : 'inactive'}
          onChange={(e) => onChange({ ...draft, active: e.target.value === 'active' })}
        >
          <option value="active">{t('active')}</option>
          <option value="inactive">{t('inactive')}</option>
        </SelectField>
      </div>
    </div>
  );
}

/** Badan permintaan tambah/ubah dari isian formulir. */
function toBody(d: Draft, fallbackCategory: string) {
  return {
    name: d.name.trim(),
    category: d.category || fallbackCategory,
    description: d.description.trim() || null,
    coachTeacherId: d.coachType === 'teacher' ? d.coachTeacherId || null : null,
    externalCoach: d.coachType === 'external' ? d.externalCoach.trim() || null : null,
    weekday: d.weekday ? Number(d.weekday) : null,
    startsAt: d.startsAt || null,
    endsAt: d.endsAt || null,
    location: d.location.trim() || null,
    active: d.active,
  };
}

export function ExtracurricularsView() {
  const t = useTranslations('extracurricular');
  const tm = useTranslations('masterData');
  const tc = useTranslations('common');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('extracurricular:manage');
  const categories = useExtracurricularCategories();
  const firstCategory = categories.data?.find((c) => c.active)?.key ?? '';

  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<({ id: string } & Draft) | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const validation = useFormValidation<ExtracurricularField>({
    errors: validateExtracurricular(editing ?? draft),
    order: EXTRACURRICULAR_ORDER,
    idPrefix: editing ? 'edit' : 'new',
  });

  const list = useQuery({
    queryKey: ['extracurriculars', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/extracurriculars', { params: header })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['extracurriculars', school.schoolId] });

  const create = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/v1/extracurriculars', { params: header, body: toBody(draft, firstCategory) })),
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
        await api.PUT('/v1/extracurriculars/{id}', {
          params: { ...header, path: { id: v.id } },
          body: toBody(v, firstCategory),
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
      unwrap(await api.DELETE('/v1/extracurriculars/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(tm('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const needle = q.trim().toLowerCase();
  const all = list.data ?? [];
  const rows = all.filter(
    (r) => (!category || r.category === category) && (!needle || r.name.toLowerCase().includes(needle)),
  );
  const activeCount = all.filter((r) => r.active).length;
  const memberTotal = all.reduce((n, r) => n + r.memberCount, 0);
  const withCoach = all.filter((r) => r.coachName).length;

  const scheduleOf = (r: { weekday: number | null; startsAt: string | null; endsAt: string | null }) => {
    if (!r.weekday) return t('noSchedule');
    const time = r.startsAt ? ` ${hhmm(r.startsAt)}${r.endsAt ? `–${hhmm(r.endsAt)}` : ''}` : '';
    return `${t(`weekdays.${String(r.weekday) as '1'}`)}${time}`;
  };

  const addButton = (
    <FormDialog
      size="wide"
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
      <ExtracurricularFields idPrefix="new" draft={draft} onChange={setDraft} v={validation} />
    </FormDialog>
  );

  return (
    <PageBody>
      <PageHeader
        icon={Trophy}
        tone={MODULE_TONE.academic}
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${tm('readOnly')}`}
        actions={manage && addButton}
      />

      {all.length > 0 && (
        <StatGrid className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
          <StatCard icon={Trophy} tone={MODULE_TONE.academic} label={t('statTotal')} value={all.length} />
          <StatCard
            icon={Activity}
            tone="emerald"
            label={t('statActive')}
            value={activeCount}
            progress={(activeCount / all.length) * 100}
          />
          <StatCard icon={Users} tone="sky" label={t('membersCount')} value={memberTotal} />
          <StatCard
            icon={UserRound}
            tone="amber"
            label={t('statWithCoach')}
            value={`${withCoach}/${all.length}`}
            progress={(withCoach / all.length) * 100}
          />
        </StatGrid>
      )}

      <Toolbar>
        <div className="relative w-full max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            aria-label={tm('search')}
            className="pl-8"
            value={q}
            placeholder={t('searchPlaceholder')}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <SelectField
          aria-label={t('categoryLabel')}
          className="sm:w-52"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">{t('allCategories')}</option>
          {categories.data?.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </SelectField>
        {manage && <CategoriesManager />}
      </Toolbar>

      {list.isPending && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
          {['a', 'b', 'c', 'd', 'e', 'f'].slice(0, 6).map((k) => (
            <Skeleton key={k} className="h-44 rounded-2xl" />
          ))}
        </div>
      )}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{tm('loadError')}</AlertDescription>
        </Alert>
      )}
      {list.data && rows.length === 0 && (
        <EmptyState
          icon={Trophy}
          tone={MODULE_TONE.academic}
          title={t('emptyTitle')}
          body={all.length === 0 ? t('empty') : t('emptyFiltered')}
          first={all.length === 0 ? te('emptyState.pages.extracurriculars') : undefined}
          canAct={manage || all.length > 0}
          action={manage && all.length === 0 && addButton}
        />
      )}

      {rows.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r, idx) => {
            const meta = categoryMeta(categories.data, r.category);
            return (
              <li
                key={r.id}
                style={{ animationDelay: `${Math.min(idx, 9) * 30}ms` }}
                className={cn(
                  'bg-card focus-within:ring-ring/50 group relative grid gap-3 rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both motion-safe:duration-300',
                  !r.active && 'opacity-75',
                )}
              >
                <div className="flex items-start gap-3">
                  <IconTile icon={meta.icon} tone={meta.tone} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/extracurriculars/${r.id}`}
                      className="font-heading block truncate font-semibold outline-none after:absolute after:inset-0 after:rounded-2xl"
                    >
                      {r.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <ToneBadge tone={meta.tone} dot={false}>
                        {meta.label}
                      </ToneBadge>
                      {!r.active && <ToneBadge tone="slate">{t('inactive')}</ToneBadge>}
                    </div>
                  </div>
                  {manage && (
                    <div className="relative z-10">
                      <RowMenu
                        label={`${t('rowActions')}: ${r.name}`}
                        items={[
                          {
                            key: 'edit',
                            label: tm('edit'),
                            icon: Pencil,
                            onSelect: () => {
                              setError(null);
                              validation.reset();
                              setEditing({
                                id: r.id,
                                name: r.name,
                                category: r.category,
                                description: r.description ?? '',
                                coachType: r.coachTeacherId
                                  ? 'teacher'
                                  : r.externalCoach
                                    ? 'external'
                                    : 'none',
                                coachTeacherId: r.coachTeacherId ?? '',
                                externalCoach: r.externalCoach ?? '',
                                weekday: r.weekday ? String(r.weekday) : '',
                                startsAt: hhmm(r.startsAt),
                                endsAt: hhmm(r.endsAt),
                                location: r.location ?? '',
                                active: r.active,
                              });
                            },
                          },
                          {
                            key: 'delete',
                            label: tm('delete'),
                            icon: Trash2,
                            destructive: true,
                            onSelect: () => setDeleting({ id: r.id, name: r.name }),
                          },
                        ]}
                      />
                    </div>
                  )}
                </div>

                {r.description && (
                  <p className="text-muted-foreground line-clamp-2 text-sm">{r.description}</p>
                )}

                <dl className="grid content-start gap-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <dt className="sr-only">{t('schedule')}</dt>
                    <CalendarClock aria-hidden className={cn('size-4 shrink-0', TONES[meta.tone].text)} />
                    <dd className={cn(!r.weekday && 'text-muted-foreground')}>{scheduleOf(r)}</dd>
                  </div>
                  {r.location && (
                    <div className="flex items-center gap-2">
                      <dt className="sr-only">{t('location')}</dt>
                      <MapPin aria-hidden className={cn('size-4 shrink-0', TONES[meta.tone].text)} />
                      <dd className="truncate">{r.location}</dd>
                    </div>
                  )}
                </dl>

                <div className="flex items-center justify-between gap-3 border-t pt-3">
                  {r.coachName ? (
                    <PersonCell name={r.coachName} sub={t('coach')} className="flex-1" />
                  ) : (
                    <span className="text-muted-foreground flex-1 text-xs">
                      {t('coach')}: {tm('none')}
                    </span>
                  )}
                  <ToneBadge tone="slate" dot={false} className="shrink-0">
                    <Users aria-hidden className="size-3" />
                    {r.memberCount} {t('membersCount').toLowerCase()}
                  </ToneBadge>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={tm('delete')}
        description={deleting ? t('confirmDelete', { name: deleting.name }) : undefined}
        confirmLabel={tc('confirmDelete')}
        destructive
        pending={remove.isPending}
        onConfirm={() => (deleting ? remove.mutateAsync(deleting.id) : Promise.resolve())}
      />

      <FormDialog
        size="wide"
        open={!!editing}
        title={t('editTitle')}
        submitLabel={tm('save')}
        error={error}
        validation={validation}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={() => (editing ? save.mutateAsync(editing) : Promise.resolve())}
      >
        {editing && (
          <ExtracurricularFields
            idPrefix="edit"
            draft={editing}
            onChange={(d) => setEditing({ id: editing.id, ...d })}
            v={validation}
          />
        )}
      </FormDialog>
    </PageBody>
  );
}
