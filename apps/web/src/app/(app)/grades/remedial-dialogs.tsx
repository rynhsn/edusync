'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { TONES } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import {
  attemptsLeft,
  buildAttemptBody,
  buildParticipants,
  buildSupportFields,
  LEARNING_SUPPORT_KINDS,
  type LearningSupportKind,
  MAX_REMEDIAL_ATTEMPTS,
  type ParticipantDraft,
  type RosterEntry,
  SUPPORT_PARTICIPANT_STATUSES,
  type SupportParticipantStatus,
  scoreIssue,
  suggestParticipantIds,
  supportIssues,
  todayIso,
  toggleId,
} from '@/lib/remedial';
import { cn } from '@/lib/utils';
import { ObjectivePicker } from './objective-picker';
import { invalidateRemedial, isReportFinal, type Scope, useAttemptSheet } from './remedial-data';

type Support = {
  id: string;
  kind: LearningSupportKind;
  title: string;
  description: string | null;
  startsOn: string | null;
  endsOn: string | null;
  objectives: { id: string; code: string | null; description: string; active: boolean }[];
  participants: { studentId: string; status: SupportParticipantStatus; outcomeNote: string | null }[];
};

/** Satu penilaian yang bisa dipilih di dialog catat remedial (dari daftar murid yang perlu remedial). */
export interface AttemptItem {
  assessmentId: string;
  title: string;
  maxScore: number;
}

const radioCard = (active: boolean) =>
  cn(
    'has-[:focus-visible]:ring-ring/50 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-[3px]',
    active ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
  );

/** Galat server menjadi pesan; rapor final juga memberi tahu tab agar menonaktifkan aksi. */
function useFailure(onLocked: () => void) {
  const t = useTranslations('grades');
  const te = useTranslations();
  return (e: unknown): string => {
    if (isReportFinal(e)) {
      onLocked();
      return t('rmLockedBody');
    }
    return te(errorKey(e));
  };
}

/* ---------- Catat hasil remedial ---------- */

