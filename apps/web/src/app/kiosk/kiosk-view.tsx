'use client';

import {
  CircleAlert,
  CircleCheck,
  Clock,
  Info as InfoIcon,
  LogOut,
  Maximize2,
  Nfc,
  School,
  WifiOff,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui-kit';
import { cn } from '@/lib/utils';

const KEY_STORAGE = 'edusync.kiosk.key';
const QUEUE_STORAGE = 'edusync.kiosk.queue';
const SHOW_MS = 4000;
const KNOWN_ERRORS = [
  'unknown_card',
  'school_closed',
  'student_inactive',
  'invalid_time',
  'module_disabled',
  'school_suspended',
];

interface Info {
  school: string;
  device: string;
}
interface Shown {
  tone: 'ok' | 'late' | 'out' | 'neutral' | 'error';
  title: string;
  detail: string;
  /** Murid yang tap (kosong untuk galat umum); dipakai untuk avatar besar dan daftar terakhir. */
  student?: { name: string; className: string };
  /** Penanda tap ini, supaya bilah hitung mundur mulai ulang di tap berikutnya. */
  id?: number;
}
interface Recent {
  id: number;
  name: string;
  tone: Shown['tone'];
  time: string;
}
interface Queued {
  code: string;
  at: string;
  clientId: string;
}
interface TapOk {
  result: 'in' | 'out' | 'already_in' | 'duplicate' | 'replayed';
  late: boolean;
  student: { name: string; className: string | null };
}

const TONE: Record<Shown['tone'], string> = {
  ok: 'bg-linear-to-br from-emerald-500 to-teal-700 text-white',
  late: 'bg-linear-to-br from-amber-400 to-orange-600 text-white',
  out: 'bg-linear-to-br from-sky-500 to-indigo-700 text-white',
  neutral: 'bg-linear-to-br from-slate-500 to-slate-700 text-white',
  error: 'bg-linear-to-br from-rose-500 to-red-700 text-white',
};
const TONE_ICON = {
  ok: CircleCheck,
  late: Clock,
  out: LogOut,
  neutral: InfoIcon,
  error: CircleAlert,
} as const;
const TONE_DOT: Record<Shown['tone'], string> = {
  ok: 'bg-emerald-400',
  late: 'bg-amber-400',
  out: 'bg-sky-400',
  neutral: 'bg-slate-400',
  error: 'bg-rose-400',
};

function readQueue(): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_STORAGE) ?? '[]') as Queued[];
  } catch {
    return [];
  }
}
function writeQueue(q: Queued[]) {
  try {
    localStorage.setItem(QUEUE_STORAGE, JSON.stringify(q.slice(-500)));
  } catch {
    // Penyimpanan penuh atau diblokir: antrean offline tidak bisa disimpan.
  }
}

function beep(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = ok ? 880 : 220;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.35));
  } catch {
    // Audio tidak tersedia; layar tetap memberi tanda.
  }
}

/**
 * Layar kiosk gerbang. Pembaca RFID USB bekerja seperti papan ketik: kolom isian tersembunyi selalu terfokus dan
 * menerima kode diakhiri Enter. Tap yang gagal karena jaringan disimpan di perangkat dan dikirim ulang dengan
 * waktu aslinya, dengan clientId tetap supaya tidak tercatat dua kali.
 */
