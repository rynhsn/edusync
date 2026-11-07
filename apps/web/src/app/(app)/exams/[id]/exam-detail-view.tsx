'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardPen,
  FileQuestion,
  Pencil,
  Plus,
  Printer,
  ScanLine,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { FormDialog } from '@/components/form-dialog';
import { FieldError, useFormValidation } from '@/components/form-field-error';
import { PageBody, PageHeader } from '@/components/page-header';
import { RichText } from '@/components/rich-text';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, TONES, ToneBadge } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { ExamDialog } from '../exam-dialog';
import { type PickField, validatePicked, validatePoints } from '../exam-validation';

interface ExamQuestion {
  id: string;
  sourceQuestionId: string | null;
  sort: number;
  type: 'mcq' | 'essay';
  body: string;
  options: { key: string; text: string }[];
  answer: string | null;
  points: number;
}

/** "07:30" + 90 menit -> "09:00" (lewat tengah malam kembali ke 00:xx). */
function endTime(start: string, minutes: number) {
  const [h = 0, m = 0] = start.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Poin satu soal, disimpan saat isian ditinggalkan. Isian yang salah tidak dibuang diam-diam: pesan merah tampil di
 * bawahnya dan tidak ada yang disimpan sampai benar (bilangan bulat 1..1000, sama dengan API).
 */
function PointsField({
  id,
  label,
  points,
  onSave,
}: {
  id: string;
  label: string;
  points: number;
  onSave: (n: number) => void;
}) {
  const [value, setValue] = useState(String(points));
  const [touched, setTouched] = useState(false);
  const issue = validatePoints(value);
  const shown = touched ? issue : undefined;
  return (
    <div className="ml-2 grid content-start gap-1 text-xs">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id} className="text-muted-foreground text-xs font-normal">
          {label}
        </Label>
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={value}
          aria-invalid={shown !== undefined}
          aria-describedby={shown ? `${id}-error` : undefined}
          className="h-10 w-20 md:h-8"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          onBlur={() => {
            setTouched(true);
            if (!issue && Number(value) !== points) onSave(Number(value));
          }}
        />
      </div>
      <FieldError id={id} issue={shown} />
    </div>
  );
}

