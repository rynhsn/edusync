'use client';

import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarClock,
  LifeBuoy,
  Plus,
  Puzzle,
  Receipt,
  School,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IconTile, StatCard, StatGrid, ToneBadge } from '@/components/ui-kit';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { goPay, useAccount } from './account-context';
import { PeriodBar, periodStats, SubscriptionBadge } from './account-ui';
import { OwnerOnboarding, SchoolsQuickOpen } from './onboarding';

export function OverviewView() {
  const t = useTranslations('account');
  const te = useTranslations();
  const { foundation: f, money, date } = useAccount();
  const sub = f.subscription;
  const openInvoices = f.invoices.filter((i) => i.status === 'open');
  const modules = new Set(f.schools.flatMap((s) => s.modules));

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
        icon={Building2}
        tone="teal"
        title={f.name}
        description={t('overviewSubtitle')}
        actions={
          <Button nativeButton={false} render={<Link href="/account/units/new" />}>
            <Plus className="size-4" aria-hidden /> {t('addUnit')}
          </Button>
        }
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

      <OwnerOnboarding />
      <SchoolsQuickOpen />

      <StatGrid>
        <StatCard label={t('statUnits')} value={f.schools.length} icon={School} tone="teal" />
        <StatCard
          label={t('statModules')}
          value={modules.size}
          hint={t('statModulesHint')}
          icon={Puzzle}
          tone="violet"
        />
        <StatCard
          label={t('statDaysLeft')}
          value={sub ? Math.max(0, periodStats(sub).daysLeft) : '-'}
          hint={sub ? t('periodEnd', { date: date(sub.currentPeriodEnd) }) : undefined}
          icon={CalendarClock}
          tone="sky"
          progress={sub ? periodStats(sub).percent : undefined}
        />
        <StatCard
          label={t('statOpenInvoices')}
          value={openInvoices.length}
          hint={openInvoices[0] ? money(openInvoices[0].amount) : t('noOpenInvoices')}
          icon={Receipt}
          tone={openInvoices.length > 0 ? 'amber' : 'emerald'}
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle className="font-heading text-lg">{t('subscription')}</CardTitle>
            {sub ? <SubscriptionBadge status={sub.status} /> : <ToneBadge>{t('noSubscription')}</ToneBadge>}
          </CardHeader>
          <CardContent className="grid gap-4">
            {!sub && (
              <p className="text-muted-foreground text-sm">
                {te('accountOnboarding.noSubscription')}{' '}
                <Link href="/account/billing" className="text-primary underline-offset-4 hover:underline">
                  {t('nav.billing')}
                </Link>
              </p>
            )}
            {sub && (
              <>
                <p className="text-muted-foreground text-sm">
                  {sub.period === 'yearly' ? t('periodYearly') : t('periodMonthly')} ·{' '}
                  {t('periodRange', { start: date(sub.currentPeriodStart), end: date(sub.currentPeriodEnd) })}
                </p>
                <PeriodBar sub={sub} />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => renew.mutate()} disabled={renew.isPending}>
                    {renew.isPending ? t('working') : t('renewNow')}
                  </Button>
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={<Link href="/account/subscription" />}
                  >
                    {t('manageSubscription')} <ArrowRight className="size-4" aria-hidden />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">{t('quickLinks')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {[
              {
                href: '/account/docs',
                icon: BookOpen,
                tone: 'violet' as const,
                title: t('nav.docs'),
                body: t('quickDocs'),
              },
              {
                href: '/account/help',
                icon: LifeBuoy,
                tone: 'sky' as const,
                title: t('nav.help'),
                body: t('quickHelp'),
              },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="hover:bg-muted flex items-center gap-3 rounded-xl border p-3 transition-colors"
              >
                <IconTile icon={l.icon} tone={l.tone} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{l.title}</span>
                  <span className="text-muted-foreground block text-xs">{l.body}</span>
                </span>
                <ArrowRight className="text-muted-foreground size-4" aria-hidden />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageBody>
  );
}
