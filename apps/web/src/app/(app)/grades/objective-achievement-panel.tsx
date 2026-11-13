'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calculator,
  CircleCheck,
  CircleDashed,
  CircleX,
  GraduationCap,
  Lock,
  MessageSquareText,
  Pencil,
  Target,
  Users,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { EmptyPanel, MODULE_TONE, PersonCell, TONES, type Tone, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import {
  achievementRate,
  buildOverrideRecord,
  type CellStatus,
  cellStatus,
  DECISIONS,
  type Decision,
  decisionOf,
  formatPercent,
  hasLinkedObjectives,
  isClearingRecord,
  isFeedbackOnly,
  MAX_NOTE_LENGTH,
  objectiveLabel,
  overrideUnchanged,
  pendingCount,
  scopeLabelKey,
} from '@/lib/objective-achievement';
import { cn } from '@/lib/utils';

interface Props {
  semesterId: string;
  classId: string;
  subjectId: string;
  /** Beralih ke tab daftar penilaian (untuk keadaan kosong). */
  onGoAssessments: () => void;
}

type Data = NonNullable<ReturnType<typeof useAchievement>['data']>;
type Student = Data['students'][number];
type Cell = Student['cells'][number];
type Objective = Data['objectives'][number];

function useAchievement(semesterId: string, classId: string, subjectId: string, includeAll: boolean) {
  const { school } = useSchool();
  return useQuery({
    queryKey: ['objective-achievement', school.schoolId, semesterId, classId, subjectId, includeAll],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/grading/objective-achievement', {
          params: {
            header: schoolHeader(school.schoolId),
            query: { semesterId, classId, subjectId, includeAll: includeAll ? 'true' : 'false' },
          },
        }),
      ),
  });
}

const STATUS_TONE: Record<CellStatus, Tone> = {
  achieved: 'emerald',
  not_achieved: 'rose',
  undetermined: 'slate',
};
const STATUS_ICON = { achieved: CircleCheck, not_achieved: CircleX, undetermined: CircleDashed } as const;

/** Status dengan ikon dan teks (tidak hanya warna). */
function StatusBadge({ status }: { status: CellStatus }) {
  const t = useTranslations('grades');
  const Icon = STATUS_ICON[status];
  return (
    <ToneBadge tone={STATUS_TONE[status]} dot={false}>
      <Icon className="size-3.5" aria-hidden />
      {t(`oaStatus_${status}`)}
    </ToneBadge>
  );
}

/** Isi satu sel: status, persen, sumber, ambang beserta asalnya, jumlah skor, umpan balik (formatif), dan catatan guru. */
function CellBody({ cell }: { cell: Cell }) {
  const t = useTranslations('grades');
  const locale = useLocale();
  const scopeKey = scopeLabelKey(cell.scope);
  return (
    <div className="grid gap-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={cellStatus(cell)} />
        <span className="text-sm font-semibold tabular-nums">{formatPercent(cell.percent, locale)}</span>
        {cell.levelLabel && (
          <ToneBadge tone="sky" dot={false}>
            {cell.levelLabel}
          </ToneBadge>
        )}
      </div>
      <p className="text-muted-foreground flex items-center gap-1">
        {cell.source === 'override' ? (
          <GraduationCap className="size-3.5 shrink-0" aria-hidden />
        ) : (
          <Calculator className="size-3.5 shrink-0" aria-hidden />
        )}
        <span>{cell.source ? t(`oaSource_${cell.source}`) : t('oaSource_none')}</span>
        {cell.scoredCount > 0 && <span>· {t('oaScored', { count: cell.scoredCount })}</span>}
      </p>
      {scopeKey && (
        <p className="text-muted-foreground">
          {cell.threshold !== null
            ? t('oaThreshold', { value: formatPercent(cell.threshold, locale), scope: t(scopeKey) })
            : t(scopeKey)}
        </p>
      )}
      {cell.formative && (
        <p className="text-muted-foreground">
          {t('oaFormativeCell', {
            average: formatPercent(cell.formative.average, locale),
            count: cell.formative.count,
          })}
        </p>
      )}
      {cell.note && (
        <p className="text-muted-foreground flex items-start gap-1 italic">
          <MessageSquareText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{cell.note}</span>
        </p>
      )}
    </div>
  );
}

