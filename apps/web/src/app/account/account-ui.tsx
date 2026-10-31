'use client';

import { useTranslations } from 'next-intl';
import { type Tone, ToneBadge } from '@/components/ui-kit';
import { cn } from '@/lib/utils';
import type { AccountFoundation } from './account-context';

type Sub = NonNullable<AccountFoundation['subscription']>;

const DAY = 86_400_000;

export const STATUS_KEY = {
  active: 'statusActive',
  past_due: 'statusPastDue',
  suspended: 'statusSuspended',
  canceled: 'statusCanceled',
  pending_payment: 'statusPending',
} as const;

export const STATUS_TONE: Record<Sub['status'], Tone> = {
  active: 'emerald',
  past_due: 'amber',
  suspended: 'rose',
  canceled: 'slate',
  pending_payment: 'sky',
};

export function SubscriptionBadge({ status }: { status: Sub['status'] }) {
  const t = useTranslations('account');
  return <ToneBadge tone={STATUS_TONE[status]}>{t(STATUS_KEY[status])}</ToneBadge>;
}

/** Sisa hari dan persen periode yang sudah berjalan. */
export function periodStats(sub: Sub, now = Date.now()) {
  const start = new Date(sub.currentPeriodStart).getTime();
  const end = new Date(sub.currentPeriodEnd).getTime();
  const total = Math.max(1, end - start);
  return {
    daysLeft: Math.ceil((end - now) / DAY),
    percent: Math.max(0, Math.min(100, ((now - start) / total) * 100)),
  };
}

/** Bilah progres periode langganan dengan sisa hari. */
export function PeriodBar({ sub, className }: { sub: Sub; className?: string }) {
  const t = useTranslations('account');
  const { daysLeft, percent } = periodStats(sub);
  const late = daysLeft < 0;
  const soon = !late && daysLeft <= 7;
  return (
    <div className={cn('grid gap-1.5', className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-label={t('periodProgress')}
        className="bg-muted h-2 overflow-hidden rounded-full"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none',
            late ? 'bg-rose-500' : soon ? 'bg-amber-500' : 'bg-emerald-500',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className={cn('text-xs', late ? 'text-rose-600 dark:text-rose-300' : 'text-muted-foreground')}>
        {late ? t('daysOverdue', { days: Math.abs(daysLeft) }) : t('daysLeft', { days: daysLeft })}
      </p>
    </div>
  );
}

export const INVOICE_STATUS_KEY = {
  open: 'invoiceOpen',
  paid: 'invoicePaid',
  expired: 'invoiceExpired',
  void: 'invoiceVoid',
} as const;

export const INVOICE_STATUS_TONE: Record<keyof typeof INVOICE_STATUS_KEY, Tone> = {
  open: 'amber',
  paid: 'emerald',
  expired: 'slate',
  void: 'slate',
};

export const INVOICE_KIND_KEY = {
  registration: 'kindRegistration',
  renewal: 'kindRenewal',
  upgrade: 'kindUpgrade',
  new_unit: 'kindNewUnit',
} as const;
