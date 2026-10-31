import type { LucideIcon } from 'lucide-react';
import { IconTile, type Tone } from '@/components/ui-kit';
import { cn } from '@/lib/utils';

/**
 * Kepala halaman yang seragam: judul dan penjelasan di kiri, tombol aksi (tambah, impor, ekspor) di kanan.
 * Nama sekolah tidak diulang di sini karena sudah ada di pemilih sekolah pada menu samping.
 */
export function PageHeader({
  title,
  description,
  actions,
  icon,
  tone,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Ikon bernada di kiri judul (warna aksen modul). */
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-x-6 gap-y-3', className)}>
      <div className="flex min-w-0 items-start gap-3.5">
        {icon && <IconTile icon={icon} tone={tone} />}
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Pembungkus isi halaman: jarak antar-bagian yang konsisten. */
export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid w-full content-start gap-6', className)}>{children}</div>;
}
