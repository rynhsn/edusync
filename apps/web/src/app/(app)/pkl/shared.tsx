'use client';

import type { PklPlacementStatus, Predicate } from '@edusync/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';
import { avatarTone, initials } from './lib';

export const STATUS_ORDER: PklPlacementStatus[] = ['planned', 'active', 'completed', 'cancelled'];

/** Warna per status: chip, titik, garis atas kartu, dan latar lembut kolom kanban (terang dan gelap). */
export const STATUS_STYLE: Record<
  PklPlacementStatus,
  { chip: string; dot: string; bar: string; column: string; head: string }
> = {
  planned: {
    chip: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
    dot: 'bg-sky-500',
    bar: 'bg-sky-500',
    column: 'bg-sky-50/70 dark:bg-sky-500/[0.06]',
    head: 'text-sky-800 dark:text-sky-200',
  },
  active: {
    chip: 'bg-orange-100 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200',
    dot: 'bg-orange-500',
    bar: 'bg-orange-500',
    column: 'bg-orange-50/70 dark:bg-orange-500/[0.06]',
    head: 'text-orange-900 dark:text-orange-200',
  },
  completed: {
    chip: 'bg-teal-100 text-teal-900 dark:bg-teal-500/20 dark:text-teal-200',
    dot: 'bg-teal-600',
    bar: 'bg-teal-600',
    column: 'bg-teal-50/70 dark:bg-teal-500/[0.06]',
    head: 'text-teal-900 dark:text-teal-200',
  },
  cancelled: {
    chip: 'bg-slate-200 text-slate-700 dark:bg-slate-500/25 dark:text-slate-200',
    dot: 'bg-slate-400',
    bar: 'bg-slate-400',
    column: 'bg-slate-100/70 dark:bg-slate-500/[0.07]',
    head: 'text-slate-700 dark:text-slate-300',
  },
};

export const PREDICATE_STYLE: Record<Predicate, string> = {
  A: 'bg-teal-600 text-white dark:bg-teal-500 dark:text-teal-950',
  B: 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950',
  C: 'bg-amber-500 text-amber-950 dark:bg-amber-400',
  D: 'bg-rose-600 text-white dark:bg-rose-500 dark:text-rose-950',
};

export interface PklPlacement {
  id: string;
  periodId: string;
  periodName: string;
  studentId: string;
  studentName: string;
  className: string | null;
  partnerId: string;
  partnerName: string;
  supervisorTeacherId: string | null;
  supervisorName: string | null;
  industrySupervisorName: string | null;
  industrySupervisorPhone: string | null;
  status: PklPlacementStatus;
  journalCount: number;
  lastJournalDate: string | null;
  finalScore: number | null;
  predicate: Predicate | null;
  hasAccessLink: boolean;
  canWrite: boolean;
}

/** Kunci query PKL satu sekolah; `invalidateQueries({ queryKey: pklKey(id) })` menyegarkan semuanya. */
export const pklKey = (schoolId: string, ...rest: unknown[]) => ['pkl', schoolId, ...rest];

/** Lencana status berwarna dengan titik penanda. */
export function StatusChip({ status, className }: { status: PklPlacementStatus; className?: string }) {
  const t = useTranslations('pkl');
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

/** Nilai akhir dengan predikat berwarna; "belum dinilai" bila kosong. */
export function ScoreBadge({
  score,
  predicate,
  className,
}: {
  score: number | null;
  predicate: Predicate | null;
  className?: string;
}) {
  const t = useTranslations('pkl');
  if (score === null || predicate === null) {
    return <span className={cn('text-muted-foreground text-xs', className)}>{t('unscored')}</span>;
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-flex size-5 items-center justify-center rounded-md text-[11px] font-bold',
          PREDICATE_STYLE[predicate],
        )}
        title={t(`predicate.${predicate}`)}
      >
        {predicate}
      </span>
      <span className="text-sm font-semibold tabular-nums">{score}</span>
    </span>
  );
}

/** Avatar inisial berwarna stabil menurut nama. */
export function PersonAvatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'font-heading inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        size === 'sm' && 'size-7 text-[11px]',
        size === 'md' && 'size-9 text-xs',
        size === 'lg' && 'size-14 text-lg',
        avatarTone(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Daftar periode PKL (terbaru dahulu). */
export function usePklPeriods() {
  const { school } = useSchool();
  return useQuery({
    queryKey: pklKey(school.schoolId, 'periods'),
    queryFn: async () =>
      unwrap(await api.GET('/v1/pkl/periods', { params: { header: schoolHeader(school.schoolId) } })),
  });
}

/** Daftar mitra PKL. */
export function usePklPartners() {
  const { school } = useSchool();
  return useQuery({
    queryKey: pklKey(school.schoolId, 'partners'),
    queryFn: async () =>
      unwrap(await api.GET('/v1/pkl/partners', { params: { header: schoolHeader(school.schoolId) } })),
  });
}

/** Rupa tanggal tampil ringkas ("12 Okt") dari TTTT-BB-HH. */
export function shortDate(locale: string, iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale === 'su' ? 'id' : locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
