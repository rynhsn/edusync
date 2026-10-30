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
import { formatRupiah } from '@/lib/money';
import { buildExport, saveBlob } from '@/lib/sheet';
import { buildArrearsRows, buildDailyRows, safeSheetName, sumArrears } from '../pdf/format';
import type { ArrearsReport, DailyReport } from '../pdf/types';
import { LateFeesPanel } from './late-fees-panel';

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAY_MS = 86_400_000;
const METHOD_KEY = { cash: 'methodCash', transfer: 'methodTransfer', other: 'methodOther' } as const;

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`font-heading text-2xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

/** Laporan keuangan: tunggakan per siswa dan kas harian, masing-masing dengan ekspor. */
export function ReportsView() {
  const t = useTranslations('financeReports');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const allowed = can('finance:read');

  const today = isoOf(new Date());
  const [tab, setTab] = useState<'arrears' | 'daily' | 'lateFees'>('arrears');
  const [yearChoice, setYearChoice] = useState('');
  const [classId, setClassId] = useState('');
  const [asOf, setAsOf] = useState(today);
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [generating, setGenerating] = useState(false);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    enabled: allowed,
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const yearList = years.data ?? [];
  const year = yearList.find((y) => y.id === yearChoice) ?? yearList.find((y) => y.isActive) ?? yearList[0];
  const yearId = year?.id ?? '';

  const classes = useQuery({
    queryKey: ['classes', school.schoolId, yearId],
    enabled: allowed && !!yearId && can('class:read'),
    queryFn: async () =>
      unwrap(await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: yearId } } })),
  });
  const classList = classes.data ?? [];

  const arrears = useQuery({
    queryKey: ['finance-arrears', school.schoolId, yearId, classId, asOf],
    enabled: allowed && tab === 'arrears' && !!yearId && !!asOf,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/finance/reports/arrears', {
          params: {
            ...header,
            query: { academicYearId: yearId, ...(classId ? { classId } : {}), asOf },
          },
        }),
      ) as ArrearsReport,
  });

  const rangeValid =
    !!from &&
    !!to &&
    from <= to &&
    Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) <= 366 * DAY_MS;
  const daily = useQuery({
    queryKey: ['finance-daily', school.schoolId, from, to],
    enabled: allowed && tab === 'daily' && rangeValid,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/finance/reports/daily', { params: { ...header, query: { from, to } } }),
      ) as DailyReport,
  });

  const methodLabel = (m: string) => (m in METHOD_KEY ? t(METHOD_KEY[m as keyof typeof METHOD_KEY]) : m);
  const money = (n: number) => formatRupiah(n);
  const date = (iso: string) => formatCalendarDate(locale, iso);

  const arrearsRows = arrears.data?.rows ?? [];
  const arrearsTotals = sumArrears(arrearsRows);
  const dailyData = daily.data;
  const scope = `${year?.name ?? ''} · ${classList.find((c) => c.id === classId)?.name ?? t('allClasses')}`;

  async function exportArrearsExcel() {
    if (arrearsRows.length === 0) return void toast.info(t('exportEmpty'));
    const blob = await buildExport(
      safeSheetName(t('tabArrears')),
      [
        '#',
        t('student'),
        t('nis'),
        t('class'),
        t('openInvoices'),
        t('outstanding'),
        t('overdue'),
        t('oldestDue'),
      ],
      buildArrearsRows(arrearsRows, t('totalRow')),
      { textColumns: [3], widths: [6, 30, 16, 12, 14, 18, 18, 18] },
    );
    saveBlob(blob, `tunggakan-${school.schoolSlug}-${asOf}.xlsx`);
  }

  async function exportArrearsPdf() {
    if (arrearsRows.length === 0) return void toast.info(t('exportEmpty'));
    setGenerating(true);
    try {
      const [{ pdf }, { ArrearsPdf }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./arrears-pdf'),
      ]);
      const doc = (
        <ArrearsPdf
          schoolName={school.schoolName}
          scope={scope}
          asOf={asOf}
          generated={t('generated', { date: date(today) })}
          rows={arrearsRows}
          totals={arrearsTotals}
        />
      );
      saveBlob(await pdf(doc).toBlob(), `tunggakan-${school.schoolSlug}-${asOf}.pdf`);
    } catch {
      toast.error(t('pdfError'));
    } finally {
      setGenerating(false);
    }
  }

  async function exportDailyExcel() {
    if (!dailyData || dailyData.totals.receipts === 0) return void toast.info(t('exportEmpty'));
    const blob = await buildExport(
      safeSheetName(t('tabDaily')),
      [t('description'), t('receipts'), t('amount')],
      buildDailyRows(dailyData, {
        methodTitle: t('byMethod'),
        feeTypeTitle: t('byFeeType'),
        dayTitle: t('byDay'),
        total: t('totalRow'),
        method: methodLabel,
      }),
      { widths: [34, 14, 20] },
    );
    saveBlob(blob, `kas-harian-${school.schoolSlug}-${from}_${to}.xlsx`);
  }

  if (!allowed) {
    return (
      <PageBody>
        <PageHeader title={t('title')} description={t('subtitle')} />
        <Alert variant="destructive">
          <AlertDescription>{t('noPermission')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          tab === 'arrears' ? (
            <>
              <Button variant="outline" disabled={arrearsRows.length === 0} onClick={exportArrearsExcel}>
                <Download className="size-4" /> {t('exportExcel')}
              </Button>
              <Button
                variant="outline"
                disabled={arrearsRows.length === 0 || generating}
                onClick={exportArrearsPdf}
              >
                <FileText className="size-4" /> {t('exportPdf')}
              </Button>
            </>
          ) : tab === 'lateFees' ? null : (
            <Button
              variant="outline"
              disabled={!dailyData || dailyData.totals.receipts === 0}
              onClick={exportDailyExcel}
            >
              <Download className="size-4" /> {t('exportExcel')}
            </Button>
          )
        }
      />

      <div className="flex gap-2">
        {(['arrears', 'daily', 'lateFees'] as const).map((k) => (
          <Button
            key={k}
            variant={tab === k ? 'default' : 'outline'}
            aria-pressed={tab === k}
            onClick={() => setTab(k)}
          >
            {k === 'arrears' ? t('tabArrears') : k === 'daily' ? t('tabDaily') : t('tabLateFees')}
          </Button>
        ))}
      </div>

      {tab === 'lateFees' ? (
        <LateFeesPanel />
      ) : tab === 'arrears' ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <SelectField
              aria-label={t('academicYear')}
              className="sm:w-52"
              value={yearId}
              onChange={(e) => {
                setYearChoice(e.target.value);
                setClassId('');
              }}
            >
              {yearList.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </SelectField>
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
              <DatePicker aria-label={t('asOf')} value={asOf} onChange={(v) => v && setAsOf(v)} />
            </div>
          </div>

          {arrears.error && (
            <Alert variant="destructive">
              <AlertDescription>{te(errorKey(arrears.error))}</AlertDescription>
            </Alert>
          )}
          {arrears.isPending && !!yearId && <Skeleton className="h-48 w-full" />}

          {arrears.data && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label={t('studentsCount')} value={arrearsTotals.students} />
                <Stat label={t('openInvoices')} value={arrearsTotals.openInvoices} />
                <Stat label={t('outstanding')} value={money(arrearsTotals.outstanding)} />
                <Stat
                  label={t('overdue')}
                  value={money(arrearsTotals.overdueOutstanding)}
                  tone="text-red-600"
                />
              </div>
              {arrearsRows.length === 0 ? (
                <Card className="text-muted-foreground p-10 text-center text-sm">{t('noArrears')}</Card>
              ) : (
                <Card className="overflow-hidden p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>{t('student')}</TableHead>
                        <TableHead>{t('class')}</TableHead>
                        <TableHead className="text-right">{t('openInvoices')}</TableHead>
                        <TableHead className="text-right">{t('outstanding')}</TableHead>
                        <TableHead className="text-right">{t('overdue')}</TableHead>
                        <TableHead className="text-right">{t('oldestDue')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {arrearsRows.map((r, i) => (
                        <TableRow key={r.studentId}>
                          <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                          <TableCell>
                            <div className="font-medium">{r.name}</div>
                            {r.nis && <div className="text-muted-foreground font-mono text-xs">{r.nis}</div>}
                          </TableCell>
                          <TableCell>{r.className}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.openInvoices}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(r.outstanding)}</TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${r.overdueOutstanding > 0 ? 'font-semibold text-red-600' : ''}`}
                          >
                            {money(r.overdueOutstanding)}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.oldestDue ? date(r.oldestDue) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/40 font-medium">
                        <TableCell />
                        <TableCell>{t('totalRow')}</TableCell>
                        <TableCell />
                        <TableCell className="text-right tabular-nums">
                          {arrearsTotals.openInvoices}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(arrearsTotals.outstanding)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(arrearsTotals.overdueOutstanding)}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </Card>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
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
          {daily.error && (
            <Alert variant="destructive">
              <AlertDescription>{te(errorKey(daily.error))}</AlertDescription>
            </Alert>
          )}
          {rangeValid && daily.isPending && <Skeleton className="h-48 w-full" />}

          {dailyData && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label={t('receipts')} value={dailyData.totals.receipts} />
                <Stat
                  label={t('totalAmount')}
                  value={money(dailyData.totals.amount)}
                  tone="text-emerald-600"
                />
              </div>
              {dailyData.totals.receipts === 0 ? (
                <Card className="text-muted-foreground p-10 text-center text-sm">{t('noPayments')}</Card>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="overflow-hidden p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('byMethod')}</TableHead>
                          <TableHead className="text-right">{t('receipts')}</TableHead>
                          <TableHead className="text-right">{t('amount')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyData.byMethod.map((m) => (
                          <TableRow key={m.method}>
                            <TableCell>{methodLabel(m.method)}</TableCell>
                            <TableCell className="text-right tabular-nums">{m.receipts}</TableCell>
                            <TableCell className="text-right tabular-nums">{money(m.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                  <Card className="overflow-hidden p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('byFeeType')}</TableHead>
                          <TableHead className="text-right">{t('amount')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyData.byFeeType.map((f) => (
                          <TableRow key={f.feeTypeName}>
                            <TableCell>{f.feeTypeName}</TableCell>
                            <TableCell className="text-right tabular-nums">{money(f.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                  <Card className="overflow-hidden p-0 lg:col-span-2">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('byDay')}</TableHead>
                          <TableHead className="text-right">{t('receipts')}</TableHead>
                          <TableHead className="text-right">{t('amount')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyData.byDay.map((d) => (
                          <TableRow key={d.date}>
                            <TableCell>{date(d.date)}</TableCell>
                            <TableCell className="text-right tabular-nums">{d.receipts}</TableCell>
                            <TableCell className="text-right tabular-nums">{money(d.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                </div>
              )}
            </>
          )}
        </>
      )}
    </PageBody>
  );
}
