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
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { RowMenu } from '@/components/row-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import {
  EmptyPanel,
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
import { CATEGORIES, CATEGORY_META, type Category, hhmm, WEEKDAYS } from './shared';

type CoachType = 'none' | 'teacher' | 'external';

interface Draft {
  name: string;
  category: Category;
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
  category: 'sport',
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
}: {
  idPrefix: string;
  draft: Draft;
  onChange: (d: Draft) => void;
}) {
  const t = useTranslations('extracurricular');
  const tm = useTranslations('masterData');
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const teachers = useQuery({
    queryKey: ['teachers', school.schoolId, ''],
    enabled: can('teacher:read'),
    queryFn: async () => unwrap(await api.GET('/v1/teachers', { params: { ...header, query: {} } })),
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
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
        <Label htmlFor={`${idPrefix}-category`}>{t('categoryLabel')}</Label>
        <SelectField
          id={`${idPrefix}-category`}
          value={draft.category}
          onChange={(e) => onChange({ ...draft, category: e.target.value as Category })}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`category.${c}`)}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-description`}>{t('description')}</Label>
        <Input
          id={`${idPrefix}-description`}
          maxLength={500}
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
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
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-coach-teacher`}>{t('coach')}</Label>
          <SelectField
            id={`${idPrefix}-coach-teacher`}
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
        </div>
      )}
      {draft.coachType === 'external' && (
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-coach-external`}>{t('externalName')}</Label>
          <Input
            id={`${idPrefix}-coach-external`}
            required
            maxLength={120}
            value={draft.externalCoach}
            onChange={(e) => onChange({ ...draft, externalCoach: e.target.value })}
          />
        </div>
      )}
      <div className="grid gap-2 sm:col-span-2">
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
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-starts`}>{t('startsAt')}</Label>
        <Input
          id={`${idPrefix}-starts`}
          type="time"
          value={draft.startsAt}
          onChange={(e) => onChange({ ...draft, startsAt: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-ends`}>{t('endsAt')}</Label>
        <Input
          id={`${idPrefix}-ends`}
          type="time"
          value={draft.endsAt}
          onChange={(e) => onChange({ ...draft, endsAt: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-location`}>{t('location')}</Label>
        <Input
          id={`${idPrefix}-location`}
          maxLength={120}
          value={draft.location}
          onChange={(e) => onChange({ ...draft, location: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
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
function toBody(d: Draft) {
  return {
    name: d.name.trim(),
    category: d.category,
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

  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<({ id: string } & Draft) | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  const list = useQuery({
    queryKey: ['extracurriculars', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/extracurriculars', { params: header })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['extracurriculars', school.schoolId] });

  const create = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/v1/extracurriculars', { params: header, body: toBody(draft) })),
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

  return (
    <PageBody>
      <PageHeader
        icon={Trophy}
        tone={MODULE_TONE.academic}
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${tm('readOnly')}`}
        actions={
          manage && (
            <FormDialog
              size="wide"
              trigger={
                <Button>
                  <Plus className="size-4" /> {t('addTitle')}
                </Button>
              }
              title={t('addTitle')}
              submitLabel={tm('add')}
              disabled={draft.coachType === 'teacher' && !draft.coachTeacherId}
              error={error}
              onOpenChange={() => {
                setDraft(EMPTY);
                setError(null);
              }}
              onSubmit={() => create.mutateAsync()}
            >
              <ExtracurricularFields idPrefix="new" draft={draft} onChange={setDraft} />
            </FormDialog>
          )
        }
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
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`category.${c}`)}
            </option>
          ))}
        </SelectField>
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
        <EmptyPanel
          icon={Trophy}
          tone={MODULE_TONE.academic}
          title={t('emptyTitle')}
          body={all.length === 0 ? t('empty') : t('emptyFiltered')}
          action={
            manage &&
            all.length === 0 && (
              <FormDialog
                size="wide"
                trigger={
                  <Button>
                    <Plus className="size-4" /> {t('addTitle')}
                  </Button>
                }
                title={t('addTitle')}
                submitLabel={tm('add')}
                disabled={draft.coachType === 'teacher' && !draft.coachTeacherId}
                error={error}
                onOpenChange={() => {
                  setDraft(EMPTY);
                  setError(null);
                }}
                onSubmit={() => create.mutateAsync()}
              >
                <ExtracurricularFields idPrefix="empty" draft={draft} onChange={setDraft} />
              </FormDialog>
            )
          }
        />
      )}

      {rows.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r, idx) => {
            const meta = CATEGORY_META[r.category];
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
                        {t(`category.${r.category}`)}
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

                <dl className="grid gap-1.5 text-sm">
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
        disabled={editing?.coachType === 'teacher' && !editing.coachTeacherId}
        error={error}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={() => (editing ? save.mutateAsync(editing) : Promise.resolve())}
      >
        {editing && (
          <ExtracurricularFields
            idPrefix="edit"
            draft={editing}
            onChange={(d) => setEditing({ id: editing.id, ...d })}
          />
        )}
      </FormDialog>
    </PageBody>
  );
}
