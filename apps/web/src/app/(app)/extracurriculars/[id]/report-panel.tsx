'use client';

import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { buildExport, saveBlob } from '@/lib/sheet';
import { ATT_STATUSES, monthStartIso, todayIso } from '../shared';

export function ReportPanel({ id }: { id: string }) {
  const t = useTranslations('extracurricular');
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const valid = !!from && !!to && from <= to;

  const report = useQuery({
    queryKey: ['extracurricular-report', school.schoolId, id, from, to],
    enabled: valid,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/extracurriculars/{id}/report', {
          params: { ...header, path: { id }, query: { from, to } },
        }),
      ),
  });

  async function exportExcel() {
    const data = report.data;
    if (!data || data.students.length === 0) return void toast.info(t('exportEmpty'));
    const blob = await buildExport(
      'Ekskul',
      ['Nama', 'NIS', ...ATT_STATUSES.map((s) => t(s)), 'Tercatat', 'Pertemuan'],
      data.students.map((m) => [
        m.name,
        m.nis,
        ...ATT_STATUSES.map((s) => m[s]),
        m.sessions,
        data.totalSessions,
      ]),
      { textColumns: [2], widths: [30, 16, 10, 10, 10, 10, 10, 12] },
    );
    saveBlob(blob, `ekskul-${school.schoolSlug}-${from}_${to}.xlsx`);
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <DatePicker aria-label={t('from')} value={from} onChange={(v) => v && setFrom(v)} />
          </div>
          <span className="text-muted-foreground text-sm">–</span>
          <div className="w-44">
            <DatePicker aria-label={t('to')} value={to} onChange={(v) => v && setTo(v)} />
          </div>
        </div>
        <Button variant="outline" disabled={!report.data} onClick={exportExcel}>
          <Download className="size-4" /> {t('exportExcel')}
        </Button>
      </div>
      {!valid && (
        <Alert variant="destructive">
          <AlertDescription>{t('invalidRange')}</AlertDescription>
        </Alert>
      )}
      {valid && report.isPending && <Skeleton className="h-40 w-full" />}
      {report.data && (
        <>
          <p className="text-muted-foreground text-sm">
            {t('totalSessions', { count: report.data.totalSessions })}
          </p>
          {report.data.students.length === 0 ? (
            <Card className="text-muted-foreground p-10 text-center text-sm">{t('noMembers')}</Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('student')}</TableHead>
                    {ATT_STATUSES.map((s) => (
                      <TableHead key={s} className="text-right">
                        {t(s)}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">{t('recorded')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.data.students.map((m) => (
                    <TableRow key={m.studentId}>
                      <TableCell>
                        <div className="font-medium">{m.name}</div>
                        {m.nis && <div className="text-muted-foreground font-mono text-xs">{m.nis}</div>}
                      </TableCell>
                      {ATT_STATUSES.map((s) => (
                        <TableCell key={s} className="text-right tabular-nums">
                          {m[s]}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums">{m.sessions}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
