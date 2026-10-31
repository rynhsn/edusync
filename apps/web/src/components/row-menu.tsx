'use client';

import type { LucideIcon } from 'lucide-react';
import { MoreHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface RowMenuItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * Menu titik-tiga untuk aksi baris/kartu: tiap aksi punya teks (bukan hanya ikon) dan tombol pembukanya ber-aria-label.
 * Aksi merusak dipisahkan garis dan berwarna merah; konfirmasinya (ConfirmDialog terkendali) dirender oleh pemanggil.
 */
export function RowMenu({
  items,
  label,
  className,
}: {
  items: RowMenuItem[];
  /** Nama tombol pembuka untuk pembaca layar, mis. "Aksi untuk Budi". */
  label?: string;
  className?: string;
}) {
  const t = useTranslations('common');
  const normal = items.filter((i) => !i.destructive);
  const danger = items.filter((i) => i.destructive);
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={label ?? t('moreActions')}
            className={className}
          />
        }
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {normal.map((i) => (
          <DropdownMenuItem key={i.key} disabled={i.disabled} onClick={i.onSelect}>
            {i.icon && <i.icon />}
            {i.label}
          </DropdownMenuItem>
        ))}
        {normal.length > 0 && danger.length > 0 && <DropdownMenuSeparator />}
        {danger.map((i) => (
          <DropdownMenuItem key={i.key} variant="destructive" disabled={i.disabled} onClick={i.onSelect}>
            {i.icon && <i.icon />}
            {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