/** Ringkasan satu TP: berapa murid tercapai dari yang sudah berstatus. */
function ObjectiveSummary({ objective, students }: { objective: Objective; students: number }) {
  const t = useTranslations('grades');
  const { assessed, achieved } = objective.summary;
  const rate = achievementRate(objective.summary);
  const pending = pendingCount(objective.summary, students);
  return (
    <li className="bg-card grid grid-cols-[minmax(0,1fr)] content-start gap-2 rounded-2xl border p-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <ToneBadge tone="teal" dot={false}>
          <Target className="size-3" aria-hidden />
          {objective.code ?? t('oaObjectiveShort')}
        </ToneBadge>
        {!objective.active && (
          <ToneBadge tone="amber" dot={false}>
            {t('objPickerOld')}
          </ToneBadge>
        )}
        {isFeedbackOnly(objective) && (
          <ToneBadge tone="slate" dot={false}>
            {t('oaFeedbackOnly')}
          </ToneBadge>
        )}
      </div>
      <p className="text-sm break-words">{objective.description}</p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={assessed}
        aria-valuenow={achieved}
        aria-label={t('oaSummaryAria', { achieved, assessed })}
        className="bg-muted h-1.5 overflow-hidden rounded-full"
      >
        <div
          className={cn('h-full rounded-full', TONES.emerald.bar)}
          style={{ width: `${assessed ? (achieved / assessed) * 100 : 0}%` }}
        />
      </div>
      <p className="text-sm font-medium tabular-nums">
        {assessed > 0 ? t('oaSummaryText', { achieved, assessed, rate: rate ?? 0 }) : t('oaSummaryNone')}
      </p>
      <p className="text-muted-foreground text-xs">
        {t('oaSummaryAssessments', {
          summative: objective.assessmentCount,
          formative: objective.formativeCount,
        })}
        {pending > 0 && assessed > 0 ? ` · ${t('oaSummaryPending', { count: pending })}` : ''}
      </p>
    </li>
  );
}

