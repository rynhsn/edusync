'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  CalendarRange,
  Download,
  Eye,
  FileSpreadsheet,
  Gauge,
  ListChecks,
  ListFilter,
  Lock,
  LockOpen,
  MessageSquare,
  MessagesSquare,
  ScrollText,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { RowMenu } from '@/components/row-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { ApiError, api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import {
  completenessPercent,
  completeCount as countComplete,
  isComplete,
  missingCount,
} from '@/lib/report-v2';
import { semesterLabel } from '@/lib/semester-label';
import { cn } from '@/lib/utils';
import { NarrativesPanel } from './narratives-panel';
import { NotesDialog } from './notes-dialog';
import { downloadClassReportCardsPdf, downloadReportCardPdf, exportLedgerExcel } from './pdf/download';
import { slugify } from './pdf/format';
import type { ReportCardDoc } from './pdf/types';
import { useSignLabels } from './pdf/use-sign-labels';
import { ReportCardPreview } from './preview';
import { reportSettingsKey, useReportCard, useReportDisplay } from './report-data';
import { ResponsesDialog } from './responses-dialog';

/** Jumlah permintaan rapor yang berjalan bersamaan saat mengunduh satu kelas. */
const CONCURRENCY = 3;

interface Target {
  studentId: string;
  name: string;
}

