'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarClock,
  Clock3,
  Copy,
  CreditCard,
  FileSpreadsheet,
  KeyRound,
  MonitorSmartphone,
  Plus,
  Power,
  RotateCw,
  ScanLine,
  Search,
  SlidersHorizontal,
  Timer,
  Trash2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionMenu, ENTER, stagger } from '@/components/access-kit';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import {
  EmptyPanel,
  IconTile,
  MODULE_TONE,
  PersonCell,
  type Tone,
  ToneBadge,
  Toolbar,
  UserAvatar,
} from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { QuickRegister } from './quick-register';

type Tab = 'policy' | 'devices' | 'cards' | 'roster';
const TABS: Tab[] = ['policy', 'devices', 'cards', 'roster'];
const TAB_ICON = {
  policy: SlidersHorizontal,
  devices: MonitorSmartphone,
  cards: CreditCard,
  roster: CalendarClock,
} as const;

/** Perangkat dianggap daring bila aktif dan terakhir terlihat dalam 5 menit. */
const ONLINE_WINDOW_MS = 5 * 60_000;

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

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
  children,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(ENTER, 'bg-card grid content-start gap-4 rounded-2xl border p-5')}>
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

function PolicyPanel() {
  const t = useTranslations('gate');
  const te = useTranslations();
  const { school, header } = useCtx();
  const queryClient = useQueryClient();
  const policy = useQuery({
    queryKey: ['attendance-policy', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/attendance/policy', { params: header })),
  });
  const [draft, setDraft] = useState<NonNullable<typeof policy.data> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const value = draft ?? policy.data;

  const save = useMutation({
    mutationFn: async () => {
      if (!value) return;
      return unwrap(
        await api.PUT('/v1/attendance/policy', {
          params: header,
          body: {
            lateAfter: value.lateAfter,
            departureFrom: value.departureFrom,
            debounceSeconds: value.debounceSeconds,
          },
        }),
      );
    },
    onSuccess: () => {
      setError(null);
      setDraft(null);
      toast.success(t('policySaved'));
      queryClient.invalidateQueries({ queryKey: ['attendance-policy', school.schoolId] });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  if (!value)
    return (
      <div className="grid gap-4 lg:grid-cols-2" aria-busy>
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  const set = (patch: Partial<typeof value>) => setDraft({ ...value, ...patch });

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <SettingCard
          icon={Clock3}
          tone={MODULE_TONE.attendance}
          title={t('policyTimesTitle')}
          body={t('policyTimesBody')}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="late-after">{t('lateAfter')}</Label>
              <Input
                id="late-after"
                type="time"
                required
                value={value.lateAfter}
                onChange={(e) => set({ lateAfter: e.target.value })}
              />
              <p className="text-muted-foreground text-xs">{t('lateAfterHint')}</p>
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="departure-from">{t('departureFrom')}</Label>
              <Input
                id="departure-from"
                type="time"
                required
                value={value.departureFrom}
                onChange={(e) => set({ departureFrom: e.target.value })}
              />
              <p className="text-muted-foreground text-xs">{t('departureFromHint')}</p>
            </div>
          </div>
          <p className="text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 text-xs">{t('policyHint')}</p>
        </SettingCard>

        <SettingCard icon={Timer} tone="amber" title={t('debounceTitle')} body={t('debounceBody')}>
          <div className="grid content-start gap-2 sm:max-w-56">
            <Label htmlFor="debounce">{t('debounce')}</Label>
            <Input
              id="debounce"
              type="number"
              min={0}
              max={600}
              value={value.debounceSeconds}
              onChange={(e) => set({ debounceSeconds: Number(e.target.value) })}
            />
            <p className="text-muted-foreground text-xs">{t('debounceHint')}</p>
          </div>
        </SettingCard>
      </div>

      <p className="text-muted-foreground text-xs">
        {t('notifyMoved')}{' '}
        <Link href="/messaging" className="text-foreground underline underline-offset-2">
          {t('notifyMovedLink')}
        </Link>
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={!draft || save.isPending}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}

function DevicesPanel() {
  const t = useTranslations('gate');
  const te = useTranslations();
  const { school, header } = useCtx();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shownKey, setShownKey] = useState<{ name: string; key: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  const list = useQuery({
    queryKey: ['attendance-devices', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/attendance/devices', { params: header })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['attendance-devices', school.schoolId] });

  const create = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/v1/attendance/devices', { params: header, body: { name } })),
    onSuccess: (d) => {
      setName('');
      setError(null);
      setShownKey({ name: d.name, key: d.key });
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const toggle = useMutation({
    mutationFn: async (v: { id: string; active: boolean }) =>
      unwrap(
        await api.PATCH('/v1/attendance/devices/{id}', {
          params: { ...header, path: { id: v.id } },
          body: { active: v.active },
        }),
      ),
    onSuccess: refresh,
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const rotate = useMutation({
    mutationFn: async (d: { id: string; name: string }) => {
      const r = unwrap(
        await api.POST('/v1/attendance/devices/{id}/rotate-key', {
          params: { ...header, path: { id: d.id } },
        }),
      );
      return { name: d.name, key: r.key };
    },
    onSuccess: (r) => setShownKey(r),
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/attendance/devices/{id}', { params: { ...header, path: { id } } })),
    onSuccess: refresh,
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground max-w-2xl text-sm">{t('devicesHint')}</p>
        <FormDialog
          trigger={
            <Button>
              <Plus className="size-4" /> {t('addDevice')}
            </Button>
          }
          title={t('addDevice')}
          submitLabel={t('create')}
          error={error}
          onOpenChange={() => {
            setName('');
            setError(null);
          }}
          onSubmit={() => create.mutateAsync()}
        >
          <div className="grid gap-2">
            <Label htmlFor="device-name">{t('deviceName')}</Label>
            <Input
              id="device-name"
              required
              minLength={2}
              maxLength={80}
              placeholder={t('deviceNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </FormDialog>
      </div>

      {shownKey && (
        <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-500/10">
          <KeyRound className="size-4" />
          <AlertDescription className="grid gap-2">
            <span className="font-medium">{t('keyOnce', { name: shownKey.name })}</span>
            <span className="flex flex-wrap items-center gap-2">
              <code className="bg-muted rounded px-2 py-1 font-mono text-xs break-all">{shownKey.key}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(shownKey.key);
                  toast.success(t('copied'));
                }}
              >
                <Copy className="size-3.5" /> {t('copy')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShownKey(null)}>
                {t('close')}
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}

      {list.isPending && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      )}
      {list.data?.length === 0 && (
        <EmptyPanel
          icon={MonitorSmartphone}
          tone={MODULE_TONE.attendance}
          title={t('noDevices')}
          body={t('noDevicesBody')}
        />
      )}
      {list.data && list.data.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.data.map((d, i) => {
            const online =
              d.active && !!d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
            return (
              <li
                key={d.id}
                style={stagger(i)}
                className={cn(
                  ENTER,
                  'bg-card grid content-start gap-3 rounded-2xl border p-4',
                  !d.active && 'opacity-75',
                )}
              >
                <div className="flex items-start gap-3">
                  <IconTile
                    icon={MonitorSmartphone}
                    tone={online ? 'emerald' : d.active ? 'sky' : 'slate'}
                    className="size-10"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.name}</p>
                    <p className="text-muted-foreground font-mono text-xs">{d.keyPrefix}…</p>
                  </div>
                  <ActionMenu
                    label={t('deviceActionsFor', { name: d.name })}
                    items={[
                      {
                        label: d.active ? t('deactivate') : t('activate'),
                        icon: Power,
                        disabled: toggle.isPending,
                        onSelect: () => toggle.mutate({ id: d.id, active: !d.active }),
                      },
                      {
                        label: t('rotateKey'),
                        icon: RotateCw,
                        disabled: rotate.isPending,
                        onSelect: () => rotate.mutate({ id: d.id, name: d.name }),
                      },
                      {
                        label: t('delete'),
                        icon: Trash2,
                        destructive: true,
                        onSelect: () => setDeleting({ id: d.id, name: d.name }),
                      },
                    ]}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!d.active ? (
                    <ToneBadge tone="slate">{t('deviceOff')}</ToneBadge>
                  ) : online ? (
                    <ToneBadge tone="emerald">{t('online')}</ToneBadge>
                  ) : (
                    <ToneBadge tone="amber">{t('offline')}</ToneBadge>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">
                  {t('lastSeenLabel', {
                    when: d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : t('never'),
                  })}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        destructive
        title={t('confirmDeleteDevice', { name: deleting?.name ?? '' })}
        description={t('confirmDeleteDeviceBody')}
        confirmLabel={t('delete')}
        pending={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </div>
  );
}

function CardsPanel() {
  const t = useTranslations('gate');
  const te = useTranslations();
  const { school, header } = useCtx();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'list' | 'quick'>('list');
  const [studentId, setStudentId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  const [search, setSearch] = useState('');
  const students = useQuery({
    queryKey: ['students', school.schoolId, 'pick', search],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/students', {
          params: { ...header, query: { limit: 100, ...(search.trim() ? { q: search.trim() } : {}) } },
        }),
      ),
  });
  const cards = useQuery({
    queryKey: ['attendance-cards', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/attendance/cards', { params: { ...header, query: {} } })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['attendance-cards', school.schoolId] });

  const create = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/v1/attendance/cards', { params: header, body: { studentId, code } })),
    onSuccess: () => {
      setCode('');
      setError(null);
      toast.success(t('cardAdded'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/attendance/cards/{id}', { params: { ...header, path: { id } } })),
    onSuccess: refresh,
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const all = cards.data ?? [];
  const fq = filter.trim().toLowerCase();
  const shown = all.filter((c) => fq === '' || c.studentName.toLowerCase().includes(fq));

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground max-w-2xl text-sm">{t('cardsHint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={mode === 'quick' ? 'secondary' : 'default'}
          onClick={() => setMode(mode === 'quick' ? 'list' : 'quick')}
        >
          <ScanLine className="size-4" /> {t('quick.button')}
        </Button>
        <Link href="/attendance-settings/cards/import" className={buttonVariants({ variant: 'outline' })}>
          <FileSpreadsheet className="size-4" /> {t('cardImport.link')}
        </Link>
        <FormDialog
          trigger={
            <Button variant="outline">
              <Plus className="size-4" /> {t('addCard')}
            </Button>
          }
          title={t('addCard')}
          submitLabel={t('create')}
          error={error}
          onOpenChange={() => {
            setStudentId('');
            setCode('');
            setError(null);
          }}
          disabled={!studentId || code.trim().length < 4}
          onSubmit={() => create.mutateAsync()}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="card-search">{t('searchStudent')}</Label>
              <Input
                id="card-search"
                value={search}
                placeholder={t('searchStudentPlaceholder')}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="card-student">{t('student')}</Label>
              <SelectField id="card-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">{t('chooseStudent')}</option>
                {(students.data?.items ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.nis ? ` (${s.nis})` : ''}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="card-code">{t('cardCode')}</Label>
              <Input
                id="card-code"
                value={code}
                maxLength={64}
                placeholder={t('cardCodePlaceholder')}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
          </div>
        </FormDialog>
      </div>

      {mode === 'quick' && <QuickRegister />}

      {cards.isPending && <Skeleton className="h-48 rounded-2xl" aria-busy />}
      {cards.data?.length === 0 && (
        <EmptyPanel
          icon={CreditCard}
          tone={MODULE_TONE.attendance}
          title={t('noCards')}
          body={t('noCardsBody')}
        />
      )}
      {cards.data && cards.data.length > 0 && (
        <section className="grid gap-3">
          <Toolbar className="gap-3">
            <div className="relative min-w-44 flex-1 sm:max-w-xs">
              <Search
                aria-hidden
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <Input
                aria-label={t('searchCards')}
                placeholder={t('searchCards')}
                className="pl-9"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <p className="text-muted-foreground ml-auto text-xs tabular-nums" aria-live="polite">
              {t('cardsCount', { count: all.length })}
            </p>
          </Toolbar>
          <ul className="bg-card divide-y overflow-hidden rounded-2xl border">
            {shown.map((c, i) => (
              <li
                key={c.id}
                style={stagger(i)}
                className={cn(
                  ENTER,
                  'hover:bg-muted/40 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]',
                )}
              >
                <PersonCell name={c.studentName} />
                <code className="text-muted-foreground order-last col-span-2 font-mono text-xs break-all sm:order-none sm:col-span-1">
                  {c.code}
                </code>
                <ActionMenu
                  label={t('cardActionsFor', { name: c.studentName })}
                  items={[
                    {
                      label: t('delete'),
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => setDeleting({ id: c.id, name: c.studentName }),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        destructive
        title={t('confirmDeleteCard', { name: deleting?.name ?? '' })}
        description={t('confirmDeleteCardBody')}
        confirmLabel={t('delete')}
        pending={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </div>
  );
}

function RosterPanel() {
  const t = useTranslations('gate');
  const te = useTranslations();
  const { school, header } = useCtx();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [picked, setPicked] = useState<string[] | null>(null);

  const teachers = useQuery({
    queryKey: ['teachers', school.schoolId, ''],
    queryFn: async () => unwrap(await api.GET('/v1/teachers', { params: { ...header, query: {} } })),
  });
  const roster = useQuery({
    queryKey: ['duty-roster', school.schoolId, date],
    queryFn: async () =>
      unwrap(await api.GET('/v1/duty-roster', { params: { ...header, query: { from: date, to: date } } })),
  });
  const current = picked ?? (roster.data ?? []).map((r) => r.teacherId);
  const active = (teachers.data ?? []).filter((x) => x.status === 'active');

  const save = useMutation({
    mutationFn: async () =>
      unwrap(await api.PUT('/v1/duty-roster', { params: header, body: { date, teacherIds: current } })),
    onSuccess: () => {
      setPicked(null);
      toast.success(t('rosterSaved'));
      queryClient.invalidateQueries({ queryKey: ['duty-roster', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <SettingCard icon={CalendarClock} tone="violet" title={t('tab.roster')} body={t('rosterHint')}>
      <div className="grid gap-2 sm:w-56">
        <Label htmlFor="roster-date">{t('date')}</Label>
        <DatePicker
          id="roster-date"
          value={date}
          onChange={(v) => {
            if (v) {
              setDate(v);
              setPicked(null);
            }
          }}
        />
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 flex w-full items-center justify-between gap-2 text-sm font-medium">
          {t('dutyTeachers')}
          <ToneBadge tone="violet" dot={false}>
            <Users aria-hidden className="size-3" /> {t('rosterDutyCount', { count: current.length })}
          </ToneBadge>
        </legend>
        {teachers.isPending && <Skeleton className="h-24 rounded-xl" />}
        {teachers.data && active.length === 0 && (
          <p className="text-muted-foreground text-sm">{t('noTeachers')}</p>
        )}
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((x) => {
            const on = current.includes(x.id);
            return (
              <Label
                key={x.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 font-normal transition-colors',
                  on ? 'border-violet-500/50 bg-violet-50 dark:bg-violet-500/10' : 'hover:bg-muted/50',
                )}
              >
                <Checkbox
                  checked={on}
                  onCheckedChange={(next) =>
                    setPicked(next ? [...current, x.id] : current.filter((i) => i !== x.id))
                  }
                />
                <UserAvatar name={x.name} size="sm" />
                <span className="min-w-0 truncate">{x.name}</span>
              </Label>
            );
          })}
        </div>
      </fieldset>
      <div>
        <Button disabled={picked === null || save.isPending} onClick={() => save.mutate()}>
          {t('save')}
        </Button>
      </div>
    </SettingCard>
  );
}

export function AttendanceSettingsView({ initialTab = 'policy' }: { initialTab?: Tab }) {
  const t = useTranslations('gate');
  const { can } = useSchool();
  const [tab, setTab] = useState<Tab>(initialTab);

  if (!can('attendance:configure')) {
    return (
      <PageBody>
        <PageHeader icon={SlidersHorizontal} tone={MODULE_TONE.attendance} title={t('settingsTitle')} />
        <Alert variant="destructive">
          <AlertDescription>{t('noAccess')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }
  return (
    <PageBody>
      <PageHeader
        icon={SlidersHorizontal}
        tone={MODULE_TONE.attendance}
        title={t('settingsTitle')}
        description={t('settingsSubtitle')}
      />
      <fieldset className="m-0 max-w-full min-w-0 overflow-x-auto border-0 p-0">
        <legend className="sr-only">{t('tabsLabel')}</legend>
        <div className="flex w-fit gap-1 rounded-xl border p-1">
          {TABS.map((k) => {
            const Icon = TAB_ICON[k];
            return (
              <Button
                key={k}
                size="sm"
                variant={tab === k ? 'secondary' : 'ghost'}
                aria-pressed={tab === k}
                onClick={() => setTab(k)}
              >
                <Icon className="size-4" /> {t(`tab.${k}`)}
              </Button>
            );
          })}
        </div>
      </fieldset>
      {tab === 'policy' && <PolicyPanel />}
      {tab === 'devices' && <DevicesPanel />}
      {tab === 'cards' && <CardsPanel />}
      {tab === 'roster' && <RosterPanel />}
    </PageBody>
  );
}
