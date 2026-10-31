'use client';

import { type CatalogItem, withRequirements } from '@edusync/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAccount } from './account-context';

/** Katalog publik sebagai daftar item yang dipakai fungsi harga bersama. */
export function useCatalogItems() {
  const catalog = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => unwrap(await api.GET('/v1/catalog')),
  });
  const items: CatalogItem[] = useMemo(
    () => (catalog.data?.items ?? []).map((i, sort) => ({ ...i, sort })),
    [catalog.data],
  );
  return { catalog, items };
}

/** Pilihan modul (dengan syarat otomatis) dan tingkat siswa untuk satu unit. Harga hanya petunjuk; angka resmi dari server. */
export function PlanPicker({
  idPrefix,
  modules,
  tier,
  active,
  onChange,
}: {
  idPrefix: string;
  modules: string[];
  tier: string;
  /** Modul yang saat ini sudah aktif (ditandai). */
  active?: string[];
  onChange: (next: { modules: string[]; tier: string }) => void;
}) {
  const t = useTranslations('account');
  const { money, moduleLabel, tierLabel } = useAccount();
  const { catalog, items } = useCatalogItems();

  if (catalog.isPending) return <Skeleton className="h-64 w-full rounded-2xl" />;
  const moduleItems = items.filter((i) => i.kind === 'module');
  const tiers = items.filter((i) => i.kind === 'tier');
  const extra = withRequirements(modules, items).filter((m) => !modules.includes(m));

  return (
    <div className="grid gap-5">
      <fieldset className="grid content-start gap-2">
        <legend className="text-sm font-medium">{t('modulesTitle')}</legend>
        <p className="text-muted-foreground text-xs">{t('modulesNote')}</p>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {moduleItems.map((m) => {
            const checked = modules.includes(m.key) || extra.includes(m.key);
            const isActive = active?.includes(m.key);
            return (
              <label
                key={m.key}
                htmlFor={`${idPrefix}-${m.key}`}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors',
                  checked ? 'border-primary/50 bg-accent/50' : 'hover:bg-muted/50',
                )}
              >
                <Checkbox
                  id={`${idPrefix}-${m.key}`}
                  checked={checked}
                  disabled={extra.includes(m.key)}
                  onCheckedChange={(next) =>
                    onChange({
                      tier,
                      modules: next ? [...modules, m.key] : modules.filter((x) => x !== m.key),
                    })
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block">{moduleLabel(m.key)}</span>
                  {isActive && (
                    <span className="text-muted-foreground block text-xs">{t('currentlyActive')}</span>
                  )}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">+{money(m.priceMonthly)}</span>
              </label>
            );
          })}
        </div>
        {extra.length > 0 && (
          <p className="text-muted-foreground text-xs">
            {t('alsoIncluded', { modules: extra.map(moduleLabel).join(', ') })}
          </p>
        )}
      </fieldset>

      <div className="grid content-start gap-2 sm:max-w-xs">
        <Label htmlFor={`${idPrefix}-tier`}>{t('tier')}</Label>
        <SelectField
          id={`${idPrefix}-tier`}
          value={tier}
          onChange={(e) => onChange({ modules, tier: e.target.value })}
        >
          {tiers.map((x) => (
            <option key={x.key} value={x.key}>
              {tierLabel(x.key)}
              {x.priceMonthly > 0 ? ` (+${money(x.priceMonthly)})` : ''}
            </option>
          ))}
        </SelectField>
      </div>
    </div>
  );
}
