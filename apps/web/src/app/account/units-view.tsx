'use client';

import { CalendarClock, ExternalLink, Plus, School, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PageBody, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { EmptyPanel, ToneBadge, UserAvatar } from '@/components/ui-kit';
import { goToSchool, useSite } from '@/lib/site';
import { type AccountSchool, useAccount } from './account-context';

const MAX_BADGES = 5;

function UnitCard({ unit, index }: { unit: AccountSchool; index: number }) {
  const t = useTranslations('account');
  const { moduleLabel, tierLabel } = useAccount();
  const site = useSite();
  const [opening, setOpening] = useState(false);
  const shown = unit.modules.slice(0, MAX_BADGES);
  const rest = unit.modules.length - shown.length;

  return (
    <article
      className="bg-card grid content-between gap-4 rounded-2xl border p-4 transition-shadow hover:shadow-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms`, animationFillMode: 'backwards' }}
    >
      <div className="grid gap-3">
        <div className="flex items-start gap-3">
          <UserAvatar name={unit.name} size="lg" className="rounded-2xl" />
          <div className="min-w-0 flex-1">
            <h2 className="font-heading truncate font-semibold">{unit.name}</h2>
            <p className="text-muted-foreground truncate font-mono text-xs">{unit.slug}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <ToneBadge tone={unit.status === 'active' ? 'emerald' : 'rose'}>
            {unit.status === 'active' ? t('unitActive') : t('unitSuspended')}
            {unit.suspendedReason === 'billing' && ` · ${t('byBilling')}`}
            {unit.suspendedReason === 'staff' && ` · ${t('byStaff')}`}
          </ToneBadge>
          <ToneBadge tone="teal" dot={false}>
            {tierLabel(unit.tier)}
          </ToneBadge>
          {unit.modules.length === 0 && (
            <ToneBadge tone="slate" dot={false}>
              {t('coreOnly')}
            </ToneBadge>
          )}
          {shown.map((m) => (
            <ToneBadge key={m} tone="violet" dot={false}>
              {moduleLabel(m)}
            </ToneBadge>
          ))}
          {rest > 0 && (
            <ToneBadge tone="slate" dot={false}>
              +{rest}
            </ToneBadge>
          )}
        </div>

        {unit.scheduled && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-100 p-2 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
            <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              {t('scheduledNote', {
                changes: [
                  ...unit.scheduled.removeModules.map((m) => `-${moduleLabel(m)}`),
                  ...(unit.scheduled.tier ? [tierLabel(unit.scheduled.tier)] : []),
                ].join(', '),
              })}
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {site.ready && unit.status === 'active' && (
          <Button
            size="sm"
            disabled={opening}
            onClick={async () => {
              setOpening(true);
              try {
                await goToSchool(site, unit.slug);
              } finally {
                setOpening(false);
              }
            }}
          >
            <ExternalLink className="size-3.5" aria-hidden /> {t('openSchool')}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href={`/account/units/${unit.id}/plan`} />}
        >
          <Sparkles className="size-3.5" aria-hidden /> {t('changePlan')}
        </Button>
      </div>
    </article>
  );
}

export function UnitsView() {
  const t = useTranslations('account');
  const { foundation: f } = useAccount();
  return (
    <PageBody>
      <PageHeader
        icon={School}
        tone="sky"
        title={t('units')}
        description={t('unitsSubtitle')}
        actions={
          <Button nativeButton={false} render={<Link href="/account/units/new" />}>
            <Plus className="size-4" aria-hidden /> {t('addUnit')}
          </Button>
        }
      />
      {f.schools.length === 0 ? (
        <EmptyPanel
          icon={School}
          title={t('noUnits')}
          body={t('noUnitsBody')}
          action={
            <Button nativeButton={false} render={<Link href="/account/units/new" />}>
              {t('addUnit')}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {f.schools.map((s, i) => (
            <UnitCard key={s.id} unit={s} index={i} />
          ))}
        </div>
      )}
    </PageBody>
  );
}
