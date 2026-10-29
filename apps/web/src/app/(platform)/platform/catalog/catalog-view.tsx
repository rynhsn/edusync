'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { useStaff } from '../../platform-shell';

type Kind = 'base' | 'module' | 'tier';
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

const KIND_KEY = { base: 'kindBase', module: 'kindModule', tier: 'kindTier' } as const;
const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));

function ItemFields({
  idPrefix,
  draft,
  onChange,
  withActive,
  lockActive,
}: {
  idPrefix: string;
  draft: ItemDraft;
  onChange: (d: ItemDraft) => void;
  withActive?: boolean;
  lockActive?: boolean;
}) {
  const t = useTranslations('platformCatalog');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-name`}>{t('name')}</Label>
        <Input
          id={`${idPrefix}-name`}
          required
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-price`}>{t('price')}</Label>
        <Input
          id={`${idPrefix}-price`}
          inputMode="numeric"
          value={draft.priceMonthly}
          onChange={(e) => onChange({ ...draft, priceMonthly: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-sort`}>{t('sort')}</Label>
        <Input
          id={`${idPrefix}-sort`}
          inputMode="numeric"
          value={draft.sort}
          onChange={(e) => onChange({ ...draft, sort: e.target.value })}
        />
      </div>
      {withActive && (
        <label htmlFor={`${idPrefix}-active`} className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox
            id={`${idPrefix}-active`}
            checked={draft.active}
            disabled={lockActive}
            onCheckedChange={(next) => onChange({ ...draft, active: next })}
          />
          {t('active')}
        </label>
      )}
    </div>
  );
}

function PlanFields({
  draft,
  onChange,
  prefix,
  modules,
  tiers,
  withActive,
}: {
  draft: PlanDraft;
  onChange: (d: PlanDraft) => void;
  prefix: string;
  modules: { key: string; name: string }[];
  tiers: { key: string; name: string }[];
  withActive?: boolean;
}) {
  const t = useTranslations('platformCatalog');
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor={`${prefix}-name`}>{t('name')}</Label>
          <Input
            id={`${prefix}-name`}
            required
            value={draft.name}
            maxLength={40}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
          />
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
        <div className="grid gap-2 sm:col-span-3">
          <Label htmlFor={`${prefix}-desc`}>{t('description')}</Label>
          <Input
            id={`${prefix}-desc`}
            value={draft.description}
            maxLength={200}
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
          />
        </div>
        <div className="grid gap-2 sm:col-span-3">
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
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t('modules')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
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
      {withActive && (
        <label htmlFor={`${prefix}-active`} className="flex items-center gap-2 text-sm">
          <Checkbox
            id={`${prefix}-active`}
            checked={draft.active}
            onCheckedChange={(next) => onChange({ ...draft, active: next })}
          />
          {t('active')}
        </label>
      )}
    </div>
  );
}

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

  const [editingItem, setEditingItem] = useState<({ kind: Kind; key: string } & ItemDraft) | null>(null);
  const [newItem, setNewItem] = useState({
    kind: 'module' as 'module' | 'tier',
    key: '',
    name: '',
    priceMonthly: '0',
    sort: '50',
    active: true,
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
    active: true,
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
      toast.success(t('saved'));
      refresh();
    },
    onError: (e) => setItemError(te(errorKey(e))),
  });
  const addItem = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/platform/catalog/items', {
          body: {
            kind: newItem.kind,
            key: newItem.key,
            name: newItem.name,
            priceMonthly: num(newItem.priceMonthly),
            sort: num(newItem.sort),
          },
        }),
      ),
    onSuccess: () => {
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
      toast.success(t('saved'));
      refresh();
    },
    onError: (e) => setPlanError(te(errorKey(e))),
  });
  const addPlan = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/platform/catalog/plans', {
          body: {
            key: newPlan.key,
            name: newPlan.name,
            description: newPlan.description,
            modules: newPlan.modules,
            tier: newPlan.tier,
            sort: num(newPlan.sort),
          },
        }),
      ),
    onSuccess: () => {
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
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (catalog.isPending) return <Skeleton className="h-64 w-full" />;
  if (!catalog.data) return null;
  const { items, plans } = catalog.data;
  const modules = items.filter((i) => i.kind === 'module');
  const tiers = items.filter((i) => i.kind === 'tier');
  const moduleName = (key: string) => modules.find((m) => m.key === key)?.name ?? key;

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={canEdit ? t('subtitle') : `${t('subtitle')} ${t('readOnly')}`}
        actions={
          canEdit && (
            <>
              <FormDialog
                trigger={
                  <Button variant="outline">
                    <Plus className="size-4" /> {t('addItemTitle')}
                  </Button>
                }
                title={t('addItemTitle')}
                description={t('addItemHint')}
                submitLabel={t('add')}
                error={itemError}
                onOpenChange={() => {
                  setItemError(null);
                  setNewItem({ ...newItem, key: '', name: '', priceMonthly: '0' });
                }}
                onSubmit={() => addItem.mutateAsync()}
              >
                <div className="grid gap-4 sm:grid-cols-2">
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
                </div>
                <ItemFields
                  idPrefix="ni"
                  draft={newItem}
                  onChange={(d) => setNewItem({ ...newItem, ...d })}
                />
              </FormDialog>
              <FormDialog
                size="wide"
                trigger={
                  <Button>
                    <Plus className="size-4" /> {t('addPlanTitle')}
                  </Button>
                }
                title={t('addPlanTitle')}
                submitLabel={t('add')}
                error={planError}
                onOpenChange={() => {
                  setPlanError(null);
                  setNewPlan({ ...newPlan, key: '', name: '', description: '', modules: [] });
                }}
                onSubmit={() => addPlan.mutateAsync()}
              >
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
                  draft={newPlan}
                  prefix="np"
                  onChange={(d) => setNewPlan({ ...newPlan, ...d })}
                />
              </FormDialog>
            </>
          )
        }
      />

      <section className="grid gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">{t('plansTitle')}</h2>
          <p className="text-muted-foreground text-sm">{t('plansHint')}</p>
        </div>
        {plans.length === 0 && (
          <Card className="text-muted-foreground p-8 text-center text-sm">{t('noPlans')}</Card>
        )}
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.key} className="gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-base font-semibold">{p.name}</h3>
                    <span className="text-muted-foreground font-mono text-xs">{p.key}</span>
                    {!p.active && <Badge variant="destructive">{t('inactive')}</Badge>}
                  </div>
                  <p className="text-muted-foreground text-sm">{p.description}</p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('edit')}
                      onClick={() => {
                        setPlanError(null);
                        setEditingPlan({
                          key: p.key,
                          name: p.name,
                          description: p.description,
                          modules: p.modules,
                          tier: p.tier,
                          sort: String(p.sort),
                          active: p.active,
                        });
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('delete')}
                      disabled={removePlan.isPending}
                      onClick={() => removePlan.mutate(p.key)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {p.modules.map((m) => (
                  <Badge key={m} variant="secondary">
                    {moduleName(m)}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">{t('itemsTitle')}</h2>
          <p className="text-muted-foreground text-sm">{t('itemsHint')}</p>
        </div>
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('name')}</TableHead>
                <TableHead>{t('kind')}</TableHead>
                <TableHead className="text-right">{t('price')}</TableHead>
                <TableHead>{t('active')}</TableHead>
                {canEdit && <TableHead className="w-16" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow key={`${i.kind}-${i.key}`}>
                  <TableCell>
                    <div className="font-medium">{i.name}</div>
                    <div className="text-muted-foreground font-mono text-xs">{i.key}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{t(KIND_KEY[i.kind])}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money.format(i.priceMonthly)}{' '}
                    <span className="text-muted-foreground text-xs">{t('perMonth')}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={i.active ? 'secondary' : 'destructive'}>
                      {i.active ? t('active') : t('inactive')}
                    </Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('edit')}
                        onClick={() => {
                          setItemError(null);
                          setEditingItem({
                            kind: i.kind,
                            key: i.key,
                            name: i.name,
                            priceMonthly: String(i.priceMonthly),
                            sort: String(i.sort),
                            active: i.active,
                          });
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>

      <FormDialog
        open={!!editingItem}
        title={`${t('edit')} · ${editingItem?.name ?? ''}`}
        submitLabel={t('save')}
        error={itemError}
        onOpenChange={(open) => !open && setEditingItem(null)}
        onSubmit={() => (editingItem ? saveItem.mutateAsync(editingItem) : Promise.resolve())}
      >
        {editingItem && (
          <ItemFields
            idPrefix="ei"
            draft={editingItem}
            withActive
            lockActive={editingItem.kind === 'base'}
            onChange={(d) => setEditingItem({ ...editingItem, ...d })}
          />
        )}
      </FormDialog>

      <FormDialog
        size="wide"
        open={!!editingPlan}
        title={`${t('edit')} · ${editingPlan?.name ?? ''}`}
        submitLabel={t('save')}
        error={planError}
        onOpenChange={(open) => !open && setEditingPlan(null)}
        onSubmit={() => (editingPlan ? savePlan.mutateAsync(editingPlan) : Promise.resolve())}
      >
        {editingPlan && (
          <PlanFields
            modules={modules}
            tiers={tiers}
            draft={editingPlan}
            prefix="ep"
            withActive
            onChange={(d) => setEditingPlan({ key: editingPlan.key, ...d })}
          />
        )}
      </FormDialog>
    </PageBody>
  );
}