/** Susun ujian: soal-soal dari bank, urutan, poin, dan jalan pintas ke lembar cetak. */
export function ExamDetailView({ id }: { id: string }) {
  const t = useTranslations('examList');
  const tc = useTranslations('examCbtAdmin');
  const ts = useTranslations('examScores');
  const tscan = useTranslations('examScan');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const author = can('exam:author');
  const key = ['exam', school.schoolId, id];
  const [editOpen, setEditOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);

  const detail = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/exams/{id}', { params: { ...header, path: { id } } })),
  });
  const ex = detail.data;
  const questions = (ex?.questions ?? []) as ExamQuestion[];

  const onData = (data: unknown) => {
    queryClient.setQueryData(key, data);
    queryClient.invalidateQueries({ queryKey: ['exams', school.schoolId] });
  };
  const failed = (e: unknown) => toast.error(te(errorKey(e)));

  const reorder = useMutation({
    mutationFn: async (ids: string[]) =>
      unwrap(
        await api.PUT('/v1/exams/{id}/questions/order', {
          params: { ...header, path: { id } },
          body: { ids },
        }),
      ),
    onSuccess: onData,
    onError: failed,
  });
  const setPoints = useMutation({
    mutationFn: async (v: { qid: string; points: number }) =>
      unwrap(
        await api.PUT('/v1/exams/{id}/questions/{questionId}', {
          params: { ...header, path: { id, questionId: v.qid } },
          body: { points: v.points },
        }),
      ),
    onSuccess: onData,
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: async (qid: string) =>
      unwrap(
        await api.DELETE('/v1/exams/{id}/questions/{questionId}', {
          params: { ...header, path: { id, questionId: qid } },
        }),
      ),
    onSuccess: (data) => {
      toast.success(t('questionRemoved'));
      onData(data);
    },
    onError: failed,
  });

  /** Tandai siap / kembalikan ke draf memakai PUT penuh dari data yang sudah dimuat. */
  const toggleStatus = useMutation({
    mutationFn: async () => {
      if (!ex) return null;
      const status = ex.status === 'ready' ? ('draft' as const) : ('ready' as const);
      if (status === 'ready' && ex.mode !== 'paper' && !(ex.examDate && ex.startTime && ex.durationMinutes)) {
        throw new Error('schedule');
      }
      return unwrap(
        await api.PUT('/v1/exams/{id}', {
          params: { ...header, path: { id } },
          body: {
            examTypeId: ex.examTypeId,
            title: ex.title,
            semesterId: ex.semesterId,
            subjectId: ex.subjectId,
            classIds: ex.classIds,
            mode: ex.mode,
            examDate: ex.examDate,
            startTime: ex.startTime,
            durationMinutes: ex.durationMinutes,
            status,
            shuffleQuestions: ex.shuffleQuestions,
            shuffleOptions: ex.shuffleOptions,
          },
        }),
      );
    },
    onSuccess: (data) => {
      if (!data) return;
      toast.success(tc('statusUpdated'));
      onData(data);
    },
    onError: (e) =>
      toast.error(e instanceof Error && e.message === 'schedule' ? tc('scheduleMissing') : te(errorKey(e))),
  });

  function move(i: number, dir: -1 | 1) {
    const ids = questions.map((q) => q.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
    reorder.mutate(ids);
  }

  if (detail.isError) {
    return (
      <PageBody>
        <PageHeader title={t('detailTitle')} actions={<BackLink href="/exams" />} />
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }
  if (!ex) {
    return (
      <PageBody>
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </PageBody>
    );
  }

  const meta = [
    ex.classNames.join(', '),
    ex.examDate ? formatCalendarDate(locale, ex.examDate) : null,
    ex.startTime,
    ex.durationMinutes ? t('minutes', { n: ex.durationMinutes }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <PageBody>
      <PageHeader
        title={ex.title}
        description={`${ex.subjectName} · ${ex.semesterName}${meta ? ` · ${meta}` : ''}`}
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href={`/exams/${id}/print`} />}>
              <Printer className="size-4" aria-hidden /> {t('print')}
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href={`/exams/${id}/scores`} />}>
              <ClipboardPen className="size-4" aria-hidden /> {ts('inputScores')}
            </Button>
            {author && (
              <Button variant="outline" nativeButton={false} render={<Link href={`/exams/${id}/scan`} />}>
                <ScanLine className="size-4" aria-hidden /> {tscan('scanButton')}
              </Button>
            )}
            {author && (
              <Button variant="outline" nativeButton={false} render={<Link href={`/exams/${id}/paper`} />}>
                <SlidersHorizontal className="size-4" aria-hidden /> {t('paperSettings')}
              </Button>
            )}
            {author && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" aria-hidden /> {t('editExam')}
              </Button>
            )}
            <BackLink href="/exams" />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ToneBadge tone="violet">{ex.typeShort}</ToneBadge>
        <ToneBadge tone={ex.status === 'ready' ? 'emerald' : 'amber'}>{t(`status_${ex.status}`)}</ToneBadge>
        <ToneBadge tone="sky" dot={false}>
          {t(`mode_${ex.mode}`)}
        </ToneBadge>
        {ex.customPaper && (
          <ToneBadge tone="slate" dot={false}>
            {t('customPaper')}
          </ToneBadge>
        )}
        <span className="text-muted-foreground ml-auto text-sm tabular-nums">
          {t('questionsPoints', { n: ex.questionCount, pts: ex.totalPoints })}
        </span>
        {author && (
          <Button variant="outline" disabled={toggleStatus.isPending} onClick={() => toggleStatus.mutate()}>
            {ex.status === 'ready' ? tc('backToDraft') : tc('markReady')}
          </Button>
        )}
        {author && (
          <Button onClick={() => setBankOpen(true)}>
            <Plus className="size-4" aria-hidden /> {t('addFromBank')}
          </Button>
        )}
      </div>

      {ex.mode !== 'paper' && (
        <Alert>
          <AlertDescription>
            {ex.examDate && ex.startTime && ex.durationMinutes
              ? tc('cbtWindow', {
                  date: formatCalendarDate(locale, ex.examDate),
                  start: ex.startTime,
                  end: endTime(ex.startTime, ex.durationMinutes),
                })
              : tc('cbtNoSchedule')}{' '}
            {ex.status === 'ready' ? tc('cbtVisible') : tc('cbtNotVisible')}
          </AlertDescription>
        </Alert>
      )}

      {questions.length === 0 ? (
        <EmptyPanel
          icon={FileQuestion}
          tone="violet"
          title={t('noQuestionsTitle')}
          body={t('noQuestionsBody')}
          action={
            author && (
              <Button onClick={() => setBankOpen(true)}>
                <Plus className="size-4" aria-hidden /> {t('addFromBank')}
              </Button>
            )
          }
        />
      ) : (
        <ol className="grid gap-3">
          {questions.map((q, i) => (
            <li key={q.id} className="bg-card grid gap-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-[var(--muted)] text-sm font-semibold tabular-nums">
                  {i + 1}
                </span>
                <ToneBadge tone={q.type === 'mcq' ? 'sky' : 'amber'}>{t(`type_${q.type}`)}</ToneBadge>
                {author ? (
                  <PointsField
                    key={`${q.id}-${q.points}`}
                    id={`pts-${q.id}`}
                    label={t('points')}
                    points={q.points}
                    onSave={(n) => setPoints.mutate({ qid: q.id, points: n })}
                  />
                ) : (
                  <span className="text-muted-foreground text-xs">{t('pointsShort', { n: q.points })}</span>
                )}
                {author && (
                  <span className="ml-auto flex gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('moveUp', { n: i + 1 })}
                      disabled={i === 0 || reorder.isPending}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('moveDown', { n: i + 1 })}
                      disabled={i === questions.length - 1 || reorder.isPending}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('removeQuestion', { n: i + 1 })}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(q.id)}
                    >
                      <Trash2 />
                    </Button>
                  </span>
                )}
              </div>
              <RichText text={q.body} className="text-sm" />
              {q.type === 'mcq' && (
                <ul className="grid content-start gap-1.5 text-sm sm:grid-cols-2">
                  {q.options.map((o) => {
                    const right = o.key.toUpperCase() === q.answer?.toUpperCase();
                    return (
                      <li
                        key={o.key}
                        className={cn(
                          'flex items-start gap-2 rounded-lg border px-2.5 py-1.5',
                          right && cn(TONES.emerald.soft, 'border-transparent'),
                        )}
                      >
                        <span className="font-semibold">{o.key}.</span>
                        <RichText text={o.text} className="min-w-0 flex-1" />
                        {right && <Check aria-label={t('correct')} className="mt-0.5 size-4 shrink-0" />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      <ExamDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        exam={ex}
        onSaved={() => {
          setEditOpen(false);
          queryClient.invalidateQueries({ queryKey: key });
          queryClient.invalidateQueries({ queryKey: ['exams', school.schoolId] });
        }}
      />

      <BankDialog
        examId={id}
        subjectId={ex.subjectId}
        subjectName={ex.subjectName}
        added={new Set(questions.map((q) => q.sourceQuestionId).filter((s): s is string => !!s))}
        open={bankOpen}
        onOpenChange={setBankOpen}
        onAdded={onData}
      />
    </PageBody>
  );
}

/** Pilih soal dari bank (mapel ujian) untuk ditambahkan; yang sudah ada di ujian ditandai dan tidak bisa dipilih. */
function BankDialog({
  examId,
  subjectId,
  subjectName,
  added,
  open,
  onOpenChange,
  onAdded,
}: {
  examId: string;
  subjectId: string;
  subjectName: string;
  added: Set<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (data: unknown) => void;
}) {
  const t = useTranslations('examList');
  const te = useTranslations();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const bank = useQuery({
    queryKey: ['exam-questions', school.schoolId, 'pick', subjectId, q],
    enabled: open,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/exam/questions', {
          params: { ...header, query: { subjectId, limit: 100, ...(q.trim() ? { q: q.trim() } : {}) } },
        }),
      ),
  });
  const items = bank.data?.items ?? [];
  const validation = useFormValidation<PickField>({
    errors: validatePicked(picked.length),
    order: ['picked'],
    idPrefix: 'bk',
  });

  const add = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/exams/{id}/questions', {
          params: { ...header, path: { id: examId } },
          body: { questionIds: picked },
        }),
      ),
    onSuccess: (data) => {
      toast.success(t('questionsAdded', { n: picked.length }));
      setPicked([]);
      onAdded(data);
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setPicked([]);
          setQ('');
          setError(null);
        }
        onOpenChange(o);
      }}
      title={t('bankDialogTitle', { subject: subjectName })}
      description={t('bankDialogBody')}
      submitLabel={t('addPicked', { n: picked.length })}
      size="wide"
      error={error}
      validation={validation}
      onSubmit={() => add.mutateAsync()}
    >
      <div className="grid gap-3">
        <div className="relative">
          <Search aria-hidden className="text-muted-foreground absolute top-3 left-2.5 size-4 md:top-2.5" />
          <Input
            aria-label={t('searchBank')}
            className="h-10 pl-8 md:h-8"
            placeholder={t('searchBank')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div
          id={validation.idOf('picked')}
          tabIndex={-1}
          aria-describedby={validation.issue('picked') ? `${validation.idOf('picked')}-error` : undefined}
          className="outline-none"
        >
          {bank.isPending ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : items.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">{t('bankEmpty')}</p>
          ) : (
            <ul className="grid max-h-[50vh] gap-2 overflow-y-auto pr-1">
              {items.map((x) => {
                const already = added.has(x.id);
                return (
                  <li key={x.id}>
                    {/* biome-ignore lint/a11y/noLabelWithoutControl: kontrolnya Checkbox Base UI di dalam label. */}
                    <label
                      className={cn(
                        'flex items-start gap-3 rounded-xl border p-3',
                        already ? 'opacity-60' : 'hover:bg-muted/40 cursor-pointer',
                      )}
                    >
                      <Checkbox
                        className="mt-1"
                        disabled={already}
                        checked={already || picked.includes(x.id)}
                        onCheckedChange={(v) => {
                          validation.touch('picked');
                          setPicked(v === true ? [...picked, x.id] : picked.filter((p) => p !== x.id));
                        }}
                      />
                      <span className="grid min-w-0 flex-1 gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <ToneBadge tone={x.type === 'mcq' ? 'sky' : 'amber'}>
                            {t(`type_${x.type}`)}
                          </ToneBadge>
                          <span className="text-muted-foreground text-xs">
                            {t('pointsShort', { n: x.points })}
                          </span>
                          {already && (
                            <span className="text-muted-foreground text-xs">{t('alreadyAdded')}</span>
                          )}
                        </span>
                        <RichText text={x.body} className="line-clamp-3 text-sm" />
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <FieldError id={validation.idOf('picked')} issue={validation.issue('picked')} />
        {(bank.data?.total ?? 0) > items.length && (
          <p className="text-muted-foreground text-center text-xs">
            {t('bankShowing', { shown: items.length, total: bank.data?.total ?? 0 })}
          </p>
        )}
      </div>
    </FormDialog>
  );
}
