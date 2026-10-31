'use client';

import { Receipt } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageBody, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { EmptyPanel, ToneBadge } from '@/components/ui-kit';
import { goPay, useAccount } from './account-context';
import { INVOICE_KIND_KEY, INVOICE_STATUS_KEY, INVOICE_STATUS_TONE } from './account-ui';

export function BillingView() {
  const t = useTranslations('account');
  const { foundation: f, money, date } = useAccount();
  return (
    <PageBody>
      <PageHeader icon={Receipt} tone="amber" title={t('nav.billing')} description={t('billingSubtitle')} />
      {f.invoices.length === 0 ? (
        <EmptyPanel icon={Receipt} tone="amber" title={t('noInvoices')} body={t('noInvoicesBody')} />
      ) : (
        <ul className="grid gap-3">
          {f.invoices.map((i) => (
            <li
              key={i.id}
              className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-heading text-lg font-semibold tabular-nums">{money(i.amount)}</span>
                  <ToneBadge tone={INVOICE_STATUS_TONE[i.status]}>
                    {t(INVOICE_STATUS_KEY[i.status])}
                  </ToneBadge>
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {t(INVOICE_KIND_KEY[i.kind])} ·{' '}
                  {i.status === 'paid' && i.paidAt
                    ? t('paidOn', { date: date(i.paidAt) })
                    : t('due', { date: date(i.dueAt) })}
                </p>
              </div>
              {i.paymentUrl && <Button onClick={() => goPay(i.paymentUrl as string)}>{t('pay')}</Button>}
            </li>
          ))}
        </ul>
      )}
    </PageBody>
  );
}
