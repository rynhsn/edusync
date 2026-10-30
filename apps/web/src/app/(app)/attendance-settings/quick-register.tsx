'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, SkipForward, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';

/** Bip pendek tanda kartu terdaftar. */
function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch {
    // Audio tidak tersedia; tanda centang di layar tetap muncul.
  }
}

interface Registered {
  cardId: string;
  code: string;
}

/**
 * Pendaftaran kartu cepat per kelas: satu kolom isian selalu terfokus, pembaca RFID USB mengetik kode lalu Enter,
 * kartu langsung didaftarkan ke siswa yang disorot lalu sorotan pindah ke siswa berikutnya yang belum punya kartu.
 * Bisa dipakai tanpa mouse: Enter mendaftar, panah kanan melewati, panah kiri membatalkan yang terakhir.
 */
export function QuickRegister() {
  const t = useTranslations('gate');
  const te = useTranslations();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  const [classId, setClassId] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Tambahan lokal di atas data server: null berarti kartu baru saja dibatalkan.
  const [local, setLocal] = useState<Record<string, Registered | null>>({});
  const [history, setHistory] = useState<string[]>([]);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const activeYear = years.data?.find((y) => y.isActive);
  const classes = useQuery({
    queryKey: ['classes', school.schoolId, activeYear?.id],
    enabled: !!activeYear,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: activeYear?.id } } }),
      ),
  });
  const students = useQuery({
    queryKey: ['students', school.schoolId, 'quick-register', classId],
    enabled: !!classId,
    queryFn: async () =>
      unwrap(await api.GET('/v1/students', { params: { ...header, query: { classId, limit: 100 } } })),
  });
  const cards = useQuery({
    queryKey: ['attendance-cards', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/attendance/cards', { params: { ...header, query: {} } })),
  });

  const list = (students.data?.items ?? []).filter((s) => s.status === 'active');
  const serverCard = new Map((cards.data ?? []).map((c) => [c.studentId, { cardId: c.id, code: c.code }]));
  const cardOf = (id: string): Registered | null => (id in local ? local[id] : (serverCard.get(id) ?? null));
  const done = list.filter((s) => cardOf(s.id)).length;
  const active = list.find((s) => s.id === activeId && !cardOf(s.id)) ?? list.find((s) => !cardOf(s.id));

  const focus = () => inputRef.current?.focus();

  /** Siswa berikutnya (berputar) yang belum punya kartu, tidak termasuk `fromId` dan yang baru didaftarkan. */
  function nextAfter(fromId: string, extraHave: string[] = []) {
    const start = list.findIndex((s) => s.id === fromId);
    for (let step = 1; step <= list.length; step++) {
      const s = list[(start + step) % list.length];
      if (s && s.id !== fromId && !cardOf(s.id) && !extraHave.includes(s.id)) return s.id;
    }
    return null;
  }

  const register = useMutation({
    mutationFn: async (v: { studentId: string; code: string }) =>
      unwrap(await api.POST('/v1/attendance/cards', { params: header, body: v })),
    onSuccess: (r, v) => {
      beep();
      setError(null);
      setLocal((l) => ({ ...l, [v.studentId]: { cardId: r.id, code: r.code } }));
      setHistory((h) => [...h, v.studentId]);
      setActiveId(nextAfter(v.studentId, [v.studentId]));
      queryClient.invalidateQueries({ queryKey: ['attendance-cards', school.schoolId] });
    },
    onError: (e) => {
      // Kode yang sama dipakai siswa lain: tetap di siswa ini supaya kartu lain bisa dicoba.
      setError(e instanceof ApiError && e.status === 409 ? t('quick.codeTaken') : te(errorKey(e)));
    },
    onSettled: () => {
      busy.current = false;
      setCode('');
      focus();
    },
  });

  const undo = useMutation({
    mutationFn: async (studentId: string) => {
      const card = cardOf(studentId);
      if (!card) return studentId;
      unwrap(
        await api.DELETE('/v1/attendance/cards/{id}', { params: { ...header, path: { id: card.cardId } } }),
      );
      return studentId;
    },
    onSuccess: (studentId) => {
      setError(null);
      setLocal((l) => ({ ...l, [studentId]: null }));
      setHistory((h) => h.slice(0, -1));
      setActiveId(studentId);
      queryClient.invalidateQueries({ queryKey: ['attendance-cards', school.schoolId] });
    },
    onError: (e) => setError(te(errorKey(e))),
    onSettled: () => {
      busy.current = false;
      focus();
    },
  });

  function submit() {
    const value = code.trim();
    if (!value || !active || busy.current) return;
    busy.current = true;
    register.mutate({ studentId: active.id, code: value });
  }
  function skip() {
    if (active) setActiveId(nextAfter(active.id));
    setError(null);
    setCode('');
    focus();
  }
  function undoLast() {
    const last = history[history.length - 1];
    if (!last || busy.current) return;
    busy.current = true;
    undo.mutate(last);
  }
  function pickClass(id: string) {
    setClassId(id);
    setActiveId(null);
    setHistory([]);
    setLocal({});
    setError(null);
    setCode('');
    // Tunggu dropdown menutup sebelum fokus kembali ke kolom pembaca.
    setTimeout(focus, 50);
  }

  const pickable = (classes.data ?? []).filter(Boolean);

  return (
    <Card className="grid gap-4 p-5">
      <div className="grid max-w-sm gap-2">
        <Label htmlFor="quick-class">{t('quick.class')}</Label>
        <SelectField id="quick-class" value={classId} onChange={(e) => pickClass(e.target.value)}>
          <option value="">{t('quick.chooseClass')}</option>
          {pickable.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
      </div>

      {!classId && <p className="text-muted-foreground text-sm">{t('quick.pickHint')}</p>}
      {classId && students.isPending && <Skeleton className="h-40 w-full" />}
      {classId && students.data && list.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('quick.noStudents')}</p>
      )}

      {classId && list.length > 0 && (
        // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: klik di mana saja hanya mengembalikan fokus ke kolom pembaca; papan ketik tetap lewat kolom isian.
        <div className="grid gap-4" onClick={focus}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium tabular-nums">
              {t('quick.progress', { done, total: list.length })}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!active} onClick={skip}>
                <SkipForward className="size-4" /> {t('quick.skip')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={history.length === 0 || undo.isPending}
                onClick={undoLast}
              >
                <Undo2 className="size-4" /> {t('quick.undo')}
              </Button>
            </div>
          </div>

          {active ? (
            <div className="bg-muted/50 grid gap-3 rounded-xl border p-5">
              <div className="text-muted-foreground text-sm">{t('quick.tapFor')}</div>
              <div className="font-heading text-3xl font-semibold sm:text-4xl">{active.name}</div>
              {active.nis && <div className="text-muted-foreground font-mono text-sm">{active.nis}</div>}
              <Input
                ref={inputRef}
                autoFocus
                aria-label={t('quick.input')}
                placeholder={t('quick.placeholder')}
                autoComplete="off"
                maxLength={64}
                className="h-14 text-center font-mono text-xl"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onBlur={(e) => {
                  if (!e.relatedTarget) setTimeout(focus, 0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                  } else if (code === '' && e.key === 'ArrowRight') {
                    e.preventDefault();
                    skip();
                  } else if (code === '' && e.key === 'ArrowLeft') {
                    e.preventDefault();
                    undoLast();
                  }
                }}
              />
              {error && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription className="font-medium">{error}</AlertDescription>
                </Alert>
              )}
              <p className="text-muted-foreground text-xs">{t('quick.keys')}</p>
            </div>
          ) : (
            <div className="grid gap-3">
              <Alert>
                <AlertDescription>{t('quick.allDone')}</AlertDescription>
              </Alert>
              {/* Tetap ada kolom fokus supaya papan ketik "Batalkan terakhir" (panah kiri) berfungsi. */}
              <Input
                ref={inputRef}
                autoFocus
                aria-label={t('quick.input')}
                className="sr-only"
                autoComplete="off"
                value=""
                readOnly
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    undoLast();
                  }
                }}
              />
            </div>
          )}

          <ul className="grid gap-1 sm:grid-cols-2">
            {list.map((s) => {
              const card = cardOf(s.id);
              return (
                <li
                  key={s.id}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm',
                    active?.id === s.id && 'border-primary bg-primary/5 ring-primary/40 ring-2',
                  )}
                >
                  <span className="min-w-0 truncate">{s.name}</span>
                  {card ? (
                    <span className="flex shrink-0 items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                      <Check className="size-4" />
                      <span className="font-mono text-xs">{card.code}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground shrink-0 text-xs">{t('quick.pending')}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
