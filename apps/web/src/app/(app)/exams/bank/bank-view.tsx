'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FileQuestion, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionMenu } from '@/components/access-kit';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { RichText } from '@/components/rich-text';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { EmptyPanel, TONES, ToneBadge, Toolbar } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { useSchoolLevels } from '@/lib/school-settings';
import { cn } from '@/lib/utils';
import { RichEditor } from './rich-editor';

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];
const PAGE = 100;

interface Question {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  level: string | null;
  type: 'mcq' | 'essay';
  body: string;
  options: { key: string; text: string }[];
  answer: string | null;
  explanation: string | null;
  points: number;
}

interface Draft {
  id: string | null;
  subjectId: string;
  level: string;
  type: 'mcq' | 'essay';
  body: string;
  options: string[];
  correct: number;
  answer: string;
  explanation: string;
  points: string;
}
const blank = (subjectId: string): Draft => ({
  id: null,
  subjectId,
  level: '',
  type: 'mcq',
  body: '',
  options: ['', '', '', ''],
  correct: 0,
  answer: '',
  explanation: '',
  points: '1',
});
const fromQuestion = (q: Question): Draft => ({
  id: q.id,
  subjectId: q.subjectId,
  level: q.level ?? '',
  type: q.type,
  body: q.body,
  options: q.type === 'mcq' ? q.options.map((o) => o.text) : ['', '', '', ''],
  correct: Math.max(
    0,
    q.options.findIndex((o) => o.key.toUpperCase() === q.answer?.toUpperCase()),
  ),
  answer: q.type === 'essay' ? (q.answer ?? '') : '',
  explanation: q.explanation ?? '',
  points: String(q.points),
});

