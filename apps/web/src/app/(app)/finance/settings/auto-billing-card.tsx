'use client';

import type { AutoBillingKind } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Pencil, Play, Plus, Power, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { FieldError, TOUCH_INPUT, useFormValidation } from '@/components/form-field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyPanel, type Tone, ToneBadge } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { withoutBlur } from '@/lib/area-rules';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { KIND_KEY, SEMESTER_KEY } from '../shared';
import { ListSkeleton, RowMenu, SectionCard } from '../ui';
import {
  dueNextMonth,
  EMPTY_RULE_FORM,
  RULE_ORDER,
  type RuleField,
  type RuleForm,
  toRuleDraft,
  validateRuleForm,
} from './auto-billing-validation';

interface FeeLite {
  id: string;
  name: string;
  kind: AutoBillingKind;
  active: boolean;
}

const BLOCKED_MESSAGES = {
  school_suspended: 'abBlockedSchoolSuspended',
  module_disabled: 'abBlockedModuleDisabled',
  fee_inactive: 'abBlockedFeeInactive',
  no_year: 'abBlockedNoYear',
  outside_year: 'abBlockedOutsideYear',
  no_semester: 'abBlockedNoSemester',
  run_on_outside_year: 'abBlockedRunOnOutsideYear',
  invalid_rule: 'abBlockedInvalid',
} as const;
const BLOCKED_KEY: Record<string, (typeof BLOCKED_MESSAGES)[keyof typeof BLOCKED_MESSAGES]> =
  BLOCKED_MESSAGES;

const STATUS_TONE: Record<string, Tone> = {
  ok: 'emerald',
  partial: 'amber',
  failed: 'rose',
  skipped: 'slate',
};
const STATUS_KEY = {
  ok: 'abStatusOk',
  partial: 'abStatusPartial',
  failed: 'abStatusFailed',
  skipped: 'abStatusSkipped',
} as const;

type Rule = NonNullable<ReturnType<typeof useRulesData>['data']>['items'][number];

function useRulesData() {
  const { school } = useSchool();
  return useQuery({
    queryKey: ['finance', school.schoolId, 'auto-billing', 'rules'],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/finance/auto-billing/rules', {
          params: { header: schoolHeader(school.schoolId) },
        }),
      ),
  });
}

const LOG_STEP = 10;

