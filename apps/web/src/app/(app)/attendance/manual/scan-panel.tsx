'use client';

import {
  CircleAlert,
  CircleCheck,
  CloudOff,
  Keyboard,
  LogIn,
  LogOut,
  QrCode,
  RefreshCw,
  TriangleAlert,
  VideoOff,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { getSchoolTimezone } from '@/lib/school-time';
import { cn } from '@/lib/utils';
import { type Direction, hmOf, isNetworkError } from './manual-logic';
import { type CameraStatus, QrCamera } from './qr-camera';
import { feedback, unlockAudio } from './scan-feedback';
import {
  classifyScan,
  dequeueScan,
  enqueueScan,
  FOREIGN_NOTICE_MS,
  loadDirection,
  loadScanQueue,
  manualInputToPayload,
  newClientId,
  pushRecent,
  replaceRecent,
  resultKind,
  type ScanEntry,
  type ScanKind,
  type ScanQueueItem,
  saveDirection,
  saveScanQueue,
  scanBody,
  scanQueueKey,
  shouldHandle,
  shouldNotifyForeign,
  splitExpired,
  toneOf,
} from './scan-logic';

const RETRY_MS = 30_000;

/** Kode galat untuk ditampilkan: kode API, atau `rate_limited` untuk 429; undefined bila bukan galat API. */
const codeOf = (e: unknown): string | undefined =>
  e instanceof ApiError ? (e.status === 429 ? 'rate_limited' : e.code) : undefined;

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

const TONE_STYLE = {
  success:
    'border-emerald-400 bg-emerald-50 text-emerald-950 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-50',
  warn: 'border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-50',
  error:
    'border-rose-400 bg-rose-50 text-rose-950 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-50',
} as const;

const DOT_STYLE = {
  success: 'bg-emerald-500',
  warn: 'bg-amber-500',
  error: 'bg-rose-500',
} as const;

/**
 * Pindai QR di kartu siswa dengan kamera sebagai cadangan kiosk RFID. Pemindaian terus-menerus: setiap pembacaan
 * dikirim ke API dan hasilnya tampil besar, lalu kamera tetap menunggu kartu berikutnya. Saat jaringan putus, pindaian
 * disimpan di perangkat (dengan jam asli dan kunci idempoten) dan dikirim ulang nanti.
 */
export function ScanPanel() {
  const t = useTranslations('manualAttendance');
  const ts = useTranslations('manualAttendance.scan');
  const te = useTranslations();
  const { school } = useSchool();
  const tz = getSchoolTimezone();
  const key = scanQueueKey(school.schoolId);

  const [direction, setDirectionState] = useState<Direction>('in');
  const directionRef = useRef<Direction>('in');
  const [cameraOn, setCameraOn] = useState(false);
  const [camera, setCamera] = useState<CameraStatus>('idle');
  const [last, setLast] = useState<ScanEntry | null>(null);
  const [recent, setRecent] = useState<ScanEntry[]>([]);
  const [busy, setBusy] = useState(0);
  const [foreign, setForeign] = useState(false);
  const [manual, setManual] = useState('');
  const [manualBad, setManualBad] = useState(false);
  const [queue, setQueueState] = useState<ScanQueueItem[]>([]);
  const queueRef = useRef<ScanQueueItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [forceFor, setForceFor] = useState<ScanQueueItem | null>(null);
  const seen = useRef(new Map<string, number>());
  const foreignSeen = useRef(new Map<string, number>());
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const storageWarned = useRef(false);
  const foreignTimer = useRef<number | undefined>(undefined);
  const manualRef = useRef<HTMLInputElement>(null);

  /* ------------------------------------------------------------ arah & antrean tersimpan */

  useEffect(() => {
    const d = loadDirection(browserStorage());
    directionRef.current = d;
    setDirectionState(d);
  }, []);

  function setDirection(d: Direction) {
    directionRef.current = d;
    setDirectionState(d);
    saveDirection(browserStorage(), d);
  }

  const updateQueue = useCallback(
    (fn: (q: ScanQueueItem[]) => ScanQueueItem[]) => {
      const next = fn(queueRef.current);
      queueRef.current = next;
      setQueueState(next);
      const ok = saveScanQueue(browserStorage(), key, next);
      if (!ok && next.length > 0 && !storageWarned.current) {
        storageWarned.current = true;
        toast.warning(t('queue.storageOff'));
      }
    },
    [key, t],
  );

  useEffect(() => {
    const loaded = loadScanQueue(browserStorage(), key);
    queueRef.current = loaded;
    setQueueState(loaded);
  }, [key]);

  /* ------------------------------------------------------------ hasil */

  const show = useCallback((entry: ScanEntry, replaceId?: string) => {
    setLast(entry);
    setRecent((list) => (replaceId ? replaceRecent(list, replaceId, entry) : pushRecent(list, entry)));
    feedback(toneOf(entry.kind));
  }, []);

  const entryFor = useCallback(
    (item: ScanQueueItem, patch: Partial<ScanEntry>): ScanEntry => ({
      id: item.clientId,
      at: item.at,
      kind: 'error',
      name: null,
      className: null,
      time: '',
      direction: item.direction,
      ...patch,
    }),
    [],
  );

  const park = useCallback(
    (item: ScanQueueItem) => {
      updateQueue((q) => enqueueScan(q, item));
      show(entryFor(item, { kind: 'queued', time: hmOf(item.at, tz) }));
    },
    [entryFor, show, tz, updateQueue],
  );

  /* ------------------------------------------------------------ mengirim satu pindaian */

  const submit = useCallback(
    async (item: ScanQueueItem) => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        park(item);
        return;
      }
      setBusy((n) => n + 1);
      try {
        const res = unwrap(
          await api.POST('/v1/gate/scan', {
            params: { header: schoolHeader(school.schoolId) },
            body: {
              payload: item.payload,
              direction: item.direction,
              clientId: item.clientId,
              force: item.force,
            },
          }),
        );
        const kind = resultKind(res);
        show(
          entryFor(item, {
            kind,
            name: res.student.name,
            className: res.student.className,
            time: hmOf(res.at, tz),
          }),
        );
      } catch (e) {
        if (isNetworkError(e)) {
          park(item);
        } else {
          const code = codeOf(e);
          if (code === 'school_closed') setForceFor(item);
          show(entryFor(item, { kind: 'error', errorCode: code }));
        }
      } finally {
        setBusy((n) => n - 1);
      }
    },
    [entryFor, park, show, tz, school.schoolId],
  );

  /** Antri berurutan agar dua pindaian berdekatan tidak saling menyalip. */
  const enqueueSubmit = useCallback(
    (payload: string, force = false) => {
      const item: ScanQueueItem = {
        clientId: newClientId(),
        payload,
        direction: directionRef.current,
        at: new Date().toISOString(),
        force,
      };
      chain.current = chain.current.then(() => submit(item)).catch(() => undefined);
    },
    [submit],
  );

  const onDetect = useCallback(
    (text: string) => {
      const check = classifyScan(text);
      if (check.kind === 'ignore') {
        // Hanya pemberitahuan inline: tanpa suara/getar, tidak dihitung sebagai pindaian.
        if (shouldNotifyForeign(foreignSeen.current, text, Date.now())) {
          setForeign(true);
          window.clearTimeout(foreignTimer.current);
          foreignTimer.current = window.setTimeout(() => setForeign(false), FOREIGN_NOTICE_MS);
        }
        return;
      }
      const dedupeKey = check.kind === 'ok' ? check.payload : text.trim().toUpperCase();
      if (!shouldHandle(seen.current, dedupeKey, Date.now())) return;
      if (check.kind === 'invalid') {
        show({
          id: newClientId(),
          at: new Date().toISOString(),
          kind: 'error',
          name: null,
          className: null,
          time: '',
          direction: directionRef.current,
          errorCode: 'invalid_qr',
        });
        return;
      }
      enqueueSubmit(check.payload);
    },
    [enqueueSubmit, show],
  );

  useEffect(
    () => () => {
      window.clearTimeout(foreignTimer.current);
    },
    [],
  );

  function submitManual() {
    const payload = manualInputToPayload(manual);
    if (!payload) {
      setManualBad(true);
      return;
    }
    setManualBad(false);
    setManual('');
    manualRef.current?.focus();
    // Ketikan manual selalu diproses (tanpa debounce): pengguna sengaja menekan tombol.
    seen.current.set(payload, Date.now());
    enqueueSubmit(payload);
  }

  /* ------------------------------------------------------------ kirim ulang antrean */

  const sync = useCallback(
    async (manualRun: boolean) => {
      if (syncingRef.current || queueRef.current.length === 0) return;
      syncingRef.current = true;
      setSyncing(true);
      let sent = 0;
      let rejected = 0;
      try {
        const { fresh, expired } = splitExpired(queueRef.current);
        if (expired.length > 0) {
          rejected += expired.length;
          updateQueue((q) =>
            dequeueScan(
              q,
              expired.map((i) => i.clientId),
            ),
          );
        }
        for (const item of fresh) {
          try {
            const res = unwrap(
              await api.POST('/v1/gate/scan', {
                params: { header: schoolHeader(school.schoolId) },
                body: scanBody(item),
              }),
            );
            sent += 1;
            updateQueue((q) => dequeueScan(q, [item.clientId]));
            const entry: ScanEntry = {
              id: item.clientId,
              at: item.at,
              kind: resultKind(res),
              name: res.student.name,
              className: res.student.className,
              time: hmOf(res.at, tz),
              direction: item.direction,
            };
            setRecent((list) => replaceRecent(list, item.clientId, entry));
          } catch (e) {
            if (isNetworkError(e)) {
              if (manualRun) toast.warning(t('queue.stillOffline'));
              break;
            }
            rejected += 1;
            updateQueue((q) => dequeueScan(q, [item.clientId]));
            const code = codeOf(e);
            setRecent((list) =>
              replaceRecent(list, item.clientId, entryFor(item, { kind: 'error', errorCode: code })),
            );
          }
        }
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
      if (sent > 0) toast.success(t('queue.synced', { count: sent }));
      if (rejected > 0) toast.error(t('queue.syncRejected', { count: rejected }));
    },
    [entryFor, school.schoolId, t, tz, updateQueue],
  );

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

  /* ------------------------------------------------------------ render */

  const cameraMessage: Record<CameraStatus, string> = {
    idle: ts('cameraOff'),
    starting: ts('cameraStarting'),
    ready: ts('cameraReady'),
    hidden: ts('cameraPausedHidden'),
    insecure: ts('errInsecure'),
    unsupported: ts('errUnsupported'),
    denied: ts('errDenied'),
    notfound: ts('errNotFound'),
    busy: ts('errBusy'),
  };
  const cameraFailed = ['insecure', 'unsupported', 'denied', 'notfound', 'busy'].includes(camera);

  const dynamicResult = ts as unknown as (key: string, values: Record<string, string | number>) => string;
  const messageOf = (kind: ScanKind, time: string) => dynamicResult(`result.${kind}`, { time });
  const tone = last ? toneOf(last.kind) : null;
  const codeMessage = (code: string | undefined) =>
    te(errorKey(new ApiError('', code === 'rate_limited' ? 429 : 400, code)));

  return (
    <div className="mx-auto grid w-full max-w-xl gap-4">
      <p className="text-muted-foreground text-sm">{ts('intro')}</p>

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

      <fieldset className="m-0 grid min-w-0 gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-sm font-medium">{ts('directionLabel')}</legend>
        <div className="bg-muted grid grid-cols-2 gap-1.5 rounded-2xl p-1.5">
          {(['in', 'out'] as const).map((d) => (
            <Button
              key={d}
              type="button"
              aria-pressed={direction === d}
              variant={direction === d ? 'default' : 'ghost'}
              className="h-16 gap-2 rounded-xl text-xl font-semibold"
              onClick={() => setDirection(d)}
            >
              {d === 'in' ? <LogIn className="size-6" /> : <LogOut className="size-6" />}
              {d === 'in' ? ts('dirIn') : ts('dirOut')}
            </Button>
          ))}
        </div>
      </fieldset>

      <section className="grid gap-3">
        <QrCamera active={cameraOn} onDetect={onDetect} onStatus={setCamera} />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant={cameraOn ? 'outline' : 'default'}
            className="h-12 px-5 text-base"
            onClick={() => {
              unlockAudio();
              setCameraOn((on) => !on);
            }}
          >
            {cameraOn ? <VideoOff className="size-5" /> : <QrCode className="size-5" />}
            {cameraOn ? ts('cameraStop') : ts('cameraStart')}
          </Button>
          <p
            className={cn(
              'min-w-0 flex-1 text-sm',
              cameraFailed ? 'text-destructive' : 'text-muted-foreground',
            )}
            aria-live="polite"
          >
            {cameraMessage[camera]}
          </p>
        </div>
        <p className="text-muted-foreground text-xs">{ts('barcodeNote')}</p>
        {foreign && cameraOn && (
          <p className="text-muted-foreground text-xs" role="status">
            {ts('foreign')}
          </p>
        )}
      </section>

      <section aria-label={ts('resultLabel')} aria-live="polite" className="grid gap-2">
        {last && tone ? (
          <div className={cn('rounded-2xl border-2 p-4', TONE_STYLE[tone])}>
            <div className="flex items-start gap-3">
              <span className="mt-1 shrink-0">
                {tone === 'success' ? (
                  <CircleCheck className="size-8" aria-hidden />
                ) : tone === 'warn' ? (
                  <TriangleAlert className="size-8" aria-hidden />
                ) : (
                  <CircleAlert className="size-8" aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                {last.kind === 'error' ? (
                  <>
                    <p className="text-lg font-semibold">{ts('failedTitle')}</p>
                    <p className="mt-1 text-base">{codeMessage(last.errorCode)}</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl leading-tight font-bold break-words">
                      {last.name ?? ts('unknownStudent')}
                    </p>
                    {last.className && <p className="mt-0.5 text-base">{last.className}</p>}
                    <p className="mt-2 text-lg font-semibold">{messageOf(last.kind, last.time)}</p>
                  </>
                )}
                {busy > 0 && <p className="mt-1 text-xs opacity-70">{t('sendingBadge')}</p>}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground rounded-2xl border-2 border-dashed p-6 text-center text-base">
            {busy > 0 ? t('sendingBadge') : ts('resultWaiting')}
          </div>
        )}
      </section>

      <section className="bg-card grid gap-2 rounded-2xl border p-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Keyboard className="size-4" aria-hidden /> {ts('manualTitle')}
        </h2>
        <p className="text-muted-foreground text-xs">{ts('manualHint')}</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitManual();
          }}
        >
          <Label htmlFor="scan-manual" className="sr-only">
            {ts('manualTitle')}
          </Label>
          <Input
            id="scan-manual"
            ref={manualRef}
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono"
            placeholder={ts('manualPlaceholder')}
            value={manual}
            aria-invalid={manualBad}
            onChange={(e) => {
              setManual(e.target.value);
              setManualBad(false);
            }}
          />
          <Button type="submit" disabled={manual.trim() === ''}>
            {ts('manualSubmit')}
          </Button>
        </form>
        {manualBad && <p className="text-destructive text-sm">{ts('manualInvalid')}</p>}
      </section>

      <section className="grid gap-2">
        <h2 className="text-sm font-semibold">{ts('recentTitle')}</h2>
        {recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">{ts('recentEmpty')}</p>
        ) : (
          <ul className="bg-card divide-y overflow-hidden rounded-2xl border">
            {recent.map((e) => {
              const k = toneOf(e.kind);
              return (
                <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', DOT_STYLE[k])} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {e.name ?? (e.kind === 'queued' ? ts('recentQueued') : ts('recentFailed'))}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {[e.className, e.kind === 'error' ? codeMessage(e.errorCode) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs tabular-nums">
                    <p className="font-medium">
                      {e.direction === 'in' ? ts('dirIn') : ts('dirOut')} {e.time}
                    </p>
                    {e.kind !== 'in' && e.kind !== 'out' && e.kind !== 'error' && (
                      <p className="text-muted-foreground">{messageOf(e.kind, e.time)}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={forceFor !== null}
        onOpenChange={(o) => {
          if (!o) setForceFor(null);
        }}
        title={t('forceTitle')}
        description={t('forceBody')}
        confirmLabel={t('forceConfirm')}
        onConfirm={async () => {
          const item = forceFor;
          setForceFor(null);
          if (item) enqueueSubmit(item.payload, true);
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
    </div>
  );
}
