'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, RefreshCw, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatRupiah } from '@/lib/money';
import { CHARGE_POLL_MS, shouldPollCharge } from '@/lib/online-charge';

/**
 * Tujuan kembali dari halaman bayar Midtrans. Staf keuangan memeriksa lewat endpoint keuangan, wali/siswa lewat
 * endpoint portal. Memeriksa ulang selama transaksi masih menunggu (server juga menanyakan ke Midtrans sekolah
 * bila notifikasi tidak sampai).
 */
export function OnlineReturnView({ orderId }: { orderId: string }) {
  const t = useTranslations('payOnline');
  const te = useTranslations();
  const { school, can } = useSchool();
  const staff = can('finance:read');
  const header = { header: schoolHeader(school.schoolId) };
  const [startedAt] = useState(() => Date.now());

  const charge = useQuery({
    queryKey: ['online-charge', school.schoolId, orderId, staff ? 'staff' : 'portal'],
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    queryFn: async () =>
      staff
        ? unwrap(
            await api.GET('/v1/finance/online-charges/{orderId}', {
              params: { ...header, path: { orderId } },
            }),
          )
        : unwrap(
            await api.GET('/v1/portal/online-charges/{orderId}', {
              params: { ...header, path: { orderId } },
            }),
          ),
    refetchInterval: (q) =>
      shouldPollCharge(q.state.data?.status, Date.now() - startedAt) ? CHARGE_POLL_MS : false,
  });

  const data = charge.data;
  const backHref = staff
    ? '/finance/online'
    : data
      ? `/portal/children/${data.studentId}?tab=invoices`
      : '/portal';
  const backLabel = staff ? t('backStaff') : t('backPortal');
  const stalled = data?.status === 'pending' && !shouldPollCharge(data.status, Date.now() - startedAt);

  return (
    <div className="mx-auto w-full max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4" aria-live="polite">
          {charge.isPending && <Skeleton className="h-24 w-full" />}

          {charge.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {charge.error instanceof ApiError && charge.error.status === 404
                  ? t('notFound')
                  : te(errorKey(charge.error))}
              </AlertDescription>
            </Alert>
          )}

          {data && (
            <>
              {data.status === 'pending' && (
                <>
                  <p className="flex items-center gap-2 font-medium">
                    <Clock className="text-muted-foreground size-5 animate-pulse" aria-hidden />{' '}
                    {t('pending')}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {stalled ? t('stalledHint') : t('pendingHint')}
                  </p>
                </>
              )}
              {data.status === 'paid' && (
                <>
                  <p className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="text-primary size-5" aria-hidden /> {t('paid')}
                  </p>
                  <p className="text-muted-foreground text-sm">{t('paidHint')}</p>
                </>
              )}
              {data.status === 'failed' && (
                <>
                  <p className="flex items-center gap-2 font-medium">
                    <XCircle className="text-destructive size-5" aria-hidden /> {t('failed')}
                  </p>
                  <p className="text-muted-foreground text-sm">{t('failedHint')}</p>
                </>
              )}
              <dl className="grid content-start gap-1 border-t pt-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">{t('amount')}</dt>
                  <dd className="font-heading text-lg font-semibold tabular-nums">
                    {formatRupiah(data.total)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">{t('order')}</dt>
                  <dd className="font-mono text-xs break-all">{data.orderId}</dd>
                </div>
              </dl>
              {data.status === 'pending' && data.paymentUrl && (
                <Button variant="outline" nativeButton={false} render={<a href={data.paymentUrl} />}>
                  {t('continuePay')}
                </Button>
              )}
              {stalled && (
                <Button variant="outline" onClick={() => charge.refetch()} disabled={charge.isFetching}>
                  <RefreshCw className="size-4" aria-hidden /> {t('recheck')}
                </Button>
              )}
            </>
          )}

          <Button
            variant={data?.status === 'paid' ? 'default' : 'outline'}
            nativeButton={false}
            render={<Link href={backHref} />}
          >
            {backLabel}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