/** Bank soal per mata pelajaran: pilihan ganda dan esai, dengan rumus dan gambar. */
export function BankView() {
  const t = useTranslations('exams');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const author = can('exam:author');
  const levels = useSchoolLevels();

  const [subjectId, setSubjectId] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Question | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subjects = useQuery({
    queryKey: ['exam-subjects', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/exam/subjects', { params: header })),
  });
  const listKey = ['exam-questions', school.schoolId, subjectId, type, q];
  const questions = useQuery({
    queryKey: listKey,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/exam/questions', {
          params: {
            ...header,
            query: {
              limit: PAGE,
              ...(subjectId ? { subjectId } : {}),
              ...(type ? { type: type as 'mcq' | 'essay' } : {}),
              ...(q.trim() ? { q: q.trim() } : {}),
            },
          },
        }),
      ),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['exam-questions', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['exam-subjects', school.schoolId] });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const mcq = d.type === 'mcq';
      const options = mcq ? d.options.map((text, i) => ({ key: KEYS[i] as string, text: text.trim() })) : [];
      const body = {
        subjectId: d.subjectId,
        level: d.level || null,
        type: d.type,
        body: d.body.trim(),
        options,
        answer: mcq ? (KEYS[d.correct] ?? 'A') : d.answer.trim() || null,
        explanation: d.explanation.trim() || null,
        points: Number(d.points) || 1,
      };
      if (d.id) {
        return unwrap(
          await api.PUT('/v1/exam/questions/{id}', { params: { ...header, path: { id: d.id } }, body }),
        );
      }
      return unwrap(await api.POST('/v1/exam/questions', { params: header, body }));
    },
    onSuccess: (_r, d) => {
      toast.success(d.id ? t('saved') : t('created'));
      setDraft(null);
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/exam/questions/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const subjectList = subjects.data ?? [];
  const items = (questions.data?.items ?? []) as Question[];
  const total = questions.data?.total ?? 0;
  const levelList = levels.data ?? [];

  function openNew() {
    setError(null);
    setDraft(blank(subjectId || subjectList[0]?.id || ''));
  }

  const set = (patch: Partial<Draft>) => draft && setDraft({ ...draft, ...patch });
  const optionsFilled = draft?.type !== 'mcq' || draft.options.every((o) => o.trim());
  const canSubmit =
    !!draft && !!draft.subjectId && !!draft.body.trim() && optionsFilled && Number(draft.points) >= 1;

  return (
    <PageBody>
      <PageHeader
        title={t('bankTitle')}
        description={t('bankSubtitle')}
        actions={
          author && (
            <Button onClick={openNew} disabled={subjectList.length === 0}>
              <Plus className="size-4" aria-hidden /> {t('addQuestion')}
            </Button>
          )
        }
      />

      <Toolbar>
        <div className="w-56">
          <SelectField
            aria-label={t('subject')}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">{t('allSubjects')}</option>
            {subjectList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.questionCount})
              </option>
            ))}
          </SelectField>
        </div>
        <div className="w-44">
          <SelectField aria-label={t('type')} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{t('allTypes')}</option>
            <option value="mcq">{t('mcq')}</option>
            <option value="essay">{t('essay')}</option>
          </SelectField>
        </div>
        <div className="relative min-w-48 flex-1">
          <Search aria-hidden className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            aria-label={t('search')}
            className="pl-8"
            placeholder={t('search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <span className="text-muted-foreground ml-auto text-sm tabular-nums">{t('count', { n: total })}</span>
      </Toolbar>

      {questions.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}

      {questions.isPending || subjects.isPending ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : subjectList.length === 0 ? (
        <EmptyPanel
          icon={FileQuestion}
          tone="violet"
          title={t('noSubjectsTitle')}
          body={t('noSubjectsBody')}
        />
      ) : items.length === 0 ? (
        <EmptyPanel
          icon={FileQuestion}
          tone="violet"
          title={t('emptyTitle')}
          body={t('emptyBody')}
          action={
            author && (
              <Button onClick={openNew}>
                <Plus className="size-4" aria-hidden /> {t('addQuestion')}
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid gap-3">
          {items.map((x) => (
            <li key={x.id} className="bg-card grid gap-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <ToneBadge tone="violet">{x.subjectName}</ToneBadge>
                <ToneBadge tone={x.type === 'mcq' ? 'sky' : 'amber'}>{t(x.type)}</ToneBadge>
                {x.level && <ToneBadge tone="slate">{t('levelShort', { level: x.level })}</ToneBadge>}
                <span className="text-muted-foreground text-xs">{t('pointsShort', { n: x.points })}</span>
                {author && (
                  <span className="ml-auto">
                    <ActionMenu
                      label={t('questionActions')}
                      items={[
                        {
                          label: t('edit'),
                          icon: Pencil,
                          onSelect: () => {
                            setError(null);
                            setDraft(fromQuestion(x));
                          },
                        },
                        {
                          label: t('delete'),
                          icon: Trash2,
                          destructive: true,
                          onSelect: () => setDeleting(x),
                        },
                      ]}
                    />
                  </span>
                )}
              </div>
              <RichText text={x.body} className="text-sm" />
              {x.type === 'mcq' ? (
                <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                  {x.options.map((o) => {
                    const right = o.key.toUpperCase() === x.answer?.toUpperCase();
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
              ) : (
                x.answer && (
                  <div className="bg-muted/40 rounded-lg border px-3 py-2 text-sm">
                    <p className="text-muted-foreground text-xs">{t('essayKey')}</p>
                    <RichText text={x.answer} />
                  </div>
                )
              )}
            </li>
          ))}
          {total > items.length && (
            <li className="text-muted-foreground text-center text-sm">
              {t('showing', { shown: items.length, total })}
            </li>
          )}
        </ul>
      )}

      <FormDialog
        open={!!draft}
        onOpenChange={(o) => {
          if (!o) setDraft(null);
        }}
        title={draft?.id ? t('editQuestion') : t('addQuestion')}
        submitLabel={t('save')}
        size="wide"
        error={error}
        disabled={!canSubmit}
        onSubmit={() => save.mutateAsync(draft as Draft)}
      >
        {draft && (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-2 sm:col-span-2">
                <Label htmlFor="q-subject">{t('subject')}</Label>
                <SelectField
                  id="q-subject"
                  value={draft.subjectId}
                  onChange={(e) => set({ subjectId: e.target.value })}
                >
                  {subjectList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="q-level">{t('level')}</Label>
                <SelectField
                  id="q-level"
                  value={draft.level}
                  onChange={(e) => set({ level: e.target.value })}
                >
                  <option value="">{t('allLevels')}</option>
                  {levelList.map((l) => (
                    <option key={l.id} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="q-points">{t('points')}</Label>
                <Input
                  id="q-points"
                  type="number"
                  min={1}
                  max={1000}
                  value={draft.points}
                  onChange={(e) => set({ points: e.target.value })}
                />
              </div>
            </div>

            {/* biome-ignore lint/a11y/useSemanticElements: dua tombol pilihan, bukan isian formulir. */}
            <div role="group" aria-label={t('type')} className="grid grid-cols-2 gap-2">
              {(['mcq', 'essay'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={draft.type === k}
                  onClick={() => set({ type: k })}
                  className={cn(
                    'focus-visible:ring-ring/50 rounded-xl border p-2.5 text-sm font-medium outline-none focus-visible:ring-3',
                    draft.type === k ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                  )}
                >
                  {t(k)}
                </button>
              ))}
            </div>

            <RichEditor
              id="q-body"
              label={t('questionText')}
              value={draft.body}
              onChange={(v) => set({ body: v })}
            />

            {draft.type === 'mcq' ? (
              <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
                <legend className="mb-1 text-sm leading-none font-medium">{t('options')}</legend>
                {draft.options.map((text, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: posisi opsi adalah kuncinya (A, B, C, ...).
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="q-correct"
                      aria-label={t('markCorrect', { key: KEYS[i] as string })}
                      checked={draft.correct === i}
                      onChange={() => set({ correct: i })}
                      className="size-4 shrink-0"
                    />
                    <span className="w-5 shrink-0 text-sm font-semibold">{KEYS[i]}.</span>
                    <Input
                      aria-label={t('optionN', { key: KEYS[i] as string })}
                      maxLength={2000}
                      value={text}
                      onChange={(e) =>
                        set({ options: draft.options.map((o, j) => (j === i ? e.target.value : o)) })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('removeOption', { key: KEYS[i] as string })}
                      disabled={draft.options.length <= 2}
                      onClick={() =>
                        set({
                          options: draft.options.filter((_, j) => j !== i),
                          correct:
                            draft.correct === i ? 0 : draft.correct > i ? draft.correct - 1 : draft.correct,
                        })
                      }
                    >
                      <X />
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={draft.options.length >= KEYS.length}
                    onClick={() => set({ options: [...draft.options, ''] })}
                  >
                    <Plus /> {t('addOption')}
                  </Button>
                  <p className="text-muted-foreground text-xs">{t('optionsHint')}</p>
                </div>
              </fieldset>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="q-answer">{t('essayKey')}</Label>
                <Textarea
                  id="q-answer"
                  rows={3}
                  maxLength={5000}
                  value={draft.answer}
                  onChange={(e) => set({ answer: e.target.value })}
                />
                <p className="text-muted-foreground text-xs">{t('essayKeyHint')}</p>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="q-explain">{t('explanation')}</Label>
              <Textarea
                id="q-explain"
                rows={2}
                maxLength={5000}
                value={draft.explanation}
                onChange={(e) => set({ explanation: e.target.value })}
              />
            </div>
          </div>
        )}
      </FormDialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={t('deleteTitle')}
        description={t('deleteBody')}
        confirmLabel={t('delete')}
        destructive
        pending={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </PageBody>
  );
}
