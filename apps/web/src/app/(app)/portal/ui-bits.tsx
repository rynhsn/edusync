'use client';

import { cn } from '@/lib/utils';
import { avatarHue, initials, ringDash, type Tone } from './logic';

/** Warna per nada; memakai token tema (varian gelap ikut otomatis). */
export const TONE_STROKE: Record<Tone, string> = {
  good: 'stroke-chart-5',
  warn: 'stroke-chart-2',
  low: 'stroke-chart-3',
  none: 'stroke-muted-foreground/30',
};

export const TONE_DOT: Record<Tone, string> = {
  good: 'bg-chart-5',
  warn: 'bg-chart-2',
  low: 'bg-chart-3',
  none: 'bg-muted-foreground/40',
};

/** Avatar berwarna stabil per nama anak. */
export function ChildAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      style={{ '--h': avatarHue(name) } as React.CSSProperties}
      className={cn(
        'font-heading grid size-12 shrink-0 place-items-center rounded-2xl text-base font-semibold',
        'bg-[oklch(0.92_0.06_var(--h))] text-[oklch(0.35_0.09_var(--h))]',
        'dark:bg-[oklch(0.36_0.07_var(--h))] dark:text-[oklch(0.93_0.04_var(--h))]',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Cincin persentase (SVG). Busur terisi bergerak halus saat tampil; dimatikan bila pengguna memilih gerak minimal. */
export function Ring({
  percentage,
  tone,
  size = 72,
  label,
}: {
  percentage: number | null;
  tone: Tone;
  size?: number;
  label: string;
}) {
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const { circumference, offset } = ringDash(percentage, radius);
  return (
    <div
      role="img"
      aria-label={label}
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(
            TONE_STROKE[tone],
            'transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none',
          )}
        />
      </svg>
      <span className="font-heading absolute text-sm font-semibold tabular-nums">
        {percentage === null ? '–' : `${Math.round(percentage)}%`}
      </span>
    </div>
  );
}

/** Ilustrasi kosong yang hangat: buku dan bintang kecil. */
export function EmptyArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 90" className={cn('text-primary h-20 w-auto', className)} aria-hidden fill="none">
      <ellipse cx="60" cy="80" rx="42" ry="5" className="fill-muted" />
      <path
        d="M22 28c14-4 26-2 38 6v40c-12-8-24-10-38-6V28Z"
        className="fill-accent stroke-current"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M98 28c-14-4-26-2-38 6v40c12-8 24-10 38-6V28Z"
        className="fill-card stroke-current"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M32 40c8-1 14 0 20 3M32 50c8-1 14 0 20 3"
        className="stroke-current"
        strokeWidth="2"
        strokeLinecap="round"
        opacity=".5"
      />
      <path
        d="M92 12l2.2 4.8 5.3.6-3.9 3.6 1.1 5.2-4.7-2.7-4.7 2.7 1.1-5.2-3.9-3.6 5.3-.6L92 12Z"
        className="fill-chart-2"
      />
      <circle cx="24" cy="14" r="2.5" className="fill-chart-3" />
      <circle cx="40" cy="8" r="1.8" className="fill-primary" />
    </svg>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-card flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center">
      <EmptyArt />
      <p className="font-heading mt-1 font-semibold">{title}</p>
      {body && <p className="text-muted-foreground max-w-xs text-sm">{body}</p>}
      {action}
    </div>
  );
}

/** Kerangka pemuat untuk daftar kartu. */
export function CardsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: kerangka statis
        <div key={i} className="bg-muted/60 h-20 animate-pulse rounded-2xl motion-reduce:animate-none" />
      ))}
    </div>
  );
}
