'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Eye, Layers, ListChecks, Pencil, PenLine, Plus, Target, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { FieldError, TOUCH_INPUT, TOUCH_SELECT, useFormValidation } from '@/components/form-field-error';
import { RowMenu } from '@/components/row-menu';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import {
  EmptyPanel,
  MODULE_TONE,
  StatCard,
  StatGrid,
  TONES,
  type Tone,
  ToneBadge,
} from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { ApiError, api, schoolHeader, unwrap } from '@/lib/api';
import { withoutBlur } from '@/lib/area-rules';
import {
  assessmentTags,
  categoryOf,
  SCOPE_OPTIONS,
  type ScopeValue,
  scopeKey,
  scopeValue,
  TECHNIQUE_OPTIONS,
  type TechniqueValue,
  techniqueKey,
  techniqueValue,
} from '@/lib/assessment-category';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { type ObjectiveLite, objectiveLabel } from '@/lib/objective-achievement';
import { todayIso } from '@/lib/school-time';
import { cn } from '@/lib/utils';
import { COMPONENT_TONES } from './grade-ui';
import { ASSESSMENT_ORDER, type AssessmentField, validateAssessment } from './grade-validation';
import { ObjectivePicker } from './objective-picker';
import { ScoreSheet } from './score-sheet';

interface Props {
  semesterId: string;
  classId: string;
  subjectId: string;
}

interface Form {
  componentId: string;
  title: string;
  date: string;
  maxScore: string;
  /** Asesmen awal (diagnostik): hanya untuk komponen formatif. */
  initial: boolean;
  /** Lingkup sumatif: hanya untuk komponen sumatif. */
  scope: ScopeValue;
  technique: TechniqueValue;
  /** TP yang dikaitkan; satu skor berlaku untuk semuanya. */
  objectiveIds: string[];
  /** TP yang sudah terkait saat formulir dibuka (untuk menampilkan versi lama). */
  linked: ObjectiveLite[];
}

const emptyForm = (componentId = ''): Form => ({
  componentId,
  title: '',
  date: todayIso(),
  maxScore: '100',
  initial: false,
  scope: '',
  technique: '',
  objectiveIds: [],
  linked: [],
});

