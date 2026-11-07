'use client';

import { useTranslations } from 'next-intl';
import { ToneBadge } from '@/components/ui-kit';
import { badgeText, PRIORITY_TONE, STATUS_TONE, type TicketPriority, type TicketStatus } from '@/lib/support';
import { cn } from '@/lib/utils';

/** Lencana status laporan; `platform` memakai teks sisi staf (mis. "Menunggu pelapor"). */
export function StatusBadge({ status, platform = false }: { status: TicketStatus; platform?: boolean }) {
  const t = useTranslations(platform ? 'platformSupport.status' : 'support.status');
  return <ToneBadge tone={STATUS_TONE[status]}>{t(status)}</ToneBadge>;
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const t = useTranslations('support.priority');
  return (
    <ToneBadge tone={PRIORITY_TONE[priority]} dot={false}>
      {t(priority)}
    </ToneBadge>
  );
}

/** Lencana jumlah merah di menu; tidak tampil bila nol. `label` dibaca pembaca layar (mis. "3 balasan baru"). */
export function CountBadge({
  count,
  label,
  className,
}: {
  count: number;
  label: string;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'bg-destructive inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-5 font-semibold text-white tabular-nums',
        className,
      )}
    >
      {badgeText(count)}
    </span>
  );
}
