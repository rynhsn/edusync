'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BackLink } from '@/components/back-link';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel } from '@/components/ui-kit';
import { ApiError, api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { goPay, useAccount } from './account-context';
import { PlanPicker } from './plan-picker';

export function UnitPlanView({ schoolId }: { schoolId: string }) {
  const t = useTranslations('account');
  const te = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { foundations, money, date, moduleLabel, tierLabel } = useAccount();
  const unit = foundations.flatMap((f) => f.schools).find((s) => s.id === schoolId);

  const [plan, setPlan] = useState<{ modules: string[]; tier: string } | null>(null);
  useEffect(() => {
    if (unit && !plan) setPlan({ modules: unit.modules, tier: unit.tier });
  }, [unit, plan]);

  const key = plan ? [...plan.modules].sort().join(',') : '';
  const quote = useQuery({
    queryKey: ['change-quote', schoolId, key, plan?.tier],
    enabled: Boolean(plan),
    retry: false,
    queryFn: async () =>
      unwrap(
        await api.POST('/v1/account/units/{schoolId}/change-quote', {
          params: { path: { schoolId } },
          body: plan as { modules: string[]; tier: string },
        }),
      ),
  });
  const noChange = quote.error instanceof ApiError && quote.error.code === 'no_change';

  const submit = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/account/units/{schoolId}/change', {
          params: { path: { schoolId } },
          body: plan as { modules: string[]; tier: string },
        }),
      ),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ['account'] });
      if (r.paymentUrl) return goPay(r.paymentUrl, '/account/units');
      toast.success(r.appliedNow ? t('changeApplied') : t('changeScheduled'));
      router.push('/account/units');
    },
  });

  if (!unit) {
    return (
      <PageBody>
        <PageHeader
          icon={Sparkles}
          tone="violet"
          title={t('changePlan')}
          actions={<BackLink href="/account/units" />}
        />
        <EmptyPanel icon={Sparkles} tone="slate" title={t('unitNotFound')} />
      </PageBody>
    );
  }

  const q = quote.data;
  const nowLines = q?.lines ?? [];
  const nextChanges = q
    ? [...q.removeModules.map((m) => `-${moduleLabel(m)}`), ...(q.tierNext ? [tierLabel(q.tier)] : [])]
    : [];

  return (
    <PageBody>
      <PageHeader
        icon={Sparkles}
        tone="violet"
        title={t('changePlanTitle', { name: unit.name })}
        description={t('changePlanSubtitle')}
        actions={<BackLink href="/account/units" />}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardContent>
            {plan ? (
              <PlanPicker
                idPrefix="plan"
                modules={plan.modules}
                tier={plan.tier}
                active={unit.modules}
                onChange={setPlan}
              />
            ) : (
              <Skeleton className="h-64 w-full" />
            )}
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle className="font-heading text-lg">{t('summary')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4" aria-live="polite">
            {quote.isPending && <Skeleton className="h-24 w-full" />}
            {noChange && <p className="text-muted-foreground text-sm">{t('noChange')}</p>}
            {quote.isError && !noChange && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{te(errorKey(quote.error))}</AlertDescription>
              </Alert>
            )}
            {q && (
              <>
                {nowLines.length > 0 && (
                  <div className="grid content-start gap-2">
                    <p className="text-sm font-medium">{t('payNow')}</p>
                    <ul className="divide-y rounded-xl border text-sm">
                      {nowLines.map((l) => (
                        <li key={l.key} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span>{tierLabel(l.key) === l.key ? moduleLabel(l.key) : tierLabel(l.key)}</span>
                          <span className="tabular-nums">{money(l.amount)}</span>
                        </li>
                      ))}
                      <li className="bg-muted/50 flex items-center justify-between gap-3 px-3 py-2 font-medium">
                        <span>{t('total')}</span>
                        <span className="tabular-nums">{money(q.total)}</span>
                      </li>
                    </ul>
                    <p className="text-muted-foreground text-xs">
                      {t('prorataNote', { percent: Math.round(q.fraction * 100), date: date(q.periodEnd) })}
                    </p>
                  </div>
                )}
                {nextChanges.length > 0 && (
                  <p className="flex items-start gap-2 rounded-lg bg-amber-100 p-3 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                    <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>
                      {t('nextPeriodNote', { changes: nextChanges.join(', '), date: date(q.periodEnd) })}
                    </span>
                  </p>
                )}
              </>
            )}
            {submit.isError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{te(errorKey(submit.error))}</AlertDescription>
              </Alert>
            )}
            <Button onClick={() => submit.mutate()} disabled={!q || submit.isPending}>
              {submit.isPending ? t('working') : q && q.total > 0 ? t('payAndApply') : t('saveChange')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageBody>
  );
}
