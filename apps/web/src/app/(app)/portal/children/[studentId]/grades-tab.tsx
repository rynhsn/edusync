'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { SelectField } from '@/components/ui/select-field';
import type { Locale } from '@/i18n/config';
import { formatCalendarDate } from '@/lib/format-date';
import { PORTAL_PATHS, type PortalGrades } from '@/lib/portal-api';
import { cn } from '@/lib/utils';
import { gradeTone } from '../../logic';
import { usePortalDetail } from '../../queries';
import { EmptyState, TONE_DOT } from '../../ui-bits';
import { TabState } from './tab-state';

export function GradesTab({ studentId }: { studentId: string }) {
  const t = useTranslations('portal');
  const locale = useLocale() as Locale;
  const [semesterId, setSemesterId] = useState('');
  const q = usePortalDetail<PortalGrades>(
    studentId,
    'grades',
    PORTAL_PATHS.grades(studentId, semesterId || undefined),
    [semesterId],
  );
  const data = q.data;

  return (
    <div className="grid gap-3">
      {data && data.semesters.length > 1 && (
        <SelectField
          aria-label={t('semester')}
          value={semesterId || data.semester?.id || ''}
          onChange={(e) => setSemesterId(e.target.value)}
          className="max-w-xs"
        >
          {data.semesters.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.academicYear}
            </option>
          ))}
        </SelectField>
      )}
      <TabState query={q} available={data?.available ?? true} />
      {data?.available && data.subjects.length === 0 && (
        <EmptyState title={t('gradesEmptyTitle')} body={t('gradesEmptyBody')} />
      )}
      {data?.available && data.subjects.length > 0 && (
        <>
          {data.average !== null && (
            <div className="from-primary/12 to-chart-2/15 flex items-center justify-between rounded-2xl bg-gradient-to-br p-4">
              <p className="text-muted-foreground text-sm">{t('average')}</p>
              <p className="font-heading text-3xl leading-none font-semibold tabular-nums">
                {Math.round(data.average * 10) / 10}
              </p>
            </div>
          )}
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.subjects.map((s) => {
              const tone = gradeTone(s.final, data.kkm);
              const width = s.final === null ? 0 : Math.min(100, Math.max(0, s.final));
              return (
                <li key={s.subjectId} className="bg-card grid gap-3 rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-heading truncate font-semibold">{s.name}</p>
                      {s.components.length > 0 && (
                        <p className="text-muted-foreground text-xs">
                          {s.components
                            .map((c) => `${c.name} ${c.average === null ? '–' : Math.round(c.average)}`)
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-heading text-2xl leading-none font-semibold tabular-nums">
                        {s.final === null ? '–' : Math.round(s.final * 10) / 10}
                      </p>
                      {s.predicate && <p className="text-muted-foreground mt-1 text-xs">{s.predicate}</p>}
                    </div>
                  </div>
                  <div
                    className="bg-muted relative h-2 overflow-hidden rounded-full"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(width)}
                    aria-label={s.name}
                  >
                    <span
                      className={cn(
                        'absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 motion-reduce:transition-none',
                        TONE_DOT[tone],
                      )}
                      style={{ width: `${width}%` }}
                    />
                    {data.kkm !== null && (
                      <span
                        aria-hidden
                        className="bg-foreground/50 absolute inset-y-0 w-0.5"
                        style={{ left: `${data.kkm}%` }}
                      />
                    )}
                  </div>
                  {s.belowKkm && <p className="text-chart-3 text-xs font-medium">{t('belowKkm')}</p>}
                </li>
              );
            })}
          </ul>
          {data.recentScores.length > 0 && (
            <section className="grid gap-2" aria-labelledby="portal-recent">
              <h3 id="portal-recent" className="font-heading font-semibold">
                {t('recentScores')}
              </h3>
              <ul className="bg-card divide-y rounded-2xl border">
                {data.recentScores.slice(0, 8).map((r) => (
                  <li
                    key={`${r.subject}-${r.title}-${r.date}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.title}</span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {r.subject} · {formatCalendarDate(locale, r.date)}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">
                      {r.value}/{r.maxScore}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
