'use client';

import type { LucideIcon } from 'lucide-react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { IconTile, TONES, type Tone } from '@/components/ui-kit';
import { formatRupiah } from '@/lib/money';
import { cn } from '@/lib/utils';

/** Animasi masuk halus; mati otomatis bila pengguna memilih gerak dikurangi. */
export const ENTER =
  'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300';

/** Angka rupiah rata kanan dengan angka selebar tetap. */
export function Money({
  value,
  className,
  negative,
}: {
  value: number;
  className?: string;
  /** Beri warna bahaya (mis. tunggakan lewat tempo). */
  negative?: boolean;
}) {
  return (
    <span
      className={cn(
        'whitespace-nowrap tabular-nums',
        negative && value > 0 && 'text-rose-600 dark:text-rose-400',
        className,
      )}
    >
      {formatRupiah(value)}
    </span>
  );
}

/** Kartu bagian pengaturan: ikon bernada, judul, penjelasan, dan tombol aksi di kanan atas. */
export function SectionCard({
  icon,
  tone = 'amber',
  title,
  description,
  actions,
  children,
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'bg-card relative grid gap-4 overflow-hidden rounded-2xl border p-4 sm:p-5',
        ENTER,
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -top-12 -right-12 size-40 rounded-full opacity-25 blur-3xl',
          TONES[tone].bar,
        )}
      />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <IconTile icon={icon} tone={tone} className="size-10" />
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-semibold">{title}</h2>
            {description && <p className="text-muted-foreground max-w-2xl text-sm">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="relative grid gap-4">{children}</div>}
    </section>
  );
}

export interface MenuAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

/** Menu titik-tiga: aksi baris berlabel teks menggantikan deretan tombol ikon. */
export function RowMenu({ label, items }: { label: string; items: MenuAction[] }) {
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={label} title={label} />}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-52">
        {items.map((it) => (
          <DropdownMenuItem
            key={it.key}
            {...(it.destructive ? { variant: 'destructive' as const } : {})}
            {...(it.disabled ? { disabled: true } : {})}
            onClick={it.onClick}
          >
            {it.icon && <it.icon className="size-4" aria-hidden="true" />}
            {it.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Kerangka pemuat untuk daftar kartu/baris. */
export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('grid gap-2', className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: kerangka statis
        <div key={i} className="bg-card flex items-center gap-3 rounded-xl border p-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Kerangka kartu ringkasan. */
export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: kerangka statis
        <div key={i} className="bg-card grid gap-2 rounded-2xl border p-4">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-1.5 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Satu baris bilah horizontal: label, bilah proporsional, dan nilai. */
export function BarRow({
  label,
  sub,
  value,
  max,
  display,
  tone = 'amber',
}: {
  label: React.ReactNode;
  sub?: React.ReactNode;
  value: number;
  max: number;
  display: React.ReactNode;
  tone?: Tone;
}) {
  const pct = max > 0 ? Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <li className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium">
          {label}
          {sub && <span className="text-muted-foreground ml-1.5 text-xs font-normal">{sub}</span>}
        </span>
        <span className="shrink-0 tabular-nums">{display}</span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden="true">
        <div
          className={cn('h-full rounded-full transition-[width] duration-700', TONES[tone].bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </li>
  );
}

/**
 * Grafik kolom SVG ringan: satu kolom per titik, tinggi proporsional. Teks bantu untuk pembaca layar
 * lewat `ariaLabel`; nilai tiap kolom tampil sebagai <title> (tooltip).
 */
export function ColumnChart({
  points,
  ariaLabel,
  tone = 'amber',
}: {
  points: { label: string; value: number; title: string }[];
  ariaLabel: string;
  tone?: Tone;
}) {
  const W = 600;
  const H = 150;
  const max = Math.max(1, ...points.map((p) => p.value));
  const n = Math.max(1, points.length);
  const slot = W / n;
  const bar = Math.min(36, slot * 0.64);
  const fill = {
    amber: 'fill-amber-500',
    emerald: 'fill-emerald-500',
    sky: 'fill-sky-500',
    rose: 'fill-rose-500',
    teal: 'fill-teal-500',
    violet: 'fill-violet-500',
    slate: 'fill-slate-500',
  }[tone];
  const step = Math.ceil(n / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label={ariaLabel} className="h-auto w-full">
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line
          key={g}
          x1={0}
          x2={W}
          y1={H - H * g}
          y2={H - H * g}
          className="stroke-border"
          strokeDasharray="3 4"
        />
      ))}
      <line x1={0} x2={W} y1={H} y2={H} className="stroke-border" />
      {points.map((p, i) => {
        const h = Math.max(p.value > 0 ? 3 : 0, (p.value / max) * (H - 8));
        const x = i * slot + (slot - bar) / 2;
        return (
          <g key={p.label}>
            <rect
              x={x}
              y={H - h}
              width={bar}
              height={h}
              rx={4}
              className={cn(fill, 'opacity-90 hover:opacity-100')}
            >
              <title>{p.title}</title>
            </rect>
            {i % step === 0 && (
              <text
                x={x + bar / 2}
                y={H + 15}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: 11 }}
              >
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
