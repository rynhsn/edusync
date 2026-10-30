'use client';

import { JUZ_START_INDEX, SURAHS, TOTAL_JUZ } from '@edusync/contracts';
import { useEffect, useId, useState } from 'react';
import { cn } from '@/lib/utils';

/** Jenis setoran dan kualitas bacaan; dipakai formulir, daftar, dan lencana. */
export const KINDS = ['ziyadah', 'murajaah'] as const;
export type Kind = (typeof KINDS)[number];
export const QUALITIES = ['fluent', 'fair', 'repeat'] as const;
export type Quality = (typeof QUALITIES)[number];

/** Warna kualitas dari token tema (hijau lancar, emas cukup, merah ulang). */
export const QUALITY_STYLE: Record<Quality, { on: string; dot: string }> = {
  fluent: { on: 'border-chart-5 bg-chart-5/15 text-foreground', dot: 'bg-chart-5' },
  fair: { on: 'border-chart-2 bg-chart-2/20 text-foreground', dot: 'bg-chart-2' },
  repeat: { on: 'border-destructive bg-destructive/10 text-foreground', dot: 'bg-destructive' },
};

export const todayIso = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

/** Geser tanggal TTTT-BB-HH sebanyak `days` hari (tanpa pergeseran zona waktu). */
export function shiftIso(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Selisih hari (b - a) antara dua tanggal TTTT-BB-HH. */
export function diffDays(a: string, b: string) {
  const p = (s: string) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((p(b) - p(a)) / 86_400_000);
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Ambang "belum setor": jumlah hari tanpa setoran. */
export const STALE_DAYS = 7;

/** Bila sudah lewat ambang (atau belum pernah setor), siswa dianggap tertinggal. */
export function isStale(lastEntryDate: string | null | undefined, today = todayIso()) {
  return !lastEntryDate || diffDays(lastEntryDate, today) >= STALE_DAYS;
}

/** Nilai yang naik halus dari 0 saat dipasang; mengikuti reduced-motion lewat CSS pada pemakainya. */
function useMountValue(value: number) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setV(value));
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return v;
}

/** Cincin progres SVG beranimasi. `percent` 0..100. Isi tengah lewat `children`. */
export function ProgressRing({
  percent,
  size = 64,
  stroke = 7,
  tone = 'emerald',
  className,
  children,
  label,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  tone?: 'emerald' | 'gold' | 'rose';
  className?: string;
  children?: React.ReactNode;
  label?: string;
}) {
  const shown = useMountValue(clamp(percent, 0, 100));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color =
    tone === 'gold' ? 'stroke-chart-2' : tone === 'rose' ? 'stroke-destructive' : 'stroke-chart-5';
  return (
    <div
      className={cn('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${Math.round(percent)}%`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
          className={cn(
            color,
            'transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none',
          )}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Pola bintang delapan sudut (rub el hizb) yang sangat tipis, untuk latar header. */
export function GeoPattern({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg aria-hidden="true" className={cn('pointer-events-none absolute inset-0 size-full', className)}>
      <defs>
        <pattern id={id} width="56" height="56" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="14" y="14" width="28" height="28" />
            <rect x="14" y="14" width="28" height="28" transform="rotate(45 28 28)" />
            <circle cx="28" cy="28" r="4" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/**
 * Pita judul khas modul: zamrud lembut, pola geometri tipis, dan semburat emas di sudut.
 * Isinya biasanya <PageHeader />.
 */
export function TahfidzBanner({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'from-chart-5/15 via-chart-5/5 relative isolate overflow-hidden rounded-2xl border bg-gradient-to-br to-transparent p-5 md:p-6',
        className,
      )}
    >
      <GeoPattern className="text-chart-5 opacity-[0.12] dark:opacity-[0.16]" />
      <div className="bg-chart-2/25 pointer-events-none absolute -top-16 -right-12 size-44 rounded-full blur-3xl" />
      <div className="relative">{children}</div>
    </div>
  );
}

/** Nama surah dalam aksara Arab (font sistem, kanan ke kiri). */
export function Arabic({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span dir="rtl" lang="ar" className={cn('font-serif leading-snug', className)}>
      {children}
    </span>
  );
}

/** Bilah progres tipis berwarna emas/zamrud. */
export function MiniBar({
  percent,
  tone = 'emerald',
  className,
}: {
  percent: number;
  tone?: 'emerald' | 'gold' | 'rose';
  className?: string;
}) {
  const shown = useMountValue(clamp(percent, 0, 100));
  const color = tone === 'gold' ? 'bg-chart-2' : tone === 'rose' ? 'bg-destructive' : 'bg-chart-5';
  return (
    <div
      className={cn('bg-muted h-1.5 w-full overflow-hidden rounded-full', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamp(percent, 0, 100))}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none',
          color,
        )}
        style={{ width: `${shown}%` }}
      />
    </div>
  );
}

/** Format persen: bulat, satu desimal bila kecil. */
export const fmtPercent = (p: number) => (p > 0 && p < 10 ? p.toFixed(1) : String(Math.round(p)));

/** Dua huruf awal nama untuk avatar. */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

/** "2. Al-Baqarah" */
export const surahLabel = (n: number) => {
  const s = SURAHS[n - 1];
  return s ? `${s.number}. ${s.name}` : String(n);
};

/** Rentang ayat ringkas: "Al-Baqarah 1-5" atau "Al-Baqarah 280 - Ali Imran 3". */
export function formatRange(r: { surahFrom: number; ayahFrom: number; surahTo: number; ayahTo: number }) {
  const a = SURAHS[r.surahFrom - 1]?.name ?? r.surahFrom;
  const b = SURAHS[r.surahTo - 1]?.name ?? r.surahTo;
  if (r.surahFrom === r.surahTo)
    return r.ayahFrom === r.ayahTo ? `${a} ${r.ayahFrom}` : `${a} ${r.ayahFrom}-${r.ayahTo}`;
  return `${a} ${r.ayahFrom} - ${b} ${r.ayahTo}`;
}

/**
 * Perkiraan isi tiap juz (0..1) dari cakupan per surah. API hanya memberi jumlah ayat per surah, jadi ayat
 * yang tercakup dianggap tersebar rata di dalam surah itu; juz yang tuntas selalu penuh.
 */
export function juzFractions(perSurah: { surah: number; ayahs: number }[], juzComplete: number[]): number[] {
  const covered = new Map(perSurah.map((p) => [p.surah, p.ayahs]));
  const sum = new Array<number>(TOTAL_JUZ).fill(0);
  const total = new Array<number>(TOTAL_JUZ).fill(0);
  let index = 0;
  for (const s of SURAHS) {
    const f = (covered.get(s.number) ?? 0) / s.ayahCount;
    for (let a = 0; a < s.ayahCount; a++) {
      index += 1;
      let j = 0;
      while (j + 1 < TOTAL_JUZ && (JUZ_START_INDEX[j + 1] as number) <= index) j++;
      total[j] = (total[j] as number) + 1;
      sum[j] = (sum[j] as number) + f;
    }
  }
  return sum.map((v, j) => (juzComplete.includes(j + 1) ? 1 : v / (total[j] || 1)));
}
