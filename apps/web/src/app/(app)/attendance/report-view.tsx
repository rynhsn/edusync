'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, FileText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { buildExport, saveBlob } from '@/lib/sheet';

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAY_MS = 86_400_000;

const DAY_KEYS = ['present', 'late', 'excused', 'sick', 'absent', 'notRecorded'] as const;
const LESSON_KEYS = ['present', 'excused', 'sick', 'absent'] as const;

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4" title={hint}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`font-heading text-3xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

/** Rekap absensi: hari gerbang, jam pelajaran, dan bolos kelas per siswa dalam rentang tanggal, dengan ekspor. */
export function ReportView() {
  const t = useTranslations('attendance');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };

  const today = isoOf(new Date());
  const [classId, setClassId] = useState('');
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [generating, setGenerating] = useState(false);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const activeYear = years.data?.find((y) => y.isActive);
  const classes = useQuery({
    queryKey: ['classes', school.schoolId, activeYear?.id],
    enabled: !!activeYear && can('class:read'),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: activeYear?.id } } }),
      ),
  });
  const classList = classes.data ?? [];

  const rangeValid =
    !!from &&
    !!to &&
    from <= to &&
    Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) <= 366 * DAY_MS;
  const report = useQuery({
    queryKey: ['attendance-report', school.schoolId, classId, from, to],
    enabled: rangeValid,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/attendance/report', {
          params: { ...header, query: { ...(classId ? { classId } : {}), from, to } },
        }),
      ),
  });

  const data = report.data;
  const rows = data?.students ?? [];
  const dayLabel = (k: (typeof DAY_KEYS)[number]) => t(k);
  const lessonLabel = (k: (typeof LESSON_KEYS)[number]) => t(k);
  const range = (a: string, b: string) =>
    `${formatCalendarDate(locale, a)} – ${formatCalendarDate(locale, b)}`;

  async function exportExcel() {
    if (!data || rows.length === 0) return void toast.info(t('exportEmpty'));
    const blob = await buildExport(
      t('title'),
      [
        t('student'),
        t('nis'),
        t('class'),
        t('effectiveDays'),
        ...DAY_KEYS.map((k) => `${t('gateGroup')}: ${dayLabel(k)}`),
        ...LESSON_KEYS.map((k) => `${t('lessonGroup')}: ${lessonLabel(k)}`),
        t('skipped'),
      ],
      rows.map((r) => [
        r.name,
        r.nis,
        r.className,
        r.effectiveDays,
        ...DAY_KEYS.map((k) => r.days[k]),
        ...LESSON_KEYS.map((k) => r.lessons[k]),
        r.skipped,
      ]),
      {
        textColumns: [2],
        widths: [30, 16, 10, 12, ...DAY_KEYS.map(() => 16), ...LESSON_KEYS.map(() => 16), 14],
      },
    );
    saveBlob(blob, `rekap-absensi-${school.schoolSlug}-${from}_${to}.xlsx`);
  }

  async function exportPdf() {
    if (!data || rows.length === 0) return void toast.info(t('exportEmpty'));
    setGenerating(true);
    try {
      const [{ pdf }, { ReportPdf }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./report-pdf'),
      ]);
      const doc = (
        <ReportPdf
          schoolName={school.schoolName}
          effectiveDays={data.effectiveDays}
          pageTemplate={t('page', { page: '{page}', total: '{total}' })}
          labels={{
            title: t('pdfTitle'),
            period: t('period', {
              from: formatCalendarDate(locale, from),
              to: formatCalendarDate(locale, to),
            }),
            generated: t('generated', { date: formatCalendarDate(locale, today) }),
            effectiveDays: t('effectiveDays'),
            students: t('studentsCount'),
            skipped: t('skipped'),
            gateGroup: t('gateGroup'),
            lessonGroup: t('lessonGroup'),
            student: t('student'),
            className: t('class'),
            totalRow: t('totalRow'),
            dayColumns: DAY_KEYS.map(dayLabel),
            lessonColumns: LESSON_KEYS.map(lessonLabel),
          }}
          rows={rows.map((r) => ({
            name: r.name,
            nis: r.nis,
            className: r.className,
            days: DAY_KEYS.map((k) => r.days[k]),
            lessons: LESSON_KEYS.map((k) => r.lessons[k]),
            skipped: r.skipped,
          }))}
          totals={{
            days: DAY_KEYS.map((k) => data.summary.days[k]),
            lessons: LESSON_KEYS.map((k) => data.summary.lessons[k]),
            skipped: data.summary.skipped,
          }}
        />
      );
      saveBlob(await pdf(doc).toBlob(), `rekap-absensi-${school.schoolSlug}-${from}_${to}.pdf`);
    } catch {
      toast.error(t('pdfError'));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <>
            <Button variant="outline" disabled={rows.length === 0} onClick={exportExcel}>
              <Download className="size-4" /> {t('exportExcel')}
            </Button>
            <Button variant="outline" disabled={rows.length === 0 || generating} onClick={exportPdf}>
              <FileText className="size-4" /> {t('exportPdf')}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SelectField
          aria-label={t('class')}
          className="sm:w-52"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          <option value="">{t('allClasses')}</option>
          {classList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <div className="sm:w-52">
          <DatePicker aria-label={t('from')} value={from} onChange={(v) => v && setFrom(v)} />
        </div>
        <span className="text-muted-foreground text-sm">–</span>
        <div className="sm:w-52">
          <DatePicker aria-label={t('to')} value={to} onChange={(v) => v && setTo(v)} />
        </div>
      </div>

      {!rangeValid && (
        <Alert variant="destructive">
          <AlertDescription>{t('invalidRange')}</AlertDescription>
        </Alert>
      )}
      {report.error && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(report.error))}</AlertDescription>
        </Alert>
      )}
      {rangeValid && report.isPending && <Skeleton className="h-48 w-full" />}

      {data && (
        <>
          <p className="text-muted-foreground text-sm">{range(data.from, data.to)}</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Stat label={t('studentsCount')} value={data.summary.students} />
            <Stat label={t('effectiveDays')} value={data.effectiveDays} />
            <Stat
              label={`${t('present')} + ${t('late')}`}
              value={data.summary.days.present + data.summary.days.late}
              tone="text-emerald-600"
            />
            <Stat label={t('absent')} value={data.summary.days.absent} tone="text-red-600" />
            <Stat label={`${t('lessonGroup')}: ${t('absent')}`} value={data.summary.lessons.absent} />
            <Stat
              label={t('skipped')}
              value={data.summary.skipped}
              hint={t('skippedHint')}
              tone="text-red-600"
            />
          </div>

          {rows.length === 0 ? (
            <Card className="text-muted-foreground p-10 text-center text-sm">
              {!classes.isPending && classList.length === 0 ? t('noClasses') : t('noStudents')}
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="w-10 align-bottom">
                      #
                    </TableHead>
                    <TableHead rowSpan={2} className="align-bottom">
                      {t('student')}
                    </TableHead>
                    <TableHead rowSpan={2} className="align-bottom">
                      {t('class')}
                    </TableHead>
                    <TableHead colSpan={DAY_KEYS.length} className="border-l text-center">
                      {t('gateGroup')}
                    </TableHead>
                    <TableHead colSpan={LESSON_KEYS.length} className="border-l text-center">
                      {t('lessonGroup')}
                    </TableHead>
                    <TableHead
                      rowSpan={2}
                      className="border-l text-right align-bottom"
                      title={t('skippedHint')}
                    >
                      {t('skipped')}
                    </TableHead>
                  </TableRow>
                  <TableRow>
                    {DAY_KEYS.map((k, i) => (
                      <TableHead key={`d-${k}`} className={`text-right ${i === 0 ? 'border-l' : ''}`}>
                        {dayLabel(k)}
                      </TableHead>
                    ))}
                    {LESSON_KEYS.map((k, i) => (
                      <TableHead key={`l-${k}`} className={`text-right ${i === 0 ? 'border-l' : ''}`}>
                        {lessonLabel(k)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={r.studentId}>
                      <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                      <TableCell>
                        <div className="font-medium">{r.name}</div>
                        {r.nis && <div className="text-muted-foreground font-mono text-xs">{r.nis}</div>}
                      </TableCell>
                      <TableCell>{r.className}</TableCell>
                      {DAY_KEYS.map((k, j) => (
                        <TableCell
                          key={`d-${k}`}
                          className={`text-right tabular-nums ${j === 0 ? 'border-l' : ''}`}
                        >
                          {r.days[k]}
                        </TableCell>
                      ))}
                      {LESSON_KEYS.map((k, j) => (
                        <TableCell
                          key={`l-${k}`}
                          className={`text-right tabular-nums ${j === 0 ? 'border-l' : ''}`}
                        >
                          {r.lessons[k]}
                        </TableCell>
                      ))}
                      <TableCell
                        className={`border-l text-right tabular-nums ${r.skipped > 0 ? 'font-semibold text-red-600' : ''}`}
                      >
                        {r.skipped}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-medium">
                    <TableCell />
                    <TableCell>{t('totalRow')}</TableCell>
                    <TableCell />
                    {DAY_KEYS.map((k, j) => (
                      <TableCell
                        key={`td-${k}`}
                        className={`text-right tabular-nums ${j === 0 ? 'border-l' : ''}`}
                      >
                        {data.summary.days[k]}
                      </TableCell>
                    ))}
                    {LESSON_KEYS.map((k, j) => (
                      <TableCell
                        key={`tl-${k}`}
                        className={`text-right tabular-nums ${j === 0 ? 'border-l' : ''}`}
                      >
                        {data.summary.lessons[k]}
                      </TableCell>
                    ))}
                    <TableCell className="border-l text-right tabular-nums">{data.summary.skipped}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </PageBody>
  );
}
