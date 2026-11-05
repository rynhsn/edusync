'use client';

import { Check, Circle, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

/**
 * Panduan awal (daftar langkah) yang selesainya dihitung dari data nyata, bukan dari klik. Hilang sendiri bila
 * semua langkah selesai, atau bila ditutup pengguna (disimpan di peramban ini saja).
 * shortcut: penutupan hanya per peramban (localStorage), pindah ke tabel per pengguna bila perlu lintas perangkat.
 */
export function OnboardingCard({
  storageKey,
  title,
  description,
  steps,
  progressLabel,
  openLabel,
  dismissLabel,
}: Props) {
  // Dibaca setelah mount supaya HTML server dan klien sama.
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  useEffect(() => setDismissed(read(storageKey)), [storageKey]);

  const doneCount = steps.filter((s) => s.done).length;
  if (dismissed !== false || steps.length === 0 || doneCount === steps.length) return null;

  const next = steps.find((s) => !s.done);

  return (
    <Card aria-labelledby={`${storageKey}-title`}>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle id={`${storageKey}-title`} className="font-heading text-lg">
            {title}
          </CardTitle>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
          <p className="text-muted-foreground text-xs tabular-nums">{progressLabel}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={dismissLabel}
          onClick={() => {
            try {
              localStorage.setItem(storageKey, '1');
            } catch {
              // Penyimpanan diblokir: cukup sembunyikan untuk sesi ini.
            }
            setDismissed(true);
          }}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </CardHeader>
      <CardContent>
        <div
          className="bg-muted mb-4 h-1.5 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={doneCount}
        >
          <div className="bg-primary h-full" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
        <ol className="grid gap-2">
          {steps.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
            >
              <div className="flex min-w-0 items-start gap-2.5">
                {s.done ? (
                  <Check className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                ) : (
                  <Circle className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                )}
                <div className="min-w-0">
                  <p
                    className={s.done ? 'text-muted-foreground text-sm line-through' : 'text-sm font-medium'}
                  >
                    {s.label}
                  </p>
                  {s.hint && !s.done && <p className="text-muted-foreground text-xs">{s.hint}</p>}
                </div>
              </div>
              {!s.done && s.href && (
                <Button
                  size="sm"
                  variant={s.id === next?.id ? 'default' : 'outline'}
                  nativeButton={false}
                  render={<Link href={s.href} />}
                >
                  {s.cta ?? openLabel}
                </Button>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
