'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ClipboardPaste, FilePlus2, ListOrdered, Lock, Pencil, Save, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { FieldError, TOUCH_INPUT, TOUCH_SELECT } from '@/components/form-field-error';
import { DataRows, ListSkeleton, RowMenu } from '@/components/master-kit';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { EmptyPanel, MODULE_TONE, ToneBadge } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { formatCalendarDate } from '@/lib/format-date';
import {
  changedScores,
  EXAM_FORMS,
  hasInvalidScore,
  initialEdits,
  LIMITS,
  type ParsedPaste,
  parseScorePaste,
  type SchoolExamItem,
  type ScoreEdits,
  scoreIssue,
} from '@/lib/graduation';
import { cn } from '@/lib/utils';
import { useGraduationError, useRefreshGraduation } from './graduation-shared';

type ExamForm = { name: string; form: (typeof EXAM_FORMS)[number]; startsOn: string; endsOn: string };
const EMPTY_EXAM: ExamForm = { name: '', form: 'written', startsOn: '', endsOn: '' };

/** Tambah atau ubah ujian satuan pendidikan. */
function ExamFormDialog({
  yearId,
  exam,
  open,
  onClose,
}: {
  yearId: string;
  exam: SchoolExamItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('graduation');
  const tm = useTranslations('masterData');
  const err = useGraduationError();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const refresh = useRefreshGraduation();
  const [values, setValues] = useState<ExamForm>(EMPTY_EXAM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setValues(
        exam
          ? { name: exam.name, form: exam.form, startsOn: exam.startsOn ?? '', endsOn: exam.endsOn ?? '' }
          : EMPTY_EXAM,
      );
    }
  }, [open, exam]);

  const send = useMutation({
    mutationFn: async () => {
      const body = {
        name: values.name.trim(),
        form: values.form,
        startsOn: values.startsOn === '' ? null : values.startsOn,
        endsOn: values.endsOn === '' ? null : values.endsOn,
      };
      if (exam) {
        return unwrap(
          await api.PUT('/v1/school-exams/{id}', { params: { ...header, path: { id: exam.id } }, body }),
        );
      }
      return unwrap(
        await api.POST('/v1/academic-years/{id}/school-exams', {
          params: { ...header, path: { id: yearId } },
          body,
        }),
      );
    },
    onSuccess: () => {
      toast.success(t('exams.saved'));
      refresh();
    },
    onError: (e) => setError(err(e)),
  });

  const nameBad = values.name.trim() === '';
  const orderBad = values.startsOn !== '' && values.endsOn !== '' && values.startsOn > values.endsOn;

  return (
    <FormDialog
      open={open}
      title={exam ? t('exams.editTitle') : t('exams.createTitle')}
      description={t('exams.formHint')}
      submitLabel={tm('save')}
      error={error}
      disabled={nameBad || orderBad}
      onOpenChange={(next) => !next && onClose()}
      onSubmit={() => send.mutateAsync()}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2 sm:col-span-2">
          <Label htmlFor="gx-name">{t('exams.fieldName')}</Label>
          <Input
            id="gx-name"
            className={TOUCH_INPUT}
            maxLength={LIMITS.examName}
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          />
        </div>
        <div className="grid content-start gap-2 sm:col-span-2">
          <Label htmlFor="gx-form">{t('exams.fieldForm')}</Label>
          <SelectField
            id="gx-form"
            className={TOUCH_SELECT}
            value={values.form}
            onChange={(e) => setValues((v) => ({ ...v, form: e.target.value as ExamForm['form'] }))}
          >
            {EXAM_FORMS.map((f) => (
              <option key={f} value={f}>
                {t(`exams.forms.${f}`)}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="gx-start">{t('exams.fieldStart')}</Label>
          <DatePicker
            id="gx-start"
            className={TOUCH_INPUT}
            clearable
            value={values.startsOn}
            onChange={(d) => setValues((v) => ({ ...v, startsOn: d }))}
          />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="gx-end">{t('exams.fieldEnd')}</Label>
          <DatePicker
            id="gx-end"
            className={TOUCH_INPUT}
            clearable
            value={values.endsOn}
            onChange={(d) => setValues((v) => ({ ...v, endsOn: d }))}
          />
          {orderBad && <FieldError id="gx-end" issue={{ code: 'dateOrder' }} />}
        </div>
      </div>
    </FormDialog>
  );
}

/** Isi nilai ujian: pilih mapel, isi nilai tiap murid (atau tempel dari spreadsheet), simpan sekaligus. */
function ScoresDialog({ exam, onClose }: { exam: SchoolExamItem | null; onClose: () => void }) {
  const t = useTranslations('graduation');
  const err = useGraduationError();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const refresh = useRefreshGraduation();
  const manage = can('graduation:manage');

  const q = useQuery({
    queryKey: ['graduation', school.schoolId, 'scores', exam?.id],
    enabled: !!exam,
    refetchOnWindowFocus: false,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/school-exams/{id}/scores', {
          params: { ...header, path: { id: (exam as SchoolExamItem).id } },
        }),
      ),
  });
  const data = q.data;
  const [subjectId, setSubjectId] = useState('');
  const subject = data?.subjects.find((s) => s.id === subjectId)?.id ?? data?.subjects[0]?.id ?? '';
  const initial = useMemo(() => (data ? initialEdits(data.scores, subject) : {}), [data, subject]);
  const [edits, setEdits] = useState<ScoreEdits>({});
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteReport, setPasteReport] = useState<ParsedPaste | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setEdits(initial);
    setPasteReport(null);
  }, [initial]);

  const changes = changedScores(initial, edits, subject);
  const invalid = hasInvalidScore(edits);
  const locked = !manage || data?.locked === true;

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/school-exams/{id}/scores', {
          params: { ...header, path: { id: (exam as SchoolExamItem).id } },
          body: { scores: changes },
        }),
      ),
    onSuccess: (r) => {
      toast.success(t('exams.scoresSaved', { saved: r.saved, cleared: r.cleared }));
      setError(null);
      refresh();
    },
    onError: (e) => setError(err(e)),
  });

  function applyPaste() {
    if (!data) return;
    const parsed = parseScorePaste(pasteText, data.students);
    setPasteReport(parsed);
    setEdits((cur) => ({
      ...cur,
      ...Object.fromEntries(parsed.matched.map((m) => [m.studentId, String(m.value)])),
    }));
    if (parsed.matched.length > 0) setPasteText('');
  }

  return (
    <Dialog open={!!exam} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">
            {exam ? exam.name : t('exams.scoresTitle')}
          </DialogTitle>
          <DialogDescription>{t('exams.scoresHint')}</DialogDescription>
        </DialogHeader>
        {q.isPending && exam && <Skeleton className="h-48 w-full rounded-xl" />}
        {q.isError && (
          <Alert variant="destructive">
            <AlertDescription>{err(q.error)}</AlertDescription>
          </Alert>
        )}
        {data && (
          <div className="grid gap-4">
            {data.locked && (
              <Alert>
                <Lock className="size-4" aria-hidden />
                <AlertDescription>{t('exams.lockedNote')}</AlertDescription>
              </Alert>
            )}
            {data.students.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('exams.noStudents')}</p>
            ) : data.subjects.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('exams.noSubjects')}</p>
            ) : (
              <>
                <div className="grid content-start gap-2">
                  <Label htmlFor="gs-subject">{t('exams.subject')}</Label>
                  <SelectField
                    id="gs-subject"
                    className={TOUCH_SELECT}
                    value={subject}
                    onChange={(e) => setSubjectId(e.target.value)}
                  >
                    {data.subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </SelectField>
                </div>

                {!locked && (
                  <div className="grid gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 justify-self-start md:h-8"
                      onClick={() => setPasteOpen((v) => !v)}
                      aria-expanded={pasteOpen}
                    >
                      <ClipboardPaste className="size-4" aria-hidden /> {t('exams.paste')}
                    </Button>
                    {pasteOpen && (
                      <div className="bg-muted/40 grid gap-2 rounded-xl border p-3">
                        <Label htmlFor="gs-paste">{t('exams.pasteLabel')}</Label>
                        <Textarea
                          id="gs-paste"
                          rows={5}
                          placeholder={t('exams.pastePlaceholder')}
                          value={pasteText}
                          onChange={(e) => setPasteText(e.target.value)}
                        />
                        <p className="text-muted-foreground text-xs">{t('exams.pasteHint')}</p>
                        <Button
                          type="button"
                          className="h-11 justify-self-start md:h-8"
                          disabled={pasteText.trim() === ''}
                          onClick={applyPaste}
                        >
                          {t('exams.pasteApply')}
                        </Button>
                        {pasteReport && (
                          <div role="status" className="grid gap-1 text-xs">
                            <p className="font-medium">
                              {t('exams.pasteResult', {
                                matched: pasteReport.matched.length,
                                unmatched: pasteReport.unmatched.length,
                                invalid: pasteReport.invalid.length,
                              })}
                            </p>
                            {[...pasteReport.unmatched, ...pasteReport.invalid].slice(0, 5).map((line) => (
                              <p key={line} className="text-amber-700 break-words dark:text-amber-300">
                                {line}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <ul className="max-h-[50dvh] divide-y overflow-y-auto rounded-xl border">
                  {data.students.map((s) => {
                    const value = edits[s.studentId] ?? '';
                    const issue = scoreIssue(value);
                    const id = `gs-${s.studentId}`;
                    return (
                      <li
                        key={s.studentId}
                        className="grid grid-cols-[1fr_6.5rem] items-center gap-3 px-3 py-1.5"
                      >
                        <Label htmlFor={id} className="grid min-w-0 gap-0 font-normal">
                          <span className="truncate text-sm font-medium">{s.name}</span>
                          <span className="text-muted-foreground truncate text-xs">
                            {[s.className, s.nis].filter(Boolean).join(' · ')}
                          </span>
                        </Label>
                        <div className="grid gap-0.5">
                          <Input
                            id={id}
                            className={cn(TOUCH_INPUT, 'text-right tabular-nums')}
                            inputMode="decimal"
                            disabled={locked}
                            aria-invalid={issue !== undefined}
                            value={value}
                            onChange={(e) => setEdits((cur) => ({ ...cur, [s.studentId]: e.target.value }))}
                          />
                          {issue && <FieldError id={id} issue={issue} />}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div
              className={cn(
                '-mx-4 -mb-4 flex flex-wrap items-center justify-between gap-2 rounded-b-xl border-t bg-muted/50 p-4',
                'max-sm:sticky max-sm:-bottom-4 max-sm:z-10',
              )}
            >
              <p className="text-muted-foreground text-xs tabular-nums">
                {t('exams.changedCount', { count: changes.length })}
              </p>
              <div className="flex gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
                <Button type="button" variant="ghost" className="h-11 md:h-8" onClick={onClose}>
                  {t('close')}
                </Button>
                {!locked && (
                  <Button
                    type="button"
                    className="h-11 md:h-8"
                    disabled={changes.length === 0 || invalid || save.isPending}
                    onClick={() => save.mutate()}
                  >
                    <Save className="size-4" aria-hidden />{' '}
                    {save.isPending ? t('saving') : t('exams.saveScores')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Daftar ujian satuan pendidikan tahun ajaran, dengan isi nilai. */
export function ExamsPanel({ yearId }: { yearId: string }) {
  const t = useTranslations('graduation');
  const tm = useTranslations('masterData');
  const err = useGraduationError();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const refresh = useRefreshGraduation();
  const manage = can('graduation:manage');
  const show = (iso: string) => formatCalendarDate(locale, iso);

  const [form, setForm] = useState<{ exam: SchoolExamItem | null } | null>(null);
  const [scoring, setScoring] = useState<SchoolExamItem | null>(null);
  const [removing, setRemoving] = useState<SchoolExamItem | null>(null);

  const exams = useQuery({
    queryKey: ['graduation', school.schoolId, yearId, 'exams'],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/academic-years/{id}/school-exams', {
          params: { ...header, path: { id: yearId } },
        }),
      ),
  });
  const items = exams.data?.items ?? [];

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/school-exams/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('exams.removed'));
      refresh();
    },
    onError: (e) => toast.error(err(e)),
  });

  const addButton = manage ? (
    <Button className="h-11 md:h-8" onClick={() => setForm({ exam: null })}>
      <FilePlus2 className="size-4" aria-hidden /> {t('exams.create')}
    </Button>
  ) : null;

  return (
    <section className="grid gap-4" aria-labelledby="grad-exams-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="grad-exams-title" className="font-heading text-lg font-semibold">
            {t('exams.title')}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{t('exams.help')}</p>
        </div>
        {items.length > 0 && addButton}
      </div>

      {exams.isPending && <ListSkeleton rows={3} stats={0} />}
      {exams.isError && (
        <Alert variant="destructive">
          <AlertDescription>{err(exams.error)}</AlertDescription>
        </Alert>
      )}
      {exams.data && items.length === 0 && (
        <EmptyPanel
          icon={ListOrdered}
          tone={MODULE_TONE.academic}
          title={t('exams.emptyTitle')}
          body={manage ? t('exams.emptyBody') : t('exams.emptyBodyReadOnly')}
          action={addButton ?? undefined}
        />
      )}
      {items.length > 0 && (
        <DataRows<SchoolExamItem>
          rows={items}
          rowKey={(r) => r.id}
          cardsBelow="lg"
          actionsHeader={tm('actions')}
          onRowClick={(r) => setScoring(r)}
          columns={[
            {
              key: 'name',
              header: t('exams.colName'),
              cell: (r) => (
                <span className="grid gap-1">
                  <span className="font-medium">{r.name}</span>
                  <span>
                    <ToneBadge tone="slate">{t(`exams.forms.${r.form}`)}</ToneBadge>
                  </span>
                </span>
              ),
            },
            {
              key: 'dates',
              header: t('exams.colDates'),
              cell: (r) =>
                r.startsOn ? (
                  <span className="tabular-nums">
                    {show(r.startsOn)}
                    {r.endsOn && r.endsOn !== r.startsOn ? ` – ${show(r.endsOn)}` : ''}
                  </span>
                ) : (
                  tm('none')
                ),
            },
            {
              key: 'scores',
              header: t('exams.colScores'),
              cell: (r) => (
                <span className="tabular-nums">{t('exams.scoreCount', { count: r.scoreCount })}</span>
              ),
            },
            {
              key: 'weight',
              header: t('exams.colWeight'),
              cell: (r) =>
                r.weight !== null ? (
                  <ToneBadge tone="violet">{r.weight}</ToneBadge>
                ) : (
                  <span className="text-muted-foreground">{t('exams.noWeight')}</span>
                ),
            },
          ]}
          actions={(r) => (
            <RowMenu
              label={tm('actionsFor', { name: r.name })}
              actions={[
                {
                  label: manage ? t('exams.fillScores') : t('exams.viewScores'),
                  icon: ListOrdered,
                  onSelect: () => setScoring(r),
                },
                ...(manage
                  ? [
                      { label: tm('edit'), icon: Pencil, onSelect: () => setForm({ exam: r }) },
                      { label: tm('delete'), icon: Trash2, onSelect: () => setRemoving(r) },
                    ]
                  : []),
              ]}
            />
          )}
        />
      )}

      <ExamFormDialog
        yearId={yearId}
        exam={form?.exam ?? null}
        open={form !== null}
        onClose={() => setForm(null)}
      />
      <ScoresDialog exam={scoring} onClose={() => setScoring(null)} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('exams.removeTitle')}
        description={t('exams.removeBody', { name: removing?.name ?? '' })}
        confirmLabel={tm('delete')}
        destructive
        pending={remove.isPending}
        onConfirm={async () => {
          if (removing) await remove.mutateAsync(removing.id);
        }}
      />
    </section>
  );
}
