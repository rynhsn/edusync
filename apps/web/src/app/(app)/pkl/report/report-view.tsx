'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { buildExport, saveBlob } from '@/lib/sheet';
import { cn } from '@/lib/utils';
import { pklKey, ScoreBadge, StatusChip, usePklPeriods } from '../shared';

/** Rekap PKL per periode: tabel hasil dan ekspor Excel. */
export function ReportView({ initialPeriodId }: { initialPeriodId: string }) {
  const t = useTranslations('pkl');
  const tm = useTranslations('masterData');
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const periods = usePklPeriods();
  const [choice, setChoice] = useState(initialPeriodId);
  const periodId = choice || periods.data?.[0]?.id || '';
  const [exporting, setExporting] = useState(false);

  const report = useQuery({
    queryKey: pklKey(school.schoolId, 'report', periodId),
    enabled: !!periodId,
    queryFn: async () =>
      unwrap(await api.GET('/v1/pkl/periods/{id}/report', { params: { ...header, path: { id: periodId } } })),
  });
  const data = report.data;

  async function exportExcel() {
    if (!data || data.rows.length === 0) {
      toast.info(tm('exportEmpty'));
      return;
    }
    setExporting(true);
    try {
      const blob = await buildExport(
        t('exportSheet'),
        [
          t('student'),
          t('class'),
          t('partner'),
          t('statusLabel'),
          t('finalScore'),
          t('predicateLabel'),
          t('journalDays'),
          t('presentDays'),
          t('visits'),
        ],
        data.rows.map((r) => [
          r.studentName,
          r.className ?? '',
          r.partnerName,
          t(`status.${r.status}`),
          r.final,
          r.predicate ?? '',
          r.journalDays,
          r.presentDays,
          r.visits,
        ]),
        { widths: [28, 12, 28, 14, 12, 10, 14, 14, 12] },
      );
      saveBlob(
        blob,
        `rekap-pkl-${school.schoolSlug}-${data.period.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.xlsx`,
      );
    } catch {
      toast.error(tm('exportError'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <PageBody>
      <Link href="/pkl" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-fit')}>
        <ArrowLeft className="size-4" aria-hidden /> {t('backToBoard')}
      </Link>
      <PageHeader
        title={t('reportTitle')}
        description={t('reportSubtitle')}
        actions={
          <Button
            variant="outline"
            disabled={exporting || !data || data.rows.length === 0}
            onClick={exportExcel}
          >
            <Download className="size-4" aria-hidden /> {exporting ? tm('exporting') : tm('export')}
          </Button>
        }
      />
      <div className="w-full sm:w-72">
        <SelectField aria-label={t('period')} value={periodId} onChange={(e) => setChoice(e.target.value)}>
          {(periods.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>
      </div>

      {report.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['reportTotal', data.summary.total],
              ['reportScored', data.summary.scored],
              ['unscoredCount', data.summary.unscored],
              ['averageScore', data.summary.average ?? '-'],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="bg-card rounded-xl border p-3.5">
              <span className="text-muted-foreground block text-xs font-medium">{t(k)}</span>
              <span className="font-heading mt-0.5 block text-3xl font-semibold tabular-nums">{v}</span>
            </div>
          ))}
        </div>
      )}

      {report.isPending && periodId ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : data && data.rows.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">{t('noMatch')}</p>
      ) : data ? (
        <div className="bg-card overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('student')}</TableHead>
                <TableHead>{t('partner')}</TableHead>
                <TableHead>{t('statusLabel')}</TableHead>
                <TableHead className="text-right">{t('journalDays')}</TableHead>
                <TableHead className="text-right">{t('presentDays')}</TableHead>
                <TableHead className="text-right">{t('visits')}</TableHead>
                <TableHead className="text-right">{t('finalScore')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.placementId}>
                  <TableCell>
                    <Link href={`/pkl/placements/${r.placementId}`} className="font-medium hover:underline">
                      {r.studentName}
                    </Link>
                    <span className="text-muted-foreground block text-xs">{r.className ?? '-'}</span>
                  </TableCell>
                  <TableCell>{r.partnerName}</TableCell>
                  <TableCell>
                    <StatusChip status={r.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.journalDays}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.presentDays}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.visits}</TableCell>
                  <TableCell className="text-right">
                    <ScoreBadge score={r.final} predicate={r.predicate} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </PageBody>
  );
}