/** Tagihan otomatis: aturan per jenis biaya, pratinjau jadwal, jalankan sekarang, dan riwayat run. */
export function AutoBillingCard({
  feeTypes,
  classes,
}: {
  feeTypes: FeeLite[];
  classes: { id: string; name: string }[];
}) {
  const t = useTranslations('finance');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };

  const [form, setForm] = useState<RuleForm>(EMPTY_RULE_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Rule | null>(null);
  const [running, setRunning] = useState<Rule | null>(null);
  const [logLimit, setLogLimit] = useState(LOG_STEP);

  const rules = useRulesData();
  const ruleList = rules.data?.items ?? [];
  const log = useQuery({
    queryKey: ['finance', school.schoolId, 'auto-billing', 'runs', logLimit],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/finance/auto-billing/runs', { params: { ...header, query: { limit: logLimit } } }),
      ),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['finance', school.schoolId, 'auto-billing'] });

  const errors = validateRuleForm(form);
  const validation = useFormValidation<RuleField>({ errors, order: RULE_ORDER, idPrefix: 'ab' });
  const valid = Object.keys(errors).length === 0;

  const bodyOf = (f: RuleForm) => {
    const d = toRuleDraft(f);
    if (!d) return null;
    return {
      runDay: d.runDay,
      dueMode: d.dueMode,
      dueDay: d.dueDay,
      dueDays: d.dueDays,
      classIds: f.classIds.length > 0 ? f.classIds : null,
      semesterRun: d.semesterRun,
      semesterOffsetDays: d.semesterOffsetDays,
      runOn: d.runOn,
      installments: d.installments,
    };
  };

  // Pratinjau hidup: tertunda 400 ms setelah isian berhenti berubah, hanya bila isian sah.
  const previewBody = open && valid ? bodyOf(form) : null;
  const previewKey = previewBody ? JSON.stringify({ feeTypeId: form.feeTypeId, previewBody }) : '';
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(previewKey), 400);
    return () => clearTimeout(id);
  }, [previewKey]);
  const preview = useQuery({
    queryKey: ['finance', school.schoolId, 'auto-billing', 'preview', debounced],
    enabled: debounced !== '',
    queryFn: async () => {
      const parsed = JSON.parse(debounced) as {
        feeTypeId: string;
        previewBody: NonNullable<ReturnType<typeof bodyOf>>;
      };
      return unwrap(
        await api.POST('/v1/finance/auto-billing/preview', {
          params: header,
          body: { feeTypeId: parsed.feeTypeId, ruleDraft: parsed.previewBody },
        }),
      );
    },
  });

  const save = useMutation({
    mutationFn: async (f: RuleForm) => {
      const body = bodyOf(f);
      if (!body) throw new Error('invalid');
      return unwrap(
        await api.PUT('/v1/finance/auto-billing/rules', {
          params: header,
          body: { feeTypeId: f.feeTypeId, enabled: f.enabled, ...body },
        }),
      );
    },
    onSuccess: () => {
      toast.success(tm('saved'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const toggle = useMutation({
    mutationFn: async (r: Rule) =>
      unwrap(
        await api.PUT('/v1/finance/auto-billing/rules', {
          params: header,
          body: {
            feeTypeId: r.feeTypeId,
            enabled: !r.enabled,
            runDay: r.runDay,
            dueMode: r.dueMode,
            dueDay: r.dueDay,
            dueDays: r.dueDays,
            classIds: r.classIds,
            semesterRun: r.semesterRun,
            semesterOffsetDays: r.semesterOffsetDays,
            runOn: r.runOn,
            installments: r.installments,
          },
        }),
      ),
    onSuccess: refresh,
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.DELETE('/v1/finance/auto-billing/rules/{id}', { params: { ...header, path: { id } } }),
      ),
    onSuccess: () => {
      toast.success(tm('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const runNow = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.POST('/v1/finance/auto-billing/rules/{id}/run-now', {
          params: { ...header, path: { id } },
          body: {},
        }),
      ),
    onSuccess: (r) => {
      toast.success(t('abRunNowDone', { created: r.createdCount, skipped: r.skippedCount }));
      refresh();
      queryClient.invalidateQueries({ queryKey: ['finance', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const periodText = (period: string) => {
    if (/^\d{4}-\d{2}$/.test(period)) {
      return new Intl.DateTimeFormat(locale === 'su' ? 'id' : locale, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${period}-01T00:00:00Z`));
    }
    if (period === 'S1' || period === 'S2') return t(SEMESTER_KEY[period]);
    return period;
  };

  const scheduleText = (r: Rule) => {
    let when: string;
    if (r.feeKind === 'monthly') when = t('abSumMonthly', { day: r.runDay ?? 0 });
    else if (r.feeKind === 'semester') {
      const off = r.semesterRun === 'custom' ? (r.semesterOffsetDays ?? 0) : 0;
      when =
        off === 0
          ? t('abSumSemesterStart')
          : off > 0
            ? t('abSumSemesterAfter', { days: off })
            : t('abSumSemesterBefore', { days: -off });
    } else when = t('abSumOn', { date: r.runOn ? formatCalendarDate(locale, r.runOn) : '-' });
    const due =
      r.dueMode === 'days_after'
        ? t('abDueAfter', { days: r.dueDays ?? 0 })
        : r.feeKind === 'monthly' && r.runDay !== null && (r.dueDay ?? 0) < r.runDay
          ? t('abDueFixedNext', { day: r.dueDay ?? 0 })
          : t('abDueFixed', { day: r.dueDay ?? 0 });
    return `${when} · ${due}${r.installments ? ` · ${t('abSumInstallments', { count: r.installments })}` : ''}`;
  };

  const openForm = (next: RuleForm, id: string | null) => {
    setError(null);
    setForm(next);
    setEditingId(id);
    setOpen(true);
  };
  const newForm = (fee: FeeLite | null): RuleForm => ({
    ...EMPTY_RULE_FORM,
    feeTypeId: fee?.id ?? '',
    kind: fee?.kind ?? null,
  });
  const editForm = (r: Rule): RuleForm => ({
    feeTypeId: r.feeTypeId,
    kind: r.feeKind,
    enabled: r.enabled,
    runDay: r.runDay?.toString() ?? EMPTY_RULE_FORM.runDay,
    dueMode: r.dueMode,
    dueDay: r.dueDay?.toString() ?? EMPTY_RULE_FORM.dueDay,
    dueDays: r.dueDays?.toString() ?? EMPTY_RULE_FORM.dueDays,
    semesterRun: r.semesterRun ?? 'start',
    semesterOffsetDays: r.semesterOffsetDays?.toString() ?? '0',
    runOn: r.runOn ?? '',
    installments: r.installments?.toString() ?? '',
    classIds: r.classIds ?? [],
  });

  const ruleOf = (feeId: string) => ruleList.find((r) => r.feeTypeId === feeId);
  const rows = feeTypes.filter((f) => f.active || ruleOf(f.id));
  const freeFees = feeTypes.filter((f) => f.active && !ruleOf(f.id));
  const feeChoices = editingId ? feeTypes.filter((f) => f.id === form.feeTypeId) : freeFees;
  const kindLabel = (k: AutoBillingKind) => t(KIND_KEY[k]);

  const statusBadge = (r: Rule | undefined) => {
    if (!r) return <ToneBadge tone="slate">{t('abNotSet')}</ToneBadge>;
    if (r.blockedReason) {
      return <ToneBadge tone="amber">{t(BLOCKED_KEY[r.blockedReason] ?? 'abBlockedInvalid')}</ToneBadge>;
    }
    return r.enabled ? (
      <ToneBadge tone="emerald">{t('abOn')}</ToneBadge>
    ) : (
      <ToneBadge tone="slate">{t('abOff')}</ToneBadge>
    );
  };

  const nextText = (r: Rule | undefined) => {
    if (!r?.nextRunDate) return '-';
    const first = r.nextRuns[0];
    const base = formatCalendarDate(locale, r.nextRunDate);
    return first?.catchUp ? `${base} · ${t('abCatchUp')}` : base;
  };

  const lastText = (r: Rule | undefined) => {
    const l = r?.lastRun;
    if (!l) return <span className="text-muted-foreground">{t('abNever')}</span>;
    return (
      <span className="grid gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <ToneBadge tone={STATUS_TONE[l.status] ?? 'slate'}>{t(STATUS_KEY[l.status])}</ToneBadge>
          <span className="text-xs">{periodText(l.period)}</span>
        </span>
        <span className="text-muted-foreground text-xs">
          {t('abResultCounts', {
            created: l.createdCount,
            skipped: l.skippedCount,
            missing: l.missingPlanCount,
          })}
        </span>
      </span>
    );
  };

  const menu = (f: FeeLite, r: Rule | undefined) => (
    <RowMenu
      label={t('rowActions')}
      items={
        r
          ? [
              { key: 'edit', label: tm('edit'), icon: Pencil, onClick: () => openForm(editForm(r), r.id) },
              {
                key: 'run',
                label: t('abRunNow'),
                icon: Play,
                disabled: !r.feeActive,
                onClick: () => setRunning(r),
              },
              {
                key: 'toggle',
                label: r.enabled ? t('abToggleOff') : t('abToggleOn'),
                icon: Power,
                onClick: () => toggle.mutate(r),
              },
              {
                key: 'delete',
                label: tm('delete'),
                icon: Trash2,
                destructive: true,
                onClick: () => setDeleting(r),
              },
            ]
          : [{ key: 'set', label: t('abSetUp'), icon: Plus, onClick: () => openForm(newForm(f), null) }]
      }
    />
  );

  const monthly = form.kind === 'monthly';
  const semester = form.kind === 'semester';
  const once = form.kind === 'one_time' || form.kind === 'yearly';
  const field = (name: RuleField) => validation.fieldProps(name);

  const fields = (
    <div className="grid gap-4">
      <div className="grid content-start gap-2">
        <Label htmlFor={validation.idOf('feeTypeId')}>{t('abFeeType')}</Label>
        <SelectField
          {...withoutBlur(field('feeTypeId'))}
          disabled={editingId !== null}
          value={form.feeTypeId}
          placeholder={t('chooseFeeType')}
          onChange={(e) => {
            const fee = feeTypes.find((x) => x.id === e.target.value);
            setForm({ ...form, feeTypeId: e.target.value, kind: fee?.kind ?? null });
            validation.touch('feeTypeId');
          }}
        >
          {feeChoices.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} · {kindLabel(f.kind)}
            </option>
          ))}
        </SelectField>
        <FieldError id={validation.idOf('feeTypeId')} issue={validation.issue('feeTypeId')} />
        {!editingId && <p className="text-muted-foreground text-xs">{t('abFeeTypeHint')}</p>}
      </div>

      {form.kind && (
        <>
          {monthly && (
            <div className="grid content-start gap-2">
              <Label htmlFor={validation.idOf('runDay')}>{t('abRunDay')}</Label>
              <Input
                {...field('runDay')}
                className={TOUCH_INPUT}
                inputMode="numeric"
                autoComplete="off"
                aria-required="true"
                value={form.runDay}
                onChange={(e) => setForm({ ...form, runDay: e.target.value })}
              />
              <FieldError id={validation.idOf('runDay')} issue={validation.issue('runDay')} />
              <p className="text-muted-foreground text-xs">{t('abRunDayHint')}</p>
            </div>
          )}

          {semester && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor={validation.idOf('semesterRun')}>{t('abSemesterRun')}</Label>
                <SelectField
                  {...withoutBlur(field('semesterRun'))}
                  value={form.semesterRun}
                  onChange={(e) =>
                    setForm({ ...form, semesterRun: e.target.value as RuleForm['semesterRun'] })
                  }
                >
                  <option value="start">{t('abSemesterStart')}</option>
                  <option value="custom">{t('abSemesterCustom')}</option>
                </SelectField>
                <FieldError id={validation.idOf('semesterRun')} issue={validation.issue('semesterRun')} />
              </div>
              {form.semesterRun === 'custom' && (
                <div className="grid content-start gap-2">
                  <Label htmlFor={validation.idOf('semesterOffsetDays')}>{t('abOffsetDays')}</Label>
                  <Input
                    {...field('semesterOffsetDays')}
                    className={TOUCH_INPUT}
                    inputMode="numeric"
                    autoComplete="off"
                    value={form.semesterOffsetDays}
                    onChange={(e) => setForm({ ...form, semesterOffsetDays: e.target.value })}
                  />
                  <FieldError
                    id={validation.idOf('semesterOffsetDays')}
                    issue={validation.issue('semesterOffsetDays')}
                  />
                  <p className="text-muted-foreground text-xs">{t('abOffsetHint')}</p>
                </div>
              )}
            </div>
          )}

          {once && (
            <div className="grid content-start gap-2">
              <Label htmlFor={validation.idOf('runOn')}>{t('abRunOn')}</Label>
              <DatePicker
                {...withoutBlur(field('runOn'))}
                className={TOUCH_INPUT}
                value={form.runOn}
                onChange={(v) => {
                  setForm({ ...form, runOn: v });
                  validation.touch('runOn');
                }}
              />
              <FieldError id={validation.idOf('runOn')} issue={validation.issue('runOn')} />
              <p className="text-muted-foreground text-xs">{t('abRunOnHint')}</p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="ab-dueMode">{t('abDueMode')}</Label>
              <SelectField
                id="ab-dueMode"
                value={form.dueMode}
                onChange={(e) => setForm({ ...form, dueMode: e.target.value as RuleForm['dueMode'] })}
              >
                <option value="fixed_day">{t('abDueFixedDay')}</option>
                <option value="days_after">{t('abDueDaysAfter')}</option>
              </SelectField>
            </div>
            {form.dueMode === 'fixed_day' ? (
              <div className="grid content-start gap-2">
                <Label htmlFor={validation.idOf('dueDay')}>{t('abDueDay')}</Label>
                <Input
                  {...field('dueDay')}
                  className={TOUCH_INPUT}
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.dueDay}
                  onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
                />
                <FieldError id={validation.idOf('dueDay')} issue={validation.issue('dueDay')} />
                <p className="text-muted-foreground text-xs">
                  {dueNextMonth(form) ? t('abDueNextMonth') : t('abDueDayHint')}
                </p>
              </div>
            ) : (
              <div className="grid content-start gap-2">
                <Label htmlFor={validation.idOf('dueDays')}>{t('abDueDays')}</Label>
                <Input
                  {...field('dueDays')}
                  className={TOUCH_INPUT}
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.dueDays}
                  onChange={(e) => setForm({ ...form, dueDays: e.target.value })}
                />
                <FieldError id={validation.idOf('dueDays')} issue={validation.issue('dueDays')} />
              </div>
            )}
          </div>

          {!monthly && (
            <div className="grid content-start gap-2">
              <Label htmlFor={validation.idOf('installments')}>{t('abInstallments')}</Label>
              <Input
                {...field('installments')}
                className={TOUCH_INPUT}
                inputMode="numeric"
                autoComplete="off"
                value={form.installments}
                onChange={(e) => setForm({ ...form, installments: e.target.value })}
              />
              <FieldError id={validation.idOf('installments')} issue={validation.issue('installments')} />
              <p className="text-muted-foreground text-xs">{t('abInstallmentsHint')}</p>
            </div>
          )}

          <div className="grid content-start gap-2">
            <Label>{t('abClasses')}</Label>
            {classes.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('feeScopeNoClasses')}</p>
            ) : (
              <ul className="grid max-h-40 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
                {classes.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id={`ab-cls-${c.id}`}
                      checked={form.classIds.includes(c.id)}
                      onCheckedChange={(v) =>
                        setForm({
                          ...form,
                          classIds:
                            v === true ? [...form.classIds, c.id] : form.classIds.filter((x) => x !== c.id),
                        })
                      }
                    />
                    <Label htmlFor={`ab-cls-${c.id}`} className="font-normal">
                      {c.name}
                    </Label>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-muted-foreground text-xs">
              {form.classIds.length > 0
                ? t('abClassesPicked', { count: form.classIds.length })
                : t('abClassesHint')}
            </p>
          </div>

          <div className="grid content-start gap-2">
            <Label htmlFor="ab-enabled">{t('abEnabled')}</Label>
            <SelectField
              id="ab-enabled"
              value={form.enabled ? 'on' : 'off'}
              onChange={(e) => setForm({ ...form, enabled: e.target.value === 'on' })}
            >
              <option value="on">{t('abOn')}</option>
              <option value="off">{t('abOff')}</option>
            </SelectField>
          </div>

          <div className="bg-muted/40 grid gap-1.5 rounded-xl border p-3 text-sm" aria-live="polite">
            <p className="font-medium">{t('abPreviewTitle')}</p>
            {!valid && <p className="text-muted-foreground text-xs">{t('abPreviewIncomplete')}</p>}
            {valid && preview.isPending && debounced !== '' && (
              <p className="text-muted-foreground text-xs">{t('abPreviewLoading')}</p>
            )}
            {valid && preview.isError && (
              <p className="text-destructive text-xs">{te(errorKey(preview.error))}</p>
            )}
            {valid && preview.data && (
              <>
                {preview.data.nextRuns.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {preview.data.error === 'no_year'
                      ? t('abBlockedNoYear')
                      : preview.data.error === 'no_semester'
                        ? t('abBlockedNoSemester')
                        : t('abPreviewNone')}
                  </p>
                ) : (
                  <ol className="grid gap-1 text-xs">
                    {preview.data.nextRuns.map((r) => (
                      <li key={r.period}>
                        <span className="font-medium">{periodText(r.period)}</span>
                        {': '}
                        {t('abPreviewRunLine', {
                          run: formatCalendarDate(locale, r.runDate),
                          due: formatCalendarDate(locale, r.dueDate),
                        })}
                        {r.catchUp ? ` ${t('abPreviewCatchUp')}` : ''}
                      </li>
                    ))}
                  </ol>
                )}
                {preview.data.wouldCreate !== null && preview.data.forPeriod && (
                  <p className="text-xs">
                    {t('abPreviewCounts', {
                      period: periodText(preview.data.forPeriod),
                      create: preview.data.wouldCreate,
                      billed: preview.data.alreadyBilled ?? 0,
                      missing: preview.data.missingPlan ?? 0,
                    })}
                  </p>
                )}
                {preview.data.error &&
                  preview.data.error !== 'no_year' &&
                  preview.data.error !== 'no_semester' &&
                  preview.data.nextRuns.length > 0 && (
                    <p className="text-muted-foreground text-xs">{t('abPreviewNoCounts')}</p>
                  )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <SectionCard
      icon={CalendarClock}
      tone="sky"
      title={t('abTitle')}
      description={t('abHint')}
      actions={
        <Button
          disabled={freeFees.length === 0}
          onClick={() => openForm(newForm(freeFees.length === 1 ? (freeFees[0] ?? null) : null), null)}
        >
          <Plus className="size-4" /> {t('abAdd')}
        </Button>
      }
    >
      {rules.isPending && <ListSkeleton rows={3} />}
      {rules.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(rules.error))}</AlertDescription>
        </Alert>
      )}
      {rules.data && rows.length === 0 && (
        <EmptyPanel icon={CalendarClock} tone="sky" title={t('abEmptyTitle')} body={t('abEmptyBody')} />
      )}
      {rows.length > 0 && rules.data && (
        <>
          <div className="hidden overflow-hidden rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('abColFee')}</TableHead>
                  <TableHead>{t('abColSchedule')}</TableHead>
                  <TableHead>{t('abColStatus')}</TableHead>
                  <TableHead>{t('abColNext')}</TableHead>
                  <TableHead>{t('abColLast')}</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">{t('rowActions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((f) => {
                  const r = ruleOf(f.id);
                  return (
                    <TableRow key={f.id}>
                      <TableCell>
                        <p className="font-medium">{f.name}</p>
                        <p className="text-muted-foreground text-xs">{kindLabel(f.kind)}</p>
                      </TableCell>
                      <TableCell className="text-sm">{r ? scheduleText(r) : '-'}</TableCell>
                      <TableCell>{statusBadge(r)}</TableCell>
                      <TableCell className="text-sm">{nextText(r)}</TableCell>
                      <TableCell>{lastText(r)}</TableCell>
                      <TableCell className="text-right">{menu(f, r)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <ul className="grid content-start gap-2 md:hidden">
            {rows.map((f) => {
              const r = ruleOf(f.id);
              return (
                <li key={f.id} className="bg-background grid gap-2 rounded-xl border p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{f.name}</p>
                      <p className="text-muted-foreground text-xs">{kindLabel(f.kind)}</p>
                    </div>
                    {statusBadge(r)}
                    {menu(f, r)}
                  </div>
                  {r && (
                    <div className="grid gap-1 text-sm">
                      <p>{scheduleText(r)}</p>
                      <p className="text-muted-foreground text-xs">
                        {t('abColNext')}: {nextText(r)}
                      </p>
                      <div>{lastText(r)}</div>
                      {r.blockedText && r.blockedReason && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          {t(BLOCKED_KEY[r.blockedReason] ?? 'abBlockedInvalid')}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="grid gap-2">
        <h3 className="font-heading text-sm font-semibold">{t('abLogTitle')}</h3>
        <p className="text-muted-foreground text-xs">{t('abLogHint')}</p>
        {log.isPending && <ListSkeleton rows={2} />}
        {log.isError && (
          <Alert variant="destructive">
            <AlertDescription>{te(errorKey(log.error))}</AlertDescription>
          </Alert>
        )}
        {log.data && log.data.items.length === 0 && (
          <p className="text-muted-foreground text-sm">{t('abLogEmpty')}</p>
        )}
        {log.data && log.data.items.length > 0 && (
          <>
            <div className="hidden overflow-hidden rounded-xl border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('abColWhen')}</TableHead>
                    <TableHead>{t('abColFee')}</TableHead>
                    <TableHead>{t('abColPeriod')}</TableHead>
                    <TableHead>{t('abColResult')}</TableHead>
                    <TableHead>{t('abColStatus')}</TableHead>
                    <TableHead>{t('abColTrigger')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {log.data.items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(r.finishedAt ?? r.startedAt).toLocaleString(
                          locale === 'su' ? 'id' : locale,
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{r.feeTypeName ?? '-'}</TableCell>
                      <TableCell className="text-sm">{periodText(r.period)}</TableCell>
                      <TableCell className="text-sm">
                        {t('abResultCounts', {
                          created: r.createdCount,
                          skipped: r.skippedCount,
                          missing: r.missingPlanCount,
                        })}
                        {r.error && <p className="text-muted-foreground text-xs">{r.error}</p>}
                      </TableCell>
                      <TableCell>
                        <ToneBadge tone={STATUS_TONE[r.status] ?? 'slate'}>
                          {t(STATUS_KEY[r.status])}
                        </ToneBadge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.trigger === 'auto' ? t('abTriggerAuto') : t('abTriggerManual')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="grid content-start gap-2 md:hidden">
              {log.data.items.map((r) => (
                <li key={r.id} className="bg-background grid gap-1 rounded-xl border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-medium">
                      {r.feeTypeName ?? '-'} · {periodText(r.period)}
                    </p>
                    <ToneBadge tone={STATUS_TONE[r.status] ?? 'slate'}>{t(STATUS_KEY[r.status])}</ToneBadge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {new Date(r.finishedAt ?? r.startedAt).toLocaleString(locale === 'su' ? 'id' : locale)} ·{' '}
                    {r.trigger === 'auto' ? t('abTriggerAuto') : t('abTriggerManual')}
                  </p>
                  <p className="text-xs">
                    {t('abResultCounts', {
                      created: r.createdCount,
                      skipped: r.skippedCount,
                      missing: r.missingPlanCount,
                    })}
                  </p>
                  {r.error && <p className="text-muted-foreground text-xs">{r.error}</p>}
                </li>
              ))}
            </ul>
            {log.data.total > log.data.items.length && (
              <Button
                variant="outline"
                className="justify-self-start"
                onClick={() => setLogLimit(logLimit + LOG_STEP)}
              >
                {t('abLogMore')}
              </Button>
            )}
          </>
        )}
      </div>

      <FormDialog
        open={open}
        title={editingId ? t('abEdit') : t('abAdd')}
        submitLabel={tm('save')}
        size="wide"
        error={error}
        validation={validation}
        disabled={!form.kind}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setForm(EMPTY_RULE_FORM);
            setEditingId(null);
            setError(null);
          }
        }}
        onSubmit={() => save.mutateAsync(form)}
      >
        {fields}
      </FormDialog>

      <ConfirmDialog
        open={!!running}
        title={`${t('abRunNow')} · ${running?.feeTypeName ?? ''}`}
        description={t('abRunNowBody', { fee: running?.feeTypeName ?? '' })}
        confirmLabel={t('abRunNow')}
        pending={runNow.isPending}
        onOpenChange={(o) => !o && setRunning(null)}
        onConfirm={() => (running ? runNow.mutateAsync(running.id) : Promise.resolve())}
      />

      <ConfirmDialog
        open={!!deleting}
        destructive
        title={`${tm('delete')} · ${deleting?.feeTypeName ?? ''}`}
        description={t('abDeleteBody')}
        confirmLabel={tm('delete')}
        pending={remove.isPending}
        onOpenChange={(o) => !o && setDeleting(null)}
        onConfirm={() => (deleting ? remove.mutateAsync(deleting.id) : Promise.resolve())}
      />
    </SectionCard>
  );
}
