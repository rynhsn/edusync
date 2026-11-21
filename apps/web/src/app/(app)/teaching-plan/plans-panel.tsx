'use client';

import { MAX_PLAN_TEXT } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ClipboardList, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { TOUCH_SELECT } from '@/components/form-field-error';
import { ConfirmDelete, ListSkeleton, type MenuAction, REVEAL, RowMenu } from '@/components/master-kit';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import { EmptyPanel, MODULE_TONE, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { useSchoolLevels } from '@/lib/school-settings';
import { cn } from '@/lib/utils';
import { ObjectivePicker } from '../grades/objective-picker';
import { usePlanSettings } from './plan-settings';

interface PlanRow {
  id: string;
  title: string;
  goals: string;
  steps: string;
  assessmentPlan: string;
  linkUrl: string | null;
  semesterId: string | null;
  semesterName: string | null;
  levelCode: string | null;
  teacherName: string | null;
  objectives: { id: string; code: string | null; description: string; active: boolean }[];
}

/** Satu sakelar fitur sekolah (`curriculum:manage`): perencanaan atau jurnal mengajar; sakelar penilaian proses dipakai tahap berikutnya. */
function FeatureSwitch({ field, enabled }: { field: 'planEnabled' | 'journalEnabled'; enabled: boolean }) {
  const t = useTranslations('teachingPlan');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const key = field === 'planEnabled' ? 'plan' : 'journal';
  const save = useMutation({
    mutationFn: async (value: boolean) =>
      unwrap(
        await api.PUT('/v1/learning-plan/settings', {
          params: { header: schoolHeader(school.schoolId) },
          body: { [field]: value },
        }),
      ),
    onSuccess: () => {
      toast.success(t(`${key}SwitchSaved`));
      queryClient.invalidateQueries({ queryKey: ['learning-plan-settings'] });
      queryClient.invalidateQueries({ queryKey: ['learning-plans'] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  return (
    <label
      htmlFor={`tp-${key}-switch`}
      className="bg-card flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border p-4"
    >
      <Checkbox
        id={`tp-${key}-switch`}
        className="mt-0.5"
        checked={enabled}
        disabled={save.isPending}
        onCheckedChange={(v) => save.mutate(v === true)}
      />
      <span className="grid gap-1">
        <span className="text-sm font-medium">{t(`${key}SwitchLabel`)}</span>
        <span className="text-muted-foreground text-xs">{t(`${key}SwitchHelp`)}</span>
      </span>
    </label>
  );
}

/** Perencanaan pembelajaran satu mapel per tahun ajaran (tujuan, langkah, asesmen). Opsional per sekolah lewat sakelar. */
export function PlansPanel({
  subjectId,
  subjectName,
  canWrite,
}: {
  subjectId: string;
  subjectName: string;
  canWrite: boolean;
}) {
  const t = useTranslations('teachingPlan');
  const te = useTranslations();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const queryClient = useQueryClient();
  const manager = can('curriculum:manage');
  const settings = usePlanSettings();
  const enabled = settings.data?.planEnabled === true;
  const [yearChoice, setYearChoice] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [form, setForm] = useState<{ plan: PlanRow | null } | null>(null);
  const [deleting, setDeleting] = useState<PlanRow | null>(null);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    enabled: enabled && can('academic_year:read'),
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const yearList = years.data ?? [];
  const yearId =
    yearList.find((y) => y.id === yearChoice)?.id ??
    yearList.find((y) => y.isActive)?.id ??
    yearList[0]?.id ??
    '';
  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, yearId],
    enabled: enabled && !!yearId && can('academic_year:read'),
    queryFn: async () =>
      unwrap(await api.GET('/v1/semesters', { params: { ...header, query: { academicYearId: yearId } } })),
  });
  const semesterList = semesters.data ?? [];

  const plans = useQuery({
    queryKey: ['learning-plans', school.schoolId, subjectId, yearId],
    enabled: enabled && !!yearId,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/learning-plans', {
          params: { ...header, query: { subjectId, academicYearId: yearId } },
        }),
      ),
  });
  const list = (plans.data?.plans ?? []).filter(
    (p) =>
      semesterFilter === '' ||
      (semesterFilter === 'year' ? p.semesterId === null : p.semesterId === semesterFilter),
  );

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/learning-plans/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('planDeleted'));
      queryClient.invalidateQueries({ queryKey: ['learning-plans'] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <section className={cn('grid gap-4', REVEAL)} aria-labelledby="tp-plans-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="tp-plans-title" className="font-heading text-lg font-semibold">
            {t('plansTitle')}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {t('plansHelp', { subject: subjectName })}
          </p>
        </div>
        {enabled && canWrite && yearId && (
          <Button onClick={() => setForm({ plan: null })}>
            <Plus className="size-4" aria-hidden /> {t('planNew')}
          </Button>
        )}
      </div>

      {manager && settings.data && (
        <div className="grid gap-3">
          <FeatureSwitch field="planEnabled" enabled={enabled} />
          <FeatureSwitch field="journalEnabled" enabled={settings.data.journalEnabled} />
        </div>
      )}
      {settings.isPending && <ListSkeleton rows={1} stats={0} />}
      {!enabled && settings.data && !manager && (
        <EmptyPanel
          icon={ClipboardList}
          tone={MODULE_TONE.academic}
          title={t('planOffTitle')}
          body={t('planOffBody')}
        />
      )}

      {enabled && (
        <>
          {years.data && yearList.length === 0 && (
            <EmptyPanel
              icon={CalendarDays}
              tone={MODULE_TONE.academic}
              title={t('noYears')}
              body={t('noYearsBody')}
              action={
                <Button variant="outline" nativeButton={false} render={<Link href="/academic-years" />}>
                  {t('yearsLink')}
                </Button>
              }
            />
          )}
          {yearList.length > 0 && (
            <div className="grid gap-4 sm:max-w-xl sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor="tp-plan-year">{t('year')}</Label>
                <SelectField
                  id="tp-plan-year"
                  className={TOUCH_SELECT}
                  value={yearId}
                  onChange={(e) => {
                    setYearChoice(e.target.value);
                    setSemesterFilter('');
                  }}
                >
                  {yearList.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.isActive ? `${y.name} (${t('activeSuffix')})` : y.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="tp-plan-sem-filter">{t('planSemester')}</Label>
                <SelectField
                  id="tp-plan-sem-filter"
                  className={TOUCH_SELECT}
                  value={semesterFilter}
                  onChange={(e) => setSemesterFilter(e.target.value)}
                >
                  <option value="">{t('planAllSemesters')}</option>
                  <option value="year">{t('planWholeYear')}</option>
                  {semesterList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectField>
              </div>
            </div>
          )}

          {plans.isPending && !!yearId && <ListSkeleton rows={2} stats={0} />}
          {plans.isError && (
            <Alert variant="destructive">
              <AlertDescription>{te(errorKey(plans.error))}</AlertDescription>
            </Alert>
          )}
          {plans.data && list.length === 0 && (
            <EmptyPanel
              icon={ClipboardList}
              tone={MODULE_TONE.academic}
              title={t('planEmpty')}
              body={canWrite ? t('planEmptyBody') : t('planEmptyReadOnly')}
            />
          )}
          <div className="grid gap-3">
            {list.map((p) => {
              const actions: MenuAction[] = canWrite
                ? [
                    { label: t('edit'), icon: Pencil, onSelect: () => setForm({ plan: p }) },
                    {
                      label: t('delete'),
                      icon: Trash2,
                      destructive: true,
                      separated: true,
                      onSelect: () => setDeleting(p),
                    },
                  ]
                : [];
              return (
                <article key={p.id} className="bg-card grid gap-3 rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-medium break-words">{p.title}</h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <ToneBadge tone="teal" dot={false}>
                          {p.semesterName ?? t('planWholeYear')}
                        </ToneBadge>
                        {p.levelCode && (
                          <ToneBadge tone="sky" dot={false}>
                            {t('planLevelBadge', { level: p.levelCode })}
                          </ToneBadge>
                        )}
                        {p.objectives.length > 0 && (
                          <ToneBadge tone="violet" dot={false}>
                            {t('planObjectivesCount', { count: p.objectives.length })}
                          </ToneBadge>
                        )}
                        <span className="text-muted-foreground text-xs">
                          {p.teacherName ? t('planOwner', { name: p.teacherName }) : t('planOwnerSchool')}
                        </span>
                      </div>
                    </div>
                    <RowMenu label={t('planMenu', { title: p.title })} actions={actions} />
                  </div>
                  <details className="group text-sm">
                    <summary className="text-primary min-h-11 cursor-pointer py-2.5 font-medium md:min-h-0 md:py-0">
                      {t('planShowDetail')}
                    </summary>
                    <dl className="mt-2 grid gap-3">
                      {(
                        [
                          ['planGoals', p.goals],
                          ['planSteps', p.steps],
                          ['planAssessment', p.assessmentPlan],
                        ] as const
                      ).map(([key, value]) => (
                        <div key={key}>
                          <dt className="text-muted-foreground text-xs font-medium">{t(key)}</dt>
                          <dd className="mt-0.5 break-words whitespace-pre-line">{value}</dd>
                        </div>
                      ))}
                      {p.objectives.length > 0 && (
                        <div>
                          <dt className="text-muted-foreground text-xs font-medium">{t('planObjectives')}</dt>
                          <dd>
                            <ul className="mt-0.5 grid gap-1">
                              {p.objectives.map((o) => (
                                <li key={o.id} className="break-words">
                                  {o.code ? `${o.code} - ` : ''}
                                  {o.description}
                                </li>
                              ))}
                            </ul>
                          </dd>
                        </div>
                      )}
                    </dl>
                  </details>
                  {p.linkUrl && (
                    <a
                      href={p.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex min-h-11 items-center gap-1.5 text-sm font-medium underline underline-offset-2 md:min-h-0"
                    >
                      <ExternalLink className="size-4 shrink-0" aria-hidden /> {t('planOpenLink')}
                    </a>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}

      {form && yearId && (
        <PlanForm
          key={form.plan?.id ?? 'new'}
          subjectId={subjectId}
          yearId={yearId}
          semesters={semesterList}
          plan={form.plan}
          onClose={() => setForm(null)}
        />
      )}
      <ConfirmDelete
        name={deleting?.title ?? null}
        onClose={() => setDeleting(null)}
        pending={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            setDeleting(null);
          } catch {
            // Galat tampil sebagai toast.
          }
        }}
      />
    </section>
  );
}

function PlanForm({
  subjectId,
  yearId,
  semesters,
  plan,
  onClose,
}: {
  subjectId: string;
  yearId: string;
  semesters: { id: string; name: string }[];
  plan: PlanRow | null;
  onClose: () => void;
}) {
  const t = useTranslations('teachingPlan');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const levels = useSchoolLevels();
  const levelList = levels.data ?? [];

  const [title, setTitle] = useState(plan?.title ?? '');
  const [goals, setGoals] = useState(plan?.goals ?? '');
  const [steps, setSteps] = useState(plan?.steps ?? '');
  const [assessmentPlan, setAssessmentPlan] = useState(plan?.assessmentPlan ?? '');
  const [linkUrl, setLinkUrl] = useState(plan?.linkUrl ?? '');
  const [semesterId, setSemesterId] = useState(plan?.semesterId ?? '');
  const [levelCode, setLevelCode] = useState(plan?.levelCode ?? '');
  const [objectiveIds, setObjectiveIds] = useState<string[]>(plan?.objectives.map((o) => o.id) ?? []);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const common = {
        title: title.trim(),
        goals: goals.trim(),
        steps: steps.trim(),
        assessmentPlan: assessmentPlan.trim(),
        linkUrl: linkUrl.trim() === '' ? null : linkUrl.trim(),
        semesterId: semesterId === '' ? null : semesterId,
        levelCode: levelCode === '' ? null : levelCode,
        objectiveIds,
      };
      if (plan) {
        return unwrap(
          await api.PUT('/v1/learning-plans/{id}', {
            params: { ...header, path: { id: plan.id } },
            body: common,
          }),
        );
      }
      return unwrap(
        await api.POST('/v1/learning-plans', {
          params: header,
          body: { ...common, subjectId, academicYearId: yearId },
        }),
      );
    },
    onSuccess: () => {
      toast.success(plan ? t('planSaved') : t('planCreated'));
      queryClient.invalidateQueries({ queryKey: ['learning-plans'] });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const longText = (id: string, label: string, hint: string, value: string, set: (v: string) => void) => (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        required
        rows={4}
        maxLength={MAX_PLAN_TEXT}
        value={value}
        placeholder={hint}
        onChange={(e) => set(e.target.value)}
      />
    </div>
  );

  return (
    <FormDialog
      open
      size="wide"
      onOpenChange={(o) => !o && onClose()}
      title={plan ? t('planEdit') : t('planNew')}
      description={plan ? undefined : t('planFormHelp')}
      submitLabel={save.isPending ? t('saving') : plan ? t('save') : t('create')}
      error={error}
      onSubmit={async () => {
        setError(null);
        await save.mutateAsync();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="tp-plan-title">{t('planTitle')}</Label>
        <Input
          id="tp-plan-title"
          required
          maxLength={200}
          value={title}
          placeholder={t('planTitleHint')}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid min-w-0 content-start gap-2">
          <Label htmlFor="tp-plan-semester">{t('planSemester')}</Label>
          <SelectField
            id="tp-plan-semester"
            className={TOUCH_SELECT}
            value={semesterId}
            onChange={(e) => setSemesterId(e.target.value)}
          >
            <option value="">{t('planWholeYear')}</option>
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid min-w-0 content-start gap-2">
          <Label htmlFor="tp-plan-level">{t('level')}</Label>
          <SelectField
            id="tp-plan-level"
            className={TOUCH_SELECT}
            value={levelCode}
            onChange={(e) => setLevelCode(e.target.value)}
          >
            <option value="">{t('planAllLevels')}</option>
            {levelList.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
      {longText('tp-plan-goals', t('planGoals'), t('planGoalsHint'), goals, setGoals)}
      {longText('tp-plan-steps', t('planSteps'), t('planStepsHint'), steps, setSteps)}
      {longText(
        'tp-plan-assessment',
        t('planAssessment'),
        t('planAssessmentHint'),
        assessmentPlan,
        setAssessmentPlan,
      )}
      <ObjectivePicker
        subjectId={subjectId}
        value={objectiveIds}
        onChange={setObjectiveIds}
        linked={plan?.objectives ?? []}
        feedback={false}
        variant="plan"
      />
      <div className="grid gap-2">
        <Label htmlFor="tp-plan-link">{t('planLink')}</Label>
        <Input
          id="tp-plan-link"
          type="url"
          inputMode="url"
          maxLength={500}
          value={linkUrl}
          placeholder="https://"
          onChange={(e) => setLinkUrl(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">{t('planLinkHint')}</p>
      </div>
    </FormDialog>
  );
}
