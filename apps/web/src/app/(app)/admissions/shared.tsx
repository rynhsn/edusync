import type { AdmissionStatus } from '@edusync/contracts';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export const STATUS_ORDER: AdmissionStatus[] = [
  'submitted',
  'verified',
  'accepted',
  'rejected',
  'enrolled',
  'withdrawn',
];

/** Warna per status: tetap terbaca di mode terang dan gelap. */
export const STATUS_STYLE: Record<AdmissionStatus, { chip: string; dot: string; bar: string }> = {
  submitted: {
    chip: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
    dot: 'bg-sky-500',
    bar: 'bg-sky-500',
  },
  verified: {
    chip: 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500',
  },
  accepted: {
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
  },
  rejected: {
    chip: 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200',
    dot: 'bg-rose-500',
    bar: 'bg-rose-500',
  },
  enrolled: {
    chip: 'bg-teal-100 text-teal-900 dark:bg-teal-500/20 dark:text-teal-200',
    dot: 'bg-teal-600',
    bar: 'bg-teal-600',
  },
  withdrawn: {
    chip: 'bg-slate-200 text-slate-700 dark:bg-slate-500/25 dark:text-slate-200',
    dot: 'bg-slate-400',
    bar: 'bg-slate-400',
  },
};

/** Lencana status berwarna dengan titik penanda. */
export function StatusChip({ status, className }: { status: AdmissionStatus; className?: string }) {
  const t = useTranslations('admissions');
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap',
        STATUS_STYLE[status].chip,
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', STATUS_STYLE[status].dot)} />
      {t(`status.${status}`)}
    </span>
  );
}

export const sizeLabel = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/** Waktu tampil ringkas (tanggal dan jam) dalam bahasa aktif. */
export function formatDateTime(locale: string, iso: string) {
  return new Intl.DateTimeFormat(locale === 'su' ? 'id' : locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}
