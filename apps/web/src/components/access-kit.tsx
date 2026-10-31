'use client';

import { MoreHorizontal } from 'lucide-react';
import { Fragment } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TONES, type Tone } from '@/components/ui-kit';
import { cn } from '@/lib/utils';

/**
 * Pendukung tampilan modul Pengguna & Akses dan Kehadiran: menu aksi titik-tiga, cincin persentase,
 * warna peran, dan animasi masuk bertahap (hormat pada prefers-reduced-motion).
 */

/** Animasi masuk ringan. Pasangkan dengan `stagger(i)` untuk daftar. */
export const ENTER =
  'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 motion-safe:fill-mode-backwards';

export function stagger(index: number): React.CSSProperties {
  return { animationDelay: `${Math.min(index, 12) * 35}ms` };
}

export interface ActionItem {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

/** Menu aksi baris/kartu: tiap aksi bertuliskan teks, tombol pembukanya ber-aria-label. Aksi merusak dipisah dan merah. */
export function ActionMenu({ label, items }: { label: string; items: ActionItem[] }) {
  if (items.length === 0) return null;
  const normal = items.filter((i) => !i.destructive);
  const danger = items.filter((i) => i.destructive);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button size="icon-sm" variant="ghost" aria-label={label} title={label} />}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 min-w-48">
        {normal.map((i) => (
          <DropdownMenuItem key={i.label} disabled={i.disabled} onClick={i.onSelect}>
            {i.icon && <i.icon className="size-4" />}
            {i.label}
          </DropdownMenuItem>
        ))}
        {normal.length > 0 && danger.length > 0 && <DropdownMenuSeparator />}
        {danger.map((i) => (
          <Fragment key={i.label}>
            <DropdownMenuItem variant="destructive" disabled={i.disabled} onClick={i.onSelect}>
              {i.icon && <i.icon className="size-4" />}
              {i.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Cincin persentase SVG. `children` tampil di tengah (mis. angka persen). */
export function ProgressRing({
  value,
  size = 72,
  stroke = 7,
  tone = 'emerald',
  className,
  children,
}: {
  /** 0..100 */
  value: number;
  size?: number;
  stroke?: number;
  tone?: Tone;
  className?: string;
  children?: React.ReactNode;
}) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className={cn('relative grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          className={cn('transition-[stroke-dashoffset] duration-700', RING_STROKE[tone])}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

const RING_STROKE: Record<Tone, string> = {
  teal: 'stroke-teal-500',
  sky: 'stroke-sky-500',
  violet: 'stroke-violet-500',
  amber: 'stroke-amber-500',
  rose: 'stroke-rose-500',
  emerald: 'stroke-emerald-500',
  slate: 'stroke-slate-500',
};

/** Nada tiap peran bawaan; peran kustom memakai slate. */
export const ROLE_TONE: Record<string, Tone> = {
  school_admin: 'violet',
  principal: 'sky',
  curriculum: 'teal',
  treasurer: 'amber',
  operator: 'slate',
  teacher: 'emerald',
  guardian: 'rose',
  student: 'sky',
};
export const roleTone = (key: string): Tone => ROLE_TONE[key] ?? 'slate';

/** Warna tiap status kehadiran harian/jam (konsisten di rekap, gerbang, dan lembar jam). */
export const STATUS_TONE = {
  present: 'emerald',
  late: 'amber',
  excused: 'sky',
  sick: 'violet',
  absent: 'rose',
  notYet: 'slate',
} as const satisfies Record<string, Tone>;

/** Sel angka berwarna: nol diredupkan, lebih dari nol diberi nada. */
export function CountCell({ value, tone }: { value: number; tone: Tone }) {
  if (value === 0) return <span className="text-muted-foreground/60 tabular-nums">0</span>;
  return (
    <span
      className={cn(
        'inline-flex min-w-7 justify-center rounded-md px-1.5 py-0.5 text-sm font-medium tabular-nums',
        TONES[tone].soft,
      )}
    >
      {value}
    </span>
  );
}
