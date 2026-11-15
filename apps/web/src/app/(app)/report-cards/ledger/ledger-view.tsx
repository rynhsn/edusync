'use client';

import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, CalendarRange, Download, ListFilter, Lock, Printer, Table2, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
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
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import {
  averageText,
  cellOf,
  cellText,
  hasRanks,
  LEDGER_TEXT_COLUMNS,
  type Ledger,
  type LedgerCell,
  type LedgerLabels,
  type LedgerStudent,
  ledgerFileName,
  ledgerHeaders,
  ledgerPrintHtml,
  ledgerRows,
  ledgerSummary,
  ledgerWidths,
  NOT_TAKEN_MARK,
  rankText,
  safeSheetName,
} from '@/lib/ledger';
import { pickClassId, reportClassList } from '@/lib/report-class-access';
import { semesterLabel } from '@/lib/semester-label';
import { buildExport, saveBlob } from '@/lib/sheet';
import { cn } from '@/lib/utils';

/** Cetak lewat iframe tersembunyi (tanpa jendela baru yang dapat diblokir); pengguna dapat memilih "Simpan sebagai PDF". */
function printHtml(html: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}

/** Isi satu sel nilai: angka (merah bila di bawah KKM), "—" berlabel bila mapel tidak diambil, "-" bila belum ada nilai. */
function CellValue({ cell, notTakenLabel }: { cell: LedgerCell | undefined; notTakenLabel: string }) {
  if (cell?.notTaken) {
    return (
      <span role="img" aria-label={notTakenLabel} title={notTakenLabel} className="text-muted-foreground">
        {NOT_TAKEN_MARK}
      </span>
    );
  }
  const empty = !cell || cell.final === null;
  return (
    <span
      className={cn(
        'tabular-nums',
        empty ? 'text-muted-foreground' : cell?.belowKkm && cn(TONES.rose.text, 'font-semibold'),
      )}
    >
      {cellText(cell)}
    </span>
  );
}

function StatusBadge({ student, label }: { student: LedgerStudent; label: string }) {
  const final = student.status === 'final';
  return (
    <ToneBadge tone={final ? 'emerald' : 'amber'} className="shrink-0">
      {final && <Lock aria-hidden className="size-3" />}
      {label}
    </ToneBadge>
  );
}

