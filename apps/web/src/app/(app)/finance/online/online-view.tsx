'use client';

import { useQuery } from '@tanstack/react-query';
import { Globe } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { EmptyState } from '@/components/empty-state';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SelectField } from '@/components/ui/select-field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MODULE_TONE, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { CHARGE_TONE, type ChargeStatus } from '@/lib/online-charge';
import { ListSkeleton, Money } from '../ui';

type Filter = ChargeStatus | '';
const STATUSES: ChargeStatus[] = ['pending', 'paid', 'failed'];

/** Daftar transaksi pembayaran online (Midtrans) sekolah, terbaru dulu. */
export function OnlineChargesView() {
  const t = useTranslations('finance');
  const te = useTranslations();
  const locale = useLocale();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [status, setStatus] = useState<Filter>('');

  const list = useQuery({
    queryKey: ['finance', school.schoolId, 'online-charges', status],
    enabled: can('finance:read'),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/finance/online-charges', {
          params: { ...header, query: { limit: 100, ...(status ? { status } : {}) } },
        }),
      ),
  });
  const items = list.data?.items ?? [];

  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'su' ? 'id' : locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  const badge = (s: ChargeStatus) => <ToneBadge tone={CHARGE_TONE[s]}>{t(`ocStatus.${s}`)}</ToneBadge>;

  return (
    <PageBody>
      <PageHeader
        icon={Globe}
        tone={MODULE_TONE.finance}
        title={t('ocTitle')}
        description={t('ocSubtitle')}
        actions={
          <>
            <SelectField
              aria-label={t('ocFilter')}
              className="sm:w-44"
              value={status}
              onChange={(e) => setStatus(e.target.value as Filter)}
            >
              <option value="">{t('ocAll')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`ocStatus.${s}`)}
                </option>
              ))}
            </SelectField>
            <BackLink href="/finance" />
          </>
        }
      />

      {list.isPending && <ListSkeleton rows={5} />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(list.error))}</AlertDescription>
        </Alert>
      )}
      {list.data && items.length === 0 && (
        <EmptyState
          icon={Globe}
          tone="sky"
          title={t('ocEmpty')}
          body={t('ocEmptyHint')}
          first={t('ocEmptyFirst')}
          canAct={false}
        />
      )}

      {items.length > 0 && (
        <>
          <div className="hidden overflow-hidden rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('ocOrder')}</TableHead>
                  <TableHead>{t('ocStudent')}</TableHead>
                  <TableHead className="text-right">{t('ocTotal')}</TableHead>
                  <TableHead>{t('ocStatusCol')}</TableHead>
                  <TableHead>{t('ocDate')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.orderId}>
                    <TableCell className="font-mono text-xs">{c.orderId}</TableCell>
                    <TableCell className="font-medium">
                      {c.studentName}
                      {c.receiptNo && (
                        <span className="text-muted-foreground block text-xs">
                          {t('ocReceipt', { no: c.receiptNo })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      <Money value={c.total} />
                    </TableCell>
                    <TableCell>{badge(c.status)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {when(c.paidAt ?? c.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="grid content-start gap-2 md:hidden">
            {items.map((c) => (
              <li key={c.orderId} className="bg-background grid gap-1.5 rounded-xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-medium">{c.studentName}</p>
                  {badge(c.status)}
                </div>
                <Money value={c.total} className="font-semibold" />
                <p className="text-muted-foreground font-mono text-xs break-all">{c.orderId}</p>
                <p className="text-muted-foreground text-xs">{when(c.paidAt ?? c.createdAt)}</p>
                {c.receiptNo && (
                  <p className="text-muted-foreground text-xs">{t('ocReceipt', { no: c.receiptNo })}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </PageBody>
  );
}