export function KioskView() {
  const t = useTranslations('gate');
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [keyDraft, setKeyDraft] = useState('');
  const [info, setInfo] = useState<Info | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [offline, setOffline] = useState(0);
  const [code, setCode] = useState('');
  const [recent, setRecent] = useState<Recent[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    try {
      setKey(localStorage.getItem(KEY_STORAGE));
    } catch {
      setKey(null);
    }
    setOffline(readQueue().length);
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const show = useCallback((s: Shown) => {
    const id = Date.now();
    setShown({ ...s, id });
    if (s.student) {
      const time = new Date(id).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const name = s.student.name;
      setRecent((r) => [{ id, name, tone: s.tone, time }, ...r].slice(0, 5));
    }
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShown(null), SHOW_MS);
    beep(s.tone !== 'error');
  }, []);

  const call = useCallback(
    async (path: string, body?: object) => {
      const res = await fetch(path, {
        method: body ? 'POST' : 'GET',
        headers: { 'x-device-key': key ?? '', ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: { code?: string } } & Record<
        string,
        unknown
      >;
      return { ok: res.ok, status: res.status, json };
    },
    [key],
  );

  useEffect(() => {
    if (!key) return;
    call('/v1/kiosk/info')
      .then((r) => {
        if (r.ok) setInfo(r.json as unknown as Info);
        else if (r.status === 401) {
          localStorage.removeItem(KEY_STORAGE);
          setKey(null);
        }
      })
      .catch(() => undefined);
  }, [key, call]);

  const flush = useCallback(async () => {
    const queue = readQueue();
    if (queue.length === 0) return;
    const rest: Queued[] = [];
    for (const item of queue) {
      try {
        const r = await call('/v1/kiosk/tap', item);
        // Galat dari server (kartu tak dikenal, libur) tidak akan berhasil bila diulang, jadi dibuang.
        if (!r.ok && r.status >= 500) rest.push(item);
      } catch {
        rest.push(item);
      }
    }
    writeQueue(rest);
    setOffline(rest.length);
  }, [call]);

  useEffect(() => {
    if (!key) return;
    const id = setInterval(flush, 15_000);
    window.addEventListener('online', flush);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', flush);
    };
  }, [key, flush]);

  // Fokus selalu kembali ke kolom pembaca, kecuali sedang di layar pengaturan kunci.
  useEffect(() => {
    if (!key) return;
    const refocus = () => inputRef.current?.focus();
    refocus();
    document.addEventListener('click', refocus);
    return () => document.removeEventListener('click', refocus);
  }, [key]);

  async function submit(raw: string) {
    const value = raw.trim();
    if (!value) return;
    const queued: Queued = { code: value, at: new Date().toISOString(), clientId: crypto.randomUUID() };
    try {
      const r = await call('/v1/kiosk/tap', { code: value, clientId: queued.clientId });
      if (r.ok) {
        const tap = r.json as unknown as TapOk;
        const name = tap.student.name;
        const cls = tap.student.className ?? '';
        const student = { name, className: cls };
        const detail = cls ? `${name} · ${cls}` : name;
        if (tap.result === 'in') {
          show(
            tap.late
              ? { tone: 'late', title: t('kiosk.late'), detail, student }
              : { tone: 'ok', title: t('kiosk.welcome'), detail, student },
          );
        } else if (tap.result === 'out') {
          show({ tone: 'out', title: t('kiosk.goodbye'), detail, student });
        } else {
          show({ tone: 'neutral', title: t(`result.${tap.result}`), detail, student });
        }
      } else if (r.status === 401) {
        localStorage.removeItem(KEY_STORAGE);
        setKey(null);
      } else {
        const errCode = r.json.error?.code ?? 'unknown';
        show({
          tone: 'error',
          title: t('kiosk.failed'),
          detail: t(
            `kioskError.${KNOWN_ERRORS.includes(errCode) ? errCode : 'unknown'}` as 'kioskError.unknown',
          ),
        });
      }
    } catch {
      // Tidak ada jaringan: simpan dengan waktu asli dan kirim ulang nanti.
      writeQueue([...readQueue(), queued]);
      setOffline(readQueue().length);
      show({ tone: 'neutral', title: t('kiosk.savedOffline'), detail: t('kiosk.willSync') });
    }
  }

  if (key === undefined) return null;

  if (!key) {
    return (
      <main className="grid min-h-dvh place-items-center bg-linear-to-br from-slate-900 via-slate-900 to-teal-950 p-6">
        <form
          className="bg-card grid w-full max-w-md gap-4 rounded-3xl border p-7 shadow-2xl"
          onSubmit={(e) => {
            e.preventDefault();
            const v = keyDraft.trim();
            if (!v) return;
            localStorage.setItem(KEY_STORAGE, v);
            setKey(v);
          }}
        >
          <span className="bg-primary/10 text-primary grid size-14 place-items-center rounded-2xl">
            <Nfc className="size-7" aria-hidden />
          </span>
          <h1 className="font-heading text-2xl font-semibold">{t('kiosk.setupTitle')}</h1>
          <p className="text-muted-foreground text-sm">{t('kiosk.setupHint')}</p>
          <Input
            aria-label={t('kiosk.keyLabel')}
            placeholder="esk_…"
            autoComplete="off"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
          />
          <Button type="submit" disabled={keyDraft.trim().length < 16}>
            {t('kiosk.connect')}
          </Button>
        </form>
      </main>
    );
  }

  const hm = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  const ss = String(now.getSeconds()).padStart(2, '0');
  const day = now.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const ToneIcon = shown ? TONE_ICON[shown.tone] : null;

  return (
    <main
      className={cn(
        'relative grid min-h-dvh place-items-center overflow-hidden p-6 text-white transition-colors duration-300',
        shown ? TONE[shown.tone] : 'bg-linear-to-br from-slate-900 via-slate-900 to-teal-950',
      )}
    >
      {!shown && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 -left-32 size-[34rem] rounded-full bg-teal-500/15 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-40 -bottom-48 size-[40rem] rounded-full bg-sky-500/10 blur-3xl"
          />
        </>
      )}
      <input
        ref={inputRef}
        aria-label={t('kiosk.readerInput')}
        className="absolute opacity-0"
        autoComplete="off"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const v = code;
            setCode('');
            submit(v);
          }
        }}
      />

      <header className="absolute top-0 right-0 left-0 flex items-center justify-between gap-3 p-5 sm:p-7">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/15 backdrop-blur">
            <School className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="font-heading truncate text-lg leading-tight font-semibold">
              {info?.school ?? '…'}
            </div>
            <div className="truncate text-sm opacity-70">{info?.device}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {offline > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3 py-1 text-sm text-amber-200">
              <WifiOff className="size-4" aria-hidden /> {t('kiosk.pending', { count: offline })}
            </span>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/15 hover:text-white"
            aria-label={t('kiosk.fullscreen')}
            onClick={() => document.documentElement.requestFullscreen?.()}
          >
            <Maximize2 className="size-5" />
          </Button>
        </div>
      </header>

      {shown && ToneIcon ? (
        <div
          key={shown.id}
          role="status"
          aria-live="assertive"
          className="grid justify-items-center gap-5 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300"
        >
          {shown.student ? (
            <UserAvatar
              name={shown.student.name}
              className="size-32 bg-white/25 text-5xl text-white shadow-2xl ring-8 ring-white/30 sm:size-40 sm:text-6xl"
            />
          ) : (
            <ToneIcon className="size-28 sm:size-36" aria-hidden />
          )}
          <div className="inline-flex items-center gap-3 rounded-full bg-white/20 px-5 py-2 text-2xl font-semibold backdrop-blur sm:text-3xl">
            {shown.student && <ToneIcon className="size-7" aria-hidden />}
            {shown.title}
          </div>
          {shown.student ? (
            <>
              <div className="font-heading max-w-[90vw] text-4xl leading-tight font-bold sm:text-6xl">
                {shown.student.name}
              </div>
              {shown.student.className && (
                <div className="text-2xl opacity-90 sm:text-4xl">{shown.student.className}</div>
              )}
            </>
          ) : (
            <div className="max-w-[90vw] text-3xl font-semibold sm:text-5xl">{shown.detail}</div>
          )}
        </div>
      ) : (
        <div className="relative grid justify-items-center gap-8 text-center">
          <div>
            <div className="font-heading flex items-end justify-center gap-3 tabular-nums">
              <span className="text-8xl leading-none font-bold sm:text-9xl">{hm}</span>
              <span className="pb-2 text-3xl font-medium opacity-50 sm:pb-3 sm:text-4xl">{ss}</span>
            </div>
            <div className="mt-3 text-xl opacity-70 sm:text-2xl">{day}</div>
          </div>

          <div className="flex items-center gap-4 rounded-3xl bg-white/10 py-4 pr-7 pl-4 ring-1 ring-white/15 backdrop-blur">
            <span className="relative grid size-14 place-items-center">
              <span
                aria-hidden
                className="absolute inset-0 rounded-full bg-teal-400/40 motion-safe:animate-ping"
              />
              <span className="relative grid size-14 place-items-center rounded-full bg-teal-400 text-slate-900">
                <Nfc className="size-7" aria-hidden />
              </span>
            </span>
            <span className="text-xl font-medium sm:text-2xl">{t('kiosk.tapPrompt')}</span>
          </div>
        </div>
      )}

      {!shown && recent.length > 0 && (
        <ul className="absolute right-0 bottom-0 left-0 flex flex-wrap justify-center gap-2 p-5 sm:p-7">
          {recent.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-full bg-white/10 py-1.5 pr-3.5 pl-2.5 text-sm ring-1 ring-white/10 motion-safe:animate-in motion-safe:fade-in"
            >
              <span aria-hidden className={cn('size-2 rounded-full', TONE_DOT[r.tone])} />
              <span className="max-w-40 truncate font-medium">{r.name}</span>
              <span className="tabular-nums opacity-60">{r.time}</span>
            </li>
          ))}
        </ul>
      )}

      {shown && (
        <div aria-hidden className="absolute right-0 bottom-0 left-0 h-2 bg-white/20">
          <div
            key={shown.id}
            className="h-full origin-left bg-white/70"
            style={{ animation: `kiosk-bar ${SHOW_MS}ms linear forwards` }}
          />
        </div>
      )}
    </main>
  );
}