/** Legger kelas: matriks siswa x mapel satu semester dari data rapor (snapshot bila final), dengan unduh Excel dan cetak. */
export function LedgerView() {
  const t = useTranslations('ledger');
  const te = useTranslations();
  const locale = useLocale();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [semesterChoice, setSemesterChoice] = useState('');
  const [classChoice, setClassChoice] = useState('');
  const [busy, setBusy] = useState(false);

  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, 'all'],
    queryFn: async () => unwrap(await api.GET('/v1/semesters', { params: { ...header, query: {} } })),
  });
  const semester =
    semesters.data?.find((s) => s.id === semesterChoice) ??
    semesters.data?.find((s) => s.isActive) ??
    semesters.data?.[0];
  const semesterId = semester?.id ?? '';

  const classes = useQuery({
    queryKey: ['classes', school.schoolId, semester?.academicYearId],
    enabled: !!semester && can('class:read'),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes', {
          params: { ...header, query: { academicYearId: semester?.academicYearId } },
        }),
      ),
  });
  const wide = can('report_card:manage') || can('report_card:read_all');
  const classList = reportClassList(classes.data ?? [], wide);
  const classId = pickClassId(classList, classChoice);
  const noHomeroom = !wide && !!classes.data && classList.length === 0;
  const className = classList.find((c) => c.id === classId)?.name ?? '';
  const ready = !!semesterId && !!classId;

  const ledger = useQuery({
    queryKey: ['report-card-ledger', school.schoolId, semesterId, classId],
    enabled: ready,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/report-cards/ledger', { params: { ...header, query: { semesterId, classId } } }),
      ),
  });
  const data: Ledger | undefined = ledger.data;
  const summary = data ? ledgerSummary(data) : null;
  const ranks = data ? hasRanks(data) : false;

  const labels: LedgerLabels = {
    no: t('colNo'),
    student: t('student'),
    nis: t('nis'),
    average: t('average'),
    rank: t('rank'),
    sick: t('sick'),
    excused: t('excused'),
    absent: t('absent'),
    late: t('late'),
    status: t('status'),
    statusDraft: t('statusDraft'),
    statusFinal: t('statusFinal'),
    notTaken: t('notTaken'),
    title: t('title'),
    legend: t('legend', { mark: NOT_TAKEN_MARK }),
    draftNote: t('draftNote'),
    descriptiveNote: t('descriptiveNote'),
    printedOn: t('printedOn'),
  };
  const semesterName = semester ? semesterLabel(semester) : '';

  async function exportExcel() {
    if (!data || data.students.length === 0) return void toast.info(t('exportEmpty'));
    setBusy(true);
    try {
      const blob = await buildExport(
        safeSheetName(`${t('title')} ${className}`),
        ledgerHeaders(data, labels),
        ledgerRows(data, labels),
        { textColumns: LEDGER_TEXT_COLUMNS, widths: ledgerWidths(data) },
      );
      saveBlob(blob, ledgerFileName('xlsx', className, semesterName));
    } catch {
      toast.error(t('exportError'));
    } finally {
      setBusy(false);
    }
  }

  function print() {
    if (!data || data.students.length === 0) return void toast.info(t('exportEmpty'));
    printHtml(
      ledgerPrintHtml(data, labels, {
        schoolName: school.schoolName,
        className,
        semesterName,
        printedOn: new Date().toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }),
      }),
    );
  }

  const none = !data || data.students.length === 0;

  return (
    <PageBody>
      <PageHeader
        icon={Table2}
        tone={MODULE_TONE.academic}
        title={t('title')}
        description={t('subtitle')}
        actions={
          <>
            <BackLink href="/report-cards" label={t('backToReports')} />
            <Button variant="outline" disabled={none || busy} onClick={exportExcel}>
              <Download className="size-4" aria-hidden /> {t('exportExcel')}
            </Button>
            <Button variant="outline" disabled={none} onClick={print}>
              <Printer className="size-4" aria-hidden /> {t('print')}
            </Button>
          </>
        }
      />

      <Toolbar>
        <SelectField
          aria-label={t('semester')}
          className="sm:w-56"
          value={semesterId}
          onChange={(e) => setSemesterChoice(e.target.value)}
        >
          {semesters.data?.length === 0 && <option value="">{t('chooseSemester')}</option>}
          {semesters.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {semesterLabel(s)}
            </option>
          ))}
        </SelectField>
        <SelectField
          aria-label={t('class')}
          className="sm:w-44"
          value={classId}
          onChange={(e) => setClassChoice(e.target.value)}
        >
          {classList.length === 0 && <option value="">{t('chooseClass')}</option>}
          {classList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
      </Toolbar>

      {semesters.data?.length === 0 && (
        <EmptyPanel
          icon={CalendarRange}
          tone={MODULE_TONE.academic}
          title={t('noSemestersTitle')}
          body={t('noSemesters')}
        />
      )}
      {semesters.data && semesters.data.length > 0 && noHomeroom && (
        <EmptyPanel
          icon={Users}
          tone={MODULE_TONE.academic}
          title={t('noHomeroomTitle')}
          body={t('noHomeroom')}
        />
      )}
      {semesters.data && semesters.data.length > 0 && !ready && !noHomeroom && !classes.isPending && (
        <EmptyPanel
          icon={ListFilter}
          tone={MODULE_TONE.academic}
          title={t('pickFiltersTitle')}
          body={t('pickFilters')}
        />
      )}
      {ledger.isPending && ready && (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      )}
      {ledger.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(ledger.error))}</AlertDescription>
        </Alert>
      )}

      {data && data.students.length === 0 && (
        <EmptyPanel
          icon={Users}
          tone={MODULE_TONE.academic}
          title={t('noStudentsTitle')}
          body={t('noStudents')}
        />
      )}

      {data && summary && data.students.length > 0 && (
        <>
          <StatGrid className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
            <StatCard
              icon={Users}
              tone={MODULE_TONE.academic}
              label={t('statStudents')}
              value={summary.total}
            />
            <StatCard
              icon={BadgeCheck}
              tone="emerald"
              label={t('statFinal')}
              value={`${summary.final}/${summary.total}`}
              hint={summary.hasDraft ? t('statDraftLeft', { count: summary.draft }) : t('statAllFinal')}
              progress={(summary.final / summary.total) * 100}
            />
          </StatGrid>

          {summary.hasDraft && (
            <Alert>
              <AlertDescription>{t('draftNote')}</AlertDescription>
            </Alert>
          )}
          {data.reportMode === 'descriptive' && (
            <Alert>
              <AlertDescription>{t('descriptiveNote')}</AlertDescription>
            </Alert>
          )}
          {data.subjects.length === 0 && (
            <Alert>
              <AlertDescription>{t('noSubjects')}</AlertDescription>
            </Alert>
          )}
          <p role="note" className="text-muted-foreground text-xs">
            {t('legend', { mark: NOT_TAKEN_MARK })}
          </p>

          {/* Layar lebar: tabel; hanya wadah tabel yang bergulir ke samping, kolom nama menempel di kiri. */}
          <div className="bg-card hidden max-w-full overflow-x-auto rounded-2xl border lg:block">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="bg-muted text-muted-foreground text-xs">
                  <th
                    scope="col"
                    className="bg-muted sticky left-0 z-10 min-w-56 px-3 py-2.5 text-left font-medium"
                  >
                    {t('student')}
                  </th>
                  {data.subjects.map((s) => (
                    <th key={s.id} scope="col" className="px-3 py-2.5 text-right font-medium">
                      {s.name}
                    </th>
                  ))}
                  <th scope="col" className="border-l px-3 py-2.5 text-right font-medium">
                    {t('average')}
                  </th>
                  {ranks && (
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      {t('rank')}
                    </th>
                  )}
                  <th scope="col" className="border-l px-3 py-2.5 text-right font-medium">
                    {t('sick')}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    {t('excused')}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    {t('absent')}
                  </th>
                  <th scope="col" className="border-l px-3 py-2.5 text-left font-medium">
                    {t('status')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.students.map((s) => (
                  <tr key={s.studentId} className="hover:bg-muted/30 transition-colors">
                    <th
                      scope="row"
                      className="bg-card sticky left-0 z-10 min-w-56 px-3 py-2.5 text-left font-normal"
                    >
                      <PersonCell name={s.name} sub={s.nis} />
                    </th>
                    {data.subjects.map((sub) => (
                      <td key={sub.id} className="px-3 py-2.5 text-right">
                        <CellValue cell={cellOf(s, sub.id)} notTakenLabel={t('notTaken')} />
                      </td>
                    ))}
                    <td className="border-l px-3 py-2.5 text-right font-semibold tabular-nums">
                      {averageText(s.average)}
                    </td>
                    {ranks && <td className="px-3 py-2.5 text-right tabular-nums">{rankText(s.rank)}</td>}
                    <td className="border-l px-3 py-2.5 text-right tabular-nums">{s.attendance.sick}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s.attendance.excused}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s.attendance.absent}</td>
                    <td className="border-l px-3 py-2.5">
                      <StatusBadge
                        student={s}
                        label={t(s.status === 'final' ? 'statusFinal' : 'statusDraft')}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Di bawah lg: satu kartu per siswa, tanpa gulir ke samping. */}
          <ul className="grid min-w-0 content-start gap-3 lg:hidden">
            {data.students.map((s) => (
              <li
                key={s.studentId}
                className="bg-card grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <PersonCell name={s.name} sub={s.nis} />
                  </div>
                  <StatusBadge student={s} label={t(s.status === 'final' ? 'statusFinal' : 'statusDraft')} />
                </div>
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                  <div>
                    <p className="text-muted-foreground text-xs">{t('average')}</p>
                    <p className="font-heading text-2xl leading-tight font-semibold tabular-nums">
                      {averageText(s.average)}
                    </p>
                  </div>
                  {s.rank && (
                    <p className="text-muted-foreground text-xs">
                      {t('rank')}: <span className="text-foreground font-semibold">{rankText(s.rank)}</span>
                    </p>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  {data.subjects.map((sub) => {
                    const c = cellOf(s, sub.id);
                    return (
                      <div key={sub.id} className="bg-muted/50 min-w-0 rounded-lg px-2 py-1.5">
                        <dt className="text-muted-foreground break-words">{sub.name}</dt>
                        <dd className="text-sm font-semibold">
                          <CellValue cell={c} notTakenLabel={t('notTaken')} />
                          {c?.notTaken && (
                            <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                              {t('notTaken')}
                            </span>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                <p className="text-muted-foreground border-t pt-2.5 text-xs tabular-nums">
                  {t('sick')} {s.attendance.sick} · {t('excused')} {s.attendance.excused} · {t('absent')}{' '}
                  {s.attendance.absent}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </PageBody>
  );
}
