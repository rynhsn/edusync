'use client';

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flag,
  LayoutGrid,
  Loader2,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { RichText } from '@/components/rich-text';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { EmptyState } from '../../ui-bits';
import { formatClock, useTick } from '../clock';

const LABELS = 'ABCDEFGH';
const SAVE_DELAY_MS = 1200;
const ESSAY_MAX = 10_000;

interface Question {
  id: string;
  type: 'mcq' | 'essay';
  body: string;
  points: number;
  options: { key: string; text: string }[];
}
interface Session {
  state: 'in_progress' | 'submitted';
  exam: { id: string; title: string; subjectName: string };
  startedAt: string | null;
  deadlineAt: string | null;
  serverNow: string;
  questions: Question[];
  answers: Record<string, string | null>;
}
type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'running' }
  | { kind: 'finished' };
type SaveStatus = 'saved' | 'saving' | 'retry';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const filled = (v: string | null | undefined) => !!v && v.trim() !== '';

/** Ruang ujian CBT: soal, hitung mundur dari waktu server, simpan otomatis, dan kumpul. */
export function ExamRoom({ id }: { id: string }) {
  const t = useTranslations('examCbt');
  const te = useTranslations();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [session, setSession] = useState<Session | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [blurs, setBlurs] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [offset, setOffset] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null);
  const now = useTick(500);

  const answersRef = useRef(answers);
  const dirty = useRef(new Map<string, string | null>());
  const blursRef = useRef(0);
  const sentBlurs = useRef(0);
  const saving = useRef(false);
  const again = useRef(false);
  const finished = useRef(false);
  const autoSubmitted = useRef(false);
  const lastBlur = useRef(0);
  const retryDelay = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markFinished = useCallback(() => {
    finished.current = true;
    if (debounce.current) clearTimeout(debounce.current);
    if (retry.current) clearTimeout(retry.current);
    setConfirmOpen(false);
    setPhase({ kind: 'finished' });
  }, []);

  const apply = useCallback(
    (s: Session) => {
      setSession(s);
      setOffset(Date.parse(s.serverNow) - Date.now());
      setDeadline(s.deadlineAt ? Date.parse(s.deadlineAt) : null);
      if (s.state === 'submitted') return markFinished();
      return undefined;
    },
    [markFinished],
  );

  // Mulai (atau lanjutkan) percobaan; server menghitung waktunya.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dijalankan sekali per ujian.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = (await unwrap(
          await api.POST('/v1/portal/exams/{id}/start', { params: { ...header, path: { id } } }),
        )) as Session;
        if (!alive) return;
        answersRef.current = s.answers;
        setAnswers(s.answers);
        apply(s);
        if (s.state !== 'submitted') setPhase({ kind: 'running' });
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && e.code === 'already_submitted') {
          finished.current = true;
          setPhase({ kind: 'finished' });
        } else if (e instanceof ApiError && e.code === 'not_open') {
          setPhase({ kind: 'error', message: t('notOpen') });
        } else setPhase({ kind: 'error', message: te(errorKey(e)) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const flush = useCallback(async () => {
    if (finished.current) return;
    if (saving.current) {
      again.current = true;
      return;
    }
    const entries = [...dirty.current.entries()];
    const b = blursRef.current;
    if (entries.length === 0 && b === sentBlurs.current) return;
    saving.current = true;
    setStatus('saving');
    try {
      await unwrap(
        await api.PUT('/v1/portal/exams/{id}/answers', {
          params: { header: schoolHeader(school.schoolId), path: { id } },
          body: { answers: entries.map(([questionId, answer]) => ({ questionId, answer })), blurs: b },
        }),
      );
      // Hanya buang yang belum berubah lagi selama permintaan berjalan.
      for (const [qid, val] of entries) if (dirty.current.get(qid) === val) dirty.current.delete(qid);
      sentBlurs.current = b;
      retryDelay.current = 0;
      setStatus('saved');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        markFinished();
        return;
      }
      setStatus('retry');
      const clientError = e instanceof ApiError && e.status < 500;
      if (clientError) toast.error(te(errorKey(e)));
      else if (!retry.current) {
        retryDelay.current = Math.min(15_000, (retryDelay.current || 1000) * 2);
        retry.current = setTimeout(() => {
          retry.current = null;
          void flush();
        }, retryDelay.current);
      }
    } finally {
      saving.current = false;
      if (again.current) {
        again.current = false;
        void flush();
      }
    }
  }, [id, school.schoolId, markFinished, te]);

  const schedule = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }, [flush]);

  function setAnswer(qid: string, value: string | null) {
    answersRef.current = { ...answersRef.current, [qid]: value };
    setAnswers(answersRef.current);
    dirty.current.set(qid, value);
    setStatus('saving');
    schedule();
  }

  const resync = useCallback(async () => {
    if (finished.current) return;
    try {
      const s = (await unwrap(
        await api.GET('/v1/portal/exams/{id}/session', {
          params: { header: schoolHeader(school.schoolId), path: { id } },
        }),
      )) as Session;
      setOffset(Date.parse(s.serverNow) - Date.now());
      setDeadline(s.deadlineAt ? Date.parse(s.deadlineAt) : null);
      if (s.state === 'submitted') markFinished();
    } catch {
      // Jaringan putus: hitung mundur tetap berjalan dari selisih jam terakhir.
    }
  }, [id, school.schoolId, markFinished]);

  // Catat keluar tab, simpan saat tersembunyi, sinkron ulang saat kembali, dan peringatan menutup halaman.
  useEffect(() => {
    if (phase.kind !== 'running') return;
    const count = () => {
      const at = Date.now();
      if (at - lastBlur.current < 800) return; // blur dan visibilitychange datang bersamaan
      lastBlur.current = at;
      blursRef.current += 1;
      setBlurs(blursRef.current);
      void flush();
    };
    const onVisibility = () => (document.hidden ? count() : void resync());
    const onFocus = () => void resync();
    const onOnline = () => {
      void flush();
      void resync();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', count);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', count);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [phase.kind, flush, resync]);

  const submit = useCallback(
    async (auto: boolean) => {
      setSubmitting(true);
      if (debounce.current) clearTimeout(debounce.current);
      try {
        while (saving.current) await sleep(150);
        await flush();
        while (saving.current) await sleep(150);
        await unwrap(
          await api.POST('/v1/portal/exams/{id}/submit', {
            params: { header: schoolHeader(school.schoolId), path: { id } },
          }),
        );
        markFinished();
      } catch (e) {
        // Waktu habis: server sudah menutup percobaan pada batas akhir, jadi layar selesai tetap benar.
        if (auto) markFinished();
        else {
          toast.error(te(errorKey(e)));
          setSubmitting(false);
        }
      }
    },
    [flush, id, school.schoolId, markFinished, te],
  );

  const remaining = deadline === null ? null : deadline - (now + offset);
  useEffect(() => {
    if (phase.kind === 'running' && remaining !== null && remaining <= 0 && !autoSubmitted.current) {
      autoSubmitted.current = true;
      void submit(true);
    }
  }, [phase.kind, remaining, submit]);

  if (phase.kind === 'loading') {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-3" aria-busy>
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }
  if (phase.kind === 'error') {
    return (
      <div className="mx-auto w-full max-w-md">
        <EmptyState
          title={t('cannotStart')}
          body={phase.message}
          action={
            <Button variant="outline" nativeButton={false} render={<Link href="/portal/exams" />}>
              {t('backToList')}
            </Button>
          }
        />
      </div>
    );
  }
  if (phase.kind === 'finished') {
    return (
      <div className="mx-auto w-full max-w-md">
        <div className="bg-card flex flex-col items-center gap-3 rounded-2xl border px-6 py-12 text-center">
          <CheckCircle2 className="text-chart-5 size-12" aria-hidden />
          <h1 className="font-heading text-xl font-semibold">{t('finishedTitle')}</h1>
          <p className="text-muted-foreground text-sm">{t('finishedBody')}</p>
          <Button nativeButton={false} render={<Link href="/portal/exams" />}>
            {t('backToList')}
          </Button>
        </div>
      </div>
    );
  }

  const questions = session?.questions ?? [];
  const q = questions[index];
  if (!q) return null;
  const value = answers[q.id] ?? null;
  const unanswered = questions.filter((x) => !filled(answers[x.id])).length;
  const flaggedCount = questions.filter((x) => flagged.has(x.id)).length;
  const last = index === questions.length - 1;
  const clockTone =
    remaining !== null && remaining < 60_000
      ? 'text-destructive'
      : remaining !== null && remaining < 300_000
        ? 'text-chart-2'
        : '';

  const go = (i: number) => {
    setIndex(Math.min(Math.max(i, 0), questions.length - 1));
    setNavOpen(false);
    void flush();
  };

  const navigator = (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-5">
      {questions.map((x, i) => (
        <button
          key={x.id}
          type="button"
          aria-label={t('goTo', { n: i + 1 })}
          aria-current={i === index}
          onClick={() => go(i)}
          className={cn(
            'focus-visible:ring-ring/50 relative h-10 rounded-lg border text-sm font-medium tabular-nums outline-none focus-visible:ring-3',
            filled(answers[x.id]) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card',
            i === index && 'ring-foreground ring-2 ring-offset-2 ring-offset-[var(--background)]',
          )}
        >
          {i + 1}
          {flagged.has(x.id) && (
            <span aria-hidden className="bg-chart-2 absolute -top-1 -right-1 size-3 rounded-full" />
          )}
        </button>
      ))}
    </div>
  );

  return (
    <div className="mx-auto grid w-full max-w-5xl content-start gap-4 pb-24">
      <header className="bg-background/90 sticky top-14 z-10 flex flex-wrap items-center gap-3 rounded-2xl border p-3 backdrop-blur">
        <div className="min-w-0 flex-1">
          <h1 className="font-heading truncate text-base font-semibold">{session?.exam.title}</h1>
          <p className="text-muted-foreground truncate text-xs">{session?.exam.subjectName}</p>
        </div>
        <span
          className={cn(
            'flex items-center gap-1 text-xs',
            status === 'retry' ? 'text-destructive' : 'text-muted-foreground',
          )}
          aria-live="polite"
        >
          {status === 'saving' && <Loader2 className="size-3 animate-spin" aria-hidden />}
          {status === 'saved' ? t('saved') : status === 'saving' ? t('saving') : t('retrying')}
        </span>
        <span
          role="timer"
          aria-label={t('timeLeft')}
          className={cn('font-heading text-xl font-semibold tabular-nums', clockTone)}
        >
          {remaining === null ? '--:--' : formatClock(remaining)}
        </span>
      </header>

      {blurs > 0 && (
        <Alert className="border-chart-2/40 bg-chart-2/10">
          <TriangleAlert className="text-chart-2" aria-hidden />
          <AlertDescription>{t('blurWarning', { n: blurs })}</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_16rem]">
        <section className="bg-card grid gap-4 rounded-2xl border p-4 sm:p-6" aria-labelledby="q-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="q-heading" className="font-heading text-lg font-semibold">
              {t('questionN', { n: index + 1, total: questions.length })}
            </h2>
            <span className="text-muted-foreground text-xs">{t('points', { n: q.points })}</span>
          </div>
          <RichText text={q.body} className="text-base leading-relaxed" />

          {q.type === 'mcq' ? (
            // biome-ignore lint/a11y/useSemanticElements: baris pilihan besar yang bisa disentuh.
            <div role="radiogroup" aria-labelledby="q-heading" className="grid gap-2">
              {q.options.map((o, i) => {
                const selected = value?.toUpperCase() === o.key.toUpperCase();
                return (
                  // biome-ignore lint/a11y/useSemanticElements: radio kustom agar baris penuh bisa disentuh.
                  <button
                    key={o.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAnswer(q.id, o.key)}
                    className={cn(
                      'focus-visible:ring-ring/50 flex min-h-12 items-start gap-3 rounded-xl border p-3 text-left outline-none focus-visible:ring-3',
                      selected ? 'border-primary bg-primary/10' : 'hover:bg-muted/50',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-full border text-sm font-semibold',
                        selected && 'bg-primary text-primary-foreground border-primary',
                      )}
                    >
                      {LABELS[i]}
                    </span>
                    <RichText text={o.text} className="min-w-0 flex-1 pt-0.5" />
                  </button>
                );
              })}
              {value && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-fit"
                  onClick={() => setAnswer(q.id, null)}
                >
                  {t('clearAnswer')}
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Textarea
                aria-labelledby="q-heading"
                rows={8}
                maxLength={ESSAY_MAX}
                value={value ?? ''}
                placeholder={t('essayPlaceholder')}
                onChange={(e) => setAnswer(q.id, e.target.value)}
              />
              <p className="text-muted-foreground text-right text-xs tabular-nums">
                {t('chars', { n: (value ?? '').length, max: ESSAY_MAX })}
              </p>
            </div>
          )}
        </section>

        <aside className="bg-card hidden gap-3 rounded-2xl border p-4 lg:grid" aria-label={t('questionList')}>
          <h2 className="font-heading text-sm font-semibold">{t('questionList')}</h2>
          {navigator}
          <p className="text-muted-foreground text-xs">
            {t('progress', { done: questions.length - unanswered, total: questions.length })}
          </p>
        </aside>
      </div>

      <div className="bg-background/95 fixed inset-x-0 bottom-0 z-20 border-t p-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => go(index - 1)} disabled={index === 0}>
            <ChevronLeft /> <span className="hidden sm:inline">{t('prev')}</span>
          </Button>
          <Button
            variant={flagged.has(q.id) ? 'secondary' : 'outline'}
            aria-pressed={flagged.has(q.id)}
            onClick={() =>
              setFlagged((s) => {
                const next = new Set(s);
                if (!next.delete(q.id)) next.add(q.id);
                return next;
              })
            }
          >
            <Flag /> <span className="hidden sm:inline">{t('flag')}</span>
          </Button>
          <Button variant="outline" className="lg:hidden" onClick={() => setNavOpen(true)}>
            <LayoutGrid /> {t('questionList')}
          </Button>
          <Button variant="outline" onClick={() => go(index + 1)} disabled={last}>
            <span className="hidden sm:inline">{t('next')}</span> <ChevronRight />
          </Button>
          <Button className="ml-auto" onClick={() => setConfirmOpen(true)} disabled={submitting}>
            {t('submit')}
          </Button>
        </div>
      </div>

      <Dialog open={navOpen} onOpenChange={setNavOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('questionList')}</DialogTitle>
            <DialogDescription>
              {t('progress', { done: questions.length - unanswered, total: questions.length })}
            </DialogDescription>
          </DialogHeader>
          {navigator}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmTitle')}</DialogTitle>
            <DialogDescription>{t('confirmBody')}</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-1 text-sm">
            <li className={unanswered > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
              {t('unanswered', { n: unanswered })}
            </li>
            {flaggedCount > 0 && (
              <li className="text-chart-2 font-medium">{t('flaggedCount', { n: flaggedCount })}</li>
            )}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              {t('keepWorking')}
            </Button>
            <Button onClick={() => void submit(false)} disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />} {t('confirmSubmit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
