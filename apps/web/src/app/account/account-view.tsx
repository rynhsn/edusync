'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { ApiError, api, unwrap } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { formatCalendarDate } from '@/lib/format-date';
import { goToSchool, useSite } from '@/lib/site';

const STATUS_KEY = {
  active: 'statusActive',
  past_due: 'statusPastDue',
  suspended: 'statusSuspended',
  canceled: 'statusCanceled',
  pending_payment: 'statusPending',
} as const;

const STATUS_TONE: Record<keyof typeof STATUS_KEY, 'secondary' | 'outline' | 'destructive'> = {
  active: 'secondary',
  past_due: 'outline',
  suspended: 'destructive',
  canceled: 'outline',
  pending_payment: 'outline',
};

const INVOICE_KEY = {
  open: 'invoiceOpen',
  paid: 'invoicePaid',
  expired: 'invoiceExpired',
  void: 'invoiceVoid',
} as const;

export function AccountView() {
  const t = useTranslations('account');
  const tc = useTranslations('common');
  const tm = useTranslations('modules');
  const tt = useTranslations('tiers');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const queryClient = useQueryClient();
  const site = useSite();

  const account = useQuery({
    queryKey: ['account'],
    queryFn: async () => unwrap(await api.GET('/v1/account')),
  });
  const unauthenticated = account.error instanceof ApiError && account.error.status === 401;
  useEffect(() => {
    if (unauthenticated) router.replace('/login');
  }, [unauthenticated, router]);

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    router.replace('/login');
  }

  const money = new Intl.NumberFormat(locale === 'su' ? 'id' : locale, {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  });
  const date = (iso: string) => formatCalendarDate(locale, iso.slice(0, 10));
  const moduleLabel = (key: string) => (tm.has(key as never) ? tm(key as never) : key);
  const tierLabel = (key: string) => (tt.has(key as never) ? tt(key as never) : key);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b p-3 md:px-6">
        <div className="flex items-center gap-4">
          <Logo />
          <span className="text-muted-foreground text-sm">{t('title')}</span>
        </div>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="size-4" /> {tc('signOut')}
          </Button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-4xl flex-1 content-start gap-6 p-4 md:p-8">
        {(account.isPending || unauthenticated) && <Skeleton className="h-40 w-full" />}

        {account.isError && !unauthenticated && (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p>{t('loadError')}</p>
            <Button onClick={() => account.refetch()}>{tc('retry')}</Button>
          </div>
        )}

        {account.data?.foundations.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <p className="font-medium">{t('notOwnerTitle')}</p>
            <p className="text-muted-foreground text-sm">{t('notOwnerBody')}</p>
          </div>
        )}

        {account.data?.foundations.map((f) => {
          const sub = f.subscription;
          return (
            <section key={f.id} className="grid gap-4" aria-labelledby={`f-${f.id}`}>
              <h1 id={`f-${f.id}`} className="font-heading text-2xl font-semibold">
                {f.name}
              </h1>

              <Card>
                <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
                  <CardTitle className="font-heading text-lg">{t('subscription')}</CardTitle>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {sub ? (
                      <>
                        <Badge variant={STATUS_TONE[sub.status]}>{t(STATUS_KEY[sub.status])}</Badge>
                        <span className="text-muted-foreground">
                          {sub.period === 'yearly' ? t('periodYearly') : t('periodMonthly')} ·{' '}
                          {t('periodEnd', { date: date(sub.currentPeriodEnd) })}
                        </span>
                      </>
                    ) : (
                      <Badge variant="outline">{t('noSubscription')}</Badge>
                    )}
                  </div>
                </CardHeader>
                {(sub?.status === 'past_due' || sub?.status === 'suspended') && (
                  <CardContent className="text-muted-foreground text-sm">
                    {sub.status === 'past_due' ? t('pastDueHint') : t('suspendedHint')}
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-lg">{t('units')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y">
                    {f.schools.map((s) => (
                      <li key={s.id} className="grid gap-2 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-medium">{s.name}</span>{' '}
                            <span className="text-muted-foreground font-mono text-xs">{s.slug}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={s.status === 'active' ? 'secondary' : 'destructive'}>
                              {s.status === 'active' ? t('unitActive') : t('unitSuspended')}
                              {s.suspendedReason === 'billing' && ` · ${t('byBilling')}`}
                              {s.suspendedReason === 'staff' && ` · ${t('byStaff')}`}
                            </Badge>
                            {site.ready && s.status === 'active' && (
                              <Button size="sm" variant="outline" onClick={() => goToSchool(site, s.slug)}>
                                {t('openSchool')}
                              </Button>
                            )}
                          </div>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {tierLabel(s.tier)} · {t('modules')}:{' '}
                          {s.modules.length > 0 ? s.modules.map(moduleLabel).join(', ') : t('coreOnly')}
                        </p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-lg">{t('invoices')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {f.invoices.length === 0 && (
                    <p className="text-muted-foreground text-sm">{t('noInvoices')}</p>
                  )}
                  <ul className="divide-y">
                    {f.invoices.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div>
                          <span className="font-medium">{money.format(i.amount)}</span>
                          <p className="text-muted-foreground text-xs">
                            {i.status === 'paid' && i.paidAt
                              ? t('paidOn', { date: date(i.paidAt) })
                              : t('due', { date: date(i.dueAt) })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={i.status === 'paid' ? 'secondary' : 'outline'}>
                            {t(INVOICE_KEY[i.status])}
                          </Badge>
                          {i.paymentUrl && (
                            <Button size="sm" nativeButton={false} render={<a href={i.paymentUrl} />}>
                              {t('pay')}
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          );
        })}
      </main>
    </div>
  );
}
