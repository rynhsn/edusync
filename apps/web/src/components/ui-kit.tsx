import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Kit tampilan bersama untuk halaman modul: warna aksen per modul, kartu ringkasan, avatar inisial,
 * lencana bernada, dan keadaan kosong. Pakai ini daripada membuat gaya sendiri agar semua layar seirama.
 */

export type Tone = 'teal' | 'sky' | 'violet' | 'amber' | 'rose' | 'emerald' | 'slate';

export const TONES: Record<Tone, { soft: string; solid: string; text: string; ring: string; bar: string }> = {
  teal: {
    soft: 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200',
    solid: 'bg-teal-600 text-white dark:bg-teal-500 dark:text-teal-950',
    text: 'text-teal-700 dark:text-teal-300',
    ring: 'ring-teal-500/25',
    bar: 'bg-teal-500',
  },
  sky: {
    soft: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200',
    solid: 'bg-sky-600 text-white dark:bg-sky-500 dark:text-sky-950',
    text: 'text-sky-700 dark:text-sky-300',
    ring: 'ring-sky-500/25',
    bar: 'bg-sky-500',
  },
  violet: {
    soft: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200',
    solid: 'bg-violet-600 text-white dark:bg-violet-500 dark:text-violet-950',
    text: 'text-violet-700 dark:text-violet-300',
    ring: 'ring-violet-500/25',
    bar: 'bg-violet-500',
  },
  amber: {
    soft: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200',
    solid: 'bg-amber-500 text-amber-950 dark:bg-amber-400',
    text: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-500/25',
    bar: 'bg-amber-500',
  },
  rose: {
    soft: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200',
    solid: 'bg-rose-600 text-white dark:bg-rose-500 dark:text-rose-950',
    text: 'text-rose-700 dark:text-rose-300',
    ring: 'ring-rose-500/25',
    bar: 'bg-rose-500',
  },
  emerald: {
    soft: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200',
    solid: 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950',
    text: 'text-emerald-700 dark:text-emerald-300',
    ring: 'ring-emerald-500/25',
    bar: 'bg-emerald-500',
  },
  slate: {
    soft: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200',
    solid: 'bg-slate-600 text-white dark:bg-slate-500 dark:text-slate-950',
    text: 'text-slate-600 dark:text-slate-300',
    ring: 'ring-slate-500/25',
    bar: 'bg-slate-500',
  },
};

/** Warna aksen tiap kelompok modul (dipakai ikon kepala halaman dan kartu ringkasan). */
export const MODULE_TONE = {
  master: 'teal',
  attendance: 'sky',
  academic: 'violet',
  finance: 'amber',
  access: 'slate',
} as const satisfies Record<string, Tone>;

/** Kotak ikon bernada. */
export function IconTile({
  icon: Icon,
  tone = 'teal',
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn('grid size-11 shrink-0 place-items-center rounded-xl', TONES[tone].soft, className)}
    >
      <Icon className="size-5" />
    </span>
  );
}

/**
 * Kartu ringkasan angka: ikon bernada, angka besar, keterangan, dan (opsional) catatan kecil atau bilah progres.
 * `onClick`/`href` tidak ada di sini; bungkus dengan tombol bila perlu menjadi saringan.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'teal',
  progress,
  active,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  /** 0..100 */
  progress?: number;
  active?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-card relative overflow-hidden rounded-2xl border p-4 transition-colors',
        active && cn('ring-2', TONES[tone].ring),
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
          <p className="font-heading mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        </div>
        {Icon && (
          <span
            aria-hidden
            className={cn('grid size-9 shrink-0 place-items-center rounded-lg', TONES[tone].soft)}
          >
            <Icon className="size-4" />
          </span>
        )}
      </div>
      {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
      {progress !== undefined && (
        <div className="bg-muted mt-3 h-1.5 overflow-hidden rounded-full">
          <div
            className={cn('h-full rounded-full transition-[width] duration-500', TONES[tone].bar)}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** Deretan kartu ringkasan yang rapi di semua lebar layar. */
export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>{children}</div>;
}

const AVATAR_TONES: Tone[] = ['teal', 'sky', 'violet', 'amber', 'rose', 'emerald'];

function hashName(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/** Avatar inisial dengan warna yang stabil menurut nama. */
export function UserAvatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const tone = AVATAR_TONES[hashName(name) % AVATAR_TONES.length] ?? 'teal';
  return (
    <span
      aria-hidden
      className={cn(
        'font-heading inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        size === 'sm' && 'size-7 text-[11px]',
        size === 'md' && 'size-9 text-xs',
        size === 'lg' && 'size-14 text-lg',
        TONES[tone].soft,
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/** Sel nama orang: avatar, nama, dan baris keterangan kecil. */
export function PersonCell({
  name,
  sub,
  className,
}: {
  name: string;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <UserAvatar name={name} size="sm" />
      <div className="min-w-0">
        <p className="truncate font-medium">{name}</p>
        {sub && <p className="text-muted-foreground truncate text-xs">{sub}</p>}
      </div>
    </div>
  );
}

/** Lencana status bernada dengan titik berwarna. */
export function ToneBadge({
  tone = 'slate',
  children,
  dot = true,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone].soft,
        className,
      )}
    >
      {dot && <span aria-hidden className={cn('size-1.5 rounded-full', TONES[tone].bar)} />}
      {children}
    </span>
  );
}

/** Keadaan kosong yang hangat: ikon bernada, judul, penjelasan, dan ajakan bertindak. */
export function EmptyPanel({
  icon: Icon,
  tone = 'teal',
  title,
  body,
  action,
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  title: React.ReactNode;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-card flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      <IconTile icon={Icon} tone={tone} className="size-14 rounded-2xl [&_svg]:size-6" />
      <p className="font-heading mt-2 font-semibold">{title}</p>
      {body && <p className="text-muted-foreground max-w-sm text-sm">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Bilah alat di atas tabel: pencarian dan saringan di kiri, keterangan jumlah di kanan. */
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-card flex flex-wrap items-center gap-2 rounded-2xl border p-2.5', className)}>
      {children}
    </div>
  );
}
