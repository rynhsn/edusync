'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Save, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FieldError, TOUCH_INPUT, TOUCH_SELECT, useFormValidation } from '@/components/form-field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, schoolHeader, unwrap } from '@/lib/api';
import {
  buildPolicyBody,
  EMPTY_POLICY,
  formFromPolicy,
  LIMITS,
  POLICY_ORDER,
  type PolicyField,
  type PolicyForm,
  type PolicyView,
  REPORT_SCOPES,
  ROUNDINGS,
  templatePreview,
  validatePolicy,
  weightShares,
} from '@/lib/graduation';
import { useGraduationError, useRefreshGraduation } from './graduation-shared';

/** Kriteria kelulusan tahun ajaran: bobot komponen, ambang (saran), mapel wajib, dan templat nomor SKL. */
export function PolicyPanel({ yearId, policy }: { yearId: string; policy: PolicyView | null }) {
  const t = useTranslations('graduation');
  const err = useGraduationError();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const refresh = useRefreshGraduation();
  const manage = can('graduation:manage');

  const [values, setValues] = useState<PolicyForm>(() => formFromPolicy(policy));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const validation = useFormValidation<PolicyField>({
    errors: validatePolicy(values),
    order: POLICY_ORDER,
    idPrefix: 'gp',
  });
  // Isian mengikuti kebijakan tersimpan setiap kali data segar tiba (setelah simpan atau ganti tahun).
  const stamp = policy ? policy.updatedAt : 'none';
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya bila kebijakan tersimpan berganti
  useEffect(() => {
    setValues(formFromPolicy(policy));
    setError(null);
    validation.reset();
  }, [stamp]);

  const exams = useQuery({
    queryKey: ['graduation', school.schoolId, yearId, 'exams'],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/academic-years/{id}/school-exams', {
          params: { ...header, path: { id: yearId } },
        }),
      ),
  });
  const examList = exams.data?.items ?? [];
  const subjects = useQuery({
    queryKey: ['subjects', school.schoolId],
    enabled: can('subject:read'),
    queryFn: async () => unwrap(await api.GET('/v1/subjects', { params: header })),
  });

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/academic-years/{id}/graduation-policy', {
          params: { ...header, path: { id: yearId } },
          body: buildPolicyBody(
            values,
            examList.map((e) => e.id),
          ),
        }),
      ),
    onSuccess: () => {
      toast.success(t('policy.saved'));
      setError(null);
      refresh();
    },
    onError: (e) => setError(err(e)),
  });
  const remove = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.DELETE('/v1/academic-years/{id}/graduation-policy', {
          params: { ...header, path: { id: yearId } },
        }),
      ),
    onSuccess: () => {
      toast.success(t('policy.removed'));
      refresh();
    },
    onError: (e) => toast.error(err(e)),
  });

  const set = <K extends keyof PolicyForm>(key: K, value: PolicyForm[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const shares = weightShares(values, examList, t('policy.reportLabel'));
  const preview = templatePreview(values.sklNumberTemplate, new Date().getFullYear());
  const f = (k: string) => `gp-${k}`;
  const ro = !manage;

  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!ro && validation.attempt()) save.mutate();
      }}
    >
      {!policy && <p className="text-muted-foreground text-sm">{t('policy.emptyHint')}</p>}
      {ro && (
        <Alert>
          <AlertDescription>{t('policy.readOnly')}</AlertDescription>
        </Alert>
      )}

      <fieldset className="bg-card grid gap-4 rounded-2xl border p-4" disabled={ro}>
        <legend className="px-1 text-sm font-semibold">{t('policy.weightsTitle')}</legend>
        <p className="text-muted-foreground -mt-2 text-xs">{t('policy.weightsHelp')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor={f('reportWeight')}>{t('policy.reportWeight')}</Label>
            <Input
              {...validation.fieldProps('reportWeight')}
              className={TOUCH_INPUT}
              inputMode="decimal"
              value={values.reportWeight}
              onChange={(e) => set('reportWeight', e.target.value)}
            />
            <FieldError id={f('reportWeight')} issue={validation.issue('reportWeight')} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor={f('reportScope')}>{t('policy.reportScope')}</Label>
            <SelectField
              id={f('reportScope')}
              className={TOUCH_SELECT}
              value={values.reportScope}
              onChange={(e) => set('reportScope', e.target.value as PolicyForm['reportScope'])}
            >
              {REPORT_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {t(`policy.scopes.${s}`)}
                </option>
              ))}
            </SelectField>
          </div>
          {values.reportScope === 'levels' && (
            <div className="grid content-start gap-2 sm:col-span-2">
              <Label htmlFor={f('reportLevels')}>{t('policy.reportLevels')}</Label>
              <Input
                {...validation.fieldProps('reportLevels')}
                className={TOUCH_INPUT}
                value={values.reportLevels}
                onChange={(e) => set('reportLevels', e.target.value)}
              />
              <p className="text-muted-foreground text-xs">{t('policy.reportLevelsHint')}</p>
              <FieldError id={f('reportLevels')} issue={validation.issue('reportLevels')} />
            </div>
          )}
        </div>

        <div className="grid gap-2" id={f('examWeights')}>
          <p className="text-sm font-medium">{t('policy.examWeights')}</p>
          {exams.isPending && <Skeleton className="h-12 w-full rounded-xl" />}
          {exams.data && examList.length === 0 && (
            <p className="text-muted-foreground text-sm">{t('policy.noExams')}</p>
          )}
          {examList.map((x) => (
            <div key={x.id} className="grid grid-cols-[1fr_7rem] items-center gap-3">
              <Label htmlFor={`gp-exam-${x.id}`} className="min-w-0 break-words">
                {x.name}
              </Label>
              <Input
                id={`gp-exam-${x.id}`}
                className={TOUCH_INPUT}
                inputMode="decimal"
                placeholder="0"
                aria-label={t('policy.examWeightFor', { name: x.name })}
                value={values.examWeights[x.id] ?? ''}
                onChange={(e) => set('examWeights', { ...values.examWeights, [x.id]: e.target.value })}
              />
            </div>
          ))}
          <FieldError id={f('examWeights')} issue={validation.issue('examWeights')} />
        </div>

        <div className="bg-muted/50 rounded-xl p-3 text-sm" aria-live="polite">
          <p className="text-muted-foreground text-xs font-medium uppercase">{t('policy.sharesTitle')}</p>
          {shares.length === 0 ? (
            <p className="text-muted-foreground mt-1">{t('policy.sharesNone')}</p>
          ) : (
            <p className="mt-1 break-words tabular-nums">
              {shares.map((s) => `${s.label} ${s.percent}%`).join(' · ')}
            </p>
          )}
        </div>
      </fieldset>

      <fieldset className="bg-card grid gap-4 rounded-2xl border p-4" disabled={ro}>
        <legend className="px-1 text-sm font-semibold">{t('policy.criteriaTitle')}</legend>
        <p className="text-muted-foreground -mt-2 text-xs">{t('policy.criteriaHelp')}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid content-start gap-2">
            <Label htmlFor={f('minAverage')}>{t('policy.minAverage')}</Label>
            <Input
              {...validation.fieldProps('minAverage')}
              className={TOUCH_INPUT}
              inputMode="decimal"
              value={values.minAverage}
              onChange={(e) => set('minAverage', e.target.value)}
            />
            <FieldError id={f('minAverage')} issue={validation.issue('minAverage')} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor={f('minSubjectScore')}>{t('policy.minSubjectScore')}</Label>
            <Input
              {...validation.fieldProps('minSubjectScore')}
              className={TOUCH_INPUT}
              inputMode="decimal"
              value={values.minSubjectScore}
              onChange={(e) => set('minSubjectScore', e.target.value)}
            />
            <FieldError id={f('minSubjectScore')} issue={validation.issue('minSubjectScore')} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor={f('rounding')}>{t('policy.rounding')}</Label>
            <SelectField
              id={f('rounding')}
              className={TOUCH_SELECT}
              value={values.rounding}
              onChange={(e) => set('rounding', e.target.value as PolicyForm['rounding'])}
            >
              {ROUNDINGS.map((r) => (
                <option key={r} value={r}>
                  {t(`policy.roundings.${r}`)}
                </option>
              ))}
            </SelectField>
          </div>
        </div>

        {can('subject:read') && (
          <div className="grid gap-2">
            <p className="text-sm font-medium">{t('policy.requiredSubjects')}</p>
            <p className="text-muted-foreground text-xs">{t('policy.requiredSubjectsHint')}</p>
            <ul className="max-h-56 divide-y overflow-y-auto rounded-xl border">
              {(subjects.data ?? []).map((s) => {
                const id = `gp-sub-${s.id}`;
                const on = values.requiredSubjectIds.includes(s.id);
                return (
                  <li key={s.id}>
                    <label
                      htmlFor={id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 text-sm"
                    >
                      <Checkbox
                        id={id}
                        checked={on}
                        onCheckedChange={(v) =>
                          set(
                            'requiredSubjectIds',
                            v === true
                              ? [...values.requiredSubjectIds, s.id]
                              : values.requiredSubjectIds.filter((x) => x !== s.id),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="grid content-start gap-2">
          <Label htmlFor={f('criteriaText')}>{t('policy.criteriaText')}</Label>
          <Textarea
            {...validation.fieldProps('criteriaText')}
            rows={3}
            maxLength={LIMITS.criteria}
            value={values.criteriaText}
            onChange={(e) => set('criteriaText', e.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t('policy.criteriaTextHint')}</p>
          <FieldError id={f('criteriaText')} issue={validation.issue('criteriaText')} />
        </div>
      </fieldset>

      <fieldset className="bg-card grid gap-4 rounded-2xl border p-4 sm:grid-cols-2" disabled={ro}>
        <legend className="px-1 text-sm font-semibold">{t('policy.numberingTitle')}</legend>
        <div className="grid content-start gap-2">
          <Label htmlFor={f('sklNumberTemplate')}>{t('policy.template')}</Label>
          <Input
            {...validation.fieldProps('sklNumberTemplate')}
            className={TOUCH_INPUT}
            maxLength={LIMITS.template}
            placeholder="{seq:3}/SKL/{year}"
            value={values.sklNumberTemplate}
            onChange={(e) => set('sklNumberTemplate', e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            {preview ? t('policy.templatePreview', { example: preview }) : t('policy.templateHint')}
          </p>
          <FieldError id={f('sklNumberTemplate')} issue={validation.issue('sklNumberTemplate')} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={f('announceOn')}>{t('policy.announceOn')}</Label>
          <DatePicker
            {...validation.fieldProps('announceOn')}
            className={TOUCH_INPUT}
            clearable
            value={values.announceOn}
            onChange={(d) => {
              set('announceOn', d);
              validation.touch('announceOn');
            }}
          />
          <p className="text-muted-foreground text-xs">{t('policy.announceOnHint')}</p>
          <FieldError id={f('announceOn')} issue={validation.issue('announceOn')} />
        </div>
        <p className="text-muted-foreground text-xs sm:col-span-2">{t('policy.diplomaNote')}</p>
      </fieldset>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {validation.summary && (
        <p aria-live="polite" className="text-destructive text-sm">
          {t('policy.checkFields')}
        </p>
      )}

      {!ro && (
        <div className="flex flex-wrap justify-end gap-2 max-sm:[&>*]:flex-1">
          {policy && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive h-11 md:h-8"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" aria-hidden /> {t('policy.remove')}
            </Button>
          )}
          <Button type="submit" className="h-11 md:h-8" disabled={save.isPending}>
            <Save className="size-4" aria-hidden /> {save.isPending ? t('saving') : t('policy.save')}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('policy.removeTitle')}
        description={t('policy.removeBody')}
        confirmLabel={t('policy.remove')}
        destructive
        pending={remove.isPending}
        onConfirm={async () => {
          await remove.mutateAsync();
          setValues({ ...EMPTY_POLICY, examWeights: {}, requiredSubjectIds: [] });
        }}
      />
    </form>
  );
}