/** Daftar penilaian untuk satu semester, kelas, dan mata pelajaran; membuka lembar input nilai. */
export function AssessmentsPanel({ semesterId, classId, subjectId }: Props) {
  const t = useTranslations('grades');
  const tc = useTranslations('common');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const canInput = can('grade:input');
  const [open, setOpen] = useState<string | null>(null);
  // null = dialog tertutup, '' = penilaian baru, selain itu id penilaian yang diubah.
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [formError, setFormError] = useState<React.ReactNode>(null);
  const validation = useFormValidation<AssessmentField>({
    errors: validateAssessment(form),
    order: ASSESSMENT_ORDER,
    idPrefix: 'assessment',
  });

  const list = useQuery({
    queryKey: ['assessments', school.schoolId, semesterId, classId, subjectId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/assessments', {
          params: { ...header, query: { semesterId, classId, subjectId } },
        }),
      ),
  });
  const components = useQuery({
    queryKey: ['grading-components', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/grading/components', { params: header })),
  });
  const componentName = (id: string) => components.data?.find((c) => c.id === id)?.name ?? '';
  const componentTone = (id: string): Tone => {
    const i = components.data?.findIndex((c) => c.id === id) ?? -1;
    return COMPONENT_TONES[Math.max(i, 0) % COMPONENT_TONES.length] ?? 'sky';
  };

  const maxNumber = Number(form.maxScore.trim().replace(',', '.'));
  // Kategori penilaian diturunkan dari komponen yang dipilih (tidak disimpan di penilaian).
  const pickedComponent = components.data?.find((c) => c.id === form.componentId);
  const pickedCategory = pickedComponent ? categoryOf(pickedComponent) : 'summative';

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['assessments', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['grading-recap', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['objective-achievement', school.schoolId] });
  };

  const submit = useMutation({
    mutationFn: async () => {
      const body = {
        componentId: form.componentId,
        title: form.title.trim(),
        date: form.date,
        maxScore: maxNumber,
        objectiveIds: form.objectiveIds,
        ...assessmentTags({
          category: pickedCategory,
          initial: form.initial,
          scope: form.scope,
          technique: form.technique,
        }),
      };
      if (editing) {
        return unwrap(
          await api.PUT('/v1/assessments/{id}', { params: { ...header, path: { id: editing } }, body }),
        );
      }
      return unwrap(
        await api.POST('/v1/assessments', {
          params: header,
          body: { semesterId, classId, subjectId, ...body },
        }),
      );
    },
    onSuccess: () => {
      toast.success(editing ? t('assessmentUpdated') : t('assessmentCreated'));
      invalidate();
    },
    onError: (e) =>
      setFormError(
        // Komponen dibuat setelah semester dibekukan: jelaskan jalan keluarnya dan tautkan ke Pengaturan penilaian.
        e instanceof ApiError && e.code === 'component_not_in_semester' ? (
          <>
            {te(errorKey(e))}{' '}
            <Link href="/grades/settings" className="font-medium underline underline-offset-2">
              {t('semCfgGoLink')}
            </Link>
          </>
        ) : (
          te(errorKey(e))
        ),
      ),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/assessments/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('assessmentDeleted'));
      invalidate();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  function openDialog(id: string, init: Form) {
    setForm(init);
    setFormError(null);
    validation.reset();
    setEditing(id);
  }

  if (open) {
    return (
      <ScoreSheet
        assessmentId={open}
        onClose={() => {
          setOpen(null);
          invalidate();
        }}
      />
    );
  }

  const items = list.data ?? [];
  const noComponents = components.data?.length === 0;
  const sumFilled = items.reduce((n, a) => n + a.filled, 0);
  const sumTotal = items.reduce((n, a) => n + a.total, 0);
  const completeCount = items.filter((a) => a.total > 0 && a.filled >= a.total).length;
  const usedComponents = new Set(items.map((a) => a.componentId)).size;

  return (
    <div className="grid gap-4">
      {list.data && items.length > 0 && (
        <StatGrid className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
          <StatCard
            icon={ClipboardList}
            tone={MODULE_TONE.academic}
            label={t('statAssessments')}
            value={items.length}
          />
          <StatCard
            icon={ListChecks}
            tone="emerald"
            label={t('statComplete')}
            value={`${completeCount}/${items.length}`}
            progress={items.length ? (completeCount / items.length) * 100 : 0}
          />
          <StatCard
            icon={PenLine}
            tone="sky"
            label={t('statScoresFilled')}
            value={sumTotal ? `${Math.round((sumFilled / sumTotal) * 100)}%` : '-'}
            hint={t('filledOf', { filled: sumFilled, total: sumTotal })}
            progress={sumTotal ? (sumFilled / sumTotal) * 100 : 0}
          />
          <StatCard icon={Layers} tone="amber" label={t('statComponents')} value={usedComponents} />
        </StatGrid>
      )}

      {canInput && items.length > 0 && (
        <div className="flex justify-end">
          <Button
            disabled={!components.data || noComponents}
            onClick={() => openDialog('', emptyForm(components.data?.[0]?.id))}
          >
            <Plus className="size-4" /> {t('newAssessment')}
          </Button>
        </div>
      )}
      {noComponents && (
        <EmptyPanel icon={Layers} tone="amber" title={t('noComponentsTitle')} body={t('noComponentsHint')} />
      )}
      {list.isPending && (
        <div className="grid content-start gap-2" aria-busy>
          {['a', 'b', 'c', 'd', 'e', 'f'].slice(0, 4).map((k) => (
            <Skeleton key={k} className="h-16 rounded-2xl" />
          ))}
        </div>
      )}
      {list.data && items.length === 0 && !noComponents && (
        <EmptyPanel
          icon={ClipboardList}
          tone={MODULE_TONE.academic}
          title={t('noAssessmentsTitle')}
          body={t('noAssessments')}
          action={
            canInput && (
              <Button onClick={() => openDialog('', emptyForm(components.data?.[0]?.id))}>
                <Plus className="size-4" /> {t('newAssessment')}
              </Button>
            )
          }
        />
      )}
      {items.length > 0 && (
        <div className="bg-card overflow-hidden rounded-2xl border">
          <div
            aria-hidden
            className="bg-muted/50 text-muted-foreground hidden grid-cols-[minmax(0,2fr)_9rem_8rem_5rem_minmax(0,1.2fr)_auto] items-center gap-4 border-b px-4 py-2.5 text-xs font-medium md:grid"
          >
            <span>{t('assessmentTitle')}</span>
            <span>{t('component')}</span>
            <span>{t('date')}</span>
            <span className="text-right">{t('maxScore')}</span>
            <span>{t('filledHeader')}</span>
            <span className="w-28" />
          </div>
          <ul className="divide-y">
            {items.map((a, idx) => {
              const done = a.total > 0 && a.filled >= a.total;
              const pct = a.total ? (a.filled / a.total) * 100 : 0;
              const ct = componentTone(a.componentId);
              return (
                <li
                  key={a.id}
                  style={{ animationDelay: `${Math.min(idx, 8) * 30}ms` }}
                  className="hover:bg-muted/30 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors md:grid-cols-[minmax(0,2fr)_9rem_8rem_5rem_minmax(0,1.2fr)_auto] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both motion-safe:duration-300"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className={cn(
                        'hidden size-9 shrink-0 place-items-center rounded-xl sm:grid',
                        TONES[ct].soft,
                      )}
                    >
                      <ClipboardList className="size-4" />
                    </span>
                    <button
                      type="button"
                      className="focus-visible:ring-ring/60 min-w-0 truncate rounded text-left font-medium outline-none hover:underline focus-visible:ring-2"
                      onClick={() => setOpen(a.id)}
                    >
                      {a.title}
                    </button>
                  </div>
                  <div className="col-start-1 flex flex-wrap items-center gap-2 md:contents">
                    <span className="flex flex-wrap items-center gap-1.5 md:order-none">
                      <ToneBadge tone={ct}>{componentName(a.componentId)}</ToneBadge>
                      {a.category === 'formative' && (
                        <ToneBadge tone="slate" dot={false}>
                          {t('categoryFormativeShort')}
                        </ToneBadge>
                      )}
                      {a.purpose === 'initial' && (
                        <ToneBadge tone="violet" dot={false}>
                          {t('purposeInitial')}
                        </ToneBadge>
                      )}
                      {a.summativeScope && (
                        <ToneBadge tone="sky" dot={false}>
                          {t(scopeKey(a.summativeScope))}
                        </ToneBadge>
                      )}
                      {a.technique && (
                        <span className="text-muted-foreground text-xs">{t(techniqueKey(a.technique))}</span>
                      )}
                      {a.objectives.length > 0 && (
                        <span title={a.objectives.map(objectiveLabel).join('\n')}>
                          <ToneBadge tone="teal" dot={false}>
                            <Target className="size-3" aria-hidden />
                            {t('objectivesBadge', { count: a.objectives.length })}
                          </ToneBadge>
                          <span className="sr-only">{a.objectives.map(objectiveLabel).join('; ')}</span>
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground text-sm md:text-foreground">
                      {formatCalendarDate(locale, a.date)}
                    </span>
                    <span className="text-muted-foreground text-sm tabular-nums md:text-foreground md:text-right">
                      <span className="md:hidden">{t('maxScore')}: </span>
                      {a.maxScore}
                    </span>
                  </div>
                  <div className="col-start-1 flex items-center gap-3 md:col-start-auto">
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={a.total}
                      aria-valuenow={a.filled}
                      aria-label={t('filledHeader')}
                      className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full"
                    >
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width] duration-500',
                          done ? TONES.emerald.bar : TONES.amber.bar,
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                      {t('filledOf', { filled: a.filled, total: a.total })}
                    </span>
                  </div>
                  <div className="col-start-2 row-start-1 flex items-center justify-end gap-1 md:col-start-auto md:row-start-auto md:w-28">
                    <Button size="sm" variant={done ? 'outline' : 'default'} onClick={() => setOpen(a.id)}>
                      {canInput ? <PenLine className="size-3.5" /> : <Eye className="size-3.5" />}
                      {canInput ? t('fill') : t('view')}
                    </Button>
                    {canInput && (
                      <RowMenu
                        label={`${t('rowActions')}: ${a.title}`}
                        items={[
                          {
                            key: 'edit',
                            label: t('edit'),
                            icon: Pencil,
                            onSelect: () =>
                              openDialog(a.id, {
                                componentId: a.componentId,
                                title: a.title,
                                date: a.date,
                                maxScore: String(a.maxScore),
                                initial: a.purpose === 'initial',
                                scope: scopeValue(a.summativeScope),
                                technique: techniqueValue(a.technique),
                                objectiveIds: a.objectives.map((x) => x.id),
                                linked: a.objectives,
                              }),
                          },
                          {
                            key: 'delete',
                            label: t('delete'),
                            icon: Trash2,
                            destructive: true,
                            onSelect: () => setDeleting({ id: a.id, title: a.title }),
                          },
                        ]}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={t('delete')}
        description={deleting ? t('confirmDelete', { title: deleting.title }) : undefined}
        confirmLabel={tc('confirmDelete')}
        destructive
        pending={remove.isPending}
        onConfirm={() => (deleting ? remove.mutateAsync(deleting.id) : Promise.resolve())}
      />

      <FormDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        title={editing ? t('editAssessment') : t('newAssessment')}
        submitLabel={t('save')}
        error={formError}
        validation={validation}
        onSubmit={() => submit.mutateAsync()}
      >
        <div className="grid content-start gap-2">
          <Label htmlFor={validation.idOf('componentId')}>{t('component')}</Label>
          <SelectField
            {...withoutBlur(validation.fieldProps('componentId'))}
            className={TOUCH_SELECT}
            value={form.componentId}
            onChange={(e) => {
              setForm((f) => ({ ...f, componentId: e.target.value }));
              validation.touch('componentId');
            }}
          >
            {components.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {`${c.name} (${categoryOf(c) === 'formative' ? t('categoryFormativeShort') : `${c.weight}%`})`}
              </option>
            ))}
          </SelectField>
          <FieldError id={validation.idOf('componentId')} issue={validation.issue('componentId')} />
          {pickedComponent && (
            <p
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-xs',
                pickedCategory === 'formative' ? TONES.slate.soft : TONES.sky.soft,
              )}
            >
              {pickedCategory === 'formative' ? t('categoryNoteFormative') : t('categoryNoteSummative')}
            </p>
          )}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={validation.idOf('title')}>{t('assessmentTitle')}</Label>
          <Input
            {...validation.fieldProps('title')}
            className={TOUCH_INPUT}
            aria-required="true"
            autoComplete="off"
            maxLength={120}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <FieldError id={validation.idOf('title')} issue={validation.issue('title')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor={validation.idOf('date')}>{t('date')}</Label>
            <DatePicker
              {...withoutBlur(validation.fieldProps('date'))}
              className={TOUCH_INPUT}
              value={form.date}
              onChange={(v) => {
                if (v) setForm((f) => ({ ...f, date: v }));
                validation.touch('date');
              }}
            />
            <FieldError id={validation.idOf('date')} issue={validation.issue('date')} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor={validation.idOf('maxScore')}>{t('maxScore')}</Label>
            <Input
              {...validation.fieldProps('maxScore')}
              className={TOUCH_INPUT}
              aria-required="true"
              inputMode="numeric"
              autoComplete="off"
              value={form.maxScore}
              onChange={(e) => setForm((f) => ({ ...f, maxScore: e.target.value }))}
            />
            <FieldError id={validation.idOf('maxScore')} issue={validation.issue('maxScore')} />
          </div>
        </div>
        {pickedComponent && pickedCategory === 'formative' && (
          <label
            htmlFor="assessment-initial"
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3"
          >
            <Checkbox
              id="assessment-initial"
              className="mt-0.5"
              checked={form.initial}
              onCheckedChange={(v) => setForm((f) => ({ ...f, initial: v === true }))}
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{t('purposeInitial')}</span>
              <span className="text-muted-foreground text-xs">{t('purposeInitialHint')}</span>
            </span>
          </label>
        )}
        {pickedComponent && pickedCategory === 'summative' && (
          <div className="grid content-start gap-2">
            <Label htmlFor="assessment-scope">{t('scopeLabel')}</Label>
            <SelectField
              id="assessment-scope"
              className={TOUCH_SELECT}
              value={form.scope}
              onChange={(e) => setForm((f) => ({ ...f, scope: scopeValue(e.target.value) }))}
            >
              <option value="">{t('scopeNone')}</option>
              {SCOPE_OPTIONS.map((sc) => (
                <option key={sc} value={sc}>
                  {t(scopeKey(sc))}
                </option>
              ))}
            </SelectField>
          </div>
        )}
        <div className="grid content-start gap-2">
          <Label htmlFor="assessment-technique">{t('techniqueLabel')}</Label>
          <SelectField
            id="assessment-technique"
            className={TOUCH_SELECT}
            value={form.technique}
            onChange={(e) => setForm((f) => ({ ...f, technique: techniqueValue(e.target.value) }))}
          >
            <option value="">{t('techniqueNone')}</option>
            {TECHNIQUE_OPTIONS.map((tq) => (
              <option key={tq} value={tq}>
                {t(techniqueKey(tq))}
              </option>
            ))}
          </SelectField>
        </div>
        <ObjectivePicker
          subjectId={subjectId}
          value={form.objectiveIds}
          onChange={(ids) => setForm((f) => ({ ...f, objectiveIds: ids }))}
          linked={form.linked}
          feedback={!!pickedComponent && pickedCategory === 'formative'}
        />
      </FormDialog>
    </div>
  );
}
