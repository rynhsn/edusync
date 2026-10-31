'use client';

import { MAX_SEMESTERS, TIMEZONE_OPTIONS } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  Clock3,
  Globe2,
  Layers,
  type LucideIcon,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ActionMenu, ENTER, stagger } from '@/components/access-kit';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, IconTile, TONES, type Tone } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const SEMESTER_TONES: Tone[] = ['teal', 'sky', 'violet', 'amber'];
const STAGES = ['sd', 'smp', 'sma', 'smk'] as const;

interface Draft {
  timezone: string;
  workingDays: number[];
  semesterNames: string[];
  lessonDefaultStart: string;
  lessonDefaultMinutes: number;
}

function useCtx() {
  const { school } = useSchool();
  return { school, header: { header: schoolHeader(school.schoolId) } };
}

/** Kartu pengaturan bersekat: ikon, judul, penjelasan singkat, lalu isi. */
function SettingCard({
  icon,
  tone,
  title,
  body,
  index,
  children,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  body: string;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <section
      style={stagger(index)}
      className={cn(ENTER, 'bg-card grid content-start gap-4 rounded-2xl border p-5')}
    >
      <div className="flex items-start gap-3">
        <IconTile icon={icon} tone={tone} className="size-10" />
        <div>
          <h2 className="font-heading font-semibold">{title}</h2>
          <p className="text-muted-foreground text-sm">{body}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Selisih UTC zona, mis. "GMT+7". */
function offsetLabel(tz: string, locale: string) {
  try {
    return (
      new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: 'shortOffset' })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value ?? ''
    );
  } catch {
    return '';
  }
}

/** Jam dinding sekarang di zona `tz`, diperbarui tiap 20 detik. */
function useClock(tz: string, locale: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(id);
  }, []);
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(now);
  } catch {
    return '';
  }
}

const addMinutes = (hhmm: string, add: number) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + add) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

