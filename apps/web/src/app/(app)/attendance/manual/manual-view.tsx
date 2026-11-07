'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCheck,
  Clock,
  CloudOff,
  LogIn,
  LogOut,
  Pencil,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ENTER, STATUS_TONE, stagger } from '@/components/access-kit';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { PrerequisiteNotice } from '@/components/prerequisite-notice';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import {
  EmptyPanel,
  MODULE_TONE,
  PersonCell,
  StatCard,
  StatGrid,
  ToneBadge,
  Toolbar,
} from '@/components/ui-kit';
import { ApiError, api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { getSchoolTimezone, nowHm, todayIso } from '@/lib/school-time';
import { cn } from '@/lib/utils';
import { CorrectionDialog } from './correction-dialog';
import {
  type BatchLine,
  batchBody,
  countersOf,
  type DailyRow,
  type Direction,
  dequeue,
  enqueue,
  hmOf,
  isMarkable,
  isNetworkError,
  itemId,
  loadQueue,
  markAllCandidates,
  type Pending,
  type QueueItem,
  queueKey,
  readTimeInput,
  type ServerResult,
  saveQueue,
  summarizeResults,
  toBatches,
  viewRow,
} from './manual-logic';

const POLL_MS = 15_000;
const RETRY_MS = 30_000;

type Student = { studentId: string; name: string };

/** Penyimpanan peramban; aksesnya sendiri bisa melempar (mode privat, data situs diblokir). */
function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

const toneOfStatus = (s: string) => STATUS_TONE[s as keyof typeof STATUS_TONE] ?? 'slate';

/**
 * Absen datang & pulang manual oleh guru (cadangan saat kiosk RFID tidak bisa dipakai). Satu ketukan mencatat siswa
 * pada jam sekarang (atau jam yang diisi), dengan antrean luring di perangkat bila jaringan putus.
 */
export function ManualView() {
  const t = useTranslations('manualAttendance');
  const tg = useTranslations('gate');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const tz = getSchoolTimezone();
  const today = todayIso();
  const allowed = can('attendance:manage');

  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<Direction>('in');
  const [timeText, setTimeText] = useState('');
  const [search, setSearch] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [forced, setForced] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const forceRetry = useRef<(() => void) | null>(null);
  const [markAllOpen, setMarkAllOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [correcting, setCorrecting] = useState<DailyRow | null>(null);
  /** Catatan yang sedang dikirim (belum dijawab server), per siswa dan arah. */
  const [inflight, setInflight] = useState<Record<string, Pending>>({});
  const [queue, setQueueState] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const storageWarned = useRef(false);
  const key = queueKey(school.schoolId);

  const future = date > today;
  const past = date < today;
  const parsedTime = readTimeInput(timeText);
  const timeInvalid = !parsedTime.ok;
  const timeMissing = past && parsedTime.ok && parsedTime.at === null;

  /* ------------------------------------------------------------ antrean luring */

  const updateQueue = useCallback(
    (fn: (q: QueueItem[]) => QueueItem[]) => {
      const next = fn(queueRef.current);
      queueRef.current = next;
      setQueueState(next);
      const ok = saveQueue(browserStorage(), key, next);
      if (!ok && next.length > 0 && !storageWarned.current) {
        storageWarned.current = true;
        toast.warning(t('queue.storageOff'));
      }
    },
    [key, t],
  );

  // Muat antrean tersimpan (setelah pemasangan, supaya cocok dengan render server).
  useEffect(() => {
    const loaded = loadQueue(browserStorage(), key);
    queueRef.current = loaded;
    setQueueState(loaded);
  }, [key]);

  /* ------------------------------------------------------------ data */

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    enabled: allowed,
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const noActiveYear = years.isSuccess && !years.data.some((y) => y.isActive);

  const classesQ = useQuery({
    queryKey: ['manual-classes', school.schoolId],
    enabled: allowed,
    refetchInterval: POLL_MS * 2,
    queryFn: async () => unwrap(await api.GET('/v1/gate/manual/classes', { params: header })),
  });
  const classes = classesQ.data?.classes ?? [];

  // Pilih kelas pertama (kelas yang diwalikan lebih dulu) bila belum ada pilihan yang berlaku.
  useEffect(() => {
    if (classes.length === 0) return;
    if (!classes.some((c) => c.id === classId)) {
      setClassId((classes.find((c) => c.homeroom) ?? classes[0])?.id ?? '');
    }
  }, [classes, classId]);

  const daily = useQuery({
    queryKey: ['gate-daily', school.schoolId, date, classId],
    enabled: allowed && classId !== '' && !future,
    refetchInterval: POLL_MS,
    queryFn: async () =>
      unwrap(await api.GET('/v1/gate/daily', { params: { ...header, query: { date, classId } } })),
  });
  const closed = daily.data?.closed ?? null;

  // Izin "tetap catat" berlaku untuk satu tampilan (tanggal + kelas) saja.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset saat tampilan berganti
  useEffect(() => {
    setForced(false);
    setSelected(new Set());
  }, [date, classId]);

  const refresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gate-daily', school.schoolId] }),
        queryClient.invalidateQueries({ queryKey: ['manual-classes', school.schoolId] }),
      ]),
    [queryClient, school.schoolId],
  );

  /* ------------------------------------------------------------ tampilan baris */

  const views = useMemo(() => {
    const rows = (daily.data?.students ?? []) as DailyRow[];
    return rows.map((row) => {
      const pend: Pending[] = [];
      for (const d of ['in', 'out'] as const) {
        const q = queue.find((i) => i.date === date && i.direction === d && i.studentId === row.studentId);
        if (q) pend.push({ direction: d, at: q.at, queued: true });
        const f = inflight[`${row.studentId}|${d}`];
        if (f) pend.push(f);
      }
      return viewRow(row, mode, tz, pend);
    });
  }, [daily.data, queue, inflight, mode, date, tz]);

  const counters = countersOf(views);
  const q = search.trim().toLowerCase();
  const shown = q ? views.filter((v) => v.row.name.toLowerCase().includes(q)) : views;
  const canAct = allowed && !future && (!closed || forced) && !timeInvalid && !timeMissing;
  const candidates = markAllCandidates(views, mode);

  /* ------------------------------------------------------------ umpan balik hasil */

  // Kunci pesan hasil dibentuk dari kode hasil server, jadi tidak bisa diperiksa tipe saat kompilasi.
  const dynamic = t as unknown as (key: string, values: Record<string, string | number>) => string;
  const lineText = (l: BatchLine) => {
    const base = dynamic(`msg.${l.key}`, { count: l.count });
    return l.warn && l.names.length > 0 ? `${base} (${l.names.join(', ')})` : base;
  };

  function showBatch(results: ServerResult[]) {
    const lines = summarizeResults(results);
    const ok = lines.filter((l) => !l.warn);
    const warn = lines.filter((l) => l.warn);
    if (ok.length > 0) toast.success(ok.map(lineText).join(' '));
    if (warn.length > 0) toast.warning(warn.map(lineText).join(' '), { duration: 8000 });
  }

  /** Satu siswa: pesan ringkas bernama, dengan tombol batalkan bila tercatat. */
  function showOne(r: ServerResult, direction: Direction) {
    if (r.result !== 'in' && r.result !== 'out') return showBatch([r]);
    const time = hmOf(r.at, tz);
    const name = r.name ?? '';
    const k =
      r.result === 'in' ? (r.late ? 'inLate' : 'in') : r.warning === 'no_check_in' ? 'outNoCheckIn' : 'out';
    const text = dynamic(`one.${k}`, { name, time });
    const action = {
      label: t('undo'),
      onClick: () => undo(r.studentId, name, direction),
    };
    if (r.warning) toast.warning(text, { action, duration: 8000 });
    else toast.success(text, { action, duration: 6000 });
  }

  async function undo(studentId: string, name: string, direction: Direction) {
    try {
      unwrap(
        await api.PUT('/v1/gate/daily/{studentId}', {
          params: { ...header, path: { studentId } },
          body: { date, ...(direction === 'in' ? { checkInAt: null } : { checkOutAt: null }) },
        }),
      );
      toast(t('undone', { name }));
      await refresh();
    } catch (e) {
      toast.error(te(errorKey(e)));
    }
  }

  /* ------------------------------------------------------------ mengirim */

  function setInflightFor(students: Student[], direction: Direction, at: string | null) {
    setInflight((cur) => {
      const next = { ...cur };
      for (const s of students)
        next[`${s.studentId}|${direction}`] = { direction, at: at ?? nowHm(), queued: false };
      return next;
    });
  }
  function clearInflight(students: Student[], direction: Direction) {
    setInflight((cur) => {
      const next = { ...cur };
      for (const s of students) delete next[`${s.studentId}|${direction}`];
      return next;
    });
  }

  function park(students: Student[], direction: Direction, at: string | null, force: boolean) {
    const when = at ?? nowHm();
    updateQueue((cur) =>
      enqueue(
        cur,
        students.map((s) => ({
          id: itemId(date, direction, s.studentId),
          date,
          direction,
          studentId: s.studentId,
          name: s.name,
          at: when,
          force,
        })),
      ),
    );
    const id = students[0] ? itemId(date, direction, students[0].studentId) : '';
    toast.warning(t('queue.queued', { count: students.length }), {
      ...(students.length === 1
        ? { action: { label: t('undo'), onClick: () => updateQueue((cur) => dequeue(cur, [id])) } }
        : {}),
    });
  }

  /** Kirim catatan massal; jam bawaan (kosong) berarti "sekarang" menurut server. */
  async function record(students: Student[], direction: Direction, at: string | null, force = forced) {
    if (students.length === 0) return;
    setInflightFor(students, direction, at);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      clearInflight(students, direction);
      park(students, direction, at, force);
      return;
    }
    try {
      const res = unwrap(
        await api.POST('/v1/gate/manual', {
          params: header,
          body: {
            date,
            direction,
            force,
            ...(at ? { at } : {}),
            entries: students.map((s) => ({ studentId: s.studentId })),
          },
        }),
      );
      const only = res.results[0];
      if (res.results.length === 1 && only) showOne(only, direction);
      else showBatch(res.results);
    } catch (e) {
      if (isNetworkError(e)) {
        park(students, direction, at, force);
      } else if (e instanceof ApiError && e.code === 'school_closed') {
        forceRetry.current = () => void record(students, direction, at, true);
        setForceOpen(true);
      } else {
        toast.error(te(errorKey(e)));
      }
    } finally {
      clearInflight(students, direction);
      await refresh();
    }
  }

  async function markAll(force = forced) {
    const at = parsedTime.ok ? parsedTime.at : null;
    const who = candidates.map((v) => ({ studentId: v.row.studentId, name: v.row.name }));
    setInflightFor(who, mode, at);
    try {
      const res = unwrap(
        await api.POST('/v1/gate/manual/mark-all', {
          params: header,
          body: { classId, direction: mode, date, force, ...(at ? { at } : {}) },
        }),
      );
      if (res.results.length === 0) toast(t('markAllNone'));
      else showBatch(res.results);
    } catch (e) {
      if (isNetworkError(e)) {
        park(who, mode, at, force);
      } else if (e instanceof ApiError && e.code === 'school_closed') {
        forceRetry.current = () => void markAll(true);
        setForceOpen(true);
      } else {
        toast.error(te(errorKey(e)));
        throw e;
      }
    } finally {
      clearInflight(who, mode);
      await refresh();
    }
  }

  /** Kirim ulang antrean luring, dengan jam asli tiap catatan. */
  const sync = useCallback(
    async (manual: boolean) => {
      if (syncingRef.current || queueRef.current.length === 0) return;
      syncingRef.current = true;
      setSyncing(true);
      let sent = 0;
      let rejected = 0;
      try {
        for (const batch of toBatches(queueRef.current)) {
          const ids = batch.items.map((i) => i.id);
          try {
            unwrap(
              await api.POST('/v1/gate/manual', {
                params: { header: schoolHeader(school.schoolId) },
                body: batchBody(batch),
              }),
            );
            sent += ids.length;
            updateQueue((cur) => dequeue(cur, ids));
          } catch (e) {
            if (isNetworkError(e)) {
              if (manual) toast.warning(t('queue.stillOffline'));
              break;
            }
            // Ditolak server (mis. tanggal libur tanpa izin): buang agar antrean tidak macet selamanya.
            rejected += ids.length;
            updateQueue((cur) => dequeue(cur, ids));
          }
        }
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
      if (sent > 0) toast.success(t('queue.synced', { count: sent }));
      if (rejected > 0) toast.error(t('queue.syncRejected', { count: rejected }));
      if (sent + rejected > 0) await refresh();
    },
    [refresh, school.schoolId, t, updateQueue],
  );

  // Kirim ulang otomatis saat jaringan kembali, saat halaman dibuka, dan berkala selama antrean belum kosong.
  const hasQueue = queue.length > 0;
  useEffect(() => {
    if (!hasQueue) return;
    const go = () => void sync(false);
    if (typeof navigator === 'undefined' || navigator.onLine !== false) go();
    window.addEventListener('online', go);
    const timer = window.setInterval(go, RETRY_MS);
    return () => {
      window.removeEventListener('online', go);
      window.clearInterval(timer);
    };
  }, [hasQueue, sync]);

  /* ------------------------------------------------------------ aksi di layar */

  const tapAt = parsedTime.ok ? parsedTime.at : null;
  const tap = (v: ReturnType<typeof viewRow>) =>
    record([{ studentId: v.row.studentId, name: v.row.name }], mode, tapAt);

  function applySelected() {
    const who = views
      .filter((v) => selected.has(v.row.studentId) && isMarkable(v))
      .map((v) => ({ studentId: v.row.studentId, name: v.row.name }));
    setSelected(new Set());
    setSelecting(false);
    void record(who, mode, tapAt);
  }

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* ------------------------------------------------------------ render */

  if (!allowed) {
    return (
      <PageBody>
        <PageHeader icon={UserCheck} tone={MODULE_TONE.attendance} title={t('title')} />
        <Alert variant="destructive">
          <AlertDescription>{t('noAccess')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  const classLabel = (c: (typeof classes)[number]) =>
    date === today
      ? t('classOption', {
          name: c.name,
          checkedIn: c.checkedIn,
          total: c.total,
          checkedOut: c.checkedOut,
          notYet: c.notYet,
        })
      : c.name;
  const scope = classesQ.data?.scope;

  return (
    <PageBody>
      <PageHeader
        icon={UserCheck}
        tone={MODULE_TONE.attendance}
        title={t('title')}
        description={t('subtitle')}
        actions={
          scope && (
            <ToneBadge tone={scope === 'homeroom' ? 'slate' : 'emerald'} className="px-3 py-1 text-sm">
              {t(scope === 'all' ? 'scopeAll' : scope === 'duty' ? 'scopeDuty' : 'scopeHomeroom')}
            </ToneBadge>
          )
        }
      />

      {noActiveYear && <PrerequisiteNotice title={t('noYearTitle')} missing={['semesters']} />}

      {queue.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          <CloudOff aria-hidden />
          <AlertTitle>{t('queue.banner', { count: queue.length })}</AlertTitle>
          <AlertDescription>
            <p>{t('queue.bannerBody')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" disabled={syncing} onClick={() => void sync(true)}>
                <RefreshCw className={cn('size-3.5', syncing && 'animate-spin')} />
                {syncing ? t('queue.retrying') : t('queue.retry')}
              </Button>
              <Button size="sm" variant="ghost" disabled={syncing} onClick={() => setDiscardOpen(true)}>
                {t('queue.discard')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {classesQ.isPending && (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      )}

      {classesQ.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {classesQ.error instanceof ApiError ? te(errorKey(classesQ.error)) : t('loadError')}
          </AlertDescription>
        </Alert>
      )}

      {classesQ.isSuccess && classes.length === 0 && (
        <EmptyPanel
          icon={Users}
          tone={MODULE_TONE.attendance}
          title={t('noClassesTitle')}
          body={t('noClassesBody')}
        />
      )}

      {classes.length > 0 && (
        <>
          <Toolbar className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="manual-class">{t('class')}</Label>
              <SelectField id="manual-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {classLabel(c)}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="manual-date">{t('date')}</Label>
              <DatePicker id="manual-date" value={date} onChange={(v) => v && setDate(v)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="manual-time">{past ? t('timeLabelRequired') : t('timeLabel')}</Label>
              <Input
                id="manual-time"
                inputMode="numeric"
                autoComplete="off"
                placeholder={t('timePlaceholder')}
                value={timeText}
                aria-invalid={timeInvalid || timeMissing}
                onChange={(e) => setTimeText(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium" id="manual-mode-label">
                {t('modeLabel')}
              </span>
              <div
                role="tablist"
                aria-labelledby="manual-mode-label"
                className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1"
              >
                {(['in', 'out'] as const).map((d) => (
                  <Button
                    key={d}
                    type="button"
                    role="tab"
                    aria-selected={mode === d}
                    variant={mode === d ? 'default' : 'ghost'}
                    className="h-9 min-w-24 px-4"
                    onClick={() => setMode(d)}
                  >
                    {d === 'in' ? <LogIn className="size-4" /> : <LogOut className="size-4" />}
                    {d === 'in' ? t('modeIn') : t('modeOut')}
                  </Button>
                ))}
              </div>
            </div>
          </Toolbar>

          {timeInvalid && (
            <Alert variant="destructive">
              <AlertDescription>{t('timeInvalid')}</AlertDescription>
            </Alert>
          )}
          {timeMissing && !timeInvalid && (
            <Alert variant="destructive">
              <AlertDescription>{te('errors.time_required')}</AlertDescription>
            </Alert>
          )}
          {future && (
            <Alert variant="destructive">
              <AlertDescription>{t('futureDate')}</AlertDescription>
            </Alert>
          )}
          {closed && (
            <Alert>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {t('closed', { title: closed.title })} {forced && t('forceOn')}
                </span>
                {!forced && (
                  <Button size="sm" variant="outline" onClick={() => setForceOpen(true)}>
                    {t('forceButton')}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}

          {daily.isPending && !future && (
            <div className="grid gap-3" aria-busy>
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-64 rounded-2xl" />
            </div>
          )}

          {daily.isError && (
            <Alert variant="destructive">
              <AlertDescription>{te(errorKey(daily.error))}</AlertDescription>
            </Alert>
          )}

          {daily.data && (
            <>
              <StatGrid>
                <StatCard
                  label={t('stats.checkedIn')}
                  value={`${counters.checkedIn}/${counters.total}`}
                  icon={LogIn}
                  tone="emerald"
                  hint={counters.late > 0 ? t('lateCount', { count: counters.late }) : undefined}
                />
                <StatCard
                  label={t('stats.checkedOut')}
                  value={counters.checkedOut}
                  icon={LogOut}
                  tone="sky"
                />
                <StatCard label={t('stats.away')} value={counters.away} icon={UserX} tone="amber" />
                <StatCard
                  label={t('stats.notYet')}
                  value={counters.notYet}
                  icon={Clock}
                  tone={counters.notYet > 0 ? 'rose' : 'slate'}
                />
              </StatGrid>

              <section className="grid gap-3">
                <Toolbar className="gap-2 p-2.5">
                  <div className="relative min-w-40 flex-1 sm:max-w-60">
                    <Search
                      aria-hidden
                      className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                    />
                    <Input
                      aria-label={t('search')}
                      placeholder={t('search')}
                      className="pl-9"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    disabled={!canAct || candidates.length === 0}
                    onClick={() => setMarkAllOpen(true)}
                  >
                    <CheckCheck className="size-4" />
                    {mode === 'in' ? t('markAllIn') : t('markAllOut')}
                  </Button>
                  <Button
                    variant={selecting ? 'secondary' : 'outline'}
                    onClick={() => {
                      setSelecting((s) => !s);
                      setSelected(new Set());
                    }}
                  >
                    {selecting ? t('selectDone') : t('select')}
                  </Button>
                  <p className="text-muted-foreground ml-auto text-xs tabular-nums" aria-live="polite">
                    {tg('shown', { shown: shown.length, total: views.length })} · {t('live')}
                  </p>
                </Toolbar>

                {selecting && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setSelected(new Set(shown.filter(isMarkable).map((v) => v.row.studentId)))
                      }
                    >
                      {t('selectAllUnmarked')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={selected.size === 0}
                      onClick={() => setSelected(new Set())}
                    >
                      {t('clearSelection')}
                    </Button>
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {t('selectedCount', { count: selected.size })}
                    </span>
                  </div>
                )}

                {shown.length === 0 ? (
                  <EmptyPanel
                    icon={Users}
                    tone={MODULE_TONE.attendance}
                    title={views.length === 0 ? t('emptyTitle') : t('noMatch')}
                    {...(views.length === 0 ? { body: t('emptyBody') } : {})}
                  />
                ) : (
                  <ul className="bg-card divide-y overflow-hidden rounded-2xl border">
                    {shown.map((v, i) => {
                      const id = v.row.studentId;
                      const markable = isMarkable(v);
                      const name = v.row.name;
                      const sub = [v.row.className, v.row.nis].filter(Boolean).join(' · ');
                      return (
                        <li
                          key={id}
                          style={stagger(i)}
                          className={cn(
                            ENTER,
                            'flex items-center gap-3 px-3 py-3 transition-colors sm:px-4',
                            selecting && selected.has(id) && 'bg-primary/5',
                          )}
                        >
                          {selecting && (
                            <Checkbox
                              aria-label={t('selectRow', { name })}
                              checked={selected.has(id)}
                              disabled={!markable}
                              onCheckedChange={() => toggle(id)}
                            />
                          )}
                          {selecting ? (
                            <button
                              type="button"
                              disabled={!markable}
                              onClick={() => toggle(id)}
                              className="min-w-0 flex-1 text-left disabled:opacity-60"
                            >
                              <PersonCell name={name} sub={sub} />
                            </button>
                          ) : (
                            <PersonCell className="flex-1" name={name} sub={sub} />
                          )}

                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {v.row.status && (
                              <ToneBadge tone={toneOfStatus(v.row.status)}>
                                {tg(`status_${v.row.status}`)}
                              </ToneBadge>
                            )}
                            {v.pending && (
                              <ToneBadge tone="amber">
                                {v.pending.queued ? t('pendingBadge') : t('sendingBadge')}
                              </ToneBadge>
                            )}
                            {!v.row.status && !v.pending && !v.inAt && (
                              <ToneBadge tone="slate">{t('notYetBadge')}</ToneBadge>
                            )}
                          </div>

                          {!selecting && (
                            <div className="flex shrink-0 items-center gap-1.5">
                              {markable ? (
                                <Button
                                  className="h-12 min-w-28 text-base"
                                  disabled={!canAct}
                                  aria-label={t(mode === 'in' ? 'tapInFor' : 'tapOutFor', { name })}
                                  onClick={() => void tap(v)}
                                >
                                  {mode === 'in' ? (
                                    <LogIn className="size-5" />
                                  ) : (
                                    <LogOut className="size-5" />
                                  )}
                                  {mode === 'in' ? t('tapIn') : t('tapOut')}
                                </Button>
                              ) : (
                                <Button
                                  variant="secondary"
                                  className="h-12 min-w-28 text-base tabular-nums"
                                  disabled={v.pending !== null}
                                  aria-label={t('editFor', { name })}
                                  onClick={() => setCorrecting(v.row)}
                                >
                                  {v.away ? (
                                    <Pencil className="size-4" />
                                  ) : mode === 'in' ? (
                                    <LogIn className="size-4" />
                                  ) : (
                                    <LogOut className="size-4" />
                                  )}
                                  {v.away
                                    ? tg(`status_${v.row.status ?? 'absent'}`)
                                    : mode === 'in'
                                      ? t('recordedIn', { time: v.inAt })
                                      : t('recordedOut', { time: v.outAt })}
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-10"
                                aria-label={t('editFor', { name })}
                                title={t('editFor', { name })}
                                onClick={() => setCorrecting(v.row)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {selecting && selected.size > 0 && (
                <div className="bg-card sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3 shadow-lg">
                  <span className="text-sm font-medium tabular-nums">
                    {t('selectedCount', { count: selected.size })}
                  </span>
                  <Button className="h-11 px-5 text-base" disabled={!canAct} onClick={applySelected}>
                    {mode === 'in'
                      ? t('applyIn', { count: selected.size })
                      : t('applyOut', { count: selected.size })}
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={markAllOpen}
        onOpenChange={setMarkAllOpen}
        title={t(mode === 'in' ? 'markAllTitleIn' : 'markAllTitleOut', { count: candidates.length })}
        description={t(mode === 'in' ? 'markAllBodyIn' : 'markAllBodyOut', {
          time: tapAt ?? t('timeNow'),
        })}
        confirmLabel={t('markAllConfirm')}
        onConfirm={() => markAll()}
      />

      <ConfirmDialog
        open={forceOpen}
        onOpenChange={(o) => {
          setForceOpen(o);
          if (!o) forceRetry.current = null;
        }}
        title={t('forceTitle')}
        description={t('forceBody')}
        confirmLabel={t('forceConfirm')}
        onConfirm={async () => {
          setForced(true);
          const retry = forceRetry.current;
          forceRetry.current = null;
          retry?.();
        }}
      />

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={t('queue.discardTitle', { count: queue.length })}
        description={t('queue.discardBody')}
        confirmLabel={t('queue.discardConfirm')}
        destructive
        onConfirm={async () => updateQueue(() => [])}
      />

      {correcting && <CorrectionDialog row={correcting} date={date} onClose={() => setCorrecting(null)} />}
    </PageBody>
  );
}
