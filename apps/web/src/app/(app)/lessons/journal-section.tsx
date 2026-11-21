'use client';

import { MAX_JOURNAL_NOTE, MAX_JOURNAL_OBJECTIVES, MAX_JOURNAL_TOPIC } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenText, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { TOUCH_SELECT } from '@/components/form-field-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import { ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { usePlanSettings } from '../teaching-plan/plan-settings';

type Target = { scheduleEntryId: string } | { combinedKey: string };

/**
 * Jurnal mengajar di bawah lembar absensi (tahap 3.6.2): bagian lipat, opsional per sekolah (sakelar jurnal), tidak wajib.
 * Disimpan sendiri, terpisah dari absensi, supaya yang satu tidak menggagalkan yang lain. Tidak dirender bila sakelar mati.
 */
export function JournalSection({ target, date }: { target: Target; date: string }) {
  const settings = usePlanSettings();
  if (!settings.data?.journalEnabled) return null;
  return <JournalBody target={target} date={date} />;
}

function JournalBody({ target, date }: { target: Target; date: string }) {
  const t = useTranslations('lessonJournal');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const key = 'scheduleEntryId' in target ? target.scheduleEntryId : target.combinedKey;
  const queryKey = ['lesson-journal', school.schoolId, key, date];
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
  const [planId, setPlanId] = useState('');
  const [objectiveIds, setObjectiveIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);

  const q = useQuery({
    queryKey,
    queryFn: async () =>
      unwrap(await api.GET('/v1/lesson-journals', { params: { ...header, query: { ...target, date } } })),
  });
  useEffect(() => {
    if (!q.data) return;
    setTopic(q.data.journal?.topic ?? '');
    setNote(q.data.journal?.note ?? '');
    setPlanId(q.data.journal?.planId ?? '');
    setObjectiveIds(q.data.journal?.objectiveIds ?? []);
    setDirty(false);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/lesson-journals', {
          params: header,
          body: {
            ...target,
            date,
            topic,
            note: note.trim() === '' ? null : note,
            planId: planId || null,
            objectiveIds,
          },
        }),
      ),
    onSuccess: (r) => {
      toast.success(r.substitute ? t('savedSubstitute') : t('saved'));
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/v1/lesson-journals', { params: { ...header, query: { ...target, date } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (!q.data) return null;
  const { canRecord, plans, objectives, journal } = q.data;
  const edit = (fn: () => void) => {
    fn();
    setDirty(true);
  };
  const pickPlan = (id: string) =>
    edit(() => {
      setPlanId(id);
      const plan = plans.find((p) => p.id === id);
      if (plan) {
        const known = new Set(objectives.map((o) => o.id));
        setObjectiveIds(plan.objectiveIds.filter((o) => known.has(o)).slice(0, MAX_JOURNAL_OBJECTIVES));
      }
    });
  const toggle = (id: string) =>
    edit(() =>
      setObjectiveIds((cur) =>
        cur.includes(id)
          ? cur.filter((x) => x !== id)
          : cur.length >= MAX_JOURNAL_OBJECTIVES
            ? cur
            : [...cur, id],
      ),
    );

  return (
    <details className="group rounded-xl border" open={journal !== null || undefined}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 sm:px-4">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <BookOpenText className="size-4" aria-hidden /> {t('title')}
          {journal ? (
            <ToneBadge tone="emerald">{t('filled')}</ToneBadge>
          ) : (
            <span className="text-muted-foreground text-xs font-normal">{t('optional')}</span>
          )}
        </span>
        <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-4 border-t p-3 sm:p-4">
        {journal?.actualTeacherName && (
          <p className="text-muted-foreground text-xs">
            {t('filledBy', { name: journal.actualTeacherName })}
          </p>
        )}
        <div className="grid gap-2">
          <Label htmlFor="journal-topic">{t('topic')}</Label>
          <Input
            id="journal-topic"
            value={topic}
            maxLength={MAX_JOURNAL_TOPIC}
            disabled={!canRecord}
            placeholder={t('topicHint')}
            onChange={(e) => edit(() => setTopic(e.target.value))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="journal-note">{t('note')}</Label>
          <Textarea
            id="journal-note"
            rows={3}
            value={note}
            maxLength={MAX_JOURNAL_NOTE}
            disabled={!canRecord}
            placeholder={t('noteHint')}
            onChange={(e) => edit(() => setNote(e.target.value))}
          />
        </div>
        {plans.length > 0 && (
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="journal-plan">{t('plan')}</Label>
            <SelectField
              id="journal-plan"
              className={TOUCH_SELECT}
              value={planId}
              disabled={!canRecord}
              onChange={(e) => pickPlan(e.target.value)}
            >
              <option value="">{t('planNone')}</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </SelectField>
          </div>
        )}
        {objectives.length > 0 && (
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="text-sm font-medium">
              {t('objectives', { count: objectiveIds.length, max: MAX_JOURNAL_OBJECTIVES })}
            </legend>
            <div className="flex flex-wrap gap-2">
              {objectives.map((o) => {
                const on = objectiveIds.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={on}
                    disabled={!canRecord || (!on && objectiveIds.length >= MAX_JOURNAL_OBJECTIVES)}
                    title={o.description}
                    onClick={() => toggle(o.id)}
                    className={cn(
                      'min-h-11 max-w-full rounded-full border px-3 py-1.5 text-left text-xs transition-colors disabled:opacity-50 sm:min-h-9',
                      on ? 'border-sky-600 bg-sky-600 text-white' : 'bg-card hover:bg-muted',
                    )}
                  >
                    <span className="line-clamp-2">
                      {o.code ? `${o.code} · ${o.description}` : o.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        {canRecord && (
          <div className="flex flex-wrap gap-2">
            <Button
              className="w-full sm:w-auto"
              disabled={!dirty || topic.trim() === '' || save.isPending}
              onClick={() => save.mutate()}
            >
              {t('save')}
            </Button>
            {journal && (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {t('delete')}
              </Button>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
