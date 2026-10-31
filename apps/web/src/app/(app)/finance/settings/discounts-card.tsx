'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent, GraduationCap, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatRupiah } from '@/lib/money';
import { digitsOnly, useFinanceYear, YearSelect } from '../shared';
import { ListSkeleton, RowMenu, SectionCard } from '../ui';

type RuleKind = 'percent' | 'amount';

interface RuleDraft {
  id: string | null;
  name: string;
  kind: RuleKind;
  value: string;
  feeTypeId: string;
  active: boolean;
}
const EMPTY_RULE: RuleDraft = { id: null, name: '', kind: 'percent', value: '', feeTypeId: '', active: true };

/** Chip besar potongan: persen berwarna jingga, nominal berwarna hijau. */
export function RuleChip({ kind, value }: { kind: RuleKind; value: number }) {
  const percent = kind === 'percent';
  return (
    <span
      className={
        percent
          ? 'inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap text-orange-800 dark:bg-orange-500/15 dark:text-orange-300'
          : 'inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
      }
    >
      <BadgePercent className="size-3.5" aria-hidden="true" />
      {percent ? `${value}%` : formatRupiah(value)}
    </span>
  );
}

interface Picked {
  id: string;
  name: string;
  detail: string;
}

/** Keringanan dan beasiswa: aturan potongan, dan pemasangannya ke kelas atau siswa tertentu. */
export function DiscountsCard({
  feeTypes,
  classes,
}: {
  feeTypes: { id: string; name: string }[];
  classes: { id: string; name: string }[];
}) {
  const t = useTranslations('finance');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const { years, yearId, setYear } = useFinanceYear();

  const [rule, setRule] = useState<RuleDraft>(EMPTY_RULE);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  // Pemasangan.
  const [ruleId, setRuleId] = useState('');
  const [scope, setScope] = useState<'class' | 'students'>('class');
  const [classId, setClassId] = useState('');
  const [picked, setPicked] = useState<Picked[]>([]);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [reason, setReason] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [result, setResult] = useState<{ assigned: number; skipped: number } | null>(null);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const rules = useQuery({
    queryKey: ['finance', school.schoolId, 'discount-rules'],
    queryFn: async () => unwrap(await api.GET('/v1/finance/discount-rules', { params: header })),
  });
  const search = useQuery({
    queryKey: ['finance', school.schoolId, 'student-search', debounced],
    enabled: scope === 'students' && debounced.length >= 2,
    queryFn: async () =>
      unwrap(await api.GET('/v1/students', { params: { ...header, query: { q: debounced, limit: 8 } } })),
  });

  const ruleList = rules.data ?? [];
  const activeRules = ruleList.filter((r) => r.active);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['finance', school.schoolId] });

  const saveRule = useMutation({
    mutationFn: async (v: RuleDraft) => {
      const body = {
        name: v.name.trim(),
        kind: v.kind,
        value: Number(v.value),
        feeTypeId: v.feeTypeId || null,
        active: v.active,
      };
      if (v.id) {
        return unwrap(
          await api.PUT('/v1/finance/discount-rules/{id}', {
            params: { ...header, path: { id: v.id } },
            body,
          }),
        );
      }
      return unwrap(await api.POST('/v1/finance/discount-rules', { params: header, body }));
    },
    onSuccess: (_d, v) => {
      toast.success(v.id ? tm('saved') : tm('created'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const removeRule = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/finance/discount-rules/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(tm('deleted'));
      refresh();
    },
    onError: (e) => {
      toast.error(te(errorKey(e)));
    },
  });

  const assign = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/finance/discounts/assign', {
          params: header,
          body: {
            ruleId,
            academicYearId: yearId,
            ...(scope === 'class' ? { classId } : { studentIds: picked.map((p) => p.id) }),
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          },
        }),
      ),
    onSuccess: (r) => {
      setAssignError(null);
      setResult(r);
      refresh();
    },
    onError: (e) => setAssignError(te(errorKey(e))),
  });

  const unassign = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/finance/discounts/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('discountRemoved'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const canAssign =
    !!ruleId && !!yearId && (scope === 'class' ? !!classId : picked.length > 0) && !assign.isPending;

  const ruleFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="rule-name">{t('ruleName')}</Label>
        <Input
          id="rule-name"
          required
          maxLength={100}
          value={rule.name}
          onChange={(e) => setRule({ ...rule, name: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="rule-kind">{t('ruleKind')}</Label>
        <SelectField
          id="rule-kind"
          value={rule.kind}
          onChange={(e) => setRule({ ...rule, kind: e.target.value as RuleKind, value: '' })}
        >
          <option value="percent">{t('ruleKindPercent')}</option>
          <option value="amount">{t('ruleKindAmount')}</option>
        </SelectField>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="rule-value">
          {rule.kind === 'percent' ? t('ruleValuePercent') : t('ruleValueAmount')}
        </Label>
        <div className="relative">
          <Input
            id="rule-value"
            required
            inputMode="numeric"
            className={rule.kind === 'percent' ? 'pr-9' : 'pl-10'}
            value={rule.value}
            onChange={(e) => {
              const v = digitsOnly(e.target.value);
              setRule({ ...rule, value: rule.kind === 'percent' && Number(v) > 100 ? '100' : v });
            }}
          />
          <span
            className={`text-muted-foreground pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm ${
              rule.kind === 'percent' ? 'right-3' : 'left-3'
            }`}
          >
            {rule.kind === 'percent' ? t('unitPercent') : t('unitRupiah')}
          </span>
        </div>
        {rule.kind === 'amount' && rule.value && (
          <p className="text-muted-foreground text-xs">{formatRupiah(Number(rule.value))}</p>
        )}
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="rule-fee">{t('appliesTo')}</Label>
        <SelectField
          id="rule-fee"
          value={rule.feeTypeId}
          onChange={(e) => setRule({ ...rule, feeTypeId: e.target.value })}
        >
          <option value="">{t('allFeeTypesRule')}</option>
          {feeTypes.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Checkbox
          id="rule-active"
          checked={rule.active}
          onCheckedChange={(v) => setRule({ ...rule, active: v === true })}
        />
        <Label htmlFor="rule-active">{t('active')}</Label>
      </div>
    </div>
  );

  const ruleInvalid = !rule.name.trim() || !rule.value || Number(rule.value) < 1;

  return (
    <>
      <SectionCard
        icon={GraduationCap}
        tone="violet"
        title={t('discountRules')}
        description={t('discountRulesHint')}
        actions={
          <FormDialog
            trigger={
              <Button>
                <Plus className="size-4" /> {t('addDiscountRule')}
              </Button>
            }
            title={t('addDiscountRule')}
            submitLabel={tm('add')}
            error={error}
            disabled={ruleInvalid}
            onOpenChange={() => {
              setRule(EMPTY_RULE);
              setError(null);
            }}
            onSubmit={() => saveRule.mutateAsync(rule)}
          >
            {ruleFields}
          </FormDialog>
        }
      >
        {rules.isPending && <ListSkeleton rows={2} />}
        {rules.isError && (
          <Alert variant="destructive">
            <AlertDescription>{te(errorKey(rules.error))}</AlertDescription>
          </Alert>
        )}
        {rules.data?.length === 0 && (
          <EmptyPanel
            icon={BadgePercent}
            tone="violet"
            title={t('noDiscountRulesTitle')}
            body={t('noDiscountRules')}
          />
        )}
        {ruleList.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ruleList.map((r) => (
              <li
                key={r.id}
                className={`bg-background grid gap-3 rounded-xl border p-3 ${r.active ? '' : 'opacity-70'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <RuleChip kind={r.kind} value={r.value} />
                  <RowMenu
                    label={t('rowActions')}
                    items={[
                      {
                        key: 'edit',
                        label: tm('edit'),
                        icon: Pencil,
                        onClick: () => {
                          setError(null);
                          setRule({
                            id: r.id,
                            name: r.name,
                            kind: r.kind,
                            value: String(r.value),
                            feeTypeId: r.feeTypeId ?? '',
                            active: r.active,
                          });
                        },
                      },
                      {
                        key: 'delete',
                        label: tm('delete'),
                        icon: Trash2,
                        destructive: true,
                        onClick: () => setDeleting({ id: r.id, name: r.name }),
                      },
                    ]}
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {r.feeTypeName ?? t('allFeeTypesRule')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ToneBadge tone={r.active ? 'emerald' : 'slate'}>
                    {r.active ? t('active') : t('inactive')}
                  </ToneBadge>
                  <ToneBadge tone="sky" dot={false}>
                    <Users className="size-3" aria-hidden="true" />
                    {t('assignedCount', { count: r.assignedCount })}
                  </ToneBadge>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Pasang ke siswa */}
        <div className="grid gap-4 border-t pt-4">
          <div>
            <h3 className="font-heading flex items-center gap-2 text-base font-semibold">
              <Users className="size-4 text-orange-600 dark:text-orange-300" aria-hidden="true" />
              {t('assignTitle')}
            </h3>
            <p className="text-muted-foreground text-sm">{t('assignHint')}</p>
          </div>

          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canAssign) assign.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="as-rule">{t('rule')}</Label>
                <SelectField
                  id="as-rule"
                  value={ruleId}
                  placeholder={t('chooseRule')}
                  onChange={(e) => setRuleId(e.target.value)}
                >
                  {activeRules.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.kind === 'percent' ? `${r.value}%` : formatRupiah(r.value)})
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="as-year">{t('academicYear')}</Label>
                <YearSelect years={years} yearId={yearId} onChange={setYear} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="as-scope">{t('scope')}</Label>
                <SelectField
                  id="as-scope"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as 'class' | 'students')}
                >
                  <option value="class">{t('scopeClass')}</option>
                  <option value="students">{t('scopeStudents')}</option>
                </SelectField>
              </div>
            </div>

            {scope === 'class' ? (
              <div className="grid gap-2 sm:max-w-xs">
                <Label htmlFor="as-class">{t('class')}</Label>
                <SelectField
                  id="as-class"
                  value={classId}
                  placeholder={t('chooseClass')}
                  onChange={(e) => setClassId(e.target.value)}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectField>
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="relative w-full sm:max-w-md">
                  <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                  <Input
                    aria-label={t('searchStudent')}
                    className="pl-8"
                    autoComplete="off"
                    value={q}
                    placeholder={t('searchPlaceholder')}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
                {search.data && search.data.items.length === 0 && (
                  <p className="text-muted-foreground text-sm">{t('noStudentFound')}</p>
                )}
                {search.data && search.data.items.length > 0 && (
                  <ul className="divide-y rounded-lg border sm:max-w-md">
                    {search.data.items.map((s) => {
                      const on = picked.some((p) => p.id === s.id);
                      return (
                        <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <Checkbox
                            id={`as-st-${s.id}`}
                            checked={on}
                            onCheckedChange={(v) =>
                              setPicked((cur) =>
                                v === true
                                  ? cur.some((p) => p.id === s.id)
                                    ? cur
                                    : [
                                        ...cur,
                                        {
                                          id: s.id,
                                          name: s.name,
                                          detail: [s.nis, s.className].filter(Boolean).join(' · '),
                                        },
                                      ]
                                  : cur.filter((p) => p.id !== s.id),
                              )
                            }
                          />
                          <Label htmlFor={`as-st-${s.id}`} className="flex flex-1 flex-col items-start gap-0">
                            <span className="font-medium">{s.name}</span>
                            <span className="text-muted-foreground text-xs font-normal">
                              {[s.nis, s.className].filter(Boolean).join(' · ')}
                            </span>
                          </Label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="grid gap-2">
                  <p className="text-sm font-medium">{t('pickedStudents', { count: picked.length })}</p>
                  {picked.length === 0 ? (
                    <p className="text-muted-foreground text-xs">{t('noPickedStudents')}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {picked.map((p) => (
                        <Badge key={p.id} variant="secondary" className="h-7 gap-1.5 pr-1 pl-2.5 text-sm">
                          {p.name}
                          <button
                            type="button"
                            aria-label={`${tm('delete')} ${p.name}`}
                            className="hover:bg-muted rounded-full p-0.5"
                            onClick={() => setPicked((cur) => cur.filter((x) => x.id !== p.id))}
                          >
                            <X className="size-3.5" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="as-reason">{t('assignReason')}</Label>
              <Input
                id="as-reason"
                maxLength={200}
                value={reason}
                placeholder={t('assignReasonHint')}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            {assignError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{assignError}</AlertDescription>
              </Alert>
            )}
            <div>
              <Button type="submit" disabled={!canAssign}>
                {t('assignButton')}
              </Button>
            </div>
          </form>

          {scope === 'students' && picked.length > 0 && (
            <div className="grid gap-3">
              {picked.map((p) => (
                <StudentDiscounts
                  key={p.id}
                  student={p}
                  yearId={yearId}
                  onRemove={(id) => setRemoving({ id, name: p.name })}
                />
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <FormDialog
        open={!!rule.id}
        title={t('editDiscountRule')}
        submitLabel={tm('save')}
        error={error}
        disabled={ruleInvalid}
        onOpenChange={(o) => !o && setRule(EMPTY_RULE)}
        onSubmit={() => saveRule.mutateAsync(rule)}
      >
        {ruleFields}
      </FormDialog>

      <ConfirmDialog
        open={!!deleting}
        destructive
        title={`${tm('delete')} · ${deleting?.name ?? ''}`}
        description={t('ruleInUseHint')}
        confirmLabel={tm('delete')}
        pending={removeRule.isPending}
        onOpenChange={(o) => !o && setDeleting(null)}
        onConfirm={() => (deleting ? removeRule.mutateAsync(deleting.id) : Promise.resolve())}
      />

      <ConfirmDialog
        open={!!removing}
        destructive
        title={`${t('removeDiscount')} · ${removing?.name ?? ''}`}
        confirmLabel={t('removeDiscount')}
        pending={unassign.isPending}
        onOpenChange={(o) => !o && setRemoving(null)}
        onConfirm={() => (removing ? unassign.mutateAsync(removing.id) : Promise.resolve())}
      />

      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">{t('assignResultTitle')}</DialogTitle>
          </DialogHeader>
          {result && (
            <ul className="grid gap-1 text-sm">
              <li className="font-medium text-emerald-700 dark:text-emerald-300">
                {t('assignResultAssigned', { count: result.assigned })}
              </li>
              <li className="text-muted-foreground">{t('assignResultSkipped', { count: result.skipped })}</li>
            </ul>
          )}
          <DialogFooter>
            <Button onClick={() => setResult(null)}>{t('close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Keringanan yang terpasang pada satu siswa di tahun ajaran terpilih, dengan tombol lepas. */
function StudentDiscounts({
  student,
  yearId,
  onRemove,
}: {
  student: Picked;
  yearId: string;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations('finance');
  const te = useTranslations();
  const { school } = useSchool();
  const list = useQuery({
    queryKey: ['finance', school.schoolId, 'student-discounts', student.id, yearId],
    enabled: !!yearId,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/finance/students/{studentId}/discounts', {
          params: {
            header: schoolHeader(school.schoolId),
            path: { studentId: student.id },
            query: { academicYearId: yearId },
          },
        }),
      ),
  });

  return (
    <div className="rounded-xl border p-3">
      <p className="text-sm font-medium">{t('appliedDiscountsFor', { name: student.name })}</p>
      {list.isPending && <Skeleton className="mt-2 h-8 w-full" />}
      {list.isError && <p className="text-destructive mt-2 text-sm">{te(errorKey(list.error))}</p>}
      {list.data?.length === 0 && (
        <p className="text-muted-foreground mt-1 text-sm">{t('noAppliedDiscounts')}</p>
      )}
      {list.data && list.data.length > 0 && (
        <ul className="mt-2 grid gap-2">
          {list.data.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <RuleChip kind={d.rule.kind} value={d.rule.value} />
                <span className="font-medium">{d.rule.name}</span>
                {d.reason && <span className="text-muted-foreground text-xs">{d.reason}</span>}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`${t('removeDiscount')} ${d.rule.name}`}
                title={t('removeDiscount')}
                onClick={() => onRemove(d.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
