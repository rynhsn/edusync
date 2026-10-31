'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  CalendarDays,
  ChartColumn,
  CircleCheck,
  Download,
  FileText,
  Hourglass,
  ReceiptText,
  Users,
  Wallet,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { SelectField } from '@/components/ui/select-field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyPanel, MODULE_TONE, PersonCell, StatCard, StatGrid, Toolbar } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { formatRupiah } from '@/lib/money';
import { buildExport, saveBlob } from '@/lib/sheet';
import { buildArrearsRows, buildDailyRows, safeSheetName, sumArrears } from '../pdf/format';
import type { ArrearsReport, DailyReport } from '../pdf/types';
import { BarRow, ColumnChart, ENTER, ListSkeleton, Money, StatSkeleton } from '../ui';
import { LateFeesPanel } from './late-fees-panel';

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAY_MS = 86_400_000;
/** Nada batang per metode: kunci bawaan punya warna tetap, metode lain bergilir. */
const METHOD_TONES = ['emerald', 'sky', 'violet', 'amber', 'rose'] as const;
const methodTone = (key: string, index: number) =>
  key === 'cash'
    ? 'emerald'
    : key === 'transfer'
      ? 'sky'
      : key === 'other'
        ? 'violet'
        : METHOD_TONES[(index + 3) % 5]!;

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

  // Label metode datang dari pengaturan sekolah lewat laporan itu sendiri (kunci bila tak ada).
  const methodLabel = (m: string) => daily.data?.byMethod.find((x) => x.method === m)?.methodLabel ?? m;
  const money = (n: number) => formatRupiah(n);
  const date = (iso: string) => formatCalendarDate(locale, iso);

  const arrearsRows = arrears.data?.rows ?? [];
  const arrearsTotals = sumArrears(arrearsRows);
  const dailyData = daily.data;
  const avgPerDay =
    dailyData && dailyData.byDay.length > 0
      ? Math.round(dailyData.totals.amount / dailyData.byDay.length)
      : 0;
  const byClass = [
    ...arrearsRows
      .reduce((m, r) => {
        const cur = m.get(r.className) ?? { name: r.className, outstanding: 0, students: 0 };
        cur.outstanding += r.outstanding;
        cur.students += 1;
        return m.set(r.className, cur);
      }, new Map<string, { name: string; outstanding: number; students: number }>())
      .values(),
  ].sort((a, b) => b.outstanding - a.outstanding);
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
        <PageHeader
          icon={ChartColumn}
          tone={MODULE_TONE.finance}
          title={t('title')}
          description={t('subtitle')}
        />
        <Alert variant="destructive">
          <AlertDescription>{t('noPermission')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader
        icon={ChartColumn}
        tone={MODULE_TONE.finance}
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

      <div
        role="tablist"
        aria-label={t('title')}
        className="bg-muted inline-flex w-full max-w-full gap-1 overflow-x-auto rounded-xl p-1 sm:w-fit"
      >
        {(
          [
            ['arrears', Hourglass, t('tabArrears')],
            ['daily', Wallet, t('tabDaily')],
            ['lateFees', AlarmClock, t('tabLateFees')],
          ] as const
        ).map(([k, Icon, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`focus-visible:ring-ring/50 inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 sm:flex-none ${
              tab === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'lateFees' ? (
        <LateFeesPanel />
      ) : tab === 'arrears' ? (
        <>
          <Toolbar>
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
          </Toolbar>

          {arrears.error && (
            <Alert variant="destructive">
              <AlertDescription>{te(errorKey(arrears.error))}</AlertDescription>
            </Alert>
          )}
          {arrears.isPending && !!yearId && (
            <>
              <StatSkeleton />
              <ListSkeleton rows={4} />
            </>
          )}

          {arrears.data && (
            <div className={`grid gap-6 ${ENTER}`}>
              <StatGrid>
                <StatCard
                  label={t('studentsCount')}
                  value={arrearsTotals.students}
                  icon={Users}
                  tone="amber"
                />
                <StatCard
                  label={t('openInvoices')}
                  value={arrearsTotals.openInvoices}
                  icon={ReceiptText}
                  tone="sky"
                />
                <StatCard
                  label={t('outstanding')}
                  value={<Money value={arrearsTotals.outstanding} />}
                  icon={Hourglass}
                  tone="violet"
                />
                <StatCard
                  label={t('overdue')}
                  value={<Money value={arrearsTotals.overdueOutstanding} />}
                  icon={AlarmClock}
                  tone="rose"
                  progress={
                    arrearsTotals.outstanding > 0
                      ? Math.round((arrearsTotals.overdueOutstanding / arrearsTotals.outstanding) * 100)
                      : 0
                  }
                />
              </StatGrid>

              {arrearsRows.length === 0 ? (
                <EmptyPanel
                  icon={CircleCheck}
                  tone="emerald"
                  title={t('noArrears')}
                  body={t('noArrearsHint')}
                />
              ) : (
                <>
                  {byClass.length > 1 && (
                    <section className="bg-card grid gap-3 rounded-2xl border p-4 sm:p-5">
                      <h2 className="font-heading text-base font-semibold">{t('byClass')}</h2>
                      <ul className="grid gap-3">
                        {byClass.map((c) => (
                          <BarRow
                            key={c.name}
                            label={c.name}
                            sub={t('studentsN', { count: c.students })}
                            value={c.outstanding}
                            max={byClass[0]?.outstanding ?? 0}
                            display={money(c.outstanding)}
                            tone="amber"
                          />
                        ))}
                      </ul>
                    </section>
                  )}

                  <div className="bg-card hidden overflow-hidden rounded-2xl border md:block">
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
                              <PersonCell name={r.name} sub={r.nis} />
                            </TableCell>
                            <TableCell>{r.className}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.openInvoices}</TableCell>
                            <TableCell className="text-right">
                              <Money value={r.outstanding} />
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              <Money value={r.overdueOutstanding} negative />
                            </TableCell>
                            <TableCell className="text-muted-foreground text-right">
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
                          <TableCell className="text-right">
                            <Money value={arrearsTotals.outstanding} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Money value={arrearsTotals.overdueOutstanding} />
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  <ul className="grid gap-2 md:hidden">
                    {arrearsRows.map((r) => (
                      <li key={r.studentId} className="bg-card grid gap-3 rounded-xl border p-3">
                        <PersonCell name={r.name} sub={[r.nis, r.className].filter(Boolean).join(' · ')} />
                        <dl className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <dt className="text-muted-foreground">{t('openInvoices')}</dt>
                            <dd className="font-medium tabular-nums">{r.openInvoices}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">{t('outstanding')}</dt>
                            <dd className="font-medium">
                              <Money value={r.outstanding} />
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">{t('overdue')}</dt>
                            <dd className="font-semibold">
                              <Money value={r.overdueOutstanding} negative />
                            </dd>
                          </div>
                        </dl>
                        {r.oldestDue && (
                          <p className="text-muted-foreground text-xs">
                            {t('oldestDue')}: {date(r.oldestDue)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <Toolbar>
            <div className="sm:w-52">
              <DatePicker aria-label={t('from')} value={from} onChange={(v) => v && setFrom(v)} />
            </div>
            <span className="text-muted-foreground text-sm">–</span>
            <div className="sm:w-52">
              <DatePicker aria-label={t('to')} value={to} onChange={(v) => v && setTo(v)} />
            </div>
          </Toolbar>

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
          {rangeValid && daily.isPending && (
            <>
              <StatSkeleton />
              <ListSkeleton rows={3} />
            </>
          )}

          {dailyData && (
            <div className={`grid gap-6 ${ENTER}`}>
              <StatGrid>
                <StatCard
                  label={t('receipts')}
                  value={dailyData.totals.receipts}
                  icon={ReceiptText}
                  tone="sky"
                />
                <StatCard
                  label={t('totalAmount')}
                  value={<Money value={dailyData.totals.amount} />}
                  icon={Wallet}
                  tone="emerald"
                />
                <StatCard
                  label={t('avgPerDay')}
                  value={<Money value={avgPerDay} />}
                  icon={ChartColumn}
                  tone="amber"
                />
                <StatCard
                  label={t('activeDays')}
                  value={dailyData.byDay.length}
                  icon={CalendarDays}
                  tone="violet"
                />
              </StatGrid>
              {dailyData.totals.receipts === 0 ? (
                <EmptyPanel icon={Wallet} tone="amber" title={t('noPayments')} body={t('noPaymentsHint')} />
              ) : (
                <>
                  <section className="bg-card grid gap-3 rounded-2xl border p-4 sm:p-5">
                    <h2 className="font-heading text-base font-semibold">{t('byDay')}</h2>
                    <ColumnChart
                      tone="emerald"
                      ariaLabel={t('byDayChart')}
                      points={dailyData.byDay.map((d) => ({
                        label: date(d.date).replace(/,?\s\d{4}$/, ''),
                        value: d.amount,
                        title: `${date(d.date)}: ${money(d.amount)} (${d.receipts})`,
                      }))}
                    />
                  </section>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <section className="bg-card grid content-start gap-3 rounded-2xl border p-4 sm:p-5">
                      <h2 className="font-heading text-base font-semibold">{t('byMethod')}</h2>
                      <ul className="grid gap-3">
                        {dailyData.byMethod.map((m, mi) => (
                          <BarRow
                            key={m.method}
                            label={methodLabel(m.method)}
                            sub={t('receiptsN', { count: m.receipts })}
                            value={m.amount}
                            max={dailyData.totals.amount}
                            display={money(m.amount)}
                            tone={methodTone(m.method, mi)}
                          />
                        ))}
                      </ul>
                    </section>
                    <section className="bg-card grid content-start gap-3 rounded-2xl border p-4 sm:p-5">
                      <h2 className="font-heading text-base font-semibold">{t('byFeeType')}</h2>
                      <ul className="grid gap-3">
                        {dailyData.byFeeType.map((f) => (
                          <BarRow
                            key={f.feeTypeName}
                            label={f.feeTypeName}
                            value={f.amount}
                            max={dailyData.totals.amount}
                            display={money(f.amount)}
                            tone="amber"
                          />
                        ))}
                      </ul>
                    </section>
                  </div>
                  <div className="bg-card overflow-hidden rounded-2xl border">
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
                            <TableCell className="text-right">
                              <Money value={d.amount} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </PageBody>
  );
}