export function AttemptDialog({
  student,
  items,
  initialAssessmentId,
  supports,
  onClose,
  onLocked,
}: {
  student: { studentId: string; name: string };
  items: AttemptItem[];
  initialAssessmentId: string;
  /** Sesi remedial pada kelas dan mapel ini, untuk tautan opsional. */
  supports: { id: string; title: string }[];
  onClose: () => void;
  onLocked: () => void;
}) {
  const t = useTranslations('grades');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const fail = useFailure(onLocked);
  const [assessmentId, setAssessmentId] = useState(initialAssessmentId);
  const [value, setValue] = useState('');
  const [takenOn, setTakenOn] = useState(todayIso());
  const [note, setNote] = useState('');
  const [supportId, setSupportId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const sheet = useAttemptSheet(assessmentId);
  const item = items.find((i) => i.assessmentId === assessmentId);
  const max = sheet.data?.assessment.maxScore ?? item?.maxScore ?? 100;
  const row = sheet.data?.students.find((s) => s.studentId === student.studentId);
  const attempts = row?.attempts ?? [];
  const left = attemptsLeft(attempts.length);
  const issue = scoreIssue(value, max);
  const dateMissing = takenOn === '';
  const showIssue = issue !== null && issue !== 'required' && value.trim() !== '';
  const blocked = left === 0 || issue !== null || dateMissing || sheet.isPending;

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/assessments/{id}/remedial-attempts', {
          params: { header: schoolHeader(school.schoolId), path: { id: assessmentId } },
          body: buildAttemptBody(student.studentId, { value, takenOn, note, supportId }),
        }),
      ),
    onSuccess: () => {
      toast.success(t('rmAttemptSaved'));
      invalidateRemedial(queryClient, school.schoolId);
    },
    onError: (e) => setError(fail(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.DELETE('/v1/remedial-attempts/{id}', {
          params: { header: schoolHeader(school.schoolId), path: { id } },
        }),
      ),
    onSuccess: () => {
      toast.success(t('rmAttemptDeleted'));
      setConfirming(null);
      invalidateRemedial(queryClient, school.schoolId);
    },
    onError: (e) => {
      setConfirming(null);
      setError(fail(e));
    },
  });

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('rmAttemptTitle')}
      description={t('rmAttemptDesc', { name: student.name })}
      submitLabel={t('rmAttemptSave')}
      disabled={blocked}
      error={error}
      onSubmit={async () => {
        setError(null);
        await save.mutateAsync();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="rm-assessment">{t('rmAttemptAssessment')}</Label>
        <SelectField
          id="rm-assessment"
          className="h-11 md:h-8"
          value={assessmentId}
          onChange={(e) => {
            setAssessmentId(e.target.value);
            setConfirming(null);
          }}
        >
          {items.map((i) => (
            <option key={i.assessmentId} value={i.assessmentId}>
              {i.title}
            </option>
          ))}
        </SelectField>
      </div>

      <section aria-labelledby="rm-history" className="grid gap-2 rounded-xl border p-3">
        <h3 id="rm-history" className="text-sm font-medium">
          {t('rmHistoryTitle')}
        </h3>
        {sheet.isPending ? (
          <Skeleton className="h-10 rounded-lg" />
        ) : attempts.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('rmHistoryEmpty')}</p>
        ) : (
          <ul className="grid gap-2">
            {attempts.map((a) => (
              <li key={a.id} className="bg-muted/40 grid gap-2 rounded-lg border p-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium tabular-nums">
                      {t('rmHistoryItem', { no: a.attemptNo })}
                      {' · '}
                      {a.value === null ? '-' : t('rmHistoryScore', { value: a.value, max })}
                    </p>
                    <p className="text-muted-foreground text-xs">{formatCalendarDate(locale, a.takenOn)}</p>
                    {a.note && <p className="text-muted-foreground text-xs break-words italic">{a.note}</p>}
                  </div>
                  {confirming !== a.id && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="max-sm:min-h-11"
                      aria-label={t('rmDeleteAttemptAria', { no: a.attemptNo })}
                      onClick={() => setConfirming(a.id)}
                    >
                      {t('rmDeleteAttempt')}
                    </Button>
                  )}
                </div>
                {confirming === a.id && (
                  <div role="alert" className={cn('grid gap-2 rounded-lg p-2.5', TONES.rose.soft)}>
                    <p className="text-sm font-medium">{t('rmDeleteAttemptTitle')}</p>
                    <p className="text-xs">
                      {t('rmDeleteAttemptDesc', { no: a.attemptNo, value: a.value ?? '-' })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="min-h-11 md:min-h-8"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(a.id)}
                      >
                        {t('rmDeleteAttempt')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-11 md:min-h-8"
                        onClick={() => setConfirming(null)}
                      >
                        {tc('cancel')}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground text-xs">
          {left === 0
            ? t('rmAttemptsFull', { max: MAX_REMEDIAL_ATTEMPTS })
            : t('rmAttemptsLeft', { count: left })}
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="rm-score">{t('rmAttemptScore')}</Label>
          <Input
            id="rm-score"
            className="h-11 md:h-8"
            inputMode="decimal"
            autoComplete="off"
            aria-required="true"
            aria-invalid={showIssue}
            aria-describedby="rm-score-hint"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <p
            id="rm-score-hint"
            className={cn('text-xs', showIssue ? 'text-destructive' : 'text-muted-foreground')}
          >
            {showIssue && issue ? t(`rmScoreErr_${issue}`, { max }) : t('rmAttemptScoreHint', { max })}
          </p>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="rm-date">{t('rmAttemptDate')}</Label>
          <DatePicker
            id="rm-date"
            className="h-11 md:h-8"
            value={takenOn}
            onChange={(v) => v && setTakenOn(v)}
          />
        </div>
      </div>
      {supports.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="rm-support">{t('rmAttemptSupport')}</Label>
          <SelectField
            id="rm-support"
            className="h-11 md:h-8"
            value={supportId}
            onChange={(e) => setSupportId(e.target.value)}
          >
            <option value="">{t('rmNoSupport')}</option>
            {supports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </SelectField>
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="rm-note">{t('rmAttemptNote')}</Label>
        <Textarea
          id="rm-note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </FormDialog>
  );
}

/* ---------- Buat atau ubah sesi pendampingan ---------- */

export function SupportFormDialog({
  scope,
  support,
  defaultKind,
  onClose,
  onLocked,
  onCreated,
}: {
  scope: Scope;
  /** Ada = mode ubah; tidak ada = mode buat. */
  support?: Support;
  defaultKind: LearningSupportKind;
  onClose: () => void;
  onLocked: () => void;
  onCreated: (s: { id: string }) => void;
}) {
  const t = useTranslations('grades');
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const fail = useFailure(onLocked);
  const editing = support !== undefined;
  const [kind, setKind] = useState<LearningSupportKind>(support?.kind ?? defaultKind);
  const [form, setForm] = useState({
    title: support?.title ?? '',
    description: support?.description ?? '',
    startsOn: support?.startsOn ?? '',
    endsOn: support?.endsOn ?? '',
  });
  const [objectiveIds, setObjectiveIds] = useState<string[]>(support?.objectives.map((o) => o.id) ?? []);
  const [error, setError] = useState<string | null>(null);
  const issues = supportIssues(form);
  const header = { header: schoolHeader(school.schoolId) };

  const save = useMutation({
    mutationFn: async () => {
      const fields = buildSupportFields(form, objectiveIds);
      if (support) {
        return unwrap(
          await api.PUT('/v1/learning-supports/{id}', {
            params: { ...header, path: { id: support.id } },
            body: fields,
          }),
        );
      }
      return unwrap(
        await api.POST('/v1/learning-supports', { params: header, body: { ...scope, kind, ...fields } }),
      );
    },
    onSuccess: (saved) => {
      toast.success(editing ? t('rmSupportUpdated') : t('rmSupportCreated'));
      queryClient.invalidateQueries({ queryKey: ['learning-supports', school.schoolId] });
      if (!editing) onCreated(saved);
    },
    onError: (e) => setError(fail(e)),
  });

  const titleShown = form.title.trim() === '' && issues.includes('title_required') && form.title !== '';
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="wide"
      title={editing ? t('rmSupportFormEdit') : t('rmSupportFormNew')}
      submitLabel={t('rmSupportSave')}
      disabled={issues.length > 0}
      error={error}
      onSubmit={async () => {
        setError(null);
        await save.mutateAsync();
      }}
    >
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{t('rmFieldKind')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {LEARNING_SUPPORT_KINDS.map((k) => (
            <label key={k} htmlFor={`rm-kind-${k}`} className={radioCard(kind === k)}>
              <input
                id={`rm-kind-${k}`}
                type="radio"
                name="rm-kind"
                className="accent-primary mt-1 size-4 shrink-0"
                checked={kind === k}
                disabled={editing}
                onChange={() => setKind(k)}
              />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">{t(`rmKind_${k}`)}</span>
                <span className="text-muted-foreground text-xs">{t(`rmKindHint_${k}`)}</span>
              </span>
            </label>
          ))}
        </div>
        {editing && <p className="text-muted-foreground text-xs">{t('rmKindLocked')}</p>}
      </fieldset>
      <div className="grid gap-2">
        <Label htmlFor="rm-title">{t('rmFieldTitle')}</Label>
        <Input
          id="rm-title"
          className="h-11 md:h-8"
          maxLength={120}
          autoComplete="off"
          aria-required="true"
          aria-invalid={titleShown}
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        {form.title !== '' && issues.includes('title_required') && (
          <p className="text-destructive text-xs">{t('rmTitleRequired')}</p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="rm-desc">{t('rmFieldDesc')}</Label>
        <Textarea
          id="rm-desc"
          rows={2}
          maxLength={2000}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="rm-start">{t('rmFieldStart')}</Label>
          <DatePicker
            id="rm-start"
            className="h-11 md:h-8"
            clearable
            placeholder={t('rmPickDate')}
            value={form.startsOn}
            onChange={(v) => setForm((f) => ({ ...f, startsOn: v }))}
          />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="rm-end">{t('rmFieldEnd')}</Label>
          <DatePicker
            id="rm-end"
            className="h-11 md:h-8"
            clearable
            placeholder={t('rmPickDate')}
            defaultMonth={form.startsOn || undefined}
            value={form.endsOn}
            onChange={(v) => setForm((f) => ({ ...f, endsOn: v }))}
          />
        </div>
      </div>
      {issues.includes('dates_order') && (
        <p role="alert" className="text-destructive text-sm">
          {t('rmDatesOrder')}
        </p>
      )}
      <ObjectivePicker
        subjectId={scope.subjectId}
        value={objectiveIds}
        onChange={setObjectiveIds}
        linked={support?.objectives ?? []}
        feedback={false}
        variant="support"
      />
    </FormDialog>
  );
}

/* ---------- Atur peserta ---------- */

export function ParticipantsDialog({
  support,
  roster,
  candidateIds,
  onClose,
  onLocked,
}: {
  support: Support;
  roster: { studentId: string; name: string; nis: string | null; final: number | null; belowKkm: boolean }[];
  candidateIds: ReadonlySet<string>;
  onClose: () => void;
  onLocked: () => void;
}) {
  const t = useTranslations('grades');
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const fail = useFailure(onLocked);
  const [selected, setSelected] = useState<string[]>(support.participants.map((p) => p.studentId));
  const [statuses, setStatuses] = useState<Record<string, SupportParticipantStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [suggested, setSuggested] = useState(false);
  const order = roster.map((r) => r.studentId);
  const existing: ParticipantDraft[] = support.participants;
  const statusOf = (id: string): SupportParticipantStatus =>
    statuses[id] ?? existing.find((p) => p.studentId === id)?.status ?? 'planned';

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/learning-supports/{id}/participants', {
          params: { header: schoolHeader(school.schoolId), path: { id: support.id } },
          body: { participants: buildParticipants(selected, existing, order, statuses) },
        }),
      ),
    onSuccess: () => {
      toast.success(t('rmPartSaved'));
      queryClient.invalidateQueries({ queryKey: ['learning-supports', school.schoolId] });
    },
    onError: (e) => setError(fail(e)),
  });

  const rosterEntries: RosterEntry[] = roster;
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('rmPartTitle', { title: support.title })}
      description={t('rmPartDesc')}
      submitLabel={t('rmPartSave')}
      error={error}
      onSubmit={async () => {
        setError(null);
        await save.mutateAsync();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 md:min-h-8"
          onClick={() => {
            setSelected(suggestParticipantIds(support.kind, rosterEntries, candidateIds));
            setSuggested(true);
          }}
        >
          {t(`rmPartSuggest_${support.kind}`)}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 md:min-h-8"
          disabled={selected.length === 0}
          onClick={() => {
            setSelected([]);
            setSuggested(false);
          }}
        >
          {t('rmPartClear')}
        </Button>
        <span className="text-muted-foreground ml-auto text-xs tabular-nums" aria-live="polite">
          {t('rmPartSelected', { count: selected.length })}
        </span>
      </div>
      {suggested && <p className="text-muted-foreground text-xs">{t('rmPartSuggestNote')}</p>}
      {roster.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('rmPartNoRoster')}</p>
      ) : (
        <ul className="grid gap-1.5" aria-label={t('rmPartSelected', { count: selected.length })}>
          {roster.map((r) => {
            const on = selected.includes(r.studentId);
            return (
              <li
                key={r.studentId}
                className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border p-2 pl-3',
                  on && 'border-primary bg-primary/5',
                )}
              >
                <label
                  htmlFor={`rm-part-${r.studentId}`}
                  className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 md:min-h-8"
                >
                  <Checkbox
                    id={`rm-part-${r.studentId}`}
                    checked={on}
                    onCheckedChange={() => setSelected((ids) => toggleId(ids, r.studentId))}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium break-words">{r.name}</span>
                    {r.nis && <span className="text-muted-foreground block text-xs">{r.nis}</span>}
                  </span>
                </label>
                {on && (
                  <SelectField
                    aria-label={t('rmPartStatusAria', { name: r.name })}
                    className="h-11 w-full sm:w-40 md:h-8"
                    value={statusOf(r.studentId)}
                    onChange={(e) =>
                      setStatuses((m) => ({
                        ...m,
                        [r.studentId]: e.target.value as SupportParticipantStatus,
                      }))
                    }
                  >
                    {SUPPORT_PARTICIPANT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`rmStatus_${s}`)}
                      </option>
                    ))}
                  </SelectField>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </FormDialog>
  );
}