function OverrideDialog({
  target,
  semesterId,
  classId,
  subjectId,
  onClose,
}: {
  target: { student: Student; objective: Objective; cell: Cell };
  semesterId: string;
  classId: string;
  subjectId: string;
  onClose: () => void;
}) {
  const t = useTranslations('grades');
  const te = useTranslations();
  const locale = useLocale();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const { student, objective, cell } = target;
  const [decision, setDecision] = useState<Decision>(decisionOf(cell));
  const [note, setNote] = useState(cell.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const record = buildOverrideRecord(student.studentId, objective.id, decision, note);

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/grading/objective-achievement', {
          params: { header: schoolHeader(school.schoolId) },
          body: { semesterId, classId, subjectId, records: [record] },
        }),
      ),
    onSuccess: () => {
      toast.success(isClearingRecord(record) ? t('oaOverrideCleared') : t('oaOverrideSaved'));
      queryClient.invalidateQueries({ queryKey: ['objective-achievement', school.schoolId] });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const computed = cell.percent === null ? t('oaNoScoreYet') : formatPercent(cell.percent, locale);
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('oaOverrideTitle')}
      description={t('oaOverrideDesc', { name: student.name })}
      submitLabel={t('save')}
      disabled={overrideUnchanged(cell, decision, note)}
      error={error}
      onSubmit={async () => {
        setError(null);
        await save.mutateAsync();
      }}
    >
      <div className="bg-muted/50 grid gap-1 rounded-xl border p-3 text-sm">
        <p className="font-medium break-words">{objectiveLabel(objective)}</p>
        <p className="text-muted-foreground text-xs">
          {t('oaOverrideComputed', { value: computed })}
          {cell.scope && scopeLabelKey(cell.scope) && cell.threshold !== null
            ? ` · ${t('oaThreshold', { value: formatPercent(cell.threshold, locale), scope: t(scopeLabelKey(cell.scope) ?? 'oaScope_objective') })}`
            : ''}
        </p>
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{t('oaOverrideDecision')}</legend>
        {DECISIONS.map((d) => (
          <label
            key={d}
            htmlFor={`oa-decision-${d}`}
            className={cn(
              'has-[:focus-visible]:ring-ring/50 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-[3px]',
              decision === d ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
            )}
          >
            <input
              id={`oa-decision-${d}`}
              type="radio"
              name="oa-decision"
              className="accent-primary mt-1 size-4 shrink-0"
              checked={decision === d}
              onChange={() => setDecision(d)}
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{t(`oaDecision_${d}`)}</span>
              <span className="text-muted-foreground text-xs">{t(`oaDecision_${d}_hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="grid gap-2">
        <Label htmlFor="oa-note">{t('oaNoteLabel')}</Label>
        <Textarea
          id="oa-note"
          rows={3}
          maxLength={MAX_NOTE_LENGTH}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">{t('oaNoteHint')}</p>
      </div>
    </FormDialog>
  );
}

/**
 * Tab "Ketercapaian Tujuan Pembelajaran (TP)": matriks murid x TP (kartu per murid di layar sempit), dengan ringkasan per TP
 * dan keputusan guru per sel. Angka ini belum memengaruhi rapor.
 */
export function ObjectiveAchievementPanel({ semesterId, classId, subjectId, onGoAssessments }: Props) {
  const t = useTranslations('grades');
  const te = useTranslations();
  const [includeAll, setIncludeAll] = useState(false);
  const [target, setTarget] = useState<{ student: Student; objective: Objective; cell: Cell } | null>(null);
  const q = useAchievement(semesterId, classId, subjectId, includeAll);
  const data = q.data;

  if (q.isPending)
    return (
      <div className="grid gap-4" aria-busy>
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  if (!data)
    return (
      <Alert variant="destructive">
        <AlertDescription>{te(errorKey(q.error))}</AlertDescription>
      </Alert>
    );

  const linked = hasLinkedObjectives(data.objectives);
  const lockedCount = data.students.filter((s) => s.locked).length;
  const canEdit = data.canInput;

  const showAllToggle = (
    <label
      htmlFor="oa-include-all"
      className="flex min-h-11 w-fit cursor-pointer items-center gap-2.5 text-sm md:min-h-8"
    >
      <Checkbox id="oa-include-all" checked={includeAll} onCheckedChange={(v) => setIncludeAll(v === true)} />
      {t('oaIncludeAll')}
    </label>
  );

  if (!linked && data.objectives.length === 0) {
    return (
      <div className="grid gap-3">
        <EmptyPanel
          icon={Target}
          tone={MODULE_TONE.academic}
          title={t('oaEmptyTitle')}
          body={t('oaEmptyBody')}
          action={
            <Button type="button" onClick={onGoAssessments}>
              {t('oaEmptyAction')}
            </Button>
          }
        />
        {showAllToggle}
      </div>
    );
  }

  const open = (student: Student, objective: Objective, cell: Cell) =>
    setTarget({ student, objective, cell });
  const total = data.students.length;

  const editButton = (student: Student, objective: Objective, cell: Cell) =>
    canEdit && !student.locked ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="max-lg:min-h-11 w-fit"
        aria-label={t('oaEditAria', {
          name: student.name,
          objective: objective.code ?? objective.description,
        })}
        onClick={() => open(student, objective, cell)}
      >
        <Pencil className="size-3.5" aria-hidden /> {t('oaEdit')}
      </Button>
    ) : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <h2 className="font-heading text-lg font-semibold">{t('oaTitle')}</h2>
      <div role="note" className={cn('grid gap-1.5 rounded-xl border p-3 text-sm', TONES.sky.soft)}>
        <p>{t('oaIntro', { rule: t(`oaAggregation_${data.aggregation}`) })}</p>
        <p>{t('oaFeedbackRule')}</p>
        <p className="text-xs">{t('oaNotInReport')}</p>
        {data.frozen && <p className="text-xs">{t('oaFrozenNote')}</p>}
      </div>

      {!linked && (
        <p role="note" className="text-muted-foreground text-sm">
          {t('oaEmptyBody')}{' '}
          <button
            type="button"
            className="text-foreground font-medium underline underline-offset-2"
            onClick={onGoAssessments}
          >
            {t('oaEmptyAction')}
          </button>
        </p>
      )}

      {lockedCount > 0 && (
        <p role="note" className="flex items-start gap-2 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{t('oaLockedNote', { count: lockedCount })}</span>
        </p>
      )}

      <section aria-labelledby="oa-summary-title" className="grid gap-2">
        <h2 id="oa-summary-title" className="font-heading text-base font-semibold">
          {t('oaSummaryTitle')}
        </h2>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.objectives.map((o) => (
            <ObjectiveSummary key={o.id} objective={o} students={total} />
          ))}
        </ul>
      </section>

      {showAllToggle}

      {total === 0 ? (
        <EmptyPanel
          icon={Users}
          tone={MODULE_TONE.academic}
          title={t('noStudentsTitle')}
          body={t('noStudents')}
        />
      ) : (
        <>
          {/* Layar lebar: matriks murid x TP. Gulir hanya di dalam tabel, bukan di halaman. */}
          <div className="bg-card hidden max-w-full overflow-x-auto rounded-2xl border lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground text-xs">
                  <th
                    scope="col"
                    className="bg-muted sticky left-0 z-[1] min-w-48 px-3 py-2.5 text-left font-medium"
                  >
                    {t('student')}
                  </th>
                  {data.objectives.map((o) => (
                    <th
                      key={o.id}
                      scope="col"
                      className="min-w-52 px-3 py-2.5 text-left align-top font-medium"
                    >
                      <span className="text-foreground block">{o.code ?? t('oaObjectiveShort')}</span>
                      <span className="line-clamp-2 block font-normal" title={o.description}>
                        {o.description}
                      </span>
                      <span className="mt-0.5 block font-normal tabular-nums">
                        {o.summary.assessed > 0
                          ? t('oaSummaryText', {
                              achieved: o.summary.achieved,
                              assessed: o.summary.assessed,
                              rate: achievementRate(o.summary) ?? 0,
                            })
                          : t('oaSummaryNone')}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.students.map((s) => (
                  <tr key={s.studentId} className="hover:bg-muted/30 align-top">
                    <th scope="row" className="bg-card sticky left-0 z-[1] px-3 py-3 text-left font-normal">
                      <PersonCell name={s.name} sub={s.nis} />
                      {s.locked && (
                        <ToneBadge tone="amber" dot={false} className="mt-1.5">
                          <Lock className="size-3" aria-hidden />
                          {t('oaLockedBadge')}
                        </ToneBadge>
                      )}
                    </th>
                    {data.objectives.map((o, i) => {
                      const cell = s.cells[i];
                      return (
                        <td key={o.id} className="px-3 py-3">
                          {cell && (
                            <div className="grid gap-2">
                              <CellBody cell={cell} />
                              {editButton(s, o, cell)}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Di bawah lg: satu kartu per murid, tanpa gulir mendatar. */}
          <ul className="grid grid-cols-[minmax(0,1fr)] content-start gap-3 lg:hidden">
            {data.students.map((s) => (
              <li
                key={s.studentId}
                className="bg-card grid grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border p-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <PersonCell name={s.name} sub={s.nis} />
                  {s.locked && (
                    <ToneBadge tone="amber" dot={false}>
                      <Lock className="size-3" aria-hidden />
                      {t('oaLockedBadge')}
                    </ToneBadge>
                  )}
                </div>
                <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
                  {data.objectives.map((o, i) => {
                    const cell = s.cells[i];
                    if (!cell) return null;
                    return (
                      <li
                        key={o.id}
                        className="bg-muted/40 grid grid-cols-[minmax(0,1fr)] gap-2 rounded-xl border p-3"
                      >
                        <p className="text-xs font-medium break-words">
                          {o.code ? `${o.code} · ` : ''}
                          <span className="text-muted-foreground font-normal">{o.description}</span>
                        </p>
                        <CellBody cell={cell} />
                        {editButton(s, o, cell)}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}

      {target && (
        <OverrideDialog
          key={`${target.student.studentId}:${target.objective.id}`}
          target={target}
          semesterId={semesterId}
          classId={classId}
          subjectId={subjectId}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
}
