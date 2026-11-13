'use client';

import type { CalculationMode } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Pencil, Plus, SlidersHorizontal, Target, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { FieldError, TOUCH_INPUT, useFormValidation } from '@/components/form-field-error';
import { PageBody, PageHeader } from '@/components/page-header';
import { RowMenu } from '@/components/row-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, IconTile, MODULE_TONE, TONES, ToneBadge } from '@/components/ui-kit';
import { ApiError, api, schoolHeader, unwrap } from '@/lib/api';
import {
  type Category,
  categoryOf,
  componentBadgeKind,
  componentBody,
  componentFormFrom,
  weightInputDisabled,
} from '@/lib/assessment-category';
import {
  CALC_EXAMPLE,
  CALC_MODE_KEYS,
  calcExampleResult,
  modeChange,
  modeOrDefault,
  percentageSaveBlocked,
  weightsSumFromMessage,
  weightsTotal,
} from '@/lib/calc-mode';
import { errorKey } from '@/lib/errors';
import { invalidateGradingConfig, syncedSemesterIdOf } from '@/lib/grading-config';
import { cn } from '@/lib/utils';
import { COMPONENT_TONES, predicateTone } from '../grade-ui';
import {
  COMPONENT_ORDER,
  type ComponentField,
  THRESHOLD_ORDER,
  type ThresholdField,
  validateComponent,
  validateThresholds,
} from '../grade-validation';
import { SemesterConfigCard } from './semester-config-card';

const KEYS = ['kkm', 'predicateA', 'predicateB', 'predicateC'] as const;
type Key = (typeof KEYS)[number];

const num = (s: string) => (s.trim() === '' ? Number.NaN : Number(s.trim().replace(',', '.')));

/**
 * Toast sukses simpan. Bila server juga menulis-tembus perubahan ke aturan beku semester aktif (`syncedSemesterId`),
 * pengguna diberi tahu supaya paham angka semester aktif ikut berubah.
 */
function toastSaved(message: string, syncedNote: string, body: unknown) {
  if (syncedSemesterIdOf(body)) toast.success(message, { description: syncedNote });
  else toast.success(message);
}

