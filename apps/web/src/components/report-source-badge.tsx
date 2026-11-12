import { BadgeCheck } from 'lucide-react';
import { ToneBadge } from '@/components/ui-kit';

/**
 * Lencana "angka ini diambil dari rapor yang sudah terbit". Teksnya dari pemanggil (rekap guru dan portal wali
 * memakai bahasa yang berbeda); penjelasan lengkap ditulis terlihat di dekatnya, bukan di tooltip, supaya terbaca di ponsel.
 */
export function ReportSourceBadge({ label, className }: { label: string; className?: string }) {
  return (
    <ToneBadge tone="sky" dot={false} {...(className ? { className } : {})}>
      <BadgeCheck aria-hidden className="size-3" />
      {label}
    </ToneBadge>
  );
}
