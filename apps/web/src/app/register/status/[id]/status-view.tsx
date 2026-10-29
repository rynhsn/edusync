'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, api, unwrap } from '@/lib/api';

const POLL_MS = 2000;

/** Tujuan kembali dari penyedia pembayaran. Memeriksa status sampai sekolah aktif atau pendaftaran gugur. */
export function StatusView({ id }: { id: string }) {
  const t = useTranslations('registerStatus');
  const locale = useLocale();
  const queryClient = useQueryClient();

  const config = useQuery({
    queryKey: ['config'],
    queryFn: async () => unwrap(await api.GET('/v1/config')),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const reg = useQuery({
    queryKey: ['registration', id],
    queryFn: async () => unwrap(await api.GET('/v1/registrations/{id}', { params: { path: { id } } })),
    // Berhenti memeriksa begitu hasilnya final, atau bila akses ditolak.
    refetchInterval: (query) => (query.state.data?.status === 'pending_payment' ? POLL_MS : false),
  });

  const status = reg.data?.status;
  useEffect(() => {
    // Pengguna baru menjadi anggota sekolah, jadi data akun lama harus dimuat ulang.
    if (status === 'paid') queryClient.invalidateQueries({ queryKey: ['me'] });
  }, [status, queryClient]);

  const money = new Intl.NumberFormat(locale === 'su' ? 'id' : locale, {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  });

  if (reg.isPending) return <Skeleton className="h-48 w-full max-w-md" />;

  if (reg.error instanceof ApiError && reg.error.status === 401) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="grid gap-4 pt-6">
          <p className="text-sm">{t('signInNeeded')}</p>
          <Button nativeButton={false} render={<Link href="/login" />}>
            {t('signIn')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (reg.isError || !reg.data) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <p className="text-sm">{t('notFound')}</p>
        </CardContent>
      </Card>
    );
  }

  const data = reg.data;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="font-heading text-xl">{data.foundationName}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4" aria-live="polite">
        {data.status === 'pending_payment' && (
          <>
            <p className="flex items-center gap-2 font-medium">
              <Clock className="text-muted-foreground size-5 animate-pulse" aria-hidden /> {t('waiting')}
            </p>
            <p className="text-muted-foreground text-sm">{t('waitingHint')}</p>
            {data.invoice && (
              <p className="flex items-baseline justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">{t('amount')}</span>
                <span className="font-heading text-lg font-semibold tabular-nums">
                  {money.format(data.invoice.amount)}
                </span>
              </p>
            )}
            {data.invoice?.paymentUrl && (
              <Button variant="outline" nativeButton={false} render={<a href={data.invoice.paymentUrl} />}>
                {t('openPayment')}
              </Button>
            )}
          </>
        )}

        {data.status === 'paid' && (
          <>
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="text-primary size-5" aria-hidden /> {t('paid')}
            </p>
            {data.schools.length > 0 && (
              <div className="text-sm">
                <p className="text-muted-foreground mb-1">{t('paidHint')}</p>
                <ul className="grid gap-1">
                  {data.schools.map((s) => (
                    <li key={s.id} className="font-medium">
                      {s.name}{' '}
                      <span className="text-muted-foreground font-mono text-xs">
                        {config.data ? `${s.slug}.${config.data.baseDomain}` : s.slug}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button nativeButton={false} render={<Link href="/dashboard" />}>
              {t('goDashboard')}
            </Button>
          </>
        )}

        {data.status === 'expired' && (
          <>
            <p className="flex items-center gap-2 font-medium">
              <XCircle className="text-destructive size-5" aria-hidden /> {t('expired')}
            </p>
            <p className="text-muted-foreground text-sm">{t('expiredHint')}</p>
            <Button nativeButton={false} render={<Link href="/register" />}>
              {t('registerAgain')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