/** Kartu KKM dan batas predikat: A > B > C, semuanya 0..100. */
function ThresholdsCard() {
  const t = useTranslations('grades');
  const tv = useTranslations('formValidation');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [values, setValues] = useState<Record<Key, string>>({
    kkm: '',
    predicateA: '',
    predicateB: '',
    predicateC: '',
  });
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<CalculationMode>('weighted_average');
  const [saveError, setSaveError] = useState<string | null>(null);

  const key = ['grading-settings', school.schoolId];
  const settings = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/grading/settings', { params: header })),
  });
  useEffect(() => {
    if (!settings.data) return;
    setValues({
      kkm: String(settings.data.kkm),
      predicateA: String(settings.data.predicateA),
      predicateB: String(settings.data.predicateB),
      predicateC: String(settings.data.predicateC),
    });
    setMode(modeOrDefault(settings.data.calculationMode));
    setDirty(false);
  }, [settings.data]);

  // Komponen nilai dimuat dengan kunci yang sama dengan kartu Komponen, jadi satu permintaan dipakai bersama.
  const components = useQuery({
    queryKey: ['grading-components', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/grading/components', { params: header })),
  });
  const weightsLoaded = components.data !== undefined;
  const total = weightsTotal(components.data ?? []);
  const percentageBlocked =
    weightsLoaded && percentageSaveBlocked(settings.data?.calculationMode, mode, total);

  const n = {
    kkm: num(values.kkm),
    a: num(values.predicateA),
    b: num(values.predicateB),
    c: num(values.predicateC),
  };
  const errors = validateThresholds(values);
  const valid = Object.keys(errors).length === 0;
  const validation = useFormValidation<ThresholdField>({
    errors,
    order: THRESHOLD_ORDER,
    idPrefix: 'grade',
  });

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/grading/settings', {
          params: header,
          body: {
            kkm: n.kkm,
            predicateA: n.a,
            predicateB: n.b,
            predicateC: n.c,
            ...modeChange(settings.data?.calculationMode, mode),
          },
        }),
      ),
    onSuccess: (saved) => {
      toastSaved(t('settingsSaved'), t('syncedToActive'), saved);
      setSaveError(null);
      setDirty(false);
      validation.reset();
      invalidateGradingConfig(queryClient, school.schoolId);
    },
    onError: (e) => {
      // Rapor final mengunci pengaturan: jelaskan penyebab dan jalan keluarnya, bukan hanya galat umum.
      if (e instanceof ApiError && e.code === 'report_final') setSaveError(t('calcModeReportFinal'));
      else if (e instanceof ApiError && e.code === 'weights_sum_invalid') {
        // Server mengembalikan jumlah bobot saat ini di pesannya; bila tak terbaca, pakai jumlah dari komponen yang dimuat.
        setSaveError(t('weightsSumInvalid', { total: weightsSumFromMessage(e.message) ?? total }));
        queryClient.invalidateQueries({ queryKey: ['grading-components', school.schoolId] });
      } else setSaveError(te(errorKey(e)));
    },
  });

  if (settings.isPending) return <Skeleton className="h-40 w-full" />;
  if (!settings.data)
    return (
      <Alert variant="destructive">
        <AlertDescription>{te(errorKey(settings.error))}</AlertDescription>
      </Alert>
    );

  // Pratinjau rentang predikat dari isian saat ini (hanya bila isian sah dan berurutan).
  const bands = valid
    ? ([
        { p: 'A', range: `≥ ${n.a}` },
        { p: 'B', range: `${n.b} – ${n.a}` },
        { p: 'C', range: `${n.c} – ${n.b}` },
        { p: 'D', range: `< ${n.c}` },
      ] as const)
    : null;

  return (
    <Card className="gap-4 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (validation.attempt()) save.mutate();
        }}
      >
        <div className="flex items-start gap-3">
          <IconTile icon={Target} tone={MODULE_TONE.academic} />
          <div>
            <h2 className="font-heading text-lg font-semibold">{t('thresholdsTitle')}</h2>
            <p className="text-muted-foreground text-sm">{t('thresholdsHint')}</p>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          {t('kktpNote')}{' '}
          <Link href="/curriculum?tab=kktp" className="text-foreground underline underline-offset-2">
            {t('kktpLink')}
          </Link>
        </p>
        {settings.data.activeSemesterConfig && (
          <p className="text-muted-foreground text-sm">{t('writeThroughNote')}</p>
        )}
        {bands && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {bands.map((b) => (
              <div key={b.p} className={cn('rounded-xl px-3 py-2', TONES[predicateTone(b.p)].soft)}>
                <p className="font-heading text-lg leading-none font-semibold">{b.p}</p>
                <p className="mt-1 text-xs tabular-nums opacity-80">{b.range}</p>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {KEYS.map((k) => (
            <div key={k} className="grid content-start gap-2">
              <Label htmlFor={`grade-${k}`}>{t(`field_${k}`)}</Label>
              <Input
                {...validation.fieldProps(k)}
                className={TOUCH_INPUT}
                aria-required="true"
                inputMode="numeric"
                autoComplete="off"
                value={values[k]}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [k]: e.target.value }));
                  setDirty(true);
                }}
              />
              <FieldError id={validation.idOf(k)} issue={validation.issue(k)} />
            </div>
          ))}
        </div>
        <fieldset className="grid gap-3">
          <legend className="font-heading text-base font-semibold">{t('calculationModeLabel')}</legend>
          <p className="text-muted-foreground text-sm">
            {t('calcModeHelp', {
              task: CALC_EXAMPLE.taskScore,
              taskWeight: CALC_EXAMPLE.taskWeight,
              mid: CALC_EXAMPLE.midScore,
              midWeight: CALC_EXAMPLE.midWeight,
              finalWeight: CALC_EXAMPLE.finalWeight,
            })}
          </p>
          <div className="grid gap-2 lg:grid-cols-3">
            {CALC_MODE_KEYS.map((m) => (
              <label
                key={m}
                htmlFor={`calc-mode-${m}`}
                className={cn(
                  'has-[:focus-visible]:ring-ring/50 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-[3px]',
                  mode === m ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                )}
              >
                <input
                  id={`calc-mode-${m}`}
                  type="radio"
                  name="calc-mode"
                  className="accent-primary mt-1 size-4 shrink-0"
                  checked={mode === m}
                  onChange={() => {
                    setMode(m);
                    setDirty(true);
                  }}
                />
                <span className="grid gap-1">
                  <span className="text-sm font-medium">{t(`calcMode.${m}.title`)}</span>
                  <span className="text-muted-foreground text-xs">{t(`calcMode.${m}.desc`)}</span>
                  <span className="text-xs font-medium tabular-nums">
                    {t(`calcMode.${m}.example`, {
                      task: CALC_EXAMPLE.taskScore,
                      taskWeight: CALC_EXAMPLE.taskWeight,
                      mid: CALC_EXAMPLE.midScore,
                      midWeight: CALC_EXAMPLE.midWeight,
                      finalWeight: CALC_EXAMPLE.finalWeight,
                      result: calcExampleResult(m) ?? '-',
                    })}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {mode === 'percentage' && weightsLoaded && (
            <div
              role={total === 100 ? undefined : 'alert'}
              className={cn(
                'grid gap-1 rounded-xl border p-3 text-sm',
                total === 100 ? TONES.emerald.soft : TONES.rose.soft,
              )}
            >
              <p className="font-medium tabular-nums">{t('percentageWeightsTotal', { total })}</p>
              {total === 100 ? (
                <p>{t('percentageWeightsOk')}</p>
              ) : (
                <p>
                  {t('percentageWeightsWarn')}{' '}
                  <a href="#grade-components" className="font-medium underline underline-offset-2">
                    {t('percentageWeightsLink')}
                  </a>
                </p>
              )}
            </div>
          )}
          {mode !== modeOrDefault(settings.data.calculationMode) && (
            <Alert>
              <AlertDescription>{t('calcModeWarning')}</AlertDescription>
            </Alert>
          )}
        </fieldset>
        {saveError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            className="h-10 md:h-8"
            disabled={!dirty || save.isPending || percentageBlocked}
          >
            {t('save')}
          </Button>
          {validation.summary && (
            <p aria-live="polite" className="text-destructive text-sm">
              {tv('summary')}
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}

interface Form {
  name: string;
  weight: string;
  sort: string;
  category: Category;
}

const CATEGORIES: readonly Category[] = ['summative', 'formative'];

/** Kartu komponen nilai (tugas, UH, UTS, UAS, dst.) beserta bobotnya; total bobot idealnya 100. */
function ComponentsCard() {
  const t = useTranslations('grades');
  const tc = useTranslations('common');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ name: '', weight: '', sort: '', category: 'summative' });
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  const key = ['grading-components', school.schoolId];
  const list = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/grading/components', { params: header })),
  });
  const items = list.data ?? [];
  const total = weightsTotal(items);
  const modeQuery = useQuery({
    queryKey: ['grading-settings', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/grading/settings', { params: header })),
  });
  const mode = modeOrDefault(modeQuery.data?.calculationMode);

  const refresh = () => invalidateGradingConfig(queryClient, school.schoolId);

  const weight = num(form.weight);
  const sort = form.sort.trim() === '' ? 0 : num(form.sort);
  const componentV = useFormValidation<ComponentField>({
    errors: validateComponent(form),
    order: COMPONENT_ORDER,
    idPrefix: 'component',
  });

  const submit = useMutation({
    mutationFn: async () => {
      const body = componentBody({ name: form.name, category: form.category, weight, sort });
      if (editing) {
        return unwrap(
          await api.PUT('/v1/grading/components/{id}', {
            params: { ...header, path: { id: editing } },
            body,
          }),
        );
      }
      return unwrap(await api.POST('/v1/grading/components', { params: header, body }));
    },
    onSuccess: (saved) => {
      toastSaved(editing ? t('componentUpdated') : t('componentCreated'), t('syncedToActive'), saved);
      refresh();
    },
    onError: (e) =>
      // Rapor final mengunci kategori sama seperti bobot: jelaskan jalan keluarnya.
      setFormError(
        e instanceof ApiError && e.code === 'report_final' && editing
          ? t('categoryReportFinal')
          : te(errorKey(e)),
      ),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/grading/components/{id}', { params: { ...header, path: { id } } })),
    onSuccess: (removed) => {
      toastSaved(t('componentDeleted'), t('syncedToActive'), removed);
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const defaults = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/grading/components/defaults', { params: header })),
    onSuccess: () => {
      toast.success(t('defaultsApplied'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  function openDialog(id: string, init: Form) {
    setForm(init);
    setFormError(null);
    componentV.reset();
    setEditing(id);
  }

  return (
    <Card
      id="grade-components"
      className="scroll-mt-20 gap-4 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <IconTile icon={Layers} tone="amber" />
          <div>
            <h2 className="font-heading text-lg font-semibold">{t('componentsTitle')}</h2>
            <p className="text-muted-foreground text-sm">{t(`componentsHint_${mode}`)}</p>
          </div>
        </div>
        <Button
          onClick={() =>
            openDialog('', {
              name: '',
              weight: '',
              sort: String(items.length > 0 ? items.length + 1 : 1),
              category: 'summative',
            })
          }
        >
          <Plus className="size-4" /> {t('addComponent')}
        </Button>
      </div>

      {list.isPending && <Skeleton className="h-32 w-full rounded-xl" />}
      {list.data && items.length === 0 && (
        <EmptyPanel
          icon={Layers}
          tone="amber"
          title={t('noComponentsTitle')}
          body={t('noComponents')}
          action={
            <Button variant="outline" disabled={defaults.isPending} onClick={() => defaults.mutate()}>
              {t('applyDefaults')}
            </Button>
          }
        />
      )}
      {items.length > 0 && (
        <>
          <div className="grid content-start gap-2">
            <div
              role="img"
              aria-label={`${t('totalWeight')}: ${total}%`}
              className="bg-muted flex h-3 overflow-hidden rounded-full"
            >
              {items.map((c, i) => (
                <div
                  key={c.id}
                  title={`${c.name} ${c.weight}%`}
                  className={cn(
                    'h-full border-r border-background last:border-0',
                    TONES[COMPONENT_TONES[i % COMPONENT_TONES.length] ?? 'sky'].bar,
                  )}
                  style={{ width: `${Math.min(100, c.weight)}%` }}
                />
              ))}
            </div>
            <p
              className={cn(
                'text-xs font-medium tabular-nums',
                total === 100 ? TONES.emerald.text : TONES.rose.text,
              )}
            >
              {t('totalWeightCounted')}: {total}%
            </p>
            {items.some((c) => categoryOf(c) === 'formative') && (
              <p className="text-muted-foreground text-xs">{t('totalWeightNote')}</p>
            )}
          </div>
          <ul className="divide-y rounded-xl border">
            {items.map((c, i) => (
              <li key={c.id} className="flex items-center gap-3 px-3.5 py-3">
                <span
                  aria-hidden
                  className={cn(
                    'size-3 shrink-0 rounded-full',
                    TONES[COMPONENT_TONES[i % COMPONENT_TONES.length] ?? 'sky'].bar,
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {t('sort')} {c.sort}
                  </p>
                  {componentBadgeKind(c) === 'formative' && (
                    <p className="text-muted-foreground mt-0.5 text-xs">{t('formativeNotInFinal')}</p>
                  )}
                </div>
                {componentBadgeKind(c) === 'summative' ? (
                  <ToneBadge
                    tone={COMPONENT_TONES[i % COMPONENT_TONES.length]}
                    dot={false}
                    className="tabular-nums"
                  >
                    {c.weight}%
                  </ToneBadge>
                ) : (
                  <ToneBadge tone="slate" dot={false}>
                    {componentBadgeKind(c) === 'formative'
                      ? t('categoryFormativeShort')
                      : t('excludedFromFinal')}
                  </ToneBadge>
                )}
                <RowMenu
                  label={`${t('rowActions')}: ${c.name}`}
                  items={[
                    {
                      key: 'edit',
                      label: t('edit'),
                      icon: Pencil,
                      onSelect: () =>
                        openDialog(c.id, {
                          name: c.name,
                          sort: String(c.sort),
                          ...componentFormFrom(c),
                        }),
                    },
                    {
                      key: 'delete',
                      label: t('delete'),
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => setDeleting({ id: c.id, name: c.name }),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(o) => {
              if (!o) setDeleting(null);
            }}
            title={t('delete')}
            description={deleting ? t('confirmDeleteComponent', { name: deleting.name }) : undefined}
            confirmLabel={tc('confirmDelete')}
            destructive
            pending={remove.isPending}
            onConfirm={() => (deleting ? remove.mutateAsync(deleting.id) : Promise.resolve())}
          />
          {total !== 100 && mode === 'percentage' && (
            <Alert variant="destructive">
              <AlertDescription>{t('weightWarningPercentage', { total })}</AlertDescription>
            </Alert>
          )}
          {total !== 100 && mode === 'weighted_average' && (
            <Alert variant="destructive">
              <AlertDescription>{t('weightWarning', { total })}</AlertDescription>
            </Alert>
          )}
        </>
      )}

      <FormDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        title={editing ? t('editComponent') : t('addComponent')}
        submitLabel={t('save')}
        error={formError}
        validation={componentV}
        onSubmit={() => submit.mutateAsync()}
      >
        <div className="grid content-start gap-2">
          <Label htmlFor={componentV.idOf('name')}>{t('componentName')}</Label>
          <Input
            {...componentV.fieldProps('name')}
            className={TOUCH_INPUT}
            aria-required="true"
            autoComplete="off"
            maxLength={60}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <FieldError id={componentV.idOf('name')} issue={componentV.issue('name')} />
        </div>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">{t('categoryLabel')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CATEGORIES.map((cat) => (
              <label
                key={cat}
                htmlFor={`component-category-${cat}`}
                className={cn(
                  'has-[:focus-visible]:ring-ring/50 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-[3px]',
                  form.category === cat ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                )}
              >
                <input
                  id={`component-category-${cat}`}
                  type="radio"
                  name="component-category"
                  className="accent-primary mt-1 size-4 shrink-0"
                  checked={form.category === cat}
                  onChange={() => setForm((f) => ({ ...f, category: cat }))}
                />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{t(`category_${cat}`)}</span>
                  <span className="text-muted-foreground text-xs">{t(`categoryDesc_${cat}`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor={componentV.idOf('weight')}>{t('weightPercent')}</Label>
            <Input
              {...componentV.fieldProps('weight')}
              className={TOUCH_INPUT}
              aria-required={!weightInputDisabled(form.category)}
              inputMode="numeric"
              autoComplete="off"
              disabled={weightInputDisabled(form.category)}
              value={weightInputDisabled(form.category) ? '0' : form.weight}
              onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
            />
            <FieldError id={componentV.idOf('weight')} issue={componentV.issue('weight')} />
            {weightInputDisabled(form.category) && (
              <p className="text-muted-foreground text-xs">{t('formativeNoWeight')}</p>
            )}
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor={componentV.idOf('sort')}>{t('sort')}</Label>
            <Input
              {...componentV.fieldProps('sort')}
              className={TOUCH_INPUT}
              inputMode="numeric"
              autoComplete="off"
              value={form.sort}
              onChange={(e) => setForm((f) => ({ ...f, sort: e.target.value }))}
            />
            <FieldError id={componentV.idOf('sort')} issue={componentV.issue('sort')} />
          </div>
        </div>
      </FormDialog>
    </Card>
  );
}

/** Pengaturan penilaian: KKM, batas predikat, dan komponen nilai berbobot. */
export function GradeSettingsView() {
  const t = useTranslations('grades');
  return (
    <PageBody>
      <PageHeader
        icon={SlidersHorizontal}
        tone={MODULE_TONE.academic}
        title={t('settingsTitle')}
        description={t('settingsSubtitle')}
        actions={<BackLink href="/grades" />}
      />
      <SemesterConfigCard />
      <ThresholdsCard />
      <ComponentsCard />
    </PageBody>
  );
}
