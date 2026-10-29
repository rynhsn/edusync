'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { useStaff } from '../../platform-shell';

interface ItemDraft {
  name: string;
  priceMonthly: string;
  sort: string;
  active: boolean;
}
interface PlanDraft {
  name: string;
  description: string;
  modules: string[];
  tier: string;
  sort: string;
  active: boolean;
}

function PlanFields({
  draft,
  onChange,
  prefix,
  modules,
  tiers,
}: {
  draft: PlanDraft;
  onChange: (d: PlanDraft) => void;
  prefix: string;
  modules: { key: string; name: string }[];
  tiers: { key: string; name: string }[];
}) {
  const t = useTranslations('platformCatalog');
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-name`}>{t('name')}</Label>
          <Input
            id={`${prefix}-name`}
            value={draft.name}
            maxLength={40}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-tier`}>{t('tier')}</Label>
          <SelectField
            id={`${prefix}-tier`}
            value={draft.tier}
            onChange={(e) => onChange({ ...draft, tier: e.target.value })}
          >
            {tiers.map((x) => (
              <option key={x.key} value={x.key}>
                {x.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-sort`}>{t('sort')}</Label>
          <Input
            id={`${prefix}-sort`}
            inputMode="numeric"
            value={draft.sort}
            onChange={(e) => onChange({ ...draft, sort: e.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-desc`}>{t('description')}</Label>
        <Input
          id={`${prefix}-desc`}
          value={draft.description}
          maxLength={200}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
        />
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t('modules')}</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <label key={m.key} htmlFor={`${prefix}-m-${m.key}`} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={`${prefix}-m-${m.key}`}
                checked={draft.modules.includes(m.key)}
                onCheckedChange={(next) =>
                  onChange({
                    ...draft,
                    modules: next ? [...draft.modules, m.key] : draft.modules.filter((x) => x !== m.key),
                  })
                }
              />
              {m.name}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

const KIND_KEY = { base: 'kindBase', module: 'kindModule', tier: 'kindTier' } as const;
const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));

