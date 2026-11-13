'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, FileText, Gavel, MoveRight, School } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { type Tone, ToneBadge } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { formatCalendarDate } from '@/lib/format-date';
import { normalizeReason, yearEvents } from '@/lib/transfer';
import { STATUS_KEY } from './student-fields';

const STATUS_TONE = { active: 'emerald', graduated: 'sky', transferred: 'amber', dropped: 'slate' } as const;
const DECISION_TONE = { promote: 'emerald', retain: 'amber', graduate: 'sky' } as const satisfies Record<
  string,
  Tone
>;

/** Satu baris linimasa: ikon di rel kiri, isi di kanan. */
function Row({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="bg-muted text-muted-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </li>
  );
}

/** Linimasa akademik murid: tahun ajaran, kelas, perpindahan kelas, keputusan akhir tahun, rapor, dan mutasi. */
export function StudentHistory({ studentId, name }: { studentId: string; name: string }) {
  const t = useTranslations('studentHistory');
  const ts = useTranslations('students');
  const tt = useTranslations('transfers');
  const locale = useLocale() as Locale;
  const { school } = useSchool();
  const show = (iso: string) => formatCalendarDate(locale, iso);
  const q = useQuery({
    queryKey: ['student-history', school.schoolId, studentId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/students/{id}/academic-history', {
          params: { header: schoolHeader(school.schoolId), path: { id: studentId } },
        }),
      ),
  });

  if (q.isPending) {
    return (
      <div className="grid gap-3" aria-hidden>
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('loadError')}</AlertDescription>
      </Alert>
    );
  }
  const data = q.data;
  const hasTransfers = data.years.some((y) => y.transfers.length > 0);
  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">{t('intro', { name })}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('statusNow')}</span>
        <ToneBadge tone={STATUS_TONE[data.status]}>{ts(STATUS_KEY[data.status])}</ToneBadge>
      </div>

      {data.years.length === 0 && <p className="text-muted-foreground text-sm">{t('empty')}</p>}

      <ol className="grid gap-3">
        {data.years.map((y) => {
          const events = yearEvents(y);
          return (
            <li key={y.academicYearId} className="bg-card rounded-xl border p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-heading text-sm font-semibold">{y.academicYearName}</h3>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {show(y.startsOn)} – {show(y.endsOn)}
                </span>
              </div>
              <ul className="mt-3 grid gap-3">
                <Row icon={School}>
                  <span className="text-muted-foreground">{t('classNow')}: </span>
                  {y.class ? (
                    <span className="font-medium">{y.class.name}</span>
                  ) : (
                    <span className="text-muted-foreground">{t('noClass')}</span>
                  )}
                </Row>
                {events.map((e) =>
                  e.type === 'classChange' ? (
                    <Row
                      key={`c-${e.date}-${e.item.toClassId ?? 'none'}-${e.item.fromClassId ?? 'none'}`}
                      icon={MoveRight}
                    >
                      <p>
                        {t('classChange', {
                          from: e.item.fromClassName ?? t('noClassName'),
                          to: e.item.toClassName ?? t('noClassName'),
                        })}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {show(e.date)}
                        {e.item.reason ? ` · ${t('reasonLine', { reason: e.item.reason })}` : ''}
                      </p>
                    </Row>
                  ) : (
                    <Row key={`t-${e.item.id}`} icon={ArrowRightLeft}>
                      <p className="font-medium">
                        {e.item.direction === 'in'
                          ? t('transferIn')
                          : e.item.kind === 'dropped'
                            ? t('transferDropped')
                            : t('transferOut')}
                        {e.item.counterpartSchoolName
                          ? ' ' +
                            t(e.item.direction === 'in' ? 'fromSchool' : 'toSchool', {
                              school: e.item.counterpartSchoolName,
                            })
                          : ''}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {show(e.date)} · {tt(`reasons.${normalizeReason(e.item.reason)}`)}
                      </p>
                    </Row>
                  ),
                )}
                {y.decision && (
                  <Row icon={Gavel}>
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">{t('decisionTitle')}</span>
                      <ToneBadge tone={DECISION_TONE[y.decision.decision]}>
                        {t(`decision.${y.decision.decision}`)}
                      </ToneBadge>
                      {y.decision.toClassName && (
                        <span>{t('toClass', { name: y.decision.toClassName })}</span>
                      )}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {y.decision.applied ? t('applied') : t('notApplied')}
                      {y.decision.reason ? ` · ${y.decision.reason}` : ''}
                    </p>
                  </Row>
                )}
                {y.reports.length > 0 && (
                  <Row icon={FileText}>
                    <p className="text-muted-foreground mb-1">{t('reportsTitle')}</p>
                    <ul className="grid gap-1">
                      {y.reports.map((r) => (
                        <li key={r.semesterId} className="flex flex-wrap items-center gap-2">
                          <span>
                            {t('reportLine', { semester: r.semesterName, class: r.className ?? '-' })}
                          </span>
                          <ToneBadge tone={r.status === 'final' ? 'emerald' : 'slate'}>
                            {r.status === 'final' ? t('reportFinal') : t('reportDraft')}
                          </ToneBadge>
                        </li>
                      ))}
                    </ul>
                  </Row>
                )}
              </ul>
            </li>
          );
        })}
      </ol>

      {hasTransfers && (
        <Link href="/transfers" className="text-primary text-sm underline underline-offset-4">
          {t('openTransfers')}
        </Link>
      )}
    </div>
  );
}
