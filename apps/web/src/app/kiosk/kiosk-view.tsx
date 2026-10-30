'use client';

import { Maximize2, ScanLine, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  ok: 'bg-emerald-600 text-white',
  late: 'bg-amber-500 text-white',
  out: 'bg-sky-600 text-white',
  neutral: 'bg-slate-600 text-white',
  error: 'bg-red-600 text-white',
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
    setShown(s);
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
        if (tap.result === 'in') {
          show(
            tap.late
              ? { tone: 'late', title: t('kiosk.late'), detail: `${name} · ${cls}` }
              : { tone: 'ok', title: t('kiosk.welcome'), detail: `${name} · ${cls}` },
          );
        } else if (tap.result === 'out') {
          show({ tone: 'out', title: t('kiosk.goodbye'), detail: `${name} · ${cls}` });
        } else {
          show({ tone: 'neutral', title: t(`result.${tap.result}`), detail: `${name} · ${cls}` });
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
      <main className="grid min-h-dvh place-items-center p-6">
        <form
          className="bg-card grid w-full max-w-md gap-4 rounded-xl border p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const v = keyDraft.trim();
            if (!v) return;
            localStorage.setItem(KEY_STORAGE, v);
            setKey(v);
          }}
        >
          <h1 className="font-heading text-xl font-semibold">{t('kiosk.setupTitle')}</h1>
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

  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  const day = now.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <main
      className={cn(
        'relative grid min-h-dvh place-items-center overflow-hidden p-6 transition-colors',
        shown ? TONE[shown.tone] : 'bg-background',
      )}
    >
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
      <header className="absolute top-0 right-0 left-0 flex items-center justify-between gap-3 p-5 text-sm opacity-80">
        <div>
          <div className="font-medium">{info?.school ?? '…'}</div>
          <div>{info?.device}</div>
        </div>
        <div className="flex items-center gap-3">
          {offline > 0 && (
            <span className="inline-flex items-center gap-1">
              <WifiOff className="size-4" /> {t('kiosk.pending', { count: offline })}
            </span>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('kiosk.fullscreen')}
            onClick={() => document.documentElement.requestFullscreen?.()}
          >
            <Maximize2 className="size-4" />
          </Button>
        </div>
      </header>

      {shown ? (
        <div role="status" aria-live="assertive" className="grid gap-3 text-center">
          <div className="font-heading text-5xl font-bold sm:text-7xl">{shown.title}</div>
          <div className="text-2xl sm:text-4xl">{shown.detail}</div>
        </div>
      ) : (
        <div className="grid gap-6 text-center">
          <div className="font-heading text-8xl font-bold tabular-nums sm:text-9xl">{time}</div>
          <div className="text-muted-foreground text-xl">{day}</div>
          <div className="text-muted-foreground mx-auto flex items-center gap-2 text-lg">
            <ScanLine className="size-6" /> {t('kiosk.tapPrompt')}
          </div>
        </div>
      )}
    </main>
  );
}