export function CatalogView() {
  const t = useTranslations('platformCatalog');
  const te = useTranslations();
  const locale = useLocale();
  const { role } = useStaff();
  const queryClient = useQueryClient();
  const canEdit = role === 'admin';
  const money = new Intl.NumberFormat(locale === 'su' ? 'id' : locale, {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  });

  const catalog = useQuery({
    queryKey: ['platform-catalog'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/catalog')),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['platform-catalog'] });
  const onError = (e: unknown) => toast.error(te(errorKey(e)));

  const [editingItem, setEditingItem] = useState<
    ({ kind: 'base' | 'module' | 'tier'; key: string } & ItemDraft) | null
  >(null);
  const [newItem, setNewItem] = useState({
    kind: 'module' as 'module' | 'tier',
    key: '',
    name: '',
    priceMonthly: '0',
    sort: '50',
  });
  const [itemError, setItemError] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<({ key: string } & PlanDraft) | null>(null);
  const [newPlan, setNewPlan] = useState({
    key: '',
    name: '',
    description: '',
    modules: [] as string[],
    tier: 't300',
    sort: '50',
  });
  const [planError, setPlanError] = useState<string | null>(null);

  const saveItem = useMutation({
    mutationFn: async (v: NonNullable<typeof editingItem>) =>
      unwrap(
        await api.PUT('/v1/platform/catalog/items/{kind}/{key}', {
          params: { path: { kind: v.kind, key: v.key } },
          body: { name: v.name, priceMonthly: num(v.priceMonthly), sort: num(v.sort), active: v.active },
        }),
      ),
    onSuccess: () => {
      setEditingItem(null);
      toast.success(t('saved'));
      refresh();
    },
    onError,
  });
  const addItem = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/platform/catalog/items', {
          body: { ...newItem, priceMonthly: num(newItem.priceMonthly), sort: num(newItem.sort) },
        }),
      ),
    onSuccess: () => {
      setItemError(null);
      setNewItem({ ...newItem, key: '', name: '', priceMonthly: '0' });
      toast.success(t('added'));
      refresh();
    },
    onError: (e) => setItemError(te(errorKey(e))),
  });
  const savePlan = useMutation({
    mutationFn: async (v: NonNullable<typeof editingPlan>) =>
      unwrap(
        await api.PUT('/v1/platform/catalog/plans/{key}', {
          params: { path: { key: v.key } },
          body: {
            name: v.name,
            description: v.description,
            modules: v.modules,
            tier: v.tier,
            sort: num(v.sort),
            active: v.active,
          },
        }),
      ),
    onSuccess: () => {
      setEditingPlan(null);
      toast.success(t('saved'));
      refresh();
    },
    onError,
  });
  const addPlan = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/v1/platform/catalog/plans', { body: { ...newPlan, sort: num(newPlan.sort) } })),
    onSuccess: () => {
      setPlanError(null);
      setNewPlan({ ...newPlan, key: '', name: '', description: '', modules: [] });
      toast.success(t('added'));
      refresh();
    },
    onError: (e) => setPlanError(te(errorKey(e))),
  });
  const removePlan = useMutation({
    mutationFn: async (key: string) =>
      unwrap(await api.DELETE('/v1/platform/catalog/plans/{key}', { params: { path: { key } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      refresh();
    },
    onError,
  });

  if (catalog.isPending) return <Skeleton className="h-64 w-full" />;
  if (!catalog.data) return null;
  const { items, plans } = catalog.data;
  const modules = items.filter((i) => i.kind === 'module');
  const tiers = items.filter((i) => i.kind === 'tier');
  const moduleName = (key: string) => modules.find((m) => m.key === key)?.name ?? key;

  return (
    <div className="grid w-full gap-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        {!canEdit && <p className="text-muted-foreground mt-1 text-sm">{t('readOnly')}</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('itemsTitle')}</CardTitle>
          <CardDescription>{t('itemsHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {items.map((i) => {
              const open = editingItem?.kind === i.kind && editingItem.key === i.key;
              return (
                <li key={`${i.kind}-${i.key}`} className="grid gap-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{i.name}</span>
                      <span className="text-muted-foreground font-mono text-xs">{i.key}</span>
                      <Badge variant="outline">{t(KIND_KEY[i.kind])}</Badge>
                      {!i.active && <Badge variant="destructive">{t('inactive')}</Badge>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums">
                        {money.format(i.priceMonthly)}{' '}
                        <span className="text-muted-foreground text-xs">{t('perMonth')}</span>
                      </span>
                      {canEdit && !open && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEditingItem({
                              kind: i.kind,
                              key: i.key,
                              name: i.name,
                              priceMonthly: String(i.priceMonthly),
                              sort: String(i.sort),
                              active: i.active,
                            })
                          }
                        >
                          {t('edit')}
                        </Button>
                      )}
                    </div>
                  </div>
                  {open && editingItem && (
                    <div className="grid gap-3 sm:grid-cols-[1fr_12rem_6rem_auto] sm:items-end">
                      <div className="grid gap-1.5">
                        <Label htmlFor={`ei-name-${i.key}`}>{t('name')}</Label>
                        <Input
                          id={`ei-name-${i.key}`}
                          value={editingItem.name}
                          onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor={`ei-price-${i.key}`}>{t('price')}</Label>
                        <Input
                          id={`ei-price-${i.key}`}
                          inputMode="numeric"
                          value={editingItem.priceMonthly}
                          onChange={(e) => setEditingItem({ ...editingItem, priceMonthly: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor={`ei-sort-${i.key}`}>{t('sort')}</Label>
                        <Input
                          id={`ei-sort-${i.key}`}
                          inputMode="numeric"
                          value={editingItem.sort}
                          onChange={(e) => setEditingItem({ ...editingItem, sort: e.target.value })}
                        />
                      </div>
                      <label htmlFor={`ei-active-${i.key}`} className="flex items-center gap-2 pb-2 text-sm">
                        <Checkbox
                          id={`ei-active-${i.key}`}
                          checked={editingItem.active}
                          disabled={i.kind === 'base'}
                          onCheckedChange={(next) => setEditingItem({ ...editingItem, active: next })}
                        />
                        {t('active')}
                      </label>
                      <div className="flex gap-2 sm:col-span-4">
                        <Button
                          size="sm"
                          disabled={saveItem.isPending}
                          onClick={() => saveItem.mutate(editingItem)}
                        >
                          {t('save')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingItem(null)}>
                          {t('cancel')}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">{t('addItemTitle')}</CardTitle>
            <CardDescription>{t('addItemHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                addItem.mutate();
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="ni-kind">{t('kind')}</Label>
                <SelectField
                  id="ni-kind"
                  value={newItem.kind}
                  onChange={(e) => setNewItem({ ...newItem, kind: e.target.value as 'module' | 'tier' })}
                >
                  <option value="module">{t('kindModule')}</option>
                  <option value="tier">{t('kindTier')}</option>
                </SelectField>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ni-key">{t('key')}</Label>
                <Input
                  id="ni-key"
                  required
                  placeholder="library"
                  value={newItem.key}
                  onChange={(e) => setNewItem({ ...newItem, key: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ni-name">{t('name')}</Label>
                <Input
                  id="ni-name"
                  required
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ni-price">{t('price')}</Label>
                <Input
                  id="ni-price"
                  inputMode="numeric"
                  value={newItem.priceMonthly}
                  onChange={(e) => setNewItem({ ...newItem, priceMonthly: e.target.value })}
                />
              </div>
              <Button type="submit" disabled={addItem.isPending}>
                {t('add')}
              </Button>
              {itemError && (
                <Alert variant="destructive" className="sm:col-span-2 lg:col-span-5">
                  <AlertDescription>{itemError}</AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('plansTitle')}</CardTitle>
          <CardDescription>{t('plansHint')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {plans.length === 0 && <p className="text-muted-foreground text-sm">{t('noPlans')}</p>}
          <ul className="divide-y">
            {plans.map((p) => {
              const open = editingPlan?.key === p.key;
              return (
                <li key={p.key} className="grid gap-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-muted-foreground font-mono text-xs">{p.key}</span>
                        {!p.active && <Badge variant="destructive">{t('inactive')}</Badge>}
                      </div>
                      <p className="text-muted-foreground text-sm">{p.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {p.modules.map((m) => (
                          <Badge key={m} variant="secondary">
                            {moduleName(m)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {canEdit && !open && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEditingPlan({
                              key: p.key,
                              name: p.name,
                              description: p.description,
                              modules: p.modules,
                              tier: p.tier,
                              sort: String(p.sort),
                              active: p.active,
                            })
                          }
                        >
                          {t('edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={removePlan.isPending}
                          onClick={() => removePlan.mutate(p.key)}
                        >
                          {t('delete')}
                        </Button>
                      </div>
                    )}
                  </div>
                  {open && editingPlan && (
                    <div className="grid gap-3">
                      <PlanFields
                        modules={modules}
                        tiers={tiers}
                        draft={editingPlan}
                        prefix={`ep-${p.key}`}
                        onChange={(d) => setEditingPlan({ key: p.key, ...d })}
                      />
                      <label htmlFor={`ep-active-${p.key}`} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          id={`ep-active-${p.key}`}
                          checked={editingPlan.active}
                          onCheckedChange={(next) => setEditingPlan({ ...editingPlan, active: next })}
                        />
                        {t('active')}
                      </label>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={savePlan.isPending}
                          onClick={() => savePlan.mutate(editingPlan)}
                        >
                          {t('save')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingPlan(null)}>
                          {t('cancel')}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {canEdit && (
            <form
              className="grid gap-4 border-t pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                addPlan.mutate();
              }}
            >
              <p className="text-sm font-medium">{t('addPlanTitle')}</p>
              <div className="grid gap-2 sm:max-w-xs">
                <Label htmlFor="np-key">{t('key')}</Label>
                <Input
                  id="np-key"
                  required
                  placeholder="premium"
                  value={newPlan.key}
                  onChange={(e) => setNewPlan({ ...newPlan, key: e.target.value })}
                />
              </div>
              <PlanFields
                modules={modules}
                tiers={tiers}
                draft={{ ...newPlan, active: true }}
                prefix="np"
                onChange={(d) => setNewPlan({ ...newPlan, ...d })}
              />
              {planError && (
                <Alert variant="destructive">
                  <AlertDescription>{planError}</AlertDescription>
                </Alert>
              )}
              <div>
                <Button type="submit" disabled={addPlan.isPending}>
                  {t('add')}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
