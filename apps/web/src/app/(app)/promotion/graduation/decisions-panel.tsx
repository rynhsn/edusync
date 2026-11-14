'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Eye,
  FileText,
  GraduationCap,
  Lock,
  LockOpen,
  Printer,
  Save,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { FieldError, TOUCH_INPUT, TOUCH_SELECT, useFormValidation } from '@/components/form-field-error';
import { DataRows, ListSkeleton, RowMenu } from '@/components/master-kit';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import { EmptyPanel, MODULE_TONE, StatCard, StatGrid, type Tone, ToneBadge } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { todayIso } from '@/lib/form-validation';
import { formatCalendarDate } from '@/lib/format-date';
import {
  buildDecisionItem,
  bulkFromSuggestions,
  DECISION_ORDER,
  type DecisionField,
  type DecisionForm,
  decisionFormOf,
  documentFileName,
  type GraduationList,
  type GraduationResult,
  type GraduationStudent,
  isFinal,
  LIMITS,
  needsForce,
  type PolicyView,
  type PrintMeta,
  RESULTS,
  readyToFinalize,
  type SklLabels,
  sklHtml,
  type TranscriptLabels,
  transcriptHtml,
  validateDecision,
} from '@/lib/graduation';
import { printHtml } from '@/lib/print-frame';
import { cn } from '@/lib/utils';
import { useGraduationError, useRefreshGraduation } from './graduation-shared';

const RESULT_TONE: Record<GraduationResult, Tone> = {
  graduated: 'emerald',
  not_graduated: 'amber',
  deferred: 'slate',
};

