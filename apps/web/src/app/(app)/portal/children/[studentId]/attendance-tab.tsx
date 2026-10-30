'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/i18n/config';
import { type AttendanceStatus, PORTAL_PATHS, type PortalAttendance } from '@/lib/portal-api';
import { cn } from '@/lib/utils';
import {
  attendanceTone,
  buildMonthGrid,
  currentMonth,
  monthRange,
  shiftMonth,
  todayJakarta,
} from '../../logic';
import { usePortalDetail } from '../../queries';
import { Ring } from '../../ui-bits';
import { TabState } from './tab-state';

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present: 'bg-chart-5/25 text-foreground ring-chart-5/40',
  late: 'bg-chart-2/30 text-foreground ring-chart-2/50',
  excused: 'bg-chart-4/20 text-foreground ring-chart-4/40',
  sick: 'bg-chart-1/20 text-foreground ring-chart-1/40',
  absent: 'bg-chart-3/25 text-foreground ring-chart-3/50',
};
const STATUSES: AttendanceStatus[] = ['present', 'late', 'excused', 'sick', 'absent'];
// Hari Senin sampai Minggu (2026-11-02 adalah Senin) agar nama hari mengikuti bahasa.
const MONDAY = Date.UTC(2026, 10, 2);

function monthTitle(locale: Locale, month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  if (locale === 'su') {
    const names = [
      'Januari',
      'Pébruari',
      'Maret',
      'April',
      'Méi',
      'Juni',
      'Juli',
      'Agustus',
      'Séptémber',
      'Oktober',
      'Nopémber',
      'Désémber',
    ];
    return `${names[m - 1]} ${y}`;
  }
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export function AttendanceTab({ studentId }: { studentId: string }) {
  const t = useTranslations('portal');
  const locale = useLocale() as Locale;
  const nowMonth = currentMonth();
  const [month, setMonth] = useState(nowMonth);
  const range = monthRange(month);
  const q = usePortalDetail<PortalAttendance>(
    studentId,
    'attendance',
    PORTAL_PATHS.attendance(studentId, range.from, range.to),
    [month],
  );
  const today = todayJakarta();
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale === 'su' ? 'id' : locale, { weekday: 'narrow', timeZone: 'UTC' }).format(
      new Date(MONDAY + i * 86_400_000),
    ),
  );

  const s = q.data?.counts;
  const pct = q.data?.percent ?? null;
  const counts: Record<AttendanceStatus, number> = {
    present: s?.present ?? 0,
    late: s?.late ?? 0,
    excused: s?.excused ?? 0,
    sick: s?.sick ?? 0,
    absent: s?.absent ?? 0,
  };

  return (
    <div className="grid gap-4">
      <div className="bg-card flex items-center justify-between rounded-2xl border p-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('prevMonth')}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <p className="font-heading font-semibold capitalize" aria-live="polite">
          {monthTitle(locale, month)}
        </p>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('nextMonth')}
          disabled={month >= nowMonth}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <TabState query={q} available={q.data?.available ?? true} />

      {q.data?.available && (
        <>
          <div className="bg-card flex items-center gap-4 rounded-2xl border p-4">
            <Ring
              percentage={pct}
              tone={attendanceTone(pct)}
              size={84}
              label={pct === null ? t('attendanceNoData') : t('attendanceAria', { percent: Math.round(pct) })}
            />
            <dl className="grid flex-1 grid-cols-3 gap-x-3 gap-y-2 text-center">
              {STATUSES.map((st) => (
                <div key={st}>
                  <dd className="font-heading text-lg leading-none font-semibold tabular-nums">
                    {counts[st]}
                  </dd>
                  <dt className="text-muted-foreground mt-0.5 text-[11px]">{t(`status.${st}`)}</dt>
                </div>
              ))}
            </dl>
          </div>

          <div className="bg-card rounded-2xl border p-3 sm:p-4">
            <div
              className="text-muted-foreground mb-1 grid grid-cols-7 text-center text-xs font-medium"
              aria-hidden
            >
              {weekdays.map((d, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: hari tetap
                <span key={i} className="py-1">
                  {d}
                </span>
              ))}
            </div>
            <div className="grid gap-1">
              {buildMonthGrid(month, q.data.days).map((week, wi) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: pekan tetap
                <div key={wi} className="grid grid-cols-7 gap-1">
                  {week.map((cell, ci) =>
                    cell ? (
                      <div
                        key={cell.date}
                        title={cell.status ? t(`status.${cell.status}`) : undefined}
                        className={cn(
                          'grid aspect-square place-items-center rounded-xl text-sm tabular-nums ring-1 ring-inset ring-transparent',
                          cell.status
                            ? `${STATUS_STYLE[cell.status]} font-semibold`
                            : cell.weekend
                              ? 'text-muted-foreground/60'
                              : 'text-muted-foreground',
                          cell.date === today && 'ring-primary! ring-2',
                        )}
                      >
                        {cell.day}
                        {cell.status && <span className="sr-only">{t(`status.${cell.status}`)}</span>}
                      </div>
                    ) : (
                      // biome-ignore lint/suspicious/noArrayIndexKey: sel kosong tetap
                      <div key={`e${ci}`} />
                    ),
                  )}
                </div>
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-3 text-xs">
              {STATUSES.map((st) => (
                <li key={st} className="flex items-center gap-1.5">
                  <span aria-hidden className={cn('size-3 rounded-md ring-1 ring-inset', STATUS_STYLE[st])} />
                  {t(`status.${st}`)}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
