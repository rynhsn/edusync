'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Scale, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { FORM_GRID, FormField } from '@/components/form-field';
import { FieldError, TOUCH_INPUT, TOUCH_SELECT, useFormValidation } from '@/components/form-field-error';
import { LevelField } from '@/components/level-field';
import { ConfirmDelete, ListSkeleton } from '@/components/master-kit';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { EmptyPanel, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import type { FieldErrors } from '@/lib/form-validation';
import {
  buildRuleBody,
  EMPTY_RULE,
  presetFor,
  RULE_KINDS,
  type RuleDraft,
  type RuleField,
  type RuleKind,
  rangeKind,
  ruleToDraft,
  validateRule,
} from '@/lib/subject-choice';
import { rangeText } from './choice-text';

const ORDER: readonly RuleField[] = ['level', 'label', 'minOffered', 'minChoices', 'maxChoices'];

const toIssues = (e: Partial<Record<RuleField, 'required' | 'invalidNumber' | 'rangeOrder'>>) => {
  const out: FieldErrors<RuleField> = {};
  for (const [k, v] of Object.entries(e) as [RuleField, 'required' | 'invalidNumber' | 'rangeOrder'][]) {
    out[k] =
      v === 'required'
        ? { code: 'required' }
        : {
            code: 'custom',
            key: v === 'invalidNumber' ? 'subjectChoices.errNumber' : 'subjectChoices.errRangeOrder',
          };
  }
  return out;
};

/** Aturan pilihan sekolah untuk satu tahun ajaran: daftar, tambah, ubah, hapus. Hanya untuk pemegang izin kelola. */
export function RulesPanel({ yearId }: { yearId: string }) {
  const t = useTranslations('subjectChoices');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const key = ['subject-choice-rules', school.schoolId, yearId];

  const [dialog, setDialog] = useState<{ id: string | null; draft: RuleDraft } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; label: string } | null>(null);

  const rules = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/subject-choice-rules', {
          params: { ...header, query: { academicYearId: yearId } },
        }),
      ),
  });
  const subjects = useQuery({
    queryKey: ['subjects', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/subjects', { params: header })),
  });
  const programs = useQuery({
    queryKey: ['programs', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/programs', { params: header })),
  });
  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, yearId],
    queryFn: async () =>
      unwrap(await api.GET('/v1/semesters', { params: { ...header, query: { academicYearId: yearId } } })),
  });

  const draft = dialog?.draft ?? EMPTY_RULE;
  const validation = useFormValidation<RuleField>({
    errors: toIssues(validateRule(draft)),
    order: ORDER,
    idPrefix: 'rule',
  });
  const patch = (p: Partial<RuleDraft>) => dialog && setDialog({ ...dialog, draft: { ...draft, ...p } });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['subject-choice-rules', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['subject-choices', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['student-subject-choices', school.schoolId] });
  };

  const send = useMutation({
    mutationFn: async () => {
      if (!dialog) throw new Error('dialog');
      const body = buildRuleBody(yearId, dialog.draft);
      return dialog.id
        ? unwrap(
            await api.PUT('/v1/subject-choice-rules/{id}', {
              params: { ...header, path: { id: dialog.id } },
              body,
            }),
          )
        : unwrap(await api.POST('/v1/subject-choice-rules', { params: header, body }));
    },
    onSuccess: () => {
      toast.success(t('ruleSaved'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/subject-choice-rules/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('ruleDeleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const openNew = () => {
    validation.reset();
    setError(null);
    setDialog({ id: null, draft: { ...EMPTY_RULE, label: t('kind_elective'), ...presetFor('elective') } });
  };
  const changeKind = (kind: RuleKind) => {
    const known = RULE_KINDS.map((k) => t(`kind_${k}`));
    patch({
      kind,
      ...presetFor(kind),
      label: draft.label.trim() === '' || known.includes(draft.label) ? t(`kind_${kind}`) : draft.label,
    });
  };

  if (rules.isPending) return <ListSkeleton rows={3} stats={0} />;
  if (rules.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{te(errorKey(rules.error))}</AlertDescription>
      </Alert>
    );
  }
  const list = rules.data;
  const subjectName = new Map((subjects.data ?? []).map((s) => [s.id, s.name]));
  const programName = new Map((programs.data ?? []).map((p) => [p.id, p.name]));
  const semesterName = new Map((semesters.data ?? []).map((s) => [s.id, s.name]));

  const sentence = (r: (typeof list)[number]) => {
    const parts: string[] = [];
    if (r.minOffered !== null) parts.push(t('ruleOffered', { min: r.minOffered }));
    if (rangeKind(r.minChoices, r.maxChoices) !== 'none') {
      parts.push(t('ruleChoose', { range: rangeText(t, r.minChoices, r.maxChoices) }));
    }
    return parts.length > 0 ? `${parts.join('; ')}.` : t('ruleNoLimits');
  };

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">{t('rulesIntro')}</p>
      <Alert>
        <Scale aria-hidden />
        <AlertDescription>{t('rulesWarnOnly')}</AlertDescription>
      </Alert>
      <div>
        <Button className="max-lg:min-h-11 max-sm:w-full" onClick={openNew}>
          <Plus aria-hidden className="size-4" />
          {t('ruleAdd')}
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyPanel icon={Scale} tone="violet" title={t('rulesEmpty')} body={t('rulesEmptyBody')} />
      ) : (
        <ul className="grid gap-3">
          {list.map((r) => (
            <li key={r.id} className="bg-card grid gap-2 rounded-2xl border p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-heading font-semibold break-words">{r.label}</p>
                  <p className="text-muted-foreground text-xs">
                    {t('ruleScope', {
                      level: r.levelCode,
                      program: r.programId ? (programName.get(r.programId) ?? '') : t('allPrograms'),
                    })}
                  </p>
                </div>
                <ToneBadge tone={r.enforce ? 'rose' : 'sky'}>
                  {r.enforce ? t('enforceOn') : t('enforceOff')}
                </ToneBadge>
              </div>
              <p className="text-sm">{sentence(r)}</p>
              {r.subjectIds.length > 0 && (
                <p className="text-muted-foreground text-xs break-words">
                  {t('ruleSubjects')}:{' '}
                  {r.subjectIds
                    .map((id) => subjectName.get(id) ?? '')
                    .filter(Boolean)
                    .join(', ')}
                </p>
              )}
              {r.lockedFromSemesterId && (
                <p className="text-muted-foreground text-xs">
                  {t('ruleLocked', { semester: semesterName.get(r.lockedFromSemesterId) ?? '' })}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="max-lg:min-h-11 max-sm:flex-1"
                  onClick={() => {
                    validation.reset();
                    setError(null);
                    setDialog({ id: r.id, draft: ruleToDraft(r) });
                  }}
                >
                  <Pencil aria-hidden className="size-4" />
                  {t('ruleEdit')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="max-lg:min-h-11 max-sm:flex-1"
                  onClick={() => setDeleting({ id: r.id, label: r.label })}
                >
                  <Trash2 aria-hidden className="size-4" />
                  {t('ruleDelete')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <FormDialog
        size="wide"
        open={dialog !== null}
        title={dialog?.id ? t('ruleEditTitle') : t('ruleAddTitle')}
        description={t('ruleDialogHint')}
        submitLabel={te('masterData.save')}
        error={error}
        validation={validation}
        onOpenChange={(o) => !o && setDialog(null)}
        onSubmit={() => send.mutateAsync()}
      >
        <div className="grid gap-4">
          <div className={FORM_GRID}>
            <FormField label={t('ruleKind')} htmlFor="rule-kind" hint={t('ruleKindHint')}>
              <SelectField
                id="rule-kind"
                className={TOUCH_SELECT}
                value={draft.kind}
                onChange={(e) => changeKind(e.target.value as RuleKind)}
              >
                {RULE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kindLabel_${k}`)}
                  </option>
                ))}
              </SelectField>
            </FormField>
            <FormField label={t('ruleName')} htmlFor="rule-label">
              <Input
                {...validation.fieldProps('label')}
                className={TOUCH_INPUT}
                maxLength={120}
                value={draft.label}
                onChange={(e) => patch({ label: e.target.value })}
              />
              <FieldError id="rule-label" issue={validation.issue('label')} />
            </FormField>
            <FormField label={t('ruleLevel')} htmlFor="rule-level">
              <LevelField
                {...validation.fieldProps('level')}
                touch
                required
                nativeRequired={false}
                value={draft.levelCode}
                onChange={(v) => patch({ levelCode: v })}
              />
              <FieldError id="rule-level" issue={validation.issue('level')} />
            </FormField>
            <FormField label={t('ruleProgram')} htmlFor="rule-program">
              <SelectField
                id="rule-program"
                className={TOUCH_SELECT}
                value={draft.programId}
                onChange={(e) => patch({ programId: e.target.value })}
              >
                <option value="">{t('allPrograms')}</option>
                {(programs.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </SelectField>
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label={t('ruleMinOffered')} htmlFor="rule-minOffered" hint={t('ruleMinOfferedHint')}>
              <Input
                {...validation.fieldProps('minOffered')}
                className={TOUCH_INPUT}
                inputMode="numeric"
                value={draft.minOffered}
                onChange={(e) => patch({ minOffered: e.target.value })}
              />
              <FieldError id="rule-minOffered" issue={validation.issue('minOffered')} />
            </FormField>
            <FormField label={t('ruleMinChoices')} htmlFor="rule-minChoices" hint={t('ruleMinChoicesHint')}>
              <Input
                {...validation.fieldProps('minChoices')}
                className={TOUCH_INPUT}
                inputMode="numeric"
                value={draft.minChoices}
                onChange={(e) => patch({ minChoices: e.target.value })}
              />
              <FieldError id="rule-minChoices" issue={validation.issue('minChoices')} />
            </FormField>
            <FormField label={t('ruleMaxChoices')} htmlFor="rule-maxChoices" hint={t('ruleMaxChoicesHint')}>
              <Input
                {...validation.fieldProps('maxChoices')}
                className={TOUCH_INPUT}
                inputMode="numeric"
                value={draft.maxChoices}
                onChange={(e) => patch({ maxChoices: e.target.value })}
              />
              <FieldError id="rule-maxChoices" issue={validation.issue('maxChoices')} />
            </FormField>
          </div>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t('ruleSubjectsLabel')}</legend>
            <p className="text-muted-foreground text-xs">{t('ruleSubjectsHint')}</p>
            <ul className="max-h-52 divide-y overflow-y-auto rounded-lg border">
              {(subjects.data ?? [])
                .filter((s) => s.active)
                .map((s) => (
                  <li key={s.id}>
                    <label
                      htmlFor={`rule-subject-${s.id}`}
                      className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5"
                    >
                      <Checkbox
                        id={`rule-subject-${s.id}`}
                        checked={draft.subjectIds.includes(s.id)}
                        onCheckedChange={(v) =>
                          patch({
                            subjectIds: v
                              ? [...draft.subjectIds, s.id]
                              : draft.subjectIds.filter((x) => x !== s.id),
                          })
                        }
                      />
                      <span className="text-sm break-words">{s.name}</span>
                    </label>
                  </li>
                ))}
            </ul>
          </fieldset>

          <FormField label={t('ruleLockFrom')} htmlFor="rule-lock" hint={t('ruleLockFromHint')}>
            <SelectField
              id="rule-lock"
              className={TOUCH_SELECT}
              value={draft.lockedFromSemesterId}
              onChange={(e) => patch({ lockedFromSemesterId: e.target.value })}
            >
              <option value="">{t('ruleLockNone')}</option>
              {(semesters.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
          </FormField>

          <label htmlFor="rule-enforce" className="flex min-h-11 cursor-pointer items-start gap-3">
            <Checkbox
              id="rule-enforce"
              className="mt-0.5"
              checked={draft.enforce}
              onCheckedChange={(v) => patch({ enforce: v === true })}
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{t('ruleEnforce')}</span>
              <span className="text-muted-foreground text-xs">{t('ruleEnforceHint')}</span>
            </span>
          </label>
        </div>
      </FormDialog>

      <ConfirmDelete
        name={deleting?.label ?? null}
        onClose={() => setDeleting(null)}
        pending={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </div>
  );
}
