'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookCheck, ClipboardList, Info, MessageSquareText, Save, Undo2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { FormDialog } from '@/components/form-dialog';
import { FieldError, TOUCH_SELECT, useFormValidation } from '@/components/form-field-error';
import { PageBody, PageHeader } from '@/components/page-header';
import { RichText } from '@/components/rich-text';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import type { FieldIssue } from '@/lib/form-validation';
import {
  countWritable,
  firstEditableIndex,
  isReadOnlyRow,
  nextEditableIndex,
  rowsToSubmit,
} from '@/lib/read-only-rows';
import { cn } from '@/lib/utils';
import { SEND_ORDER, type SendField, validateEssayScore, validateSend } from '../../exam-validation';

interface Question {
  id: string;
  sort: number;
  type: 'mcq' | 'essay';
  points: number;
  key: string | null;
  optionKeys: string[];
}
interface Student {
  studentId: string;
  name: string;
  nis: string | null;
  classId: string;
  className: string;
  /** `graduated` = lulusan: tampil baca-saja dan tidak pernah dikirim. Kosong (server lama) = dapat diubah. */
  studentStatus?: 'active' | 'graduated';
  entered: boolean;
  absent: boolean;
  /** Dari server: ada esai yang belum diberi skor. */
  essayPending: boolean;
  answers: Record<string, { answer: string | null; score: number | null }>;
  startedAt: string | null;
  submittedAt: string | null;
  blurCount: number;
}
/** Isian siswa yang sedang diedit: huruf untuk pilihan ganda, angka (teks) untuk esai. */
interface Edit {
  absent: boolean;
  cells: Record<string, string>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function cellOf(s: Student, q: Question): string {
  const a = s.answers[q.id];
  if (!a) return '';
  return q.type === 'mcq' ? (a.answer ?? '') : a.score == null ? '' : String(a.score);
}

/** Aturan yang sama dengan server: pilihan ganda benar = poin soal; esai = skor ketikan; kosong = 0. */
function scoreOf(q: Question, v: string): number {
  if (q.type === 'mcq') return v && v === q.key?.toUpperCase() ? q.points : 0;
  const n = Number(v.replace(',', '.'));
  return v.trim() !== '' && Number.isFinite(n) ? n : 0;
}

/** Input nilai ujian: jawaban pilihan ganda dan skor esai per siswa, lalu kirim ke buku nilai. */
export function ScoresView({ id }: { id: string }) {
  const t = useTranslations('examScores');
  const tc = useTranslations('examCbtAdmin');
  const locale = useLocale();
  const te = useTranslations();
  const tv = useTranslations('formValidation');
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const author = can('exam:author');
  const sheetKey = ['exam-scoresheet', school.schoolId, id];
  const grid = useRef<HTMLDivElement>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [error, setError] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [componentId, setComponentId] = useState('');
  const [sendDate, setSendDate] = useState('');
  const [allowPending, setAllowPending] = useState(false);
  const [reading, setReading] = useState<{ s: Student; qid: string; n: number } | null>(null);
  // Sel skor yang sudah ditinggalkan (blur) dan apakah simpan sudah dicoba: galat sel baru tampil setelah itu.
  const [touchedCells, setTouchedCells] = useState<Set<string>>(() => new Set());
  const [attempted, setAttempted] = useState(false);

  const exam = useQuery({
    queryKey: ['exam', school.schoolId, id],
    queryFn: async () => unwrap(await api.GET('/v1/exams/{id}', { params: { ...header, path: { id } } })),
  });
  const sheet = useQuery({
    queryKey: sheetKey,
    queryFn: async () =>
      unwrap(await api.GET('/v1/exams/{id}/scoresheet', { params: { ...header, path: { id } } })),
  });
  const components = useQuery({
    queryKey: ['grading-components', school.schoolId],
    enabled: author,
    queryFn: async () => unwrap(await api.GET('/v1/grading/components', { params: header })),
  });

  const questions = (sheet.data?.questions ?? []) as Question[];
  const students = (sheet.data?.students ?? []) as Student[];
  const maxTotal = sheet.data?.maxTotal ?? 0;
  const multiClass = new Set(students.map((s) => s.classId)).size > 1;
  const dirty = rowsToSubmit(students, (s) => !!edits[s.studentId]).length > 0;
  const hasReadOnly = students.some(isReadOnlyRow);
  // Lulusan tidak ikut dikirim ke buku nilai, jadi esai mereka yang belum dinilai bukan "perlu diisi".
  const pendingEssays = countWritable(students, (s) => s.entered && !s.absent && s.essayPending);
  const firstEditable = firstEditableIndex(students);

  const view = (s: Student): Edit =>
    edits[s.studentId] ?? {
      absent: s.absent,
      cells: Object.fromEntries(questions.map((q) => [q.id, cellOf(s, q)])),
    };

  const rows = students.map((s, r) => {
    const e = view(s);
    const readOnly = isReadOnlyRow(s);
    const touched = s.entered || !!edits[s.studentId];
    const total = round2(questions.reduce((n, q) => n + scoreOf(q, e.cells[q.id] ?? ''), 0));
    // Galat per sel skor esai, kuncinya "baris-kolom" seperti data-cell. Siswa tidak hadir tidak diperiksa.
    const cellIssues: Record<string, FieldIssue> = {};
    if (!e.absent && !readOnly) {
      questions.forEach((q, c) => {
        if (q.type !== 'essay') return;
        const issue = validateEssayScore(e.cells[q.id] ?? '', q.points);
        if (issue) cellIssues[`${r}-${c}`] = issue;
      });
    }
    return {
      s,
      e,
      readOnly,
      studentStatus: s.studentStatus,
      touched,
      total,
      cellIssues,
      percent: touched && !e.absent && maxTotal > 0 ? round2((total / maxTotal) * 100) : null,
      essayPending:
        !readOnly &&
        touched &&
        !e.absent &&
        questions.some((q) => q.type === 'essay' && (e.cells[q.id] ?? '').trim() === ''),
    };
  });
  const firstBadCell = rows.flatMap((r) => Object.keys(r.cellIssues))[0];
  const invalid = firstBadCell !== undefined;
  const present = rows.filter((r) => r.percent !== null);
  const percents = present.map((r) => r.percent as number);
  const stats = {
    entered: rows.filter((r) => r.touched && !r.e.absent).length,
    absent: rows.filter((r) => r.e.absent).length,
    avg: percents.length ? round2(percents.reduce((a, b) => a + b, 0) / percents.length) : null,
    min: percents.length ? Math.min(...percents) : null,
    max: percents.length ? Math.max(...percents) : null,
  };

  function patch(s: Student, fn: (e: Edit) => Edit) {
    setEdits((prev) => ({ ...prev, [s.studentId]: fn(prev[s.studentId] ?? view(s)) }));
  }

  const save = useMutation({
    mutationFn: async () => {
      // Lulusan tidak pernah dikirim: server menolak seluruh permintaan (400) bila ada satu saja.
      const records = rowsToSubmit(students, (s) => !!edits[s.studentId]).map((s) => {
        const e = edits[s.studentId] as Edit;
        return {
          studentId: s.studentId,
          absent: e.absent,
          answers: e.absent
            ? []
            : questions.map((q) => {
                const v = e.cells[q.id] ?? '';
                return q.type === 'mcq'
                  ? { questionId: q.id, answer: v || null }
                  : {
                      questionId: q.id,
                      score: v.trim() === '' ? null : Number(v.replace(',', '.')),
                    };
              }),
        };
      });
      return unwrap(
        await api.PUT('/v1/exams/{id}/scoresheet', {
          params: { ...header, path: { id } },
          body: { records },
        }),
      );
    },
    onSuccess: (data) => {
      setError(null);
      setEdits({});
      setAttempted(false);
      setTouchedCells(new Set());
      queryClient.setQueryData(sheetKey, data);
      toast.success(t('saved'));
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const send = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/exams/{id}/grades', {
          params: { ...header, path: { id } },
          body: { componentId, allowPending, ...(sendDate ? { date: sendDate } : {}) },
        }),
      ),
    onSuccess: (r) => {
      toast.success(t('sent', { assessments: r.assessments, scores: r.scores }));
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
    },
  });

  /** Pindah fokus ke sel lain; sel diberi `data-cell="baris-kolom"`. */
  function focusCell(r: number, c: number) {
    const el = grid.current?.querySelector<HTMLInputElement>(`[data-cell="${r}-${c}"]`);
    if (el && !el.disabled) {
      el.focus();
      el.select();
    }
  }
  /** Coba simpan: bila ada sel yang salah, tampilkan semuanya dan pindah ke yang pertama. */
  function trySave() {
    setAttempted(true);
    if (firstBadCell === undefined) {
      save.mutate();
      return;
    }
    const [r, c] = firstBadCell.split('-').map(Number) as [number, number];
    focusCell(r, c);
    const el = grid.current?.querySelector<HTMLInputElement>(`[data-cell="${firstBadCell}"]`);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center', inline: 'center' });
  }
  function onKey(e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) {
    const move = (dr: number, dc: number) => {
      e.preventDefault();
      if (dr === 0) return focusCell(r, c + dc);
      // Vertikal: lompati baris baca-saja (lulusan) dan siswa tidak hadir.
      const next = nextEditableIndex(rows, r, dr < 0 ? -1 : 1, (row) => !row.e.absent);
      if (next !== null) focusCell(next, c);
    };
    if (e.key === 'Enter' || e.key === 'ArrowDown') move(1, 0);
    else if (e.key === 'ArrowUp') move(-1, 0);
    else if (e.key === 'ArrowRight' && e.currentTarget.selectionEnd === e.currentTarget.value.length)
      move(0, 1);
    else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) move(0, -1);
  }

  const clock = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const cbtRows = students.filter((s) => s.startedAt);
  const examQuestionBody = (qid: string) =>
    (exam.data?.questions ?? []).find((q) => q.id === qid)?.body ?? '';

  const loading = sheet.isPending || exam.isPending;
  const ex = exam.data;
  const componentList = components.data ?? [];
  const canSend = author && !dirty && students.some((s) => !isReadOnlyRow(s) && s.entered);
  const sendValidation = useFormValidation<SendField>({
    errors: validateSend({ componentId, pendingEssays, allowPending }),
    order: SEND_ORDER,
    idPrefix: 'send',
  });

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={ex ? `${ex.title} · ${ex.subjectName} · ${ex.classNames.join(', ')}` : t('subtitle')}
        actions={
          <>
            {author && (
              <Button
                variant="outline"
                disabled={!canSend}
                title={canSend ? undefined : t('sendHint')}
                onClick={() => {
                  setComponentId((c) => c || componentList[0]?.id || '');
                  setSendDate(ex?.examDate ?? '');
                  setSendOpen(true);
                }}
              >
                <BookCheck className="size-4" aria-hidden /> {t('sendGrades')}
              </Button>
            )}
            <BackLink href={`/exams/${id}`} />
          </>
        }
      />

      {(sheet.isError || exam.isError) && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : questions.length === 0 ? (
        <EmptyPanel
          icon={ClipboardList}
          tone="violet"
          title={t('noQuestionsTitle')}
          body={t('noQuestionsBody')}
        />
      ) : students.length === 0 ? (
        <EmptyPanel
          icon={ClipboardList}
          tone="violet"
          title={t('noStudentsTitle')}
          body={t('noStudentsBody')}
        />
      ) : (
        <>
          <div className="bg-card grid grid-cols-2 gap-3 rounded-2xl border p-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              [t('sumStudents'), students.length],
              [t('sumEntered'), stats.entered],
              [t('sumAbsent'), stats.absent],
              [t('sumAvg'), stats.avg === null ? '-' : stats.avg],
              [t('sumMin'), stats.min === null ? '-' : stats.min],
              [t('sumMax'), stats.max === null ? '-' : stats.max],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-muted-foreground text-xs">{label}</p>
                <p className="font-heading text-lg font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {cbtRows.length > 0 && (
            <p className="text-sm">
              {tc('submittedSummary', {
                done: cbtRows.filter((s) => s.submittedAt).length,
                total: students.length,
              })}
            </p>
          )}

          {!author && (
            <Alert>
              <AlertDescription>{t('readOnly')}</AlertDescription>
            </Alert>
          )}
          {hasReadOnly && (
            <Alert>
              <Info className="size-4" aria-hidden />
              <AlertDescription>{t('graduatedHint')}</AlertDescription>
            </Alert>
          )}
          <p className="text-muted-foreground text-xs">{t('keysHint')}</p>

          <div ref={grid} className="bg-card max-h-[70vh] overflow-auto rounded-2xl border">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="bg-card sticky top-0 left-0 z-20 min-w-48 border-b px-3 py-2 text-left font-medium">
                    {t('student')}
                  </th>
                  {questions.map((q, c) => (
                    <th
                      key={q.id}
                      className="bg-card sticky top-0 z-10 min-w-16 border-b px-2 py-2 text-center"
                    >
                      <div className="font-medium">{t('questionNo', { n: c + 1 })}</div>
                      <div className="text-muted-foreground text-xs font-normal">
                        {q.type === 'mcq' ? t('mcqShort') : t('essayShort')} · {q.points}
                      </div>
                    </th>
                  ))}
                  <th className="bg-card sticky top-0 z-10 min-w-24 border-b px-3 py-2 text-right font-medium">
                    {t('total')}
                    <div className="text-muted-foreground text-xs font-normal">/ {maxTotal}</div>
                  </th>
                  <th className="bg-card sticky top-0 z-10 min-w-36 border-b px-3 py-2 text-left font-medium">
                    {t('absent')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, r) => (
                  <tr
                    key={row.s.studentId}
                    className={cn(
                      (row.e.absent || row.readOnly) && 'bg-muted/40',
                      row.e.absent && 'opacity-70',
                    )}
                  >
                    <td className="bg-card sticky left-0 z-10 border-b px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 truncate font-medium">{row.s.name}</span>
                        {row.readOnly && (
                          <ToneBadge tone="slate" dot={false}>
                            {t('graduatedBadge')}
                          </ToneBadge>
                        )}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {[multiClass ? row.s.className : null, row.s.nis].filter(Boolean).join(' · ')}
                      </div>
                      {row.s.startedAt && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                          <ToneBadge tone={row.s.submittedAt ? 'emerald' : 'sky'} dot={false}>
                            {row.s.submittedAt
                              ? tc('submittedAt', { time: clock(row.s.submittedAt) })
                              : tc('working', { time: clock(row.s.startedAt) })}
                          </ToneBadge>
                          {row.s.blurCount > 0 && (
                            <ToneBadge tone="amber" dot={false}>
                              {tc('blurs', { n: row.s.blurCount })}
                            </ToneBadge>
                          )}
                        </div>
                      )}
                    </td>
                    {questions.map((q, c) => {
                      const v = row.e.cells[q.id] ?? '';
                      const mcq = q.type === 'mcq';
                      const right = mcq && v !== '' && v === q.key?.toUpperCase();
                      const wrong = mcq && v !== '' && !right;
                      const cellKey = `${r}-${c}`;
                      const cellIssue = row.cellIssues[cellKey];
                      const shownIssue =
                        cellIssue && (attempted || touchedCells.has(cellKey)) ? cellIssue : undefined;
                      const over = shownIssue !== undefined;
                      const errId = `score-${cellKey}`;
                      return (
                        <td key={q.id} className="border-b px-1.5 py-1.5 text-center align-top">
                          <div className="flex items-center justify-center gap-0.5">
                            <input
                              data-cell={`${r}-${c}`}
                              // biome-ignore lint/a11y/noAutofocus: guru langsung mengetik di sel pertama.
                              autoFocus={r === firstEditable && c === 0}
                              inputMode={mcq ? 'text' : 'decimal'}
                              maxLength={mcq ? 1 : 6}
                              disabled={!author || row.e.absent || row.readOnly}
                              readOnly={row.readOnly}
                              value={v}
                              aria-label={t(mcq ? 'cellMcq' : 'cellEssay', { name: row.s.name, n: c + 1 })}
                              aria-invalid={over}
                              aria-describedby={over ? `${errId}-error` : undefined}
                              onKeyDown={(e) => onKey(e, r, c)}
                              onFocus={(e) => e.currentTarget.select()}
                              onBlur={() =>
                                setTouchedCells((prev) =>
                                  prev.has(cellKey) ? prev : new Set(prev).add(cellKey),
                                )
                              }
                              onChange={(e) => {
                                const raw = e.target.value;
                                const next = mcq ? raw.toUpperCase().slice(-1) : raw.replace(/[^0-9.,]/g, '');
                                if (mcq && next && !q.optionKeys.map((k) => k.toUpperCase()).includes(next))
                                  return;
                                patch(row.s, (ed) => ({ ...ed, cells: { ...ed.cells, [q.id]: next } }));
                              }}
                              className={cn(
                                'border-input h-10 w-12 rounded-md border bg-transparent text-center tabular-nums outline-none md:h-8',
                                'focus-visible:ring-ring/50 focus-visible:ring-2 disabled:cursor-not-allowed',
                                row.readOnly && 'bg-muted/60 text-muted-foreground border-dashed',
                                right &&
                                  'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                                wrong && 'border-rose-400 bg-rose-500/10 text-rose-700 dark:text-rose-300',
                                over && 'border-destructive',
                              )}
                            />
                            {!mcq && row.s.answers[q.id]?.answer && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                tabIndex={-1}
                                className="size-6"
                                aria-label={tc('viewAnswer', { name: row.s.name, n: c + 1 })}
                                onClick={() => setReading({ s: row.s, qid: q.id, n: c + 1 })}
                              >
                                <MessageSquareText className="size-3.5" />
                              </Button>
                            )}
                          </div>
                          <FieldError id={errId} issue={shownIssue} className="mt-1" />
                        </td>
                      );
                    })}
                    <td className="border-b px-3 py-1.5 text-right tabular-nums">
                      <span className="font-semibold">{row.touched && !row.e.absent ? row.total : '-'}</span>
                      {row.percent !== null && (
                        <span className="text-muted-foreground ml-1 text-xs">{row.percent}%</span>
                      )}
                    </td>
                    <td className="border-b px-3 py-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Checkbox
                          checked={row.e.absent}
                          disabled={!author || row.readOnly}
                          aria-label={t('absentLabel', { name: row.s.name })}
                          onCheckedChange={(v) =>
                            patch(row.s, (ed) => ({
                              absent: v === true,
                              cells:
                                v === true ? Object.fromEntries(questions.map((q) => [q.id, ''])) : ed.cells,
                            }))
                          }
                        />
                        {row.essayPending && (
                          <ToneBadge tone="amber" dot={false}>
                            {t('essayPending')}
                          </ToneBadge>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {author && (
            <div className="bg-background/90 sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border p-3 shadow-lg backdrop-blur">
              <div className="text-muted-foreground flex min-w-0 flex-1 items-center gap-2 text-sm">
                <Info className="size-4 shrink-0" aria-hidden />
                <span className="truncate" aria-live="polite">
                  {dirty ? t('dirty') : t('maxTotal', { n: maxTotal })}
                </span>
              </div>
              {error && (
                <span role="alert" className="text-destructive text-sm">
                  {error}
                </span>
              )}
              {attempted && invalid && (
                <span aria-live="polite" className="text-destructive text-sm">
                  {tv('summary')}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                className="h-10 md:h-8"
                disabled={!dirty}
                onClick={() => {
                  setEdits({});
                  setError(null);
                  setAttempted(false);
                  setTouchedCells(new Set());
                }}
              >
                <Undo2 className="size-4" aria-hidden /> {t('discard')}
              </Button>
              <Button
                type="button"
                className="h-10 md:h-8"
                disabled={!dirty || save.isPending}
                onClick={trySave}
              >
                <Save className="size-4" aria-hidden /> {t('save')}
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={!!reading} onOpenChange={(o) => !o && setReading(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tc('answerTitle')}</DialogTitle>
            <DialogDescription>
              {reading ? tc('answerOf', { name: reading.s.name, n: reading.n }) : ''}
            </DialogDescription>
          </DialogHeader>
          {reading && (
            <div className="grid gap-3 text-sm">
              <div>
                <p className="text-muted-foreground mb-1 text-xs">{tc('questionLabel')}</p>
                <RichText text={examQuestionBody(reading.qid)} />
              </div>
              <div>
                <p className="text-muted-foreground mb-1 text-xs">{tc('studentAnswer')}</p>
                {/* Teks siswa: tampil apa adanya (tanpa rumus/gambar), bukan RichText. */}
                <p className="bg-muted/40 rounded-lg border p-3 break-words whitespace-pre-wrap">
                  {reading.s.answers[reading.qid]?.answer}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <FormDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        title={t('sendTitle')}
        description={t('sendBody')}
        submitLabel={t('sendSubmit')}
        validation={sendValidation}
        error={send.error ? te(errorKey(send.error)) : null}
        onSubmit={() => send.mutateAsync()}
      >
        <div className="grid gap-4">
          <div className="grid content-start gap-2">
            <Label htmlFor={sendValidation.idOf('componentId')}>{t('component')}</Label>
            <SelectField
              {...sendValidation.fieldProps('componentId')}
              className={TOUCH_SELECT}
              value={componentId}
              onChange={(e) => setComponentId(e.target.value)}
            >
              {componentList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <FieldError id={sendValidation.idOf('componentId')} issue={sendValidation.issue('componentId')} />
            {componentList.length === 0 && (
              <p className="text-muted-foreground text-xs">{t('noComponents')}</p>
            )}
          </div>
          {pendingEssays > 0 && (
            <div className="grid content-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
              <p>{t('pendingWarn', { n: pendingEssays })}</p>
              <label className="flex items-center gap-2" htmlFor={sendValidation.idOf('allowPending')}>
                <Checkbox
                  id={sendValidation.idOf('allowPending')}
                  aria-invalid={sendValidation.issue('allowPending') !== undefined}
                  aria-describedby={
                    sendValidation.issue('allowPending')
                      ? `${sendValidation.idOf('allowPending')}-error`
                      : undefined
                  }
                  checked={allowPending}
                  onCheckedChange={(v) => {
                    sendValidation.touch('allowPending');
                    setAllowPending(v === true);
                  }}
                />
                {t('pendingConfirm')}
              </label>
              <FieldError
                id={sendValidation.idOf('allowPending')}
                issue={sendValidation.issue('allowPending')}
              />
            </div>
          )}
          <div className="grid content-start gap-2">
            <Label htmlFor="send-date">{t('date')}</Label>
            <DatePicker id="send-date" value={sendDate} onChange={setSendDate} clearable />
            <p className="text-muted-foreground text-xs">{t('dateHint')}</p>
          </div>
        </div>
      </FormDialog>
    </PageBody>
  );
}
