'use client';

import { MoreHorizontal, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * Pendukung tampilan halaman Data Induk: menu aksi titik-tiga, daftar responsif (tabel di layar lebar,
 * kartu bertumpuk di layar sempit), pemuat kerangka, pencarian, dan konfirmasi hapus.
 */

/** Animasi masuk ringan yang hormat pada prefers-reduced-motion. */
export const REVEAL =
  'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300';

export interface MenuAction {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Sisipkan garis pemisah sebelum item ini. */
  separated?: boolean;
}

/** Menu aksi baris dengan label teks yang jelas; menggantikan deretan tombol ikon. */
export function RowMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button size="icon-sm" variant="ghost" aria-label={label} title={label} />}
        onClick={(e) => e.stopPropagation()}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 min-w-48">
        {actions.map((a) => (
          <Fragment key={a.label}>
            {a.separated && <DropdownMenuSeparator />}
            <DropdownMenuItem
              variant={a.destructive ? 'destructive' : 'default'}
              disabled={a.disabled}
              onClick={(e) => {
                e.stopPropagation();
                a.onSelect();
              }}
            >
              {a.icon && <a.icon className="size-4" />}
              {a.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Kolom yang disembunyikan pada kartu layar sempit (mis. bila sudah tampil di judul kartu). */
  hideOnCard?: boolean;
}

/**
 * Daftar responsif. Kolom pertama menjadi judul kartu di layar sempit; kolom lain tampil sebagai
 * pasangan label dan nilai. `actions` dirender di kolom paling kanan (biasanya RowMenu).
 */
export function DataRows<T>({
  rows,
  rowKey,
  columns,
  actions,
  actionsHeader,
  onRowClick,
}: {
  rows: T[];
  rowKey: (row: T) => string;
  columns: Column<T>[];
  actions?: (row: T) => React.ReactNode;
  actionsHeader: string;
  onRowClick?: (row: T) => void;
}) {
  const [first, ...rest] = columns;
  return (
    <div className={cn('bg-card overflow-hidden rounded-2xl border', REVEAL)}>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={cn('text-xs font-semibold tracking-wide uppercase', c.className)}
                >
                  {c.header}
                </TableHead>
              ))}
              {actions && (
                <TableHead className="w-12">
                  <span className="sr-only">{actionsHeader}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={rowKey(r)}
                className={cn('transition-colors', onRowClick && 'cursor-pointer')}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
              >
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.className}>
                    {c.cell(r)}
                  </TableCell>
                ))}
                {actions && (
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {actions(r)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} className="p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">{first?.cell(r)}</div>
              {actions && <div className="-mt-1 -mr-1 shrink-0">{actions(r)}</div>}
            </div>
            {rest.some((c) => !c.hideOnCard) && (
              <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                {rest
                  .filter((c) => !c.hideOnCard)
                  .map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-muted-foreground text-[11px] font-medium uppercase">{c.header}</dt>
                      <dd className="mt-0.5 truncate">{c.cell(r)}</dd>
                    </div>
                  ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Kerangka pemuat yang mirip bentuk akhir: deretan kartu ringkasan lalu baris daftar. */
export function ListSkeleton({ rows = 6, stats = 0 }: { rows?: number; stats?: number }) {
  return (
    <div className="grid gap-4" aria-hidden>
      {stats > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: stats }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: kerangka statis
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      )}
      <div className="bg-card overflow-hidden rounded-2xl border">
        {Array.from({ length: rows }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: kerangka statis
          <div key={i} className="flex items-center gap-3 border-b p-3.5 last:border-b-0">
            <Skeleton className="size-7 rounded-full" />
            <div className="grid flex-1 gap-1.5">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/5" />
            </div>
            <Skeleton className="hidden h-5 w-16 rounded-full sm:block" />
            <Skeleton className="size-7 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Kolom pencarian dengan ikon kaca pembesar, untuk dipakai di dalam Toolbar. */
export function SearchBox({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const tm = useTranslations('masterData');
  return (
    <div className={cn('relative w-full sm:w-72', className)}>
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        aria-label={tm('search')}
        className="pl-8"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Konfirmasi hapus bersama. `target` null berarti tertutup. */
export function ConfirmDelete({
  name,
  onClose,
  onConfirm,
  pending,
}: {
  /** Nama data yang akan dihapus; null menutup dialog. */
  name: string | null;
  onClose: () => void;
  onConfirm: () => Promise<unknown>;
  pending?: boolean;
}) {
  const tm = useTranslations('masterData');
  const tc = useTranslations('common');
  return (
    <ConfirmDialog
      open={name !== null}
      onOpenChange={(o) => !o && onClose()}
      title={tm('deleteTitle', { name: name ?? '' })}
      description={tm('deleteBody')}
      confirmLabel={tc('confirmDelete')}
      destructive
      pending={pending}
      onConfirm={onConfirm}
    />
  );
}

/** Kode atau nomor bergaya mono ringan. */
export function MonoText({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground font-mono text-xs tracking-tight">{children}</span>;
}