/** Cetak SKL dan transkrip: label dari terjemahan, tanggal dari bahasa pengguna. */
function usePrintDocs(list: GraduationList | undefined, yearName: string, announceOn: string | null) {
  const t = useTranslations('graduation.print');
  const tr = useTranslations('graduation.results');
  const locale = useLocale() as Locale;
  return useMemo(() => {
    const show = (iso: string) => formatCalendarDate(locale, iso);
    const meta = (s: GraduationStudent): PrintMeta | null =>
      list
        ? {
            school: list.school,
            yearName,
            locale,
            graduatedOnText: s.decision?.graduatedOn ? show(s.decision.graduatedOn) : '-',
            printedOnText: t('printedOn', { date: show(todayIso()) }),
          }
        : null;
    const place = () => [list?.school.city, show(announceOn ?? todayIso())].filter(Boolean).join(', ');
    const sklLabels = (): SklLabels => ({
      title: t('sklTitle'),
      number: t('sklNumber'),
      intro: t('sklIntro', { school: list?.school.name ?? '' }),
      name: t('name'),
      nis: t('nis'),
      nisn: t('nisn'),
      className: t('className'),
      year: t('year'),
      statement: t('sklStatement', { school: list?.school.name ?? '' }),
      criteria: t('criteria'),
      principal: t('principal'),
      nip: t('nip'),
      npsn: t('npsn'),
      draftNote: t('draftNote'),
      numberMissing: t('numberMissing'),
      signPlace: place(),
    });
    const transcriptLabels = (): TranscriptLabels => ({
      title: t('transcriptTitle'),
      name: t('name'),
      nis: t('nis'),
      nisn: t('nisn'),
      className: t('className'),
      year: t('year'),
      colNo: t('colNo'),
      colSubject: t('colSubject'),
      colReport: t('colReport'),
      colFinal: t('colFinal'),
      average: t('average'),
      weights: t('weights'),
      reportWeightLabel: t('reportWeightLabel'),
      criteria: t('criteria'),
      forced: t('forced'),
      result: t('result'),
      results: { graduated: tr('graduated'), not_graduated: tr('not_graduated'), deferred: tr('deferred') },
      decidedOn: t('decidedOn'),
      skl: t('sklNumber'),
      principal: t('principal'),
      nip: t('nip'),
      draftNote: t('draftNote'),
      signPlace: place(),
    });
    return {
      skl(s: GraduationStudent) {
        const m = meta(s);
        if (!m) return;
        const doc = document.title;
        document.title = documentFileName('skl', s.name, yearName);
        printHtml(sklHtml(s, sklLabels(), m));
        setTimeout(() => {
          document.title = doc;
        }, 1000);
      },
      transcript(s: GraduationStudent) {
        const m = meta(s);
        const html = m ? transcriptHtml(s, transcriptLabels(), m) : null;
        if (html) printHtml(html);
      },
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: label dibuat ulang tiap daftar atau bahasa berganti
  }, [list, yearName, announceOn, locale, t, tr]);
}

/** Dialog konfirmasi penetapan: ringkasan dan, bila ada murid dengan data belum lengkap, alasan tertulis (force). */
function FinalizeDialog({
  yearId,
  students,
  onClose,
  onDone,
}: {
  yearId: string;
  students: GraduationStudent[] | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('graduation');
  const err = useGraduationError();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const refresh = useRefreshGraduation();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const list = students ?? [];
  const force = needsForce(list);
  useEffect(() => {
    if (students) {
      setReason('');
      setError(null);
    }
  }, [students]);

  const send = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/academic-years/{id}/graduations/finalize', {
          params: { ...header, path: { id: yearId } },
          body: {
            studentIds: list.map((s) => s.studentId),
            force: force.any,
            ...(force.any ? { reason: reason.trim() } : {}),
          },
        }),
      ),
    onSuccess: (r) => {
      toast.success(t('decisions.finalized', { count: r.finalized }));
      refresh();
      onDone();
    },
    onError: (e) => setError(err(e)),
  });

  const count = (r: GraduationResult) => list.filter((s) => s.decision?.result === r).length;

  return (
    <FormDialog
      open={students !== null}
      title={t('finalize.title', { count: list.length })}
      description={t('finalize.body')}
      submitLabel={t('finalize.confirm')}
      error={error}
      disabled={list.length === 0 || (force.any && reason.trim() === '')}
      onOpenChange={(open) => !open && onClose()}
      onSubmit={() => send.mutateAsync()}
    >
      <ul className="grid gap-1.5 text-sm">
        {RESULTS.map((r) => (
          <li key={r} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <ToneBadge tone={RESULT_TONE[r]}>{t(`results.${r}`)}</ToneBadge>
            <span className="tabular-nums">{count(r)}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">{t('finalize.effects')}</p>
      {force.any && (
        <div className="grid gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {t('finalize.incompleteTitle')}
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-200">
            {t('finalize.incompleteBody', {
              reportNotFinal: force.reportNotFinal,
              incomplete: force.incomplete,
            })}
          </p>
          <Label htmlFor="gf-reason">{t('finalize.reason')}</Label>
          <Textarea
            id="gf-reason"
            rows={3}
            maxLength={LIMITS.reason}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      )}
    </FormDialog>
  );
}

/** Detail murid: nilai per mapel, saran, keputusan (draf), nomor, cetak, penetapan, dan buka kembali. */
function StudentDialog({
  yearId,
  list,
  student,
  announceOn,
  print,
  onClose,
  onFinalize,
}: {
  yearId: string;
  list: GraduationList;
  student: GraduationStudent | null;
  announceOn: string | null;
  print: ReturnType<typeof usePrintDocs>;
  onClose: () => void;
  onFinalize: (s: GraduationStudent) => void;
}) {
  const t = useTranslations('graduation');
  const tm = useTranslations('masterData');
  const err = useGraduationError();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const refresh = useRefreshGraduation();
  const manage = can('graduation:manage');
  const show = (iso: string) => formatCalendarDate(locale, iso);
  const defaultDate = announceOn ?? todayIso();

  const [values, setValues] = useState<DecisionForm>(() => ({
    result: '',
    graduatedOn: defaultDate,
    note: '',
    meetingId: '',
    sklNumber: '',
    diplomaNumber: '',
  }));
  const [error, setError] = useState<string | null>(null);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const validation = useFormValidation<DecisionField>({
    errors: validateDecision(values),
    order: DECISION_ORDER,
    idPrefix: 'gd',
  });
  // Isian disiapkan ulang saat murid berganti atau data segar tiba (mis. setelah simpan).
  const stamp = student
    ? `${student.studentId}:${student.decision?.status}:${student.decision?.result}:${student.decision?.sklNumber}:${student.decision?.diplomaNumber}:${student.decision?.graduatedOn}`
    : '';
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya bila murid atau keputusan tersimpannya berganti
  useEffect(() => {
    if (student) {
      setValues(decisionFormOf(student, defaultDate));
      setError(null);
      validation.reset();
    }
  }, [stamp]);

  const meetings = useQuery({
    queryKey: ['council-meetings', school.schoolId, yearId, 'graduation'],
    enabled: !!student && can('report_card:read_all'),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/council-meetings', {
          params: { ...header, query: { academicYearId: yearId } },
        }),
      ),
  });

  const saveDraft = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/academic-years/{id}/graduations', {
          params: { ...header, path: { id: yearId } },
          body: { decisions: [buildDecisionItem((student as GraduationStudent).studentId, values)] },
        }),
      ),
    onSuccess: () => {
      toast.success(t('decisions.draftSaved'));
      setError(null);
      refresh();
    },
    onError: (e) => setError(err(e)),
  });
  const saveDiploma = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/academic-years/{id}/graduations/diploma-numbers', {
          params: { ...header, path: { id: yearId } },
          body: {
            items: [
              {
                studentId: (student as GraduationStudent).studentId,
                diplomaNumber: values.diplomaNumber.trim() === '' ? null : values.diplomaNumber.trim(),
              },
            ],
          },
        }),
      ),
    onSuccess: () => {
      toast.success(t('decisions.diplomaSaved'));
      setError(null);
      refresh();
    },
    onError: (e) => setError(err(e)),
  });
  const reopen = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/academic-years/{id}/graduations/reopen', {
          params: { ...header, path: { id: yearId } },
          body: { studentIds: [(student as GraduationStudent).studentId] },
        }),
      ),
    onSuccess: () => {
      toast.success(t('decisions.reopened'));
      refresh();
    },
    onError: (e) => toast.error(err(e)),
  });

  const d = student?.decision ?? null;
  const final = student ? isFinal(student) : false;
  const draft = !final;
  const scoring = student ? (student.transcript ?? student.suggestion) : undefined;
  const examName = new Map(list.exams.map((x) => [x.id, x.name]));
  const subjectName = new Map((scoring?.subjects ?? []).map((s) => [s.subjectId, s.name]));
  const meetingOptions = (meetings.data?.items ?? []).filter(
    (m) => m.status !== 'final' || m.id === values.meetingId,
  );
  const graduated = values.result === 'graduated';
  const f = (k: string) => `gd-${k}`;

  function failureText(fl: { code: string; subjectId?: string | undefined }) {
    const name = fl.subjectId ? (subjectName.get(fl.subjectId) ?? '') : '';
    const p = student?.transcript?.policy;
    const min = p ? p : list.policy.config;
    if (fl.code === 'below_average') return t('detail.failBelowAverage', { min: min.minAverage ?? 0 });
    if (fl.code === 'below_subject') {
      return t('detail.failBelowSubject', { name, min: min.minSubjectScore ?? 0 });
    }
    if (fl.code === 'required_missing') return t('detail.failRequiredMissing', { name });
    return t('detail.failNoScores');
  }

  return (
    <>
      <Dialog open={!!student} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">{student?.name ?? t('detail.title')}</DialogTitle>
            <DialogDescription>
              {student ? [student.className, student.nis].filter(Boolean).join(' · ') : ' '}
            </DialogDescription>
          </DialogHeader>
          {student && scoring && (
            <div className="grid gap-5">
              <div className="flex flex-wrap items-center gap-2">
                {d?.result && <ToneBadge tone={RESULT_TONE[d.result]}>{t(`results.${d.result}`)}</ToneBadge>}
                <ToneBadge tone={final ? 'emerald' : 'amber'}>
                  {final && <Lock aria-hidden className="size-3" />}
                  {final ? t('status.final') : t('status.draft')}
                </ToneBadge>
                {student.studentStatus === 'graduated' && (
                  <ToneBadge tone="violet">{t('detail.studentGraduated')}</ToneBadge>
                )}
              </div>

              {final && (
                <Alert>
                  <AlertDescription>
                    {d?.promotionApplied ? t('detail.appliedNote') : t('detail.finalNote')}
                  </AlertDescription>
                </Alert>
              )}
              {!final && student.suggestion?.reportNotFinal && (
                <Alert variant="destructive">
                  <AlertDescription>{t('detail.reportNotFinal')}</AlertDescription>
                </Alert>
              )}

              <section className="grid gap-2" aria-labelledby="gd-scores-title">
                <h3 id="gd-scores-title" className="font-heading text-sm font-semibold">
                  {final ? t('detail.scoresFrozen') : t('detail.scoresTitle')}
                </h3>
                {scoring.subjects.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('detail.noScores')}</p>
                ) : (
                  <ul className="grid gap-1.5">
                    {scoring.subjects.map((s) => (
                      <li key={s.subjectId} className="rounded-xl border px-3 py-2 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <span className="min-w-0 font-medium break-words">{s.name}</span>
                          <span className="text-lg font-semibold tabular-nums">{s.final ?? '-'}</span>
                        </div>
                        <p className="text-muted-foreground mt-0.5 text-xs break-words tabular-nums">
                          {t('detail.reportScore')} {s.report ?? '-'}
                          {s.exams.map(
                            (x) => ` · ${examName.get(x.examId) ?? t('detail.exam')} ${x.value ?? '-'}`,
                          )}
                        </p>
                        {s.missing.length > 0 && (
                          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                            {t('detail.missing', {
                              list: s.missing
                                .map((m) =>
                                  m === 'report' ? t('detail.reportScore') : (examName.get(m) ?? m),
                                )
                                .join(', '),
                            })}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 text-sm">
                  <span>
                    {t('detail.average')}: <b className="tabular-nums">{scoring.average ?? '-'}</b>
                  </span>
                  <ToneBadge tone={scoring.meetsCriteria ? 'emerald' : 'rose'}>
                    {scoring.meetsCriteria ? t('detail.meets') : t('detail.notMeets')}
                  </ToneBadge>
                </div>
                {scoring.failures.length > 0 && (
                  <ul className="text-muted-foreground list-disc pl-5 text-xs">
                    {scoring.failures.map((fl) => (
                      <li key={`${fl.code}-${fl.subjectId ?? ''}`}>{failureText(fl)}</li>
                    ))}
                  </ul>
                )}
                <p className="text-muted-foreground text-xs">{t('detail.suggestionNote')}</p>
              </section>

              <section className="grid gap-3 border-t pt-4" aria-labelledby="gd-decision-title">
                <h3 id="gd-decision-title" className="font-heading text-sm font-semibold">
                  {t('detail.decisionTitle')}
                </h3>
                {final ? (
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground text-[11px] font-medium uppercase">
                        {t('detail.graduatedOn')}
                      </dt>
                      <dd className="text-sm">{d?.graduatedOn ? show(d.graduatedOn) : tm('none')}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-[11px] font-medium uppercase">
                        {t('detail.sklNumber')}
                      </dt>
                      <dd className="text-sm break-words">{d?.sklNumber ?? tm('none')}</dd>
                    </div>
                    {d?.note && (
                      <div className="sm:col-span-2">
                        <dt className="text-muted-foreground text-[11px] font-medium uppercase">
                          {t('detail.note')}
                        </dt>
                        <dd className="text-sm break-words whitespace-pre-line">{d.note}</dd>
                      </div>
                    )}
                  </dl>
                ) : manage ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid content-start gap-2 sm:col-span-2">
                      <Label htmlFor={f('result')}>{t('detail.result')}</Label>
                      <SelectField
                        id={f('result')}
                        className={TOUCH_SELECT}
                        value={values.result}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, result: e.target.value as DecisionForm['result'] }))
                        }
                      >
                        <option value="">{t('results.undecided')}</option>
                        {RESULTS.map((r) => (
                          <option key={r} value={r}>
                            {t(`results.${r}`)}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                    {graduated && (
                      <div className="grid content-start gap-2">
                        <Label htmlFor={f('graduatedOn')}>{t('detail.graduatedOn')}</Label>
                        <DatePicker
                          {...validation.fieldProps('graduatedOn')}
                          className={TOUCH_INPUT}
                          value={values.graduatedOn}
                          onChange={(date) => {
                            setValues((v) => ({ ...v, graduatedOn: date }));
                            validation.touch('graduatedOn');
                          }}
                        />
                        <FieldError id={f('graduatedOn')} issue={validation.issue('graduatedOn')} />
                      </div>
                    )}
                    {can('report_card:read_all') && (
                      <div className="grid content-start gap-2">
                        <Label htmlFor={f('meeting')}>{t('detail.meeting')}</Label>
                        <SelectField
                          id={f('meeting')}
                          className={TOUCH_SELECT}
                          value={values.meetingId}
                          onChange={(e) => setValues((v) => ({ ...v, meetingId: e.target.value }))}
                        >
                          <option value="">{t('detail.noMeeting')}</option>
                          {meetingOptions.map((m) => (
                            <option key={m.id} value={m.id}>
                              {`${m.title} (${show(m.heldOn)})`}
                            </option>
                          ))}
                        </SelectField>
                      </div>
                    )}
                    {graduated && (
                      <>
                        <div className="grid content-start gap-2">
                          <Label htmlFor={f('sklNumber')}>{t('detail.sklNumber')}</Label>
                          <Input
                            {...validation.fieldProps('sklNumber')}
                            className={TOUCH_INPUT}
                            maxLength={LIMITS.skl}
                            value={values.sklNumber}
                            onChange={(e) => setValues((v) => ({ ...v, sklNumber: e.target.value }))}
                          />
                          <p className="text-muted-foreground text-xs">
                            {list.policy.sklNumberTemplate ? t('detail.sklAuto') : t('detail.sklManual')}
                          </p>
                          <FieldError id={f('sklNumber')} issue={validation.issue('sklNumber')} />
                        </div>
                        <div className="grid content-start gap-2">
                          <Label htmlFor={f('diplomaNumber')}>{t('detail.diplomaNumber')}</Label>
                          <Input
                            {...validation.fieldProps('diplomaNumber')}
                            className={TOUCH_INPUT}
                            maxLength={LIMITS.number}
                            value={values.diplomaNumber}
                            onChange={(e) => setValues((v) => ({ ...v, diplomaNumber: e.target.value }))}
                          />
                          <p className="text-muted-foreground text-xs">{t('detail.diplomaHint')}</p>
                          <FieldError id={f('diplomaNumber')} issue={validation.issue('diplomaNumber')} />
                        </div>
                      </>
                    )}
                    <div className="grid content-start gap-2 sm:col-span-2">
                      <Label htmlFor={f('note')}>{t('detail.note')}</Label>
                      <Textarea
                        {...validation.fieldProps('note')}
                        rows={3}
                        maxLength={LIMITS.note}
                        value={values.note}
                        onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))}
                      />
                      <FieldError id={f('note')} issue={validation.issue('note')} />
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {d?.result ? t(`results.${d.result}`) : t('results.undecided')}
                  </p>
                )}

                {final && d?.result === 'graduated' && manage && (
                  <div className="grid content-start gap-2">
                    <Label htmlFor={f('diplomaNumber')}>{t('detail.diplomaNumber')}</Label>
                    <div className="flex gap-2">
                      <Input
                        {...validation.fieldProps('diplomaNumber')}
                        className={TOUCH_INPUT}
                        maxLength={LIMITS.number}
                        value={values.diplomaNumber}
                        onChange={(e) => setValues((v) => ({ ...v, diplomaNumber: e.target.value }))}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 md:h-8"
                        disabled={
                          saveDiploma.isPending || values.diplomaNumber.trim() === (d.diplomaNumber ?? '')
                        }
                        onClick={() => saveDiploma.mutate()}
                      >
                        <Save className="size-4" aria-hidden /> {t('detail.saveNumber')}
                      </Button>
                    </div>
                    <p className="text-muted-foreground text-xs">{t('detail.diplomaHint')}</p>
                    <FieldError id={f('diplomaNumber')} issue={validation.issue('diplomaNumber')} />
                  </div>
                )}
                {final && d?.result !== 'graduated' && d?.diplomaNumber && (
                  <p className="text-sm">
                    {t('detail.diplomaNumber')}: {d.diplomaNumber}
                  </p>
                )}
              </section>

              {error && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div
                className={cn(
                  '-mx-4 -mb-4 flex flex-wrap justify-end gap-2 rounded-b-xl border-t bg-muted/50 p-4',
                  'max-sm:sticky max-sm:-bottom-4 max-sm:z-10 max-sm:[&>*]:flex-1',
                )}
              >
                {final && d?.result === 'graduated' && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 md:h-8"
                    onClick={() => print.skl(student)}
                  >
                    <Printer className="size-4" aria-hidden /> {t('detail.printSkl')}
                  </Button>
                )}
                {final && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 md:h-8"
                    onClick={() => print.transcript(student)}
                  >
                    <FileText className="size-4" aria-hidden /> {t('detail.printTranscript')}
                  </Button>
                )}
                {manage && draft && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 md:h-8"
                    disabled={saveDraft.isPending}
                    onClick={() => validation.attempt() && saveDraft.mutate()}
                  >
                    <Save className="size-4" aria-hidden />{' '}
                    {saveDraft.isPending ? t('saving') : t('detail.saveDraft')}
                  </Button>
                )}
                {manage && draft && d?.result && (
                  <Button type="button" className="h-11 md:h-8" onClick={() => onFinalize(student)}>
                    <Lock className="size-4" aria-hidden /> {t('detail.finalize')}
                  </Button>
                )}
                {manage && final && !d?.promotionApplied && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 md:h-8"
                    onClick={() => setConfirmReopen(true)}
                  >
                    <LockOpen className="size-4" aria-hidden /> {t('detail.reopen')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmReopen}
        onOpenChange={setConfirmReopen}
        title={t('detail.reopenTitle')}
        description={t('detail.reopenBody')}
        confirmLabel={t('detail.reopen')}
        pending={reopen.isPending}
        onConfirm={async () => {
          await reopen.mutateAsync();
        }}
      />
    </>
  );
}

