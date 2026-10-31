'use client';

import { useMutation } from '@tanstack/react-query';
import { CalendarClock, ChevronRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToneBadge, UserAvatar } from '@/components/ui-kit';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { goPay, useAccount } from './account-context';
import { PeriodBar, SubscriptionBadge } from './account-ui';

export function SubscriptionView() {
  const t = useTranslations('account');
  const te = useTranslations();
  const { foundation: f, date, moduleLabel, tierLabel } = useAccount();
  const sub = f.subscription;

  const renew = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/account/foundations/{foundationId}/renewal', {
          params: { path: { foundationId: f.id } },
        }),
      ),
    onSuccess: (r) => goPay(r.paymentUrl),
  });

  return (
    <PageBody>
      <PageHeader
        icon={Sparkles}
        tone="amber"
        title={t('nav.subscription')}
        description={t('subscriptionSubtitle')}
      />

      {(sub?.status === 'past_due' || sub?.status === 'suspended') && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {sub.status === 'past_due' ? t('pastDueHint') : t('suspendedHint')}
          </AlertDescription>
        </Alert>
      )}
      {renew.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{te(errorKey(renew.error))}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="font-heading text-lg">{t('subscription')}</CardTitle>
          {sub ? <SubscriptionBadge status={sub.status} /> : <ToneBadge>{t('noSubscription')}</ToneBadge>}
        </CardHeader>
        <CardContent className="grid gap-4">
          {sub ? (
            <>
              <dl className="grid gap-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground text-xs">{t('billingCycle')}</dt>
                  <dd className="font-medium">
                    {sub.period === 'yearly' ? t('periodYearly') : t('periodMonthly')}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">{t('periodStart')}</dt>
                  <dd className="font-medium">{date(sub.currentPeriodStart)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">{t('periodEndLabel')}</dt>
                  <dd className="font-medium">{date(sub.currentPeriodEnd)}</dd>
                </div>
              </dl>
              <PeriodBar sub={sub} />
              <div>
                <Button onClick={() => renew.mutate()} disabled={renew.isPending}>
                  <CalendarClock className="size-4" aria-hidden />{' '}
                  {renew.isPending ? t('working') : t('renewNow')}
                </Button>
                <p className="text-muted-foreground mt-2 text-xs">{t('renewNote')}</p>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">{t('noSubscription')}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('modulesPerUnit')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {f.schools.map((s) => (
              <li key={s.id} className="py-3">
                <Link
                  href={`/account/units/${s.id}/plan`}
                  className="hover:bg-muted/50 -mx-2 grid gap-2 rounded-xl p-2 transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <UserAvatar name={s.name} size="sm" />
                    <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                    <span className="text-primary flex items-center gap-0.5 text-xs font-medium">
                      {t('changePlan')} <ChevronRight className="size-3.5" aria-hidden />
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <ToneBadge tone="teal" dot={false}>
                      {tierLabel(s.tier)}
                    </ToneBadge>
                    {s.modules.length === 0 && (
                      <ToneBadge tone="slate" dot={false}>
                        {t('coreOnly')}
                      </ToneBadge>
                    )}
                    {s.modules.map((m) => (
                      <ToneBadge key={m} tone="violet" dot={false}>
                        {moduleLabel(m)}
                      </ToneBadge>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </PageBody>
  );
}
