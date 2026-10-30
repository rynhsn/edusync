'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatRupiah } from '@/lib/money';
import { digitsOnly, KIND_KEY, KINDS, type Kind, useFinanceYear, YearSelect } from '../shared';
import { DiscountsCard } from './discounts-card';

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
  // Tingkat diambil dari kelas pada tahun ajaran terpilih, ditambah tingkat yang sudah punya tarif.
  const levels = [
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

  return (
    <PageBody>
      <PageHeader title={t('settingsTitle')} description={t('settingsSubtitle')} />

      {!manage && (
        <Alert variant="destructive">
          <AlertDescription>{te('errors.forbidden')}</AlertDescription>
        </Alert>
      )}

      {manage && (
        <>
          <Card className="gap-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg font-semibold">{t('feeTypes')}</h2>
                <p className="text-muted-foreground text-sm">{t('feeTypesHint')}</p>
              </div>
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
            </div>

            {feeTypes.isPending && <Skeleton className="h-24 w-full" />}
            {feeTypes.isError && (
              <Alert variant="destructive">
                <AlertDescription>{te(errorKey(feeTypes.error))}</AlertDescription>
              </Alert>
            )}
            {feeTypes.data?.length === 0 && (
              <p className="text-muted-foreground text-sm">{t('noFeeTypes')}</p>
            )}
            {feeList.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tm('name')}</TableHead>
                      <TableHead>{t('kind')}</TableHead>
                      <TableHead>{t('status')}</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feeList.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.name}</TableCell>
                        <TableCell>{t(KIND_KEY[f.kind])}</TableCell>
                        <TableCell>
                          <Badge variant={f.active ? 'secondary' : 'outline'}>
                            {f.active ? t('active') : t('inactive')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={tm('edit')}
                            onClick={() => {
                              setError(null);
                              setFee({ id: f.id, name: f.name, kind: f.kind, active: f.active });
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={tm('delete')}
                            disabled={removeFee.isPending}
                            onClick={() => removeFee.mutate(f.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          <Card className="gap-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg font-semibold">{t('plans')}</h2>
                <p className="text-muted-foreground text-sm">{t('plansHint')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
              </div>
            </div>

            {plans.isPending && <Skeleton className="h-24 w-full" />}
            {plans.isError && (
              <Alert variant="destructive">
                <AlertDescription>{te(errorKey(plans.error))}</AlertDescription>
              </Alert>
            )}
            {plans.data?.length === 0 && <p className="text-muted-foreground text-sm">{t('noPlans')}</p>}
            {planList.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('feeType')}</TableHead>
                      <TableHead>{t('level')}</TableHead>
                      <TableHead className="text-right">{t('amount')}</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {planList.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{feeName(p.feeTypeId)}</TableCell>
                        <TableCell>{p.level ?? t('allLevels')}</TableCell>
                        <TableCell className="text-right">{formatRupiah(p.amount)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={tm('edit')}
                            onClick={() => {
                              setError(null);
                              setPlan({
                                feeTypeId: p.feeTypeId,
                                level: p.level ?? '',
                                amount: String(p.amount),
                                editing: true,
                              });
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={tm('delete')}
                            disabled={removePlan.isPending}
                            onClick={() => removePlan.mutate(p.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          <DiscountsCard
            feeTypes={feeList.map((f) => ({ id: f.id, name: f.name }))}
            classes={(classes.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
          />
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
    </PageBody>
  );
}
