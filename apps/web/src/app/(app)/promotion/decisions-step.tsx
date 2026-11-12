'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ListSkeleton, REVEAL } from '@/components/master-kit';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyPanel, StatCard, StatGrid, TONES, type Tone, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import {
  buildSavePayload,
  type Choices,
  chunk,
  type Decision,
  initialChoices,
  optionsFor,
  type PromotionClass,
  SAVE_CHUNK,
  setClassDecision,
  summarize,
} from './promotion-logic';
import { StepError } from './step-error';

const DECISION_TONE: Record<Decision, Tone> = { promote: 'emerald', retain: 'amber', graduate: 'violet' };

/** Data keputusan satu tahun sumber beserta pilihan yang sedang diedit; dipakai bersama oleh langkah 3 dan 4. */
export function useDecisions(sourceId: string, enabled: boolean) {
  const t = useTranslations('promotion');
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const key = ['promotions', school.schoolId, sourceId];
  const query = useQuery({
    queryKey: key,
    enabled: enabled && !!sourceId,
    // Pilihan yang belum disimpan tidak boleh tertimpa data segar saat jendela kembali difokuskan.
    refetchOnWindowFocus: false,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/academic-years/{id}/promotions', {
          params: { header: schoolHeader(school.schoolId), path: { id: sourceId } },
        }),
      ),
  });
  const [choices, setChoices] = useState<Choices>({});
  const data = query.data;
  useEffect(() => {
    if (data) setChoices(initialChoices(data.classes));
  }, [data]);

  const classes: PromotionClass[] = data?.classes ?? [];
  const summary = summarize(classes, choices);

  const save = useMutation({
    mutationFn: async () => {
      let saved = 0;
      for (const part of chunk(buildSavePayload(classes, choices), SAVE_CHUNK)) {
        saved += unwrap(
          await api.PUT('/v1/academic-years/{id}/promotions', {
            params: { header: schoolHeader(school.schoolId), path: { id: sourceId } },
            body: { decisions: part },
          }),
        ).saved;
      }
      return saved;
    },
    onSuccess: (saved) => toast.success(t('saved', { count: saved })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { query, classes, choices, setChoices, summary, save };
}

export type DecisionsState = ReturnType<typeof useDecisions>;

export function DecisionsStep({ state }: { state: DecisionsState }) {
  const t = useTranslations('promotion');
  const te = useTranslations();
  const { query, classes, choices, setChoices, summary, save } = state;

  const label: Record<Decision, string> = {
    promote: t('decisionPromote'),
    retain: t('decisionRetain'),
    graduate: t('decisionGraduate'),
  };
  const bulkLabel: Record<Decision, string> = {
    promote: t('allPromote'),
    retain: t('allRetain'),
    graduate: t('allGraduate'),
  };

  return (
    <section className={cn('grid gap-4', REVEAL)} aria-labelledby="promo-decisions-title">
      <div>
        <h2 id="promo-decisions-title" className="font-heading text-lg font-semibold">
          {t('decisionsTitle')}
        </h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{t('decisionsHelp')}</p>
      </div>

      {query.isPending && <ListSkeleton rows={4} stats={4} />}
      {query.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(query.error))}</AlertDescription>
        </Alert>
      )}

      {query.data && classes.length === 0 && (
        <EmptyPanel icon={Lock} tone="slate" title={t('noClasses')} body={t('noClassesBody')} />
      )}

      {query.data && classes.length > 0 && (
        <>
          <StatGrid>
            <StatCard tone="emerald" label={t('decisionPromote')} value={summary.promote} />
            <StatCard tone="amber" label={t('decisionRetain')} value={summary.retain} />
            <StatCard tone="violet" label={t('decisionGraduate')} value={summary.graduate} />
            <StatCard
              tone="slate"
              label={t('statApplied')}
              value={summary.applied}
              hint={t('statAppliedHint')}
            />
          </StatGrid>

          <ul className="grid gap-4">
            {classes.map((cls) => {
              const options = optionsFor(cls);
              const editable = cls.students.filter((s) => !s.applied).length;
              return (
                <li key={cls.classId} className="bg-card overflow-hidden rounded-2xl border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-heading font-semibold">{cls.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {cls.isFinalLevel
                          ? t('classFinal', { level: cls.level, count: cls.students.length })
                          : t('classMeta', {
                              level: cls.level,
                              next: cls.nextLevel ?? '-',
                              count: cls.students.length,
                            })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {options.map((d) => (
                        <Button
                          key={d}
                          size="sm"
                          variant="outline"
                          disabled={editable === 0}
                          onClick={() => setChoices((c) => setClassDecision(cls, c, d))}
                        >
                          {bulkLabel[d]}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {cls.students.length === 0 ? (
                    <p className="text-muted-foreground px-4 py-3 text-sm">{t('classEmpty')}</p>
                  ) : (
                    <ul className="divide-y">
                      {cls.students.map((s) => {
                        const choice = choices[s.studentId];
                        return (
                          <li
                            key={s.studentId}
                            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{s.name}</p>
                              <p className="text-muted-foreground text-xs tabular-nums">{s.nis ?? '-'}</p>
                            </div>
                            {s.applied ? (
                              <span className="flex items-center gap-2">
                                {s.decision && (
                                  <ToneBadge tone={DECISION_TONE[s.decision]}>{label[s.decision]}</ToneBadge>
                                )}
                                <ToneBadge tone="slate" dot={false}>
                                  <Lock className="size-3" aria-hidden /> {t('applied')}
                                </ToneBadge>
                              </span>
                            ) : (
                              <fieldset className="bg-muted/50 m-0 inline-flex min-w-0 rounded-lg border p-0.5">
                                <legend className="sr-only">{t('decisionFor', { name: s.name })}</legend>
                                {options.map((d) => (
                                  <button
                                    key={d}
                                    type="button"
                                    aria-pressed={choice === d}
                                    onClick={() => setChoices((c) => ({ ...c, [s.studentId]: d }))}
                                    className={cn(
                                      'focus-visible:ring-ring/50 rounded-md px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px]',
                                      choice === d
                                        ? TONES[DECISION_TONE[d]].solid
                                        : 'text-muted-foreground hover:bg-muted',
                                    )}
                                  >
                                    {label[d]}
                                  </button>
                                ))}
                              </fieldset>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          {save.isError && <StepError error={save.error} />}

          <div className="bg-card sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 shadow-sm">
            <p className="text-sm" aria-live="polite">
              {summary.unsaved > 0 ? (
                <span className="font-medium text-amber-700 dark:text-amber-300">
                  {t('unsaved', { count: summary.unsaved })}
                </span>
              ) : (
                <span className="text-muted-foreground">{t('allSaved')}</span>
              )}
            </p>
            <Button disabled={summary.unsaved === 0 || save.isPending} onClick={() => save.mutate()}>
              <Save className="size-4" aria-hidden /> {save.isPending ? t('saving') : t('save')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
