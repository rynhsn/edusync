'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookCheck, ClipboardList, Info, Save, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';

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
  entered: boolean;
  absent: boolean;
  answers: Record<string, { answer: string | null; score: number | null }>;
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
  const te = useTranslations();
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
  const dirty = Object.keys(edits).length > 0;

  const view = (s: Student): Edit =>
    edits[s.studentId] ?? {
      absent: s.absent,
      cells: Object.fromEntries(questions.map((q) => [q.id, cellOf(s, q)])),
    };

  const rows = students.map((s) => {
    const e = view(s);
    const touched = s.entered || !!edits[s.studentId];
    const total = round2(questions.reduce((n, q) => n + scoreOf(q, e.cells[q.id] ?? ''), 0));
    const tooHigh = questions.some((q) => q.type === 'essay' && scoreOf(q, e.cells[q.id] ?? '') > q.points);
    return {
      s,
      e,
      touched,
      total,
      tooHigh,
      percent: touched && !e.absent && maxTotal > 0 ? round2((total / maxTotal) * 100) : null,
      essayPending:
        touched &&
        !e.absent &&
        questions.some((q) => q.type === 'essay' && (e.cells[q.id] ?? '').trim() === ''),
    };
  });
  const invalid = rows.some((r) => r.tooHigh);
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
      const records = students
        .filter((s) => edits[s.studentId])
        .map((s) => {
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
          body: { componentId, ...(sendDate ? { date: sendDate } : {}) },
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
  function onKey(e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) {
    const move = (dr: number, dc: number) => {
      e.preventDefault();
      focusCell(r + dr, c + dc);
    };
    if (e.key === 'Enter' || e.key === 'ArrowDown') move(1, 0);
    else if (e.key === 'ArrowUp') move(-1, 0);
    else if (e.key === 'ArrowRight' && e.currentTarget.selectionEnd === e.currentTarget.value.length)
      move(0, 1);
    else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) move(0, -1);
  }

  const loading = sheet.isPending || exam.isPending;
  const ex = exam.data;
  const componentList = components.data ?? [];
  const canSend = author && !dirty && students.some((s) => s.entered);

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

          {!author && (
            <Alert>
              <AlertDescription>{t('readOnly')}</AlertDescription>
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
                  <tr key={row.s.studentId} className={cn(row.e.absent && 'bg-muted/40 opacity-70')}>
                    <td className="bg-card sticky left-0 z-10 border-b px-3 py-1.5">
                      <div className="truncate font-medium">{row.s.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {[multiClass ? row.s.className : null, row.s.nis].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    {questions.map((q, c) => {
                      const v = row.e.cells[q.id] ?? '';
                      const mcq = q.type === 'mcq';
                      const right = mcq && v !== '' && v === q.key?.toUpperCase();
                      const wrong = mcq && v !== '' && !right;
                      const over = !mcq && scoreOf(q, v) > q.points;
                      return (
                        <td key={q.id} className="border-b px-1.5 py-1.5 text-center">
                          <input
                            data-cell={`${r}-${c}`}
                            // biome-ignore lint/a11y/noAutofocus: guru langsung mengetik di sel pertama.
                            autoFocus={r === 0 && c === 0}
                            inputMode={mcq ? 'text' : 'decimal'}
                            maxLength={mcq ? 1 : 6}
                            disabled={!author || row.e.absent}
                            value={v}
                            aria-label={t(mcq ? 'cellMcq' : 'cellEssay', { name: row.s.name, n: c + 1 })}
                            aria-invalid={over}
                            title={over ? t('scoreTooHigh', { max: q.points }) : undefined}
                            onKeyDown={(e) => onKey(e, r, c)}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const next = mcq ? raw.toUpperCase().slice(-1) : raw.replace(/[^0-9.,]/g, '');
                              if (mcq && next && !q.optionKeys.map((k) => k.toUpperCase()).includes(next))
                                return;
                              patch(row.s, (ed) => ({ ...ed, cells: { ...ed.cells, [q.id]: next } }));
                            }}
                            className={cn(
                              'border-input h-8 w-12 rounded-md border bg-transparent text-center tabular-nums outline-none',
                              'focus-visible:ring-ring/50 focus-visible:ring-2 disabled:cursor-not-allowed',
                              right &&
                                'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                              wrong && 'border-rose-400 bg-rose-500/10 text-rose-700 dark:text-rose-300',
                              over && 'border-destructive',
                            )}
                          />
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
                          disabled={!author}
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
              <Button
                type="button"
                variant="ghost"
                disabled={!dirty}
                onClick={() => {
                  setEdits({});
                  setError(null);
                }}
              >
                <Undo2 className="size-4" aria-hidden /> {t('discard')}
              </Button>
              <Button
                type="button"
                disabled={!dirty || invalid || save.isPending}
                onClick={() => save.mutate()}
              >
                <Save className="size-4" aria-hidden /> {t('save')}
              </Button>
            </div>
          )}
        </>
      )}

      <FormDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        title={t('sendTitle')}
        description={t('sendBody')}
        submitLabel={t('sendSubmit')}
        disabled={!componentId}
        error={send.error ? te(errorKey(send.error)) : null}
        onSubmit={() => send.mutateAsync()}
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="send-component">{t('component')}</Label>
            <SelectField
              id="send-component"
              value={componentId}
              onChange={(e) => setComponentId(e.target.value)}
            >
              {componentList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            {componentList.length === 0 && (
              <p className="text-muted-foreground text-xs">{t('noComponents')}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="send-date">{t('date')}</Label>
            <DatePicker id="send-date" value={sendDate} onChange={setSendDate} clearable />
            <p className="text-muted-foreground text-xs">{t('dateHint')}</p>
          </div>
        </div>
      </FormDialog>
    </PageBody>
  );
}
