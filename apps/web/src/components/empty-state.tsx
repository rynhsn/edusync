'use client';

import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { type PrerequisiteKind, PrerequisiteList } from '@/components/prerequisite-notice';
import { Card } from '@/components/ui/card';
import { IconTile, type Tone } from '@/components/ui-kit';
import { cn } from '@/lib/utils';

interface Props {
  icon: LucideIcon;
  tone?: Tone;
  /** Apa yang kosong, mis. "Belum ada kelas". */
  title: ReactNode;
  /** Satu kalimat: halaman ini untuk apa. */
  body?: ReactNode;
  /** Langkah pertama yang disarankan, satu kalimat. */
  first?: ReactNode;
  /** Data yang harus ada lebih dulu (belum ada). Tautannya hanya tampil bagi yang berhak membuatnya. */
  needs?: PrerequisiteKind[];
  /** Tombol utama (mis. tombol Tambah). Hanya dirender bila `canAct`. */
  action?: ReactNode;
  /** Pengguna boleh membuat data di halaman ini. Bila false: tampil penjelasan "hubungi admin", tanpa tombol mati. */
  canAct?: boolean;
  className?: string;
}

/**
 * Keadaan kosong bersama untuk halaman daftar: apa ini, apa yang perlu disiapkan dulu, apa yang dilakukan
 * pertama, dan tombol utamanya. Tanpa izin membuat, pengguna hanya melihat penjelasan agar tidak ada tombol mati.
 */
export function EmptyState({
  icon,
  tone = 'teal',
  title,
  body,
  first,
  needs = [],
  action,
  canAct = true,
  className,
}: Props) {
  const t = useTranslations('emptyState');
  return (
    <Card
      className={cn(
        'items-center gap-2 border border-dashed px-6 py-10 text-center ring-0 sm:py-12 [--card-spacing:--spacing(6)]',
        className,
      )}
    >
      <IconTile icon={icon} tone={tone} className="size-14 rounded-2xl [&_svg]:size-6" />
      <h2 className="font-heading mt-2 font-semibold">{title}</h2>
      {body && <p className="text-muted-foreground max-w-md text-sm text-pretty">{body}</p>}
      {needs.length > 0 && (
        <div className="bg-muted/50 mt-2 w-full max-w-md rounded-lg p-3 text-left text-sm">
          <p className="text-muted-foreground mb-1 text-xs font-medium">{t('needsFirst')}</p>
          <PrerequisiteList missing={needs} />
        </div>
      )}
      {canAct && first && (
        <p className="mt-1 max-w-md text-sm text-pretty">
          <span className="font-medium">{t('firstStep')}</span> {first}
        </p>
      )}
      {canAct && action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
      {!canAct && needs.length === 0 && (
        <p className="text-muted-foreground mt-1 max-w-md text-sm text-pretty">{t('askAdmin')}</p>
      )}
    </Card>
  );
}
