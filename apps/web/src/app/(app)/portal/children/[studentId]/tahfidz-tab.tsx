'use client';

import { BookHeart, Flame, Repeat2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/config';
import { formatCalendarDate } from '@/lib/format-date';
import { PORTAL_PATHS, type PortalTahfidz } from '@/lib/portal-api';
import { cn } from '@/lib/utils';
import { formatRange } from '../../../tahfidz/shared';
import { usePortalDetail } from '../../queries';
import { EmptyState, Ring } from '../../ui-bits';
import { TabState } from './tab-state';

export function TahfidzTab({ studentId }: { studentId: string }) {
  const t = useTranslations('portal');
  const locale = useLocale() as Locale;
  const q = usePortalDetail<PortalTahfidz>(studentId, 'tahfidz', PORTAL_PATHS.tahfidz(studentId));
  const d = q.data;
  const target = d?.semester.percentOfTarget ?? null;

  return (
    <div className="grid gap-3">
      <TabState query={q} available={d?.available ?? true} />
      {d?.available && d.recentEntries.length === 0 && d.coverage.ayahs === 0 && (
        <EmptyState title={t('tahfidzEmptyTitle')} body={t('tahfidzEmptyBody')} />
      )}
      {d?.available && (d.recentEntries.length > 0 || d.coverage.ayahs > 0) && (
        <>
          <div className="from-chart-1/15 to-chart-2/15 flex items-center gap-4 rounded-2xl bg-gradient-to-br p-4">
            <Ring
              percentage={target ?? d.coverage.percent}
              tone="good"
              size={84}
              label={t('tahfidzProgressAria', { percent: Math.round(target ?? d.coverage.percent) })}
            />
            <div className="grid flex-1 grid-cols-3 gap-2 text-center">
              <div>
                <p className="font-heading text-xl leading-none font-semibold tabular-nums">
                  {d.coverage.ayahs}
                </p>
                <p className="text-muted-foreground mt-1 text-[11px]">{t('ayahsMemorized')}</p>
              </div>
              <div>
                <p className="font-heading text-xl leading-none font-semibold tabular-nums">
                  {d.coverage.juzComplete}
                </p>
                <p className="text-muted-foreground mt-1 text-[11px]">{t('juzComplete')}</p>
              </div>
              <div>
                <p className="font-heading flex items-center justify-center gap-1 text-xl leading-none font-semibold tabular-nums">
                  <Flame className="text-chart-3 size-4" aria-hidden />
                  {d.streakDays}
                </p>
                <p className="text-muted-foreground mt-1 text-[11px]">{t('streakDays')}</p>
              </div>
            </div>
          </div>
          {d.halaqah && <p className="text-muted-foreground text-sm">{t('halaqah', { name: d.halaqah })}</p>}
          <ol className="grid gap-2">
            {d.recentEntries.map((r) => (
              <li
                key={`${r.date}-${r.kind}-${r.surahFrom}-${r.ayahFrom}`}
                className="bg-card flex items-center gap-3 rounded-2xl border p-3"
              >
                <span
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-xl',
                    r.kind === 'ziyadah' ? 'bg-chart-5/20' : 'bg-chart-4/15',
                  )}
                >
                  {r.kind === 'ziyadah' ? (
                    <BookHeart className="size-4" aria-hidden />
                  ) : (
                    <Repeat2 className="size-4" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{formatRange(r)}</p>
                  <p className="text-muted-foreground text-xs">
                    {t(`tahfidzKind.${r.kind}`)} · {formatCalendarDate(locale, r.date)}
                  </p>
                </div>
                <span className="bg-muted rounded-full px-2.5 py-0.5 text-xs font-semibold">
                  {t(`quality.${r.quality}`)}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