/** Penetapan: daftar murid tingkat akhir dengan saran angka dan keputusan; buka murid untuk menetapkan dan mencetak. */
export function DecisionsPanel({
  yearId,
  yearName,
  policy,
  onGoPolicy,
}: {
  yearId: string;
  yearName: string;
  policy: PolicyView | null;
  onGoPolicy: () => void;
}) {
  const t = useTranslations('graduation');
  const tm = useTranslations('masterData');
  const err = useGraduationError();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const refresh = useRefreshGraduation();
  const manage = can('graduation:manage');

  const [classChoice, setClassChoice] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState<GraduationStudent[] | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const q = useQuery({
    queryKey: ['graduation', school.schoolId, yearId, 'list'],
    enabled: !!policy,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/academic-years/{id}/graduations', { params: { ...header, path: { id: yearId } } }),
      ),
  });
  const data = q.data;
  const announceOn = policy?.announceOn ?? null;
  const print = usePrintDocs(data, yearName, announceOn);
  const students = (data?.students ?? []).filter((s) => classChoice === '' || s.classId === classChoice);
  const opened = data?.students.find((s) => s.studentId === openId) ?? null;
  const bulk = bulkFromSuggestions(data?.students ?? [], announceOn ?? todayIso());
  const ready = readyToFinalize(data?.students ?? []);

  const fillBulk = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/academic-years/{id}/graduations', {
          params: { ...header, path: { id: yearId } },
          body: { decisions: bulk },
        }),
      ),
    onSuccess: (r) => {
      toast.success(t('decisions.bulkDone', { count: r.saved }));
      refresh();
    },
    onError: (e) => toast.error(err(e)),
  });

  if (!policy) {
    return (
      <EmptyPanel
        icon={GraduationCap}
        tone={MODULE_TONE.academic}
        title={t('decisions.noPolicyTitle')}
        body={manage ? t('decisions.noPolicyBody') : t('decisions.noPolicyBodyReadOnly')}
        action={
          manage ? (
            <Button onClick={onGoPolicy} className="h-11 md:h-8">
              {t('decisions.goPolicy')}
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <section className="grid gap-4" aria-labelledby="grad-decisions-title">
      <div className="min-w-0">
        <h2 id="grad-decisions-title" className="font-heading text-lg font-semibold">
          {t('decisions.title')}
        </h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{t('decisions.help')}</p>
      </div>

      {q.isPending && <ListSkeleton rows={4} stats={0} />}
      {q.isError && (
        <Alert variant="destructive">
          <AlertDescription>{err(q.error)}</AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          <StatGrid>
            <StatCard tone="emerald" label={t('results.graduated')} value={data.summary.graduated} />
            <StatCard tone="amber" label={t('results.not_graduated')} value={data.summary.notGraduated} />
            <StatCard tone="slate" label={t('results.deferred')} value={data.summary.deferred} />
            <StatCard tone="sky" label={t('decisions.statUndecided')} value={data.summary.undecided} />
            <StatCard tone="violet" label={t('decisions.statFinal')} value={data.summary.final} />
          </StatGrid>

          <div className="flex flex-wrap items-end gap-3">
            {data.classes.length > 1 && (
              <div className="grid gap-2 sm:w-60">
                <Label htmlFor="gd-class">{t('decisions.classFilter')}</Label>
                <SelectField
                  id="gd-class"
                  className={TOUCH_SELECT}
                  value={classChoice}
                  onChange={(e) => setClassChoice(e.target.value)}
                >
                  <option value="">{t('decisions.allClasses')}</option>
                  {data.classes.map((c) => (
                    <option key={c.classId} value={c.classId}>
                      {c.name}
                    </option>
                  ))}
                </SelectField>
              </div>
            )}
            {manage && (
              <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:[&>*]:flex-1 sm:ml-auto">
                <Button
                  variant="outline"
                  className="h-11 md:h-8"
                  disabled={bulk.length === 0 || fillBulk.isPending}
                  onClick={() => setConfirmBulk(true)}
                >
                  <Sparkles className="size-4" aria-hidden />{' '}
                  {t('decisions.fillSuggestions', { count: bulk.length })}
                </Button>
                <Button
                  className="h-11 md:h-8"
                  disabled={ready.length === 0}
                  onClick={() => setFinalizing(ready)}
                >
                  <Lock className="size-4" aria-hidden />{' '}
                  {t('decisions.finalizeReady', { count: ready.length })}
                </Button>
              </div>
            )}
          </div>

          {data.students.length === 0 ? (
            <EmptyPanel
              icon={Users}
              tone={MODULE_TONE.academic}
              title={t('decisions.noStudentsTitle')}
              body={t('decisions.noStudentsBody')}
            />
          ) : (
            <DataRows<GraduationStudent>
              rows={students}
              rowKey={(r) => r.studentId}
              cardsBelow="lg"
              actionsHeader={tm('actions')}
              onRowClick={(r) => setOpenId(r.studentId)}
              columns={[
                {
                  key: 'student',
                  header: t('decisions.colStudent'),
                  cell: (r) => (
                    <span className="grid gap-0.5">
                      <span className="font-medium">{r.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {[r.className, r.nis].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  ),
                },
                {
                  key: 'score',
                  header: t('decisions.colScore'),
                  cell: (r) => {
                    const sc = r.transcript ?? r.suggestion;
                    return (
                      <span className="grid gap-1">
                        <span className="font-medium tabular-nums">{sc?.average ?? '-'}</span>
                        <span className="flex flex-wrap gap-1">
                          {r.suggestion?.reportNotFinal && (
                            <ToneBadge tone="amber" dot={false}>
                              {t('decisions.badgeReportNotFinal')}
                            </ToneBadge>
                          )}
                          {r.suggestion?.incomplete && (
                            <ToneBadge tone="amber" dot={false}>
                              {t('decisions.badgeIncomplete')}
                            </ToneBadge>
                          )}
                          {sc && sc.average !== null && (
                            <ToneBadge tone={sc.meetsCriteria ? 'emerald' : 'rose'} dot={false}>
                              {sc.meetsCriteria ? t('detail.meets') : t('detail.notMeets')}
                            </ToneBadge>
                          )}
                        </span>
                      </span>
                    );
                  },
                },
                {
                  key: 'decision',
                  header: t('decisions.colDecision'),
                  cell: (r) => (
                    <span className="grid gap-1">
                      <span className="flex flex-wrap gap-1">
                        {r.decision?.result ? (
                          <ToneBadge tone={RESULT_TONE[r.decision.result]}>
                            {t(`results.${r.decision.result}`)}
                          </ToneBadge>
                        ) : (
                          <ToneBadge tone="slate">{t('results.undecided')}</ToneBadge>
                        )}
                        {r.decision && (
                          <ToneBadge tone={r.decision.status === 'final' ? 'emerald' : 'amber'}>
                            {r.decision.status === 'final' && <Lock aria-hidden className="size-3" />}
                            {r.decision.status === 'final' ? t('status.final') : t('status.draft')}
                          </ToneBadge>
                        )}
                      </span>
                      {r.decision?.sklNumber && (
                        <span className="text-muted-foreground text-xs break-all">
                          {r.decision.sklNumber}
                        </span>
                      )}
                    </span>
                  ),
                },
              ]}
              actions={(r) => (
                <RowMenu
                  label={tm('actionsFor', { name: r.name })}
                  actions={[
                    { label: t('decisions.open'), icon: Eye, onSelect: () => setOpenId(r.studentId) },
                    ...(isFinal(r) && r.decision?.result === 'graduated'
                      ? [{ label: t('detail.printSkl'), icon: Printer, onSelect: () => print.skl(r) }]
                      : []),
                    ...(isFinal(r)
                      ? [
                          {
                            label: t('detail.printTranscript'),
                            icon: FileText,
                            onSelect: () => print.transcript(r),
                          },
                        ]
                      : []),
                  ]}
                />
              )}
            />
          )}
          <p className="text-muted-foreground flex items-start gap-2 text-xs">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('decisions.applyNote')}
          </p>
        </>
      )}

      {data && (
        <StudentDialog
          yearId={yearId}
          list={data}
          student={opened}
          announceOn={announceOn}
          print={print}
          onClose={() => setOpenId(null)}
          onFinalize={(s) => setFinalizing([s])}
        />
      )}
      <FinalizeDialog
        yearId={yearId}
        students={finalizing}
        onClose={() => setFinalizing(null)}
        onDone={() => setFinalizing(null)}
      />
      <ConfirmDialog
        open={confirmBulk}
        onOpenChange={setConfirmBulk}
        title={t('decisions.bulkTitle', { count: bulk.length })}
        description={t('decisions.bulkBody')}
        confirmLabel={t('decisions.bulkConfirm')}
        pending={fillBulk.isPending}
        onConfirm={async () => {
          await fillBulk.mutateAsync();
        }}
      />
    </section>
  );
}
