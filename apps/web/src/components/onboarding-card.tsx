'use client';

import { BookOpen, Check, ChevronDown, ChevronUp, Circle, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface OnboardingStep {
  id: string;
  label: string;
  /** Satu kalimat: untuk apa langkah ini dan apa yang terbuka setelahnya. */
  hint?: string;
  done: boolean;
  href?: string;
  /** Teks tombol; bawaan memakai `openLabel`. */
  cta?: string;
}

interface Props {
  /** Kunci unik per pengguna dan konteks, mis. `onboarding:<userId>:school:<schoolId>`. */
  storageKey: string;
  title: string;
  description?: string;
  steps: OnboardingStep[];
  /** "2 dari 5 langkah", sudah diterjemahkan. */
  progressLabel: string;
  openLabel: string;
  dismissLabel: string;
  /**
   * `steps` (bawaan): daftar langkah berprogres, hanya langkah berikutnya yang ditonjolkan.
   * `welcome`: sambutan ringkas tanpa progres, berisi pintasan (maks. 4) saja.
   */
  variant?: 'steps' | 'welcome';
}

const flag = (key: string) => {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

const setFlag = (key: string, on: boolean) => {
  try {
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    // Penyimpanan diblokir: keadaan hanya berlaku untuk sesi ini.
  }
};

/**
 * Panduan awal yang ringkas: satu baris ringkasan (judul, progres, bilah tipis), langkah berikutnya sebagai
 * tombol utama, dan daftar lengkap yang bisa dibuka. Selesainya dihitung dari data nyata, bukan dari klik.
 * Terbuka pada kunjungan pertama; setelah itu tertutup bila sudah ada progres. Ditutup pengguna (X) menyisakan
 * tombol kecil "Panduan" untuk membukanya lagi; hilang sepenuhnya hanya bila semua langkah selesai.
 * shortcut: status hanya per peramban (localStorage), pindah ke tabel per pengguna bila perlu lintas perangkat.
 */
export function OnboardingCard({
  storageKey,
  title,
  description,
  steps,
  progressLabel,
  openLabel,
  dismissLabel,
  variant = 'steps',
}: Props) {
  const t = useTranslations('onboardingCard');
  const listId = useId();
  // Dibaca setelah mount supaya HTML server dan klien sama.
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(false);

  const doneCount = steps.filter((s) => s.done).length;
  const doneRef = useRef(doneCount);
  doneRef.current = doneCount;

  useEffect(() => {
    const seen = flag(`${storageKey}:seen`);
    setDismissed(flag(storageKey));
    // Kunjungan pertama atau belum ada progres: terbuka. Selebihnya ringkas.
    setExpanded(!seen || doneRef.current === 0);
    setFlag(`${storageKey}:seen`, true);
  }, [storageKey]);

  if (dismissed === null || steps.length === 0 || (variant === 'steps' && doneCount === steps.length)) {
    return null;
  }

  if (dismissed) {
    return (
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('reopenAria', { title })}
          onClick={() => {
            setFlag(storageKey, false);
            setDismissed(false);
          }}
        >
          <BookOpen aria-hidden /> {t('reopen')}
        </Button>
      </div>
    );
  }

  const dismiss = (
    <Button
      variant="ghost"
      size="icon-sm"
      className="-mt-1 -mr-1 shrink-0"
      aria-label={dismissLabel}
      onClick={() => {
        setFlag(storageKey, true);
        setDismissed(true);
      }}
    >
      <X className="size-4" aria-hidden />
    </Button>
  );

  if (variant === 'welcome') {
    return (
      <Card size="sm" aria-labelledby={`${listId}-title`} className="bg-muted/30">
        <CardContent className="grid gap-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 id={`${listId}-title`} className="font-heading text-base font-medium">
                {title}
              </h2>
              {description && <p className="text-muted-foreground text-sm">{description}</p>}
            </div>
            {dismiss}
          </div>
          <ul className="flex flex-wrap gap-2" aria-label={t('shortcuts')}>
            {steps.slice(0, 4).map((s) => (
              <li key={s.id}>
                {s.href ? (
                  <Button
                    size="sm"
                    variant="outline"
                    title={s.hint}
                    nativeButton={false}
                    render={<Link href={s.href} />}
                  >
                    {s.label}
                  </Button>
                ) : (
                  <span className="text-sm">{s.label}</span>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }

  const next = steps.find((s) => !s.done);

  return (
    <Card size="sm" aria-labelledby={`${listId}-title`} className="bg-muted/30">
      <CardContent className="grid gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <h2 id={`${listId}-title`} className="font-heading text-base font-medium">
              {title}
            </h2>
            <span className="text-muted-foreground text-sm tabular-nums">{progressLabel}</span>
          </div>
          {dismiss}
        </div>
        <div
          className="bg-muted h-1 overflow-hidden rounded-full"
          role="progressbar"
          aria-label={progressLabel}
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={doneCount}
          aria-valuetext={progressLabel}
        >
          <div className="bg-primary h-full" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>

        {next && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1 basis-56">
              <p className="text-muted-foreground text-xs">{t('next')}</p>
              <p className="text-sm font-medium">{next.label}</p>
              {next.hint && <p className="text-muted-foreground text-xs text-pretty">{next.hint}</p>}
            </div>
            {next.href && (
              <Button size="sm" nativeButton={false} render={<Link href={next.href} />}>
                {next.cta ?? openLabel}
              </Button>
            )}
          </div>
        )}

        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
            {expanded ? t('hideAll') : t('showAll')}
          </Button>
        </div>

        {expanded && (
          <div id={listId} className="grid content-start gap-2">
            {description && <p className="text-muted-foreground text-xs">{description}</p>}
            <ol className="grid content-start gap-1">
              {steps.map((s) => {
                const isNext = s.id === next?.id;
                return (
                  <li
                    key={s.id}
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5',
                      isNext && 'bg-background ring-1 ring-foreground/10',
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      {s.done ? (
                        <Check className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                      ) : (
                        <Circle className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                      )}
                      <p
                        className={cn(
                          'text-sm',
                          s.done ? 'text-muted-foreground' : isNext ? 'font-medium' : 'text-foreground',
                        )}
                      >
                        {s.label}
                        {s.done && <span className="sr-only"> ({t('done')})</span>}
                      </p>
                    </div>
                    {!s.done && !isNext && s.href && (
                      <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={s.href} />}>
                        {s.cta ?? openLabel}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
