'use client';

import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { buildExport, saveBlob } from '@/lib/sheet';

interface Props {
  semesterId: string;
  classId: string;
  subjectId: string;
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`font-heading text-3xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '-' : String(n));

/** Rekap nilai satu mata pelajaran: rata-rata per komponen, nilai akhir berbobot, predikat, dan penanda di bawah KKM. */
export function RecapPanel({ semesterId, classId, subjectId }: Props) {
  const t = useTranslations('grades');
  const te = useTranslations();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };

  const recap = useQuery({
    queryKey: ['grading-recap', school.schoolId, semesterId, classId, subjectId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/grading/recap', {
          params: { ...header, query: { semesterId, classId, subjectId } },
        }),
      ),
  });

  const data = recap.data;

  async function exportExcel() {
    if (!data || data.students.length === 0) return void toast.info(t('exportEmpty'));
    const blob = await buildExport(
      t('recapSheet'),
      [
        t('student'),
        t('nis'),
        ...data.components.map((c) => `${c.name} (${c.weight}%)`),
        t('finalScore'),
        t('predicate'),
      ],
      data.students.map((s) => [
        s.name,
        s.nis,
        ...data.components.map((c) => s.perComponent.find((p) => p.componentId === c.id)?.average ?? null),
        s.final,
        s.predicate,
      ]),
      { textColumns: [2], widths: [30, 16, ...data.components.map(() => 16), 14, 10] },
    );
    saveBlob(blob, `rekap-nilai-${school.schoolSlug}.xlsx`);
  }

  if (recap.isPending) return <Skeleton className="h-48 w-full" />;
  if (!data)
    return (
      <Alert variant="destructive">
        <AlertDescription>{te(errorKey(recap.error))}</AlertDescription>
      </Alert>
    );
  const { stats } = data;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{t('kkmInfo', { kkm: data.settings.kkm })}</p>
        <Button variant="outline" disabled={data.students.length === 0} onClick={exportExcel}>
          <Download className="size-4" /> {t('exportExcel')}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label={t('average')} value={fmt(stats.average)} />
        <Stat label={t('highest')} value={fmt(stats.max)} tone="text-emerald-600" />
        <Stat label={t('lowest')} value={fmt(stats.min)} />
        <Stat
          label={t('belowKkm')}
          value={stats.belowKkmCount}
          tone={stats.belowKkmCount > 0 ? 'text-red-600' : ''}
        />
        <Stat label={t('filledStudents')} value={`${stats.filled}/${data.students.length}`} />
      </div>
      {data.students.length === 0 ? (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('noStudents')}</Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>{t('student')}</TableHead>
                {data.components.map((c) => (
                  <TableHead key={c.id} className="text-right">
                    {c.name} <span className="text-muted-foreground font-normal">({c.weight}%)</span>
                  </TableHead>
                ))}
                <TableHead className="border-l text-right">{t('finalScore')}</TableHead>
                <TableHead>{t('predicate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.students.map((s, i) => (
                <TableRow key={s.studentId}>
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{s.name}</div>
                    {s.nis && <div className="text-muted-foreground font-mono text-xs">{s.nis}</div>}
                  </TableCell>
                  {data.components.map((c) => (
                    <TableCell key={c.id} className="text-right tabular-nums">
                      {fmt(s.perComponent.find((p) => p.componentId === c.id)?.average)}
                    </TableCell>
                  ))}
                  <TableCell
                    className={`border-l text-right font-semibold tabular-nums ${s.belowKkm ? 'text-red-600' : ''}`}
                  >
                    {fmt(s.final)}
                  </TableCell>
                  <TableCell className="space-x-1">
                    {s.predicate && <Badge variant="secondary">{s.predicate}</Badge>}
                    {s.belowKkm && (
                      <Badge className="border-0 bg-red-600/15 text-red-700 dark:text-red-300">
                        {t('belowKkmBadge')}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