function GeneralSettings() {
  const t = useTranslations('schoolSettings');
  const te = useTranslations();
  const locale = useLocale();
  const { school, header } = useCtx();
  const queryClient = useQueryClient();
  const canManage = useSchool().can('school:manage');
  const settings = useQuery({
    queryKey: ['school-settings', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/school/settings', { params: header })),
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const value: Draft | undefined = draft ?? settings.data;
  const clock = useClock(value?.timezone ?? 'Asia/Jakarta', locale);

  const save = useMutation({
    mutationFn: async () => {
      if (!value) return;
      return unwrap(
        await api.PUT('/v1/school/settings', {
          params: header,
          body: {
            ...value,
            semesterNames: value.semesterNames.map((n) => n.trim()),
          },
        }),
      );
    },
    onSuccess: () => {
      setError(null);
      setDraft(null);
      toast.success(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['school-settings', school.schoolId] });
      // Zona waktu sekolah ikut di /v1/me; muat ulang agar "hari ini" di seluruh layar mengikutinya.
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  if (!value)
    return (
      <div className="grid gap-4 lg:grid-cols-2" aria-busy>
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );

  const set = (patch: Partial<Draft>) => setDraft({ ...value, ...patch });
  const names = value.semesterNames;
  const lowered = names.map((n) => n.trim().toLowerCase());
  const semesterError =
    names.some((n) => n.trim() === '') || new Set(lowered).size !== lowered.length
      ? t('semesterInvalid')
      : null;
  const daysError = value.workingDays.length === 0 ? t('daysInvalid') : null;
  const minutesValid = value.lessonDefaultMinutes >= 10 && value.lessonDefaultMinutes <= 180;
  const invalid = !!semesterError || !!daysError || !minutesValid || !value.lessonDefaultStart;
  const zones: { value: string; label: string }[] = TIMEZONE_OPTIONS.map((o) => ({
    value: o.value,
    label: `${o.abbr} · ${o.value} (${offsetLabel(o.value, locale)})`,
  }));
  if (!zones.some((z) => z.value === value.timezone)) {
    zones.push({ value: value.timezone, label: value.timezone });
  }
  const moveName = (i: number, dir: -1 | 1) => {
    const next = [...names];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j] as string, next[i] as string];
    set({ semesterNames: next });
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) save.mutate();
      }}
    >
      <fieldset disabled={!canManage || save.isPending} className="grid min-w-0 gap-4 lg:grid-cols-2">
        <SettingCard index={0} icon={Globe2} tone="sky" title={t('timezoneTitle')} body={t('timezoneBody')}>
          <div className="grid gap-2">
            <Label htmlFor="tz">{t('timezone')}</Label>
            <SelectField id="tz" value={value.timezone} onChange={(e) => set({ timezone: e.target.value })}>
              {zones.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="bg-muted/50 flex items-center gap-3 rounded-xl px-4 py-3">
            <Clock3 aria-hidden className={cn('size-5 shrink-0', TONES.sky.text)} />
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">{t('nowThere')}</p>
              <p className="font-heading truncate font-semibold tabular-nums">{clock}</p>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">{t('timezoneHint')}</p>
        </SettingCard>

        <SettingCard
          index={1}
          icon={CalendarCheck}
          tone="emerald"
          title={t('daysTitle')}
          body={t('daysBody')}
        >
          {/* biome-ignore lint/a11y/useSemanticElements: tata letak grid; fieldset tidak cocok di dalam kartu. */}
          <div role="group" aria-label={t('daysTitle')} className="grid grid-cols-7 gap-1.5">
            {DAYS.map((d) => {
              const on = value.workingDays.includes(d);
              return (
                // biome-ignore lint/a11y/noLabelWithoutControl: kontrolnya Checkbox Base UI di dalam label.
                <label
                  key={d}
                  className={cn(
                    'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-center text-xs font-medium transition-colors',
                    'has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-3',
                    on
                      ? cn(TONES.emerald.soft, 'border-transparent')
                      : 'text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  <Checkbox
                    checked={on}
                    aria-label={t(`days.${d}`)}
                    onCheckedChange={(next) =>
                      set({
                        workingDays: next
                          ? [...value.workingDays, d].sort((a, b) => a - b)
                          : value.workingDays.filter((x) => x !== d),
                      })
                    }
                  />
                  <span>{t(`daysShort.${d}`)}</span>
                </label>
              );
            })}
          </div>
          <p className={cn('text-xs', daysError ? 'text-destructive' : 'text-muted-foreground')}>
            {daysError ?? t('daysCount', { n: value.workingDays.length })}
          </p>
        </SettingCard>

        <SettingCard
          index={2}
          icon={Layers}
          tone="violet"
          title={t('semesterTitle')}
          body={t('semesterBody')}
        >
          <div aria-hidden className="flex h-2.5 w-full gap-1 overflow-hidden rounded-full">
            {names.map((n, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: urutan adalah bagian dari data.
                key={`${n}-${i}`}
                className={cn(
                  'h-full flex-1 rounded-full transition-all',
                  TONES[SEMESTER_TONES[i] ?? 'slate'].bar,
                )}
              />
            ))}
          </div>
          <ul className="grid gap-2">
            {names.map((n, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: nama diedit langsung, posisi menjadi identitas baris.
              <li key={i} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn(
                    'grid size-8 shrink-0 place-items-center rounded-lg text-xs font-semibold',
                    TONES[SEMESTER_TONES[i] ?? 'slate'].soft,
                  )}
                >
                  {i + 1}
                </span>
                <Input
                  aria-label={t('semesterName', { n: i + 1 })}
                  value={n}
                  maxLength={40}
                  onChange={(e) =>
                    set({ semesterNames: names.map((x, j) => (j === i ? e.target.value : x)) })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('moveUp', { name: n })}
                  disabled={i === 0}
                  onClick={() => moveName(i, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('moveDown', { name: n })}
                  disabled={i === names.length - 1}
                  onClick={() => moveName(i, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('removeSemester', { name: n })}
                  disabled={names.length <= 1}
                  onClick={() => set({ semesterNames: names.filter((_, j) => j !== i) })}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={names.length >= MAX_SEMESTERS}
              onClick={() => set({ semesterNames: [...names, ''] })}
            >
              <Plus />
              {t('addSemester')}
            </Button>
            <p className={cn('text-xs', semesterError ? 'text-destructive' : 'text-muted-foreground')}>
              {semesterError ?? t('semesterHint', { max: MAX_SEMESTERS })}
            </p>
          </div>
        </SettingCard>

        <SettingCard index={3} icon={Clock3} tone="amber" title={t('lessonTitle')} body={t('lessonBody')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="lesson-start">{t('lessonStart')}</Label>
              <Input
                id="lesson-start"
                type="time"
                required
                value={value.lessonDefaultStart}
                onChange={(e) => set({ lessonDefaultStart: e.target.value })}
              />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="lesson-minutes">{t('lessonMinutes')}</Label>
              <Input
                id="lesson-minutes"
                type="number"
                min={10}
                max={180}
                required
                value={value.lessonDefaultMinutes}
                aria-invalid={!minutesValid}
                onChange={(e) => set({ lessonDefaultMinutes: Number(e.target.value) })}
              />
            </div>
          </div>
          {value.lessonDefaultStart && minutesValid && (
            // biome-ignore lint/a11y/useSemanticElements: kelompok keterangan, bukan isian formulir.
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('lessonPreview')}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={cn('rounded-lg px-2.5 py-1 text-xs font-medium tabular-nums', TONES.amber.soft)}
                >
                  {i + 1}: {addMinutes(value.lessonDefaultStart, i * value.lessonDefaultMinutes)}–
                  {addMinutes(value.lessonDefaultStart, (i + 1) * value.lessonDefaultMinutes)}
                </span>
              ))}
            </div>
          )}
          <p className="text-muted-foreground text-xs">{t('lessonHint')}</p>
        </SettingCard>
      </fieldset>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {canManage ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!draft || invalid || save.isPending}>
            {t('save')}
          </Button>
          {draft && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              {t('discard')}
            </Button>
          )}
          {draft && <span className="text-muted-foreground text-xs">{t('unsaved')}</span>}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t('readOnly')}</p>
      )}
    </form>
  );
}

