'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, Pencil, Plus, Settings2, Tags, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyPanel, MODULE_TONE, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatRupiah } from '@/lib/money';
import { useSchoolLevels } from '@/lib/school-settings';
import { digitsOnly, KIND_KEY, KINDS, type Kind, useFinanceYear, YearSelect } from '../shared';
import { ListSkeleton, Money, RowMenu, SectionCard } from '../ui';
import { DiscountsCard } from './discounts-card';
import { LateFeeCard } from './late-fee-card';
import { PaymentMethodsCard } from './payment-methods-card';

interface FeeDraft {
  id: string | null;
  name: string;
  kind: Kind;
  active: boolean;
}
const EMPTY_FEE: FeeDraft = { id: null, name: '', kind: 'monthly', active: true };

interface PlanDraft {
  feeTypeId: string;
  level: string;
  amount: string;
  /** Mengubah tarif yang sudah ada: jenis biaya dan tingkat dikunci (kuncinya menentukan barisnya). */
  editing: boolean;
}
const EMPTY_PLAN: PlanDraft = { feeTypeId: '', level: '', amount: '', editing: false };

/** Pengaturan keuangan: jenis biaya, dan tarif per tahun ajaran, jenis biaya, dan tingkat. */
export function FinanceSettingsView() {
  const t = useTranslations('finance');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('finance:manage');
  const { years, yearId, setYear } = useFinanceYear();

  const [fee, setFee] = useState<FeeDraft>(EMPTY_FEE);
  const [plan, setPlan] = useState<PlanDraft>(EMPTY_PLAN);
  const [error, setError] = useState<string | null>(null);
  const [deletingFee, setDeletingFee] = useState<{ id: string; name: string } | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<{ id: string; name: string } | null>(null);

  const feeTypes = useQuery({
    queryKey: ['finance', school.schoolId, 'fee-types'],
    enabled: manage,
    queryFn: async () => unwrap(await api.GET('/v1/finance/fee-types', { params: header })),
  });
  const plans = useQuery({
    queryKey: ['finance', school.schoolId, 'fee-plans', yearId],
    enabled: manage && !!yearId,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/finance/fee-plans', { params: { ...header, query: { academicYearId: yearId } } }),
      ),
  });
  const classes = useQuery({
    queryKey: ['classes', school.schoolId, yearId],
    enabled: can('class:read') && !!yearId,
    queryFn: async () =>
      unwrap(await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: yearId } } })),
  });

  const feeList = feeTypes.data ?? [];
  const planList = plans.data ?? [];
  const feeName = (id: string) => feeList.find((f) => f.id === id)?.name ?? '-';
  // Tingkat dari daftar tingkat sekolah (Pengaturan sekolah) bila sudah diatur; selain itu dari kelas pada tahun
  // ajaran terpilih. Tingkat yang sudah punya tarif selalu ikut.
  const schoolLevels = useSchoolLevels().data ?? [];
  const levels =
    schoolLevels.length > 0
      ? [
          ...new Set([
            ...schoolLevels.map((l) => l.code),
            ...planList.flatMap((p) => (p.level ? [p.level] : [])),
          ]),
        ]
      : [
          ...new Set([
            ...(classes.data ?? []).map((c) => c.level),
            ...planList.flatMap((p) => (p.level ? [p.level] : [])),
          ]),
        ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['finance', school.schoolId] });

  const saveFee = useMutation({
    mutationFn: async (v: FeeDraft) => {
      const body = { name: v.name.trim(), kind: v.kind, active: v.active };
      if (v.id) {
        return unwrap(
          await api.PUT('/v1/finance/fee-types/{id}', { params: { ...header, path: { id: v.id } }, body }),
        );
      }
      return unwrap(await api.POST('/v1/finance/fee-types', { params: header, body }));
    },
    onSuccess: (_d, v) => {
      toast.success(v.id ? tm('saved') : tm('created'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const removeFee = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/finance/fee-types/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(tm('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const savePlan = useMutation({
    mutationFn: async (v: PlanDraft) =>
      unwrap(
        await api.PUT('/v1/finance/fee-plans', {
          params: header,
          body: {
            academicYearId: yearId,
            feeTypeId: v.feeTypeId,
            level: v.level || null,
            amount: Number(v.amount),
          },
        }),
      ),
    onSuccess: (_d, v) => {
      toast.success(v.editing ? tm('saved') : tm('created'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const removePlan = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/finance/fee-plans/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(tm('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const feeFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="fee-name">{tm('name')}</Label>
        <Input
          id="fee-name"
          required
          maxLength={100}
          value={fee.name}
          onChange={(e) => setFee({ ...fee, name: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="fee-kind">{t('kind')}</Label>
        <SelectField
          id="fee-kind"
          value={fee.kind}
          onChange={(e) => setFee({ ...fee, kind: e.target.value as Kind })}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t(KIND_KEY[k])}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="flex items-end gap-2 pb-2">
        <Checkbox
          id="fee-active"
          checked={fee.active}
          onCheckedChange={(v) => setFee({ ...fee, active: v === true })}
        />
        <Label htmlFor="fee-active">{t('active')}</Label>
      </div>
    </div>
  );

  const planFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor="plan-fee">{t('feeType')}</Label>
        <SelectField
          id="plan-fee"
          disabled={plan.editing}
          value={plan.feeTypeId}
          placeholder={t('chooseFeeType')}
          onChange={(e) => setPlan({ ...plan, feeTypeId: e.target.value })}
        >
          {feeList.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="plan-level">{t('level')}</Label>
        <SelectField
          id="plan-level"
          disabled={plan.editing}
          value={plan.level}
          onChange={(e) => setPlan({ ...plan, level: e.target.value })}
        >
          <option value="">{t('allLevels')}</option>
          {levels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="plan-amount">{t('amountRupiah')}</Label>
        <Input
          id="plan-amount"
          required
          inputMode="numeric"
          value={plan.amount}
          onChange={(e) => setPlan({ ...plan, amount: digitsOnly(e.target.value) })}
        />
        {plan.amount && <p className="text-muted-foreground text-xs">{formatRupiah(Number(plan.amount))}</p>}
      </div>
    </div>
  );

  type PlanRow = NonNullable<typeof plans.data>[number];
  const planMenu = (p: PlanRow) => (
    <RowMenu
      label={t('rowActions')}
      items={[
        {
          key: 'edit',
          label: tm('edit'),
          icon: Pencil,
          onClick: () => {
            setError(null);
            setPlan({
              feeTypeId: p.feeTypeId,
              level: p.level ?? '',
              amount: String(p.amount),
              editing: true,
            });
          },
        },
        {
          key: 'delete',
          label: tm('delete'),
          icon: Trash2,
          destructive: true,
          onClick: () =>
            setDeletingPlan({
              id: p.id,
              name: `${feeName(p.feeTypeId)} · ${p.level ?? t('allLevels')}`,
            }),
        },
      ]}
    />
  );

  return (
    <PageBody>
      <PageHeader
        icon={Settings2}
        tone={MODULE_TONE.finance}
        title={t('settingsTitle')}
        description={t('settingsSubtitle')}
      />

      {!manage && (
        <Alert variant="destructive">
          <AlertDescription>{te('errors.forbidden')}</AlertDescription>
        </Alert>
      )}

      {manage && (
        <>
          <SectionCard
            icon={Tags}
            tone="amber"
            title={t('feeTypes')}
            description={t('feeTypesHint')}
            actions={
              <FormDialog
                trigger={
                  <Button>
                    <Plus className="size-4" /> {t('addFeeType')}
                  </Button>
                }
                title={t('addFeeType')}
                submitLabel={tm('add')}
                error={error}
                onOpenChange={() => {
                  setFee(EMPTY_FEE);
                  setError(null);
                }}
                onSubmit={() => saveFee.mutateAsync(fee)}
              >
                {feeFields}
              </FormDialog>
            }
          >
            {feeTypes.isPending && <ListSkeleton rows={3} />}
            {feeTypes.isError && (
              <Alert variant="destructive">
                <AlertDescription>{te(errorKey(feeTypes.error))}</AlertDescription>
              </Alert>
            )}
            {feeTypes.data?.length === 0 && (
              <EmptyPanel icon={Tags} tone="amber" title={t('noFeeTypes')} body={t('noFeeTypesHint')} />
            )}
            {feeList.length > 0 && (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {feeList.map((f) => (
                  <li
                    key={f.id}
                    className={`bg-background flex items-start gap-3 rounded-xl border p-3 ${f.active ? '' : 'opacity-70'}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{f.name}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <ToneBadge tone="sky" dot={false}>
                          {t(KIND_KEY[f.kind])}
                        </ToneBadge>
                        <ToneBadge tone={f.active ? 'emerald' : 'slate'}>
                          {f.active ? t('active') : t('inactive')}
                        </ToneBadge>
                      </div>
                    </div>
                    <RowMenu
                      label={t('rowActions')}
                      items={[
                        {
                          key: 'edit',
                          label: tm('edit'),
                          icon: Pencil,
                          onClick: () => {
                            setError(null);
                            setFee({ id: f.id, name: f.name, kind: f.kind, active: f.active });
                          },
                        },
                        {
                          key: 'delete',
                          label: tm('delete'),
                          icon: Trash2,
                          destructive: true,
                          onClick: () => setDeletingFee({ id: f.id, name: f.name }),
                        },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            icon={Coins}
            tone="emerald"
            title={t('plans')}
            description={t('plansHint')}
            actions={
              <>
                <YearSelect className="sm:w-44" years={years} yearId={yearId} onChange={setYear} />
                <FormDialog
                  trigger={
                    <Button disabled={feeList.length === 0 || !yearId}>
                      <Plus className="size-4" /> {t('addPlan')}
                    </Button>
                  }
                  title={t('addPlan')}
                  submitLabel={tm('add')}
                  error={error}
                  disabled={!plan.feeTypeId || !plan.amount}
                  onOpenChange={() => {
                    setPlan(EMPTY_PLAN);
                    setError(null);
                  }}
                  onSubmit={() => savePlan.mutateAsync(plan)}
                >
                  {planFields}
                </FormDialog>
              </>
            }
          >
            {plans.isPending && <ListSkeleton rows={3} />}
            {plans.isError && (
              <Alert variant="destructive">
                <AlertDescription>{te(errorKey(plans.error))}</AlertDescription>
              </Alert>
            )}
            {plans.data?.length === 0 && (
              <EmptyPanel icon={Coins} tone="emerald" title={t('noPlans')} body={t('noPlansHint')} />
            )}
            {planList.length > 0 && (
              <>
                <div className="hidden overflow-hidden rounded-xl border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('feeType')}</TableHead>
                        <TableHead>{t('level')}</TableHead>
                        <TableHead className="text-right">{t('amount')}</TableHead>
                        <TableHead className="w-10">
                          <span className="sr-only">{t('rowActions')}</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {planList.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{feeName(p.feeTypeId)}</TableCell>
                          <TableCell>
                            <ToneBadge tone={p.level ? 'violet' : 'slate'} dot={false}>
                              {p.level ?? t('allLevels')}
                            </ToneBadge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            <Money value={p.amount} />
                          </TableCell>
                          <TableCell className="text-right">{planMenu(p)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ul className="grid gap-2 md:hidden">
                  {planList.map((p) => (
                    <li key={p.id} className="bg-background flex items-center gap-3 rounded-xl border p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{feeName(p.feeTypeId)}</p>
                        <ToneBadge tone={p.level ? 'violet' : 'slate'} dot={false} className="mt-1">
                          {p.level ?? t('allLevels')}
                        </ToneBadge>
                      </div>
                      <Money value={p.amount} className="font-semibold" />
                      {planMenu(p)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </SectionCard>

          <DiscountsCard
            feeTypes={feeList.map((f) => ({ id: f.id, name: f.name }))}
            classes={(classes.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
          />

          <LateFeeCard feeTypes={feeList.map((f) => ({ id: f.id, name: f.name, active: f.active }))} />

          <PaymentMethodsCard />
        </>
      )}

      <FormDialog
        open={!!fee.id}
        title={t('editFeeType')}
        submitLabel={tm('save')}
        error={error}
        onOpenChange={(o) => !o && setFee(EMPTY_FEE)}
        onSubmit={() => saveFee.mutateAsync(fee)}
      >
        {feeFields}
      </FormDialog>

      <FormDialog
        open={plan.editing}
        title={t('editPlan')}
        submitLabel={tm('save')}
        error={error}
        disabled={!plan.amount}
        onOpenChange={(o) => !o && setPlan(EMPTY_PLAN)}
        onSubmit={() => savePlan.mutateAsync(plan)}
      >
        {planFields}
      </FormDialog>

      <ConfirmDialog
        open={!!deletingFee}
        destructive
        title={`${tm('delete')} · ${deletingFee?.name ?? ''}`}
        confirmLabel={tm('delete')}
        pending={removeFee.isPending}
        onOpenChange={(o) => !o && setDeletingFee(null)}
        onConfirm={() => (deletingFee ? removeFee.mutateAsync(deletingFee.id) : Promise.resolve())}
      />

      <ConfirmDialog
        open={!!deletingPlan}
        destructive
        title={`${tm('delete')} · ${deletingPlan?.name ?? ''}`}
        confirmLabel={tm('delete')}
        pending={removePlan.isPending}
        onOpenChange={(o) => !o && setDeletingPlan(null)}
        onConfirm={() => (deletingPlan ? removePlan.mutateAsync(deletingPlan.id) : Promise.resolve())}
      />
    </PageBody>
  );
}
