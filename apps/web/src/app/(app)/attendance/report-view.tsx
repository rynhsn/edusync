'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BookX,
  CalendarDays,
  ClipboardCheck,
  DoorOpen,
  Download,
  FileText,
  School,
  Search,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { CountCell, ENTER, ProgressRing, STATUS_TONE, stagger } from '@/components/access-kit';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  EmptyPanel,
  MODULE_TONE,
  PersonCell,
  StatCard,
  StatGrid,
  TONES,
  ToneBadge,
  Toolbar,
} from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { buildExport, saveBlob } from '@/lib/sheet';
import { cn } from '@/lib/utils';

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAY_MS = 86_400_000;

const DAY_KEYS = ['present', 'late', 'excused', 'sick', 'absent', 'notRecorded'] as const;
const LESSON_KEYS = ['present', 'excused', 'sick', 'absent'] as const;

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
  const [search, setSearch] = useState('');

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

  const q = search.trim().toLowerCase();
  const shownRows = rows.filter(
    (r) => q === '' || r.name.toLowerCase().includes(q) || (r.nis ?? '').toLowerCase().includes(q),
  );
  const rateOf = (d: { present: number; late: number; excused: number; sick: number; absent: number }) => {
    const total = d.present + d.late + d.excused + d.sick + d.absent;
    return total === 0 ? null : Math.round(((d.present + d.late) / total) * 100);
  };
  const overall = data ? rateOf(data.summary.days) : null;
  const gateTotal = data
    ? data.summary.days.present +
      data.summary.days.late +
      data.summary.days.excused +
      data.summary.days.sick +
      data.summary.days.absent
    : 0;

  return (
    <PageBody>
      <PageHeader
        icon={ClipboardCheck}
        tone={MODULE_TONE.attendance}
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

      <Toolbar className="gap-3">
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <DatePicker aria-label={t('from')} value={from} onChange={(v) => v && setFrom(v)} />
          </div>
          <span className="text-muted-foreground text-sm">–</span>
          <div className="w-44">
            <DatePicker aria-label={t('to')} value={to} onChange={(v) => v && setTo(v)} />
          </div>
        </div>
        <div className="relative min-w-44 flex-1 sm:max-w-60">
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            aria-label={t('search')}
            placeholder={t('search')}
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </Toolbar>

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
      {rangeValid && report.isPending && (
        <div className="grid gap-4" aria-busy>
          <div className="grid gap-3 lg:grid-cols-[18rem_1fr]">
            <Skeleton className="h-36 rounded-2xl" />
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-[4.5rem] rounded-2xl" />
              ))}
            </div>
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      )}

      {data && (
        <>
          <p className="text-muted-foreground text-sm">
            <span className="font-medium">{t('periodLabel')}:</span> {range(data.from, data.to)}
          </p>
          <div className={cn(ENTER, 'grid gap-3 lg:grid-cols-[18rem_1fr]')}>
            <div className="bg-card flex items-center gap-4 rounded-2xl border p-4">
              <ProgressRing value={overall ?? 0} size={88} stroke={9} tone="emerald">
                <span className="font-heading text-lg font-semibold tabular-nums">
                  {overall === null ? '–' : `${overall}%`}
                </span>
              </ProgressRing>
              <div className="min-w-0">
                <p className="font-heading font-semibold">{t('rateTitle')}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {overall === null
                    ? t('rateNone')
                    : t('rateHint', {
                        present: data.summary.days.present + data.summary.days.late,
                        total: gateTotal,
                      })}
                </p>
              </div>
            </div>
            <StatGrid className="xl:grid-cols-3 lg:grid-cols-3">
              <StatCard
                label={t('studentsCount')}
                value={data.summary.students}
                icon={Users}
                tone={MODULE_TONE.attendance}
              />
              <StatCard
                label={t('effectiveDays')}
                value={data.effectiveDays}
                icon={CalendarDays}
                tone="slate"
              />
              <StatCard
                label={`${t('present')} + ${t('late')}`}
                value={data.summary.days.present + data.summary.days.late}
                icon={UserCheck}
                tone="emerald"
              />
              <StatCard label={t('absent')} value={data.summary.days.absent} icon={UserX} tone="rose" />
              <StatCard
                label={`${t('lessonGroup')}: ${t('absent')}`}
                value={data.summary.lessons.absent}
                icon={BookX}
                tone="amber"
              />
              <StatCard
                label={t('skipped')}
                value={data.summary.skipped}
                hint={t('skippedHint')}
                icon={DoorOpen}
                tone="rose"
              />
            </StatGrid>
          </div>

          {rows.length === 0 ? (
            !classes.isPending && classList.length === 0 ? (
              <EmptyPanel
                icon={School}
                tone={MODULE_TONE.attendance}
                title={t('noClassesTitle')}
                body={t('noClasses')}
              />
            ) : (
              <EmptyPanel
                icon={Users}
                tone={MODULE_TONE.attendance}
                title={t('noStudentsTitle')}
                body={t('noStudents')}
              />
            )
          ) : shownRows.length === 0 ? (
            <EmptyPanel icon={Search} tone="slate" title={t('noMatch')} />
          ) : (
            <section className="grid gap-3">
              <p className="text-muted-foreground text-xs tabular-nums" aria-live="polite">
                {t('shown', { shown: shownRows.length, total: rows.length })}
              </p>

              {/* Layar lebar: tabel bergaris dengan sel angka berwarna */}
              <div className="bg-card hidden overflow-hidden rounded-2xl border md:block">
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
                      <TableHead rowSpan={2} className="border-l align-bottom">
                        {t('present')}
                      </TableHead>
                    </TableRow>
                    <TableRow>
                      {DAY_KEYS.map((k, i) => (
                        <TableHead key={`d-${k}`} className={cn('text-center', i === 0 && 'border-l')}>
                          {dayLabel(k)}
                        </TableHead>
                      ))}
                      {LESSON_KEYS.map((k, i) => (
                        <TableHead key={`l-${k}`} className={cn('text-center', i === 0 && 'border-l')}>
                          {lessonLabel(k)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shownRows.map((r, i) => {
                      const rate = rateOf(r.days);
                      return (
                        <TableRow key={r.studentId}>
                          <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                          <TableCell className="min-w-48">
                            <PersonCell
                              name={r.name}
                              sub={r.nis ? <span className="font-mono">{r.nis}</span> : undefined}
                            />
                          </TableCell>
                          <TableCell>{r.className}</TableCell>
                          {DAY_KEYS.map((k, j) => (
                            <TableCell key={`d-${k}`} className={cn('text-center', j === 0 && 'border-l')}>
                              <CountCell
                                value={r.days[k]}
                                tone={STATUS_TONE[k === 'notRecorded' ? 'notYet' : k]}
                              />
                            </TableCell>
                          ))}
                          {LESSON_KEYS.map((k, j) => (
                            <TableCell key={`l-${k}`} className={cn('text-center', j === 0 && 'border-l')}>
                              <CountCell value={r.lessons[k]} tone={STATUS_TONE[k]} />
                            </TableCell>
                          ))}
                          <TableCell className="border-l text-right">
                            <CountCell value={r.skipped} tone="rose" />
                          </TableCell>
                          <TableCell className="border-l">
                            <RateBar rate={rate} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/40 font-medium">
                      <TableCell />
                      <TableCell>{t('totalRow')}</TableCell>
                      <TableCell />
                      {DAY_KEYS.map((k, j) => (
                        <TableCell
                          key={`td-${k}`}
                          className={cn('text-center tabular-nums', j === 0 && 'border-l')}
                        >
                          {data.summary.days[k]}
                        </TableCell>
                      ))}
                      {LESSON_KEYS.map((k, j) => (
                        <TableCell
                          key={`tl-${k}`}
                          className={cn('text-center tabular-nums', j === 0 && 'border-l')}
                        >
                          {data.summary.lessons[k]}
                        </TableCell>
                      ))}
                      <TableCell className="border-l text-right tabular-nums">
                        {data.summary.skipped}
                      </TableCell>
                      <TableCell className="border-l">
                        <RateBar rate={overall} />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Layar sempit: kartu bertumpuk, tanpa scroll horizontal */}
              <ul className="grid gap-3 md:hidden">
                {shownRows.map((r, i) => (
                  <li
                    key={r.studentId}
                    style={stagger(i)}
                    className={cn(ENTER, 'bg-card grid gap-3 rounded-2xl border p-4')}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <PersonCell name={r.name} sub={[r.className, r.nis].filter(Boolean).join(' · ')} />
                      <RateBar rate={rateOf(r.days)} compact />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {DAY_KEYS.filter((k) => r.days[k] > 0).map((k) => (
                        <ToneBadge key={k} tone={STATUS_TONE[k === 'notRecorded' ? 'notYet' : k]} dot={false}>
                          {dayLabel(k)} {r.days[k]}
                        </ToneBadge>
                      ))}
                      {r.skipped > 0 && (
                        <ToneBadge tone="rose">
                          {t('skipped')} {r.skipped}
                        </ToneBadge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </PageBody>
  );
}

/** Persentase kehadiran sebagai angka dan bilah kecil; warna berubah menurut ambang. */
function RateBar({ rate, compact }: { rate: number | null; compact?: boolean }) {
  if (rate === null) return <span className="text-muted-foreground text-xs">–</span>;
  const tone = rate >= 90 ? 'emerald' : rate >= 75 ? 'amber' : 'rose';
  return (
    <div className={cn('flex items-center gap-2', compact ? 'w-24' : 'w-28')}>
      <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
        <div className={cn('h-full rounded-full', TONES[tone].bar)} style={{ width: `${rate}%` }} />
      </div>
      <span className="w-9 text-right text-xs font-medium tabular-nums">{rate}%</span>
    </div>
  );
}