interface Level {
  id: string;
  code: string;
  label: string;
  sort: number;
}

function LevelsPanel() {
  const t = useTranslations('schoolSettings');
  const te = useTranslations();
  const { school, header } = useCtx();
  const queryClient = useQueryClient();
  const canManage = useSchool().can('school:manage');
  const levels = useQuery({
    queryKey: ['school-levels', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/school/levels', { params: header })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['school-levels', school.schoolId] });

  const [createForm, setCreateForm] = useState({ code: '', label: '', sort: '' });
  const [editing, setEditing] = useState<Level | null>(null);
  const [editForm, setEditForm] = useState({ label: '', sort: '0' });
  const [deleting, setDeleting] = useState<Level | null>(null);
  const [stage, setStage] = useState<(typeof STAGES)[number]>('smp');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/school/levels', {
          params: header,
          body: {
            code: createForm.code.trim(),
            label: createForm.label.trim(),
            ...(createForm.sort.trim() !== '' ? { sort: Number(createForm.sort) } : {}),
          },
        }),
      ),
    onSuccess: () => {
      setError(null);
      setCreateForm({ code: '', label: '', sort: '' });
      toast.success(t('levelAdded'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const update = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/school/levels/{id}', {
          params: { ...header, path: { id: (editing as Level).id } },
          body: { label: editForm.label.trim(), sort: Number(editForm.sort) },
        }),
      ),
    onSuccess: () => {
      setError(null);
      toast.success(t('levelSaved'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/school/levels/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('levelDeleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const defaults = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/v1/school/levels/defaults', { params: header, body: { stage } })),
    onSuccess: () => {
      toast.success(t('defaultsFilled'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const list = levels.data ?? [];

  return (
    <section className={cn(ENTER, 'bg-card grid content-start gap-4 rounded-2xl border p-5')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <IconTile icon={Layers} tone="teal" className="size-10" />
          <div>
            <h2 className="font-heading font-semibold">{t('levelsTitle')}</h2>
            <p className="text-muted-foreground max-w-xl text-sm">{t('levelsBody')}</p>
          </div>
        </div>
        {canManage && (
          <FormDialog
            title={t('addLevel')}
            description={t('addLevelBody')}
            submitLabel={t('add')}
            error={error}
            onOpenChange={(o) => {
              setError(null);
              if (!o) setCreateForm({ code: '', label: '', sort: '' });
            }}
            onSubmit={() => create.mutateAsync()}
            trigger={
              <Button>
                <Plus />
                {t('addLevel')}
              </Button>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor="level-code">{t('levelCode')}</Label>
                <Input
                  id="level-code"
                  required
                  maxLength={20}
                  placeholder="7"
                  value={createForm.code}
                  onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                />
                <p className="text-muted-foreground text-xs">{t('levelCodeHint')}</p>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="level-label">{t('levelLabel')}</Label>
                <Input
                  id="level-label"
                  required
                  maxLength={60}
                  placeholder="Kelas 7"
                  value={createForm.label}
                  onChange={(e) => setCreateForm({ ...createForm, label: e.target.value })}
                />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="level-sort">{t('levelSort')}</Label>
                <Input
                  id="level-sort"
                  type="number"
                  min={0}
                  max={10000}
                  value={createForm.sort}
                  onChange={(e) => setCreateForm({ ...createForm, sort: e.target.value })}
                />
                <p className="text-muted-foreground text-xs">{t('levelSortHint')}</p>
              </div>
            </div>
          </FormDialog>
        )}
      </div>

      {levels.isLoading ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : list.length === 0 ? (
        <EmptyPanel
          icon={Layers}
          tone="teal"
          title={t('levelsEmptyTitle')}
          body={t('levelsEmptyBody')}
          action={
            canManage ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <div className="w-44">
                  <SelectField
                    aria-label={t('stage')}
                    value={stage}
                    onChange={(e) => setStage(e.target.value as (typeof STAGES)[number])}
                  >
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {t(`stages.${s}`)}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <Button onClick={() => defaults.mutate()} disabled={defaults.isPending}>
                  {t('fillDefaults')}
                </Button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((l, i) => (
            <li
              key={l.id}
              style={stagger(i)}
              className={cn(ENTER, 'flex items-center gap-3 rounded-xl border p-2.5 pr-1.5')}
            >
              <span
                className={cn(
                  'grid min-w-11 shrink-0 place-items-center rounded-lg px-2 py-2 text-sm font-semibold tabular-nums',
                  TONES.teal.soft,
                )}
              >
                {l.code}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.label}</p>
                <p className="text-muted-foreground text-xs tabular-nums">{t('levelOrder', { n: l.sort })}</p>
              </div>
              {canManage && (
                <ActionMenu
                  label={t('levelActionsFor', { name: l.label })}
                  items={[
                    {
                      label: t('edit'),
                      icon: Pencil,
                      onSelect: () => {
                        setError(null);
                        setEditing(l);
                        setEditForm({ label: l.label, sort: String(l.sort) });
                      },
                    },
                    {
                      label: t('delete'),
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => setDeleting(l),
                    },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <FormDialog
        open={!!editing}
        title={t('editLevel', { code: editing?.code ?? '' })}
        submitLabel={t('save')}
        error={error}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        onSubmit={() => update.mutateAsync()}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="edit-level-label">{t('levelLabel')}</Label>
            <Input
              id="edit-level-label"
              required
              maxLength={60}
              value={editForm.label}
              onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
            />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="edit-level-sort">{t('levelSort')}</Label>
            <Input
              id="edit-level-sort"
              type="number"
              min={0}
              max={10000}
              required
              value={editForm.sort}
              onChange={(e) => setEditForm({ ...editForm, sort: e.target.value })}
            />
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={t('deleteLevelTitle', { name: deleting?.label ?? '' })}
        description={t('deleteLevelBody')}
        confirmLabel={t('delete')}
        destructive
        pending={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </section>
  );
}

export function SchoolSettingsView() {
  const t = useTranslations('schoolSettings');
  return (
    <PageBody>
      <PageHeader icon={Settings2} tone="slate" title={t('title')} description={t('subtitle')} />
      <GeneralSettings />
      <LevelsPanel />
    </PageBody>
  );
}
