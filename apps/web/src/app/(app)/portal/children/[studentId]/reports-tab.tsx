'use client';

import { Download, ScrollText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/i18n/config';
import { formatCalendarDate } from '@/lib/format-date';
import {
  PORTAL_PATHS,
  type PortalReportCardItem,
  type PortalReportCards,
  type PortalReportDocument,
  portalRequest,
} from '@/lib/portal-api';
import { downloadReportCardPdf } from '../../../report-cards/pdf/download';
import { usePortalDetail } from '../../queries';
import { EmptyState } from '../../ui-bits';
import { TabState } from './tab-state';

export function ReportsTab({ studentId }: { studentId: string }) {
  const t = useTranslations('portal');
  const locale = useLocale() as Locale;
  const { school } = useSchool();
  const q = usePortalDetail<PortalReportCards>(
    studentId,
    'report-cards',
    PORTAL_PATHS.reportCards(studentId),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const data = q.data;

  async function download(r: PortalReportCardItem) {
    setBusy(r.semesterId);
    try {
      const doc = await portalRequest<PortalReportDocument>(
        'GET',
        PORTAL_PATHS.reportCard(studentId, r.semesterId),
        { schoolId: school.schoolId },
      );
      await downloadReportCardPdf(doc);
    } catch {
      toast.error(t('reportError'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3">
      <TabState query={q} available={data?.available ?? true} />
      {data?.available && data.items.length === 0 && (
        <EmptyState title={t('reportsEmptyTitle')} body={t('reportsEmptyBody')} />
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {data?.items.map((r) => (
          <li
            key={r.semesterId}
            className="bg-card relative grid gap-3 overflow-hidden rounded-2xl border p-4"
          >
            <span aria-hidden className="bg-primary/8 absolute -top-6 -right-6 size-20 rounded-full" />
            <div className="flex items-center gap-3">
              <span className="bg-accent text-accent-foreground grid size-10 shrink-0 place-items-center rounded-xl">
                <ScrollText className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="font-heading truncate font-semibold">{r.semesterName}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {r.academicYear} · {r.className}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-muted/50 rounded-xl py-2">
                <dd className="font-heading text-lg leading-none font-semibold tabular-nums">
                  {r.average === null ? '–' : Math.round(r.average * 10) / 10}
                </dd>
                <dt className="text-muted-foreground mt-0.5 text-[11px]">{t('average')}</dt>
              </div>
              <div className="bg-muted/50 rounded-xl py-2">
                <dd className="font-heading text-lg leading-none font-semibold tabular-nums">
                  {r.subjectsGraded}/{r.subjectsTotal}
                </dd>
                <dt className="text-muted-foreground mt-0.5 text-[11px]">{t('subjectsGraded')}</dt>
              </div>
            </dl>
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs">
                {r.finalizedAt &&
                  t('publishedOn', { date: formatCalendarDate(locale, r.finalizedAt.slice(0, 10)) })}
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === r.semesterId}
                onClick={() => download(r)}
              >
                <Download className="size-3.5" aria-hidden /> {t('downloadReport')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