/** Dialog konfirmasi sederhana sebagai ganti window.confirm. */
function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const tc = useTranslations('common');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button disabled={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewDialog({
  semesterId,
  target,
  onClose,
}: {
  semesterId: string;
  target: Target | null;
  onClose: () => void;
}) {
  const t = useTranslations('reportCards');
  const te = useTranslations();
  const doc = useReportCard(semesterId, target?.studentId ?? null);
  const signLabels = useSignLabels();
  const display = useReportDisplay();
  const [busy, setBusy] = useState(false);

  async function download() {
    if (!doc.data) return;
    setBusy(true);
    try {
      await downloadReportCardPdf(doc.data, signLabels, display);
    } catch {
      toast.error(t('pdfError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">{t('previewTitle')}</DialogTitle>
          <DialogDescription>{target?.name}</DialogDescription>
        </DialogHeader>
        {doc.isPending && <Skeleton className="h-64 w-full" />}
        {doc.isError && (
          <Alert variant="destructive">
            <AlertDescription>{te(errorKey(doc.error))}</AlertDescription>
          </Alert>
        )}
        {doc.data && <ReportCardPreview doc={doc.data} display={display} />}
        <DialogFooter>
          <Button variant="outline" disabled={!doc.data || busy} onClick={download}>
            <Download className="size-4" /> {t('downloadPdf')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Rapor semester: pilih semester dan kelas, isi catatan wali kelas, pratinjau, finalisasi, dan unduh PDF/leger. */
export function ReportCardsView() {
  const t = useTranslations('reportCards');
  const te = useTranslations();
  const signLabels = useSignLabels();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('report_card:manage');
  const [semesterChoice, setSemesterChoice] = useState('');
  const [classChoice, setClassChoice] = useState('');
  const [preview, setPreview] = useState<Target | null>(null);
  const [noteFor, setNoteFor] = useState<Target | null>(null);
  const [responsesFor, setResponsesFor] = useState<Target | null>(null);
  const [dialog, setDialog] = useState<'finalize' | 'incomplete' | 'reopen' | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [busyStudent, setBusyStudent] = useState<string | null>(null);

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
  const classList = classes.data ?? [];
  const classId = classList.some((c) => c.id === classChoice) ? classChoice : (classList[0]?.id ?? '');
  const className = classList.find((c) => c.id === classId)?.name ?? '';
  const ready = !!semesterId && !!classId;

  const listKey = ['report-cards', school.schoolId, semesterId, classId];
  const list = useQuery({
    queryKey: listKey,
    enabled: ready,
    queryFn: async () =>
      unwrap(await api.GET('/v1/report-cards', { params: { ...header, query: { semesterId, classId } } })),
  });
  const rows = list.data ?? [];
  const finalCount = rows.filter((r) => r.status === 'final').length;
  const allFinal = rows.length > 0 && finalCount === rows.length;
  // Mode rapor kelas dan daftar mapelnya dibaca dari rapor siswa pertama (daftar rapor tidak membawanya).
  const sample = useReportCard(semesterId, rows[0]?.studentId ?? null);
  const descriptive = sample.data?.reportMode === 'descriptive';
  const classSubjects = (sample.data?.subjects ?? []).map((s) => ({ subjectId: s.subjectId, name: s.name }));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['report-cards', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['report-card', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['report-card-narratives', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['report-card-responses', school.schoolId] });
  };

  const finalize = useMutation({
    mutationFn: async (force: boolean) =>
      unwrap(
        await api.POST('/v1/report-cards/finalize', {
          params: header,
          body: { semesterId, classId, ...(force ? { force: true } : {}) },
        }),
      ),
    onSuccess: () => {
      setDialog(null);
      toast.success(t('finalized'));
      refresh();
    },
    onError: (e) => {
      // Nilai belum lengkap: tawarkan finalisasi tetap alih-alih sekadar menolak.
      if (e instanceof ApiError && e.code === 'grades_incomplete') return setDialog('incomplete');
      setDialog(null);
      toast.error(te(errorKey(e)));
    },
  });
  const reopen = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/v1/report-cards/reopen', { params: header, body: { semesterId, classId } })),
    onSuccess: () => {
      setDialog(null);
      toast.success(t('reopened'));
      refresh();
    },
    onError: (e) => {
      setDialog(null);
      toast.error(te(errorKey(e)));
    },
  });

  const fetchDoc = async (studentId: string): Promise<ReportCardDoc> =>
    queryClient.fetchQuery({
      queryKey: ['report-card', school.schoolId, semesterId, studentId],
      staleTime: 0,
      queryFn: async (): Promise<ReportCardDoc> =>
        unwrap(
          await api.GET('/v1/report-cards/{studentId}', {
            params: { ...header, path: { studentId }, query: { semesterId } },
          }),
        ),
    });

  /** Bendera tampilan PDF; menunggu pengaturan termuat supaya hasil unduhan konsisten. */
  const loadDisplay = async () => {
    const d = await queryClient.fetchQuery({
      queryKey: reportSettingsKey(school.schoolId),
      queryFn: async () => unwrap(await api.GET('/v1/report-cards/settings', { params: header })),
    });
    return { showCocurricular: d.showCocurricular, showGuardianResponse: d.showGuardianResponse };
  };

  async function downloadOne(studentId: string) {
    setBusyStudent(studentId);
    try {
      await downloadReportCardPdf(await fetchDoc(studentId), signLabels, await loadDisplay());
    } catch (e) {
      toast.error(e instanceof ApiError ? te(errorKey(e)) : t('pdfError'));
    } finally {
      setBusyStudent(null);
    }
  }

  async function downloadAll() {
    if (rows.length === 0) return;
    setProgress({ done: 0, total: rows.length });
    try {
      // Kumpulan kecil pekerja supaya server tidak dibanjiri, urutan hasil tetap mengikuti daftar siswa.
      const docs = new Array<ReportCardDoc>(rows.length);
      let next = 0;
      let done = 0;
      const worker = async () => {
        while (next < rows.length) {
          const i = next++;
          docs[i] = await fetchDoc((rows[i] as (typeof rows)[number]).studentId);
          setProgress({ done: ++done, total: rows.length });
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
      await downloadClassReportCardsPdf(
        docs,
        `rapor-${slugify(className)}-${slugify(semester?.name ?? '')}.pdf`,
        signLabels,
        await loadDisplay(),
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? te(errorKey(e)) : t('pdfError'));
    } finally {
      setProgress(null);
    }
  }

  async function downloadLedger() {
    setLedgerBusy(true);
    try {
      const recap = unwrap(
        await api.GET('/v1/grading/recap/class', { params: { ...header, query: { semesterId, classId } } }),
      );
      await exportLedgerExcel(recap, {
        schoolName: school.schoolName,
        className,
        semesterName: semester?.name ?? '',
        fileName: `leger-${slugify(className)}-${slugify(semester?.name ?? '')}.xlsx`,
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? te(errorKey(e)) : t('ledgerError'));
    } finally {
      setLedgerBusy(false);
    }
  }

  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '-' : String(n));
  const averages = rows.map((r) => r.average).filter((v): v is number => typeof v === 'number');
  const classAverage = averages.length
    ? Math.round((averages.reduce((a, b) => a + b, 0) / averages.length) * 100) / 100
    : null;
  const completeCount = countComplete(rows);
  const pctOf = (n: number) => (rows.length ? (n / rows.length) * 100 : 0);

  return (
    <PageBody>
      <PageHeader
        icon={ScrollText}
        tone={MODULE_TONE.academic}
        title={t('title')}
        description={t('subtitle')}
        actions={
          ready && (
            <>
              <Button variant="outline" disabled={rows.length === 0 || !!progress} onClick={downloadAll}>
                <Download className="size-4" />{' '}
                {progress
                  ? t('downloadingAll', { done: progress.done, total: progress.total })
                  : t('downloadAll')}
              </Button>
              <Button disabled={rows.length === 0 || allFinal} onClick={() => setDialog('finalize')}>
                <Lock className="size-4" /> {t('finalizeClass')}
              </Button>
              <RowMenu
                label={t('classActions')}
                items={[
                  {
                    key: 'ledger',
                    label: t('ledger'),
                    icon: FileSpreadsheet,
                    disabled: ledgerBusy,
                    onSelect: downloadLedger,
                  },
                  ...(manage
                    ? [
                        {
                          key: 'reopen',
                          label: t('reopen'),
                          icon: LockOpen,
                          disabled: finalCount === 0,
                          onSelect: () => setDialog('reopen'),
                        },
                      ]
                    : []),
                ]}
              />
            </>
          )
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
      {semesters.data && semesters.data.length > 0 && !ready && !classes.isPending && (
        <EmptyPanel
          icon={ListFilter}
          tone={MODULE_TONE.academic}
          title={t('pickFiltersTitle')}
          body={t('pickFilters')}
        />
      )}
      {list.isPending && ready && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
          {['a', 'b', 'c', 'd', 'e', 'f'].slice(0, 6).map((k) => (
            <Skeleton key={k} className="h-40 rounded-2xl" />
          ))}
        </div>
      )}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(list.error))}</AlertDescription>
        </Alert>
      )}

      {list.data && rows.length === 0 && (
        <EmptyPanel
          icon={Users}
          tone={MODULE_TONE.academic}
          title={t('noStudentsTitle')}
          body={t('noStudents')}
        />
      )}
      {rows.length > 0 && (
        <>
          <StatGrid className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
            <StatCard
              icon={Users}
              tone={MODULE_TONE.academic}
              label={t('statStudents')}
              value={rows.length}
            />
            <StatCard
              icon={BadgeCheck}
              tone="emerald"
              label={t('statFinalized')}
              value={`${finalCount}/${rows.length}`}
              hint={allFinal ? t('statAllFinal') : t('statDraftLeft', { count: rows.length - finalCount })}
              progress={pctOf(finalCount)}
            />
            <StatCard
              icon={ListChecks}
              tone={completeCount === rows.length ? 'emerald' : 'amber'}
              label={descriptive ? t('statCompleteDescriptive') : t('statComplete')}
              value={`${completeCount}/${rows.length}`}
              progress={pctOf(completeCount)}
            />
            <StatCard icon={Gauge} tone="sky" label={t('average')} value={fmt(classAverage)} />
          </StatGrid>

          {descriptive && (
            <Alert>
              <AlertDescription>{t('descriptiveBanner')}</AlertDescription>
            </Alert>
          )}
          {allFinal && (
            <Alert>
              <Lock aria-hidden className="size-4" />
              <AlertDescription>{t('allFinalNotice')}</AlertDescription>
            </Alert>
          )}

          <NarrativesPanel
            key={`${semesterId}-${classId}-${descriptive}`}
            semesterId={semesterId}
            classId={classId}
            subjects={classSubjects}
            descriptive={descriptive}
          />

          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((r, i) => {
              const target = { studentId: r.studentId, name: r.name };
              const isFinal = r.status === 'final';
              const complete = isComplete(r);
              const missing = missingCount(r);
              return (
                <li
                  key={r.studentId}
                  style={{ animationDelay: `${Math.min(i, 9) * 30}ms` }}
                  className="bg-card hover:border-foreground/20 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3.5 rounded-2xl border p-4 transition-colors motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both motion-safe:duration-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <PersonCell name={r.name} sub={r.nis} />
                    </div>
                    <ToneBadge tone={isFinal ? 'emerald' : 'amber'} className="shrink-0">
                      {isFinal && <Lock aria-hidden className="size-3" />}
                      {t(isFinal ? 'statusFinal' : 'statusDraft')}
                    </ToneBadge>
                  </div>

                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-muted-foreground text-xs">{t('average')}</p>
                      <p className="font-heading text-2xl leading-tight font-semibold tabular-nums">
                        {fmt(r.average)}
                      </p>
                    </div>
                    <div className="grid min-w-0 flex-1 gap-1 text-right">
                      <p
                        className={cn(
                          'text-xs tabular-nums',
                          complete ? 'text-muted-foreground' : TONES.amber.text,
                        )}
                      >
                        {descriptive ? t('descriptionsFilled') : t('subjectsFilled')} {r.subjectsGraded}/
                        {r.subjectsTotal}
                      </p>
                      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                        <div
                          className={cn(
                            'h-full rounded-full transition-[width] duration-500',
                            complete ? TONES.emerald.bar : TONES.amber.bar,
                          )}
                          style={{ width: `${completenessPercent(r)}%` }}
                        />
                      </div>
                      {descriptive && missing > 0 && (
                        <p className={cn('text-xs font-medium', TONES.amber.text)}>
                          {t('descriptionsMissing', { count: missing })}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <ToneBadge tone={r.hasNote ? 'sky' : 'slate'} dot={false}>
                      <MessageSquare aria-hidden className="size-3" />
                      {t('note')}: {t(r.hasNote ? 'noteYes' : 'noteNo')}
                    </ToneBadge>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" onClick={() => setPreview(target)}>
                        <Eye className="size-3.5" /> {t('preview')}
                      </Button>
                      <RowMenu
                        label={`${t('rowActions')}: ${r.name}`}
                        items={[
                          {
                            key: 'note',
                            label: isFinal ? `${t('notesTitle')} (${t('noteLocked')})` : t('notesTitle'),
                            icon: MessageSquare,
                            disabled: isFinal,
                            onSelect: () => setNoteFor(target),
                          },
                          ...(isFinal
                            ? [
                                {
                                  key: 'responses',
                                  label: t('responsesTitle'),
                                  icon: MessagesSquare,
                                  onSelect: () => setResponsesFor(target),
                                },
                              ]
                            : []),
                          {
                            key: 'pdf',
                            label: t('downloadPdf'),
                            icon: Download,
                            disabled: busyStudent === r.studentId,
                            onSelect: () => downloadOne(r.studentId),
                          },
                        ]}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <PreviewDialog semesterId={semesterId} target={preview} onClose={() => setPreview(null)} />
      <NotesDialog semesterId={semesterId} target={noteFor} onClose={() => setNoteFor(null)} />
      <ResponsesDialog semesterId={semesterId} target={responsesFor} onClose={() => setResponsesFor(null)} />

      <ConfirmDialog
        open={dialog === 'finalize'}
        title={t('finalizeTitle')}
        description={t('finalizeConfirm', { count: rows.length - finalCount, className })}
        confirmLabel={t('finalizeClass')}
        pending={finalize.isPending}
        onConfirm={() => finalize.mutate(false)}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'incomplete'}
        title={descriptive ? t('incompleteTitleDescriptive') : t('incompleteTitle')}
        description={descriptive ? t('incompleteBodyDescriptive') : t('incompleteBody')}
        confirmLabel={t('finalizeAnyway')}
        pending={finalize.isPending}
        onConfirm={() => finalize.mutate(true)}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'reopen'}
        title={t('reopenTitle')}
        description={t('reopenConfirm', { count: finalCount, className })}
        confirmLabel={t('reopen')}
        pending={reopen.isPending}
        onConfirm={() => reopen.mutate()}
        onClose={() => setDialog(null)}
      />
    </PageBody>
  );
}
