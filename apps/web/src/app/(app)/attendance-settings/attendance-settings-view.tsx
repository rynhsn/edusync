'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, FileSpreadsheet, Plus, RotateCw, ScanLine, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { QuickRegister } from './quick-register';

type Tab = 'policy' | 'devices' | 'cards' | 'roster';
const TABS: Tab[] = ['policy', 'devices', 'cards', 'roster'];

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

function useCtx() {
  const { school } = useSchool();
  return { school, header: { header: schoolHeader(school.schoolId) } };
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
            notifyParents: value.notifyParents,
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

  if (!value) return <Skeleton className="h-60 w-full" />;
  const set = (patch: Partial<typeof value>) => setDraft({ ...value, ...patch });

  return (
    <Card className="grid gap-5 p-5">
      <form
        className="grid max-w-2xl gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="late-after">{t('lateAfter')}</Label>
            <Input
              id="late-after"
              type="time"
              required
              value={value.lateAfter}
              onChange={(e) => set({ lateAfter: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="departure-from">{t('departureFrom')}</Label>
            <Input
              id="departure-from"
              type="time"
              required
              value={value.departureFrom}
              onChange={(e) => set({ departureFrom: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="debounce">{t('debounce')}</Label>
            <Input
              id="debounce"
              type="number"
              min={0}
              max={600}
              value={value.debounceSeconds}
              onChange={(e) => set({ debounceSeconds: Number(e.target.value) })}
            />
          </div>
        </div>
        <p className="text-muted-foreground -mt-2 text-xs">{t('policyHint')}</p>

        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={value.notifyParents} onCheckedChange={(next) => set({ notifyParents: next })} />
          {t('notifyParents')}
        </Label>

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
    </Card>
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
        <Alert>
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

      {list.isPending && <Skeleton className="h-32 w-full" />}
      {list.data?.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('noDevices')}</Card>
      )}
      {list.data && list.data.length > 0 && (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('deviceName')}</TableHead>
                <TableHead>{t('keyPrefix')}</TableHead>
                <TableHead>{t('lastSeen')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{d.keyPrefix}…</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : t('never')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.active ? 'secondary' : 'outline'}>
                      {d.active ? t('active') : t('inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggle.mutate({ id: d.id, active: !d.active })}
                    >
                      {d.active ? t('deactivate') : t('activate')}
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('rotateKey')}
                      title={t('rotateKey')}
                      onClick={() => rotate.mutate({ id: d.id, name: d.name })}
                    >
                      <RotateCw className="size-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('delete')}
                      onClick={() => remove.mutate(d.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
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

      {cards.isPending && <Skeleton className="h-32 w-full" />}
      {cards.data?.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('noCards')}</Card>
      )}
      {cards.data && cards.data.length > 0 && (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('student')}</TableHead>
                <TableHead>{t('cardCode')}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cards.data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.studentName}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs break-all">
                    {c.code}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('delete')}
                      onClick={() => remove.mutate(c.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
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
    <Card className="grid max-w-2xl gap-4 p-5">
      <p className="text-muted-foreground text-sm">{t('rosterHint')}</p>
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
        <legend className="mb-1 text-sm font-medium">{t('dutyTeachers')}</legend>
        {(teachers.data ?? [])
          .filter((x) => x.status === 'active')
          .map((x) => (
            <Label key={x.id} className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={current.includes(x.id)}
                onCheckedChange={(next) =>
                  setPicked(next ? [...current, x.id] : current.filter((i) => i !== x.id))
                }
              />
              {x.name}
            </Label>
          ))}
      </fieldset>
      <div>
        <Button disabled={picked === null || save.isPending} onClick={() => save.mutate()}>
          {t('save')}
        </Button>
      </div>
    </Card>
  );
}

export function AttendanceSettingsView({ initialTab = 'policy' }: { initialTab?: Tab }) {
  const t = useTranslations('gate');
  const { can } = useSchool();
  const [tab, setTab] = useState<Tab>(initialTab);

  if (!can('attendance:configure')) {
    return (
      <PageBody>
        <PageHeader title={t('settingsTitle')} />
        <Alert variant="destructive">
          <AlertDescription>{t('noAccess')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }
  return (
    <PageBody>
      <PageHeader title={t('settingsTitle')} description={t('settingsSubtitle')} />
      <div className="flex w-fit flex-wrap rounded-lg border p-0.5">
        {TABS.map((k) => (
          <Button
            key={k}
            size="sm"
            variant={tab === k ? 'secondary' : 'ghost'}
            aria-pressed={tab === k}
            onClick={() => setTab(k)}
          >
            {t(`tab.${k}`)}
          </Button>
        ))}
      </div>
      {tab === 'policy' && <PolicyPanel />}
      {tab === 'devices' && <DevicesPanel />}
      {tab === 'cards' && <CardsPanel />}
      {tab === 'roster' && <RosterPanel />}
    </PageBody>
  );
}
