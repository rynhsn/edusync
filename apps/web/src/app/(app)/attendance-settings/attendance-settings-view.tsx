'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarClock,
  Clock3,
  Copy,
  CreditCard,
  KeyRound,
  Layers,
  MonitorSmartphone,
  Plus,
  Power,
  RotateCw,
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
import { FORM_GRID } from '@/components/form-field';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { TimeField } from '@/components/ui/time-field';
import { EmptyPanel, IconTile, MODULE_TONE, type Tone, ToneBadge, UserAvatar } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { todayIso } from '@/lib/school-time';
import { cn } from '@/lib/utils';

type Tab = 'policy' | 'devices' | 'roster';
const TABS: Tab[] = ['policy', 'devices', 'roster'];
const TAB_ICON = {
  policy: SlidersHorizontal,
  devices: MonitorSmartphone,
  roster: CalendarClock,
} as const;

/** Perangkat dianggap daring bila aktif dan terakhir terlihat dalam 5 menit. */
const ONLINE_WINDOW_MS = 5 * 60_000;

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
          <div className={FORM_GRID}>
            <div className="grid content-start gap-2">
              <Label htmlFor="late-after">{t('lateAfter')}</Label>
              <TimeField id="late-after" value={value.lateAfter} onChange={(v) => set({ lateAfter: v })} />
              <p className="text-muted-foreground text-xs">{t('lateAfterHint')}</p>
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="departure-from">{t('departureFrom')}</Label>
              <TimeField
                id="departure-from"
                value={value.departureFrom}
                onChange={(v) => set({ departureFrom: v })}
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

interface Unit {
  id: string;
  name: string;
}

/** Pilihan unit tambahan yang dilayani satu perangkat (selain sekolah ini). */
function UnitPicker({
  units,
  value,
  onChange,
}: {
  units: Unit[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations('gate');
  return (
    <fieldset className="grid content-start gap-2">
      <legend className="flex w-full items-center gap-2 text-sm font-medium">
        <Layers className="size-4" aria-hidden /> {t('scopeTitle')}
      </legend>
      <p className="text-muted-foreground text-xs">{t('scopeHint')}</p>
      <div className="grid content-start gap-2">
        {units.map((u) => {
          const on = value.includes(u.id);
          return (
            <Label
              key={u.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 font-normal transition-colors',
                on ? 'border-sky-500/50 bg-sky-50 dark:bg-sky-500/10' : 'hover:bg-muted/50',
              )}
            >
              <Checkbox
                checked={on}
                onCheckedChange={(next) =>
                  onChange(next ? [...value, u.id] : value.filter((i) => i !== u.id))
                }
              />
              <span className="min-w-0 truncate">{u.name}</span>
            </Label>
          );
        })}
      </div>
    </fieldset>
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
  const [extra, setExtra] = useState<string[]>([]);
  const [scope, setScope] = useState<{ id: string; name: string; ids: string[] } | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['attendance-devices', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/attendance/devices', { params: header })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['attendance-devices', school.schoolId] });
  // Unit lain di lembaga yang sama yang boleh dilayani perangkat ini; kosong = pilihan jangkauan tidak ditampilkan.
  const units = useQuery({
    queryKey: ['attendance-device-units', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/attendance/devices/units', { params: header })),
  });
  const saveScope = useMutation({
    mutationFn: async (v: { id: string; ids: string[] }) =>
      unwrap(
        await api.PATCH('/v1/attendance/devices/{id}', {
          params: { ...header, path: { id: v.id } },
          body: { extraSchoolIds: v.ids },
        }),
      ),
    onSuccess: () => {
      setScope(null);
      setScopeError(null);
      refresh();
    },
    onError: (e) => setScopeError(te(errorKey(e))),
  });

  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/attendance/devices', { params: header, body: { name, extraSchoolIds: extra } }),
      ),
    onSuccess: (d) => {
      setName('');
      setExtra([]);
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
            setExtra([]);
            setError(null);
          }}
          onSubmit={() => create.mutateAsync()}
        >
          <div className="grid content-start gap-2">
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
          {(units.data?.length ?? 0) > 0 && (
            <UnitPicker units={units.data ?? []} value={extra} onChange={setExtra} />
          )}
        </FormDialog>
      </div>

      {shownKey && (
        <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-500/10">
          <KeyRound className="size-4" />
          <AlertDescription className="grid content-start gap-2">
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
                      ...((units.data?.length ?? 0) > 0 || d.schools.length > 0
                        ? [
                            {
                              label: t('editScope'),
                              icon: Layers,
                              onSelect: () => {
                                setScopeError(null);
                                setScope({ id: d.id, name: d.name, ids: d.schools.map((x) => x.id) });
                              },
                            },
                          ]
                        : []),
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
                  {d.schools.map((u) => (
                    <ToneBadge key={u.id} tone="violet" dot={false}>
                      <Layers aria-hidden className="size-3" /> {u.name}
                    </ToneBadge>
                  ))}
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

      <FormDialog
        open={!!scope}
        title={t('editScopeTitle', { name: scope?.name ?? '' })}
        submitLabel={t('save')}
        error={scopeError}
        onOpenChange={(o) => !o && setScope(null)}
        onSubmit={async () => {
          if (scope) await saveScope.mutateAsync({ id: scope.id, ids: scope.ids });
        }}
      >
        {scope && (
          <UnitPicker
            // Unit yang sudah terpasang tetap tampil walau kini tidak bisa ditambahkan lagi, supaya bisa dilepas.
            units={[
              ...(units.data ?? []),
              ...(list.data?.find((d) => d.id === scope.id)?.schools ?? []).filter(
                (u) => !(units.data ?? []).some((x) => x.id === u.id),
              ),
            ]}
            value={scope.ids}
            onChange={(ids) => setScope({ ...scope, ids })}
          />
        )}
      </FormDialog>

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
      <div className="grid content-start gap-2 sm:w-56">
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
      <fieldset className="grid content-start gap-2">
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
        <div className="grid content-start gap-2 sm:grid-cols-2 xl:grid-cols-3">
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
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/attendance/cards" />}>
            <CreditCard className="size-4" aria-hidden /> {t('manageCards')}
          </Button>
        }
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
      {tab === 'roster' && <RosterPanel />}
    </PageBody>
  );
}
