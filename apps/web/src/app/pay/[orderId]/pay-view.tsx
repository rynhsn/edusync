'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';

/** Halaman bayar penyedia dev. Di produksi pengguna diarahkan ke halaman penyedia sungguhan. */
export function PayView({ orderId }: { orderId: string }) {
  const t = useTranslations('pay');
  const te = useTranslations();
  const queryClient = useQueryClient();
  const router = useRouter();

  const simulate = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/v1/dev/payments/{orderId}/simulate', { params: { path: { orderId } } })),
    onSuccess: () => {
      // Pengguna kini menjadi anggota sekolah baru, jadi data akun lama dibuang.
      queryClient.invalidateQueries({ queryKey: ['me'] });
      // Sama seperti kembali dari penyedia sungguhan: lanjut ke halaman status pendaftaran.
      let registrationId: string | null = null;
      try {
        registrationId = sessionStorage.getItem('edusync.pendingRegistration');
      } catch {
        // Tanpa penyimpanan sesi, pengguna memakai tombol dashboard di bawah.
      }
      if (registrationId) router.replace(`/register/status/${registrationId}`);
    },
  });

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="font-heading text-xl">{t('title')}</CardTitle>
        <CardDescription>{t('devNotice')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {simulate.isError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{te(errorKey(simulate.error))}</AlertDescription>
          </Alert>
        )}
        {simulate.isSuccess ? (
          <>
            <p className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="text-primary size-5" aria-hidden /> {t('activated')}
            </p>
            <Button nativeButton={false} render={<Link href="/" />}>
              {t('goDashboard')}
            </Button>
          </>
        ) : (
          <Button onClick={() => simulate.mutate()} disabled={simulate.isPending}>
            {simulate.isPending ? t('simulating') : t('simulate')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
