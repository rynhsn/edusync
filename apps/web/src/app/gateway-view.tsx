'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { homePathFor } from '@/lib/portal-access';
import { goToSchool, useSite } from '@/lib/site';

/**
 * - Belum masuk → halaman login.
 * - Alamat sekolah → dashboard sekolah itu.
 * - Alamat utama: staf platform → konsol; anggota sekolah → dipindahkan ke alamat sekolahnya.
 */
export function GatewayView({ landing }: { landing: ReactNode }) {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const router = useRouter();
  const queryClient = useQueryClient();
  const site = useSite();
  const moving = useRef(false);
  const [moveFailed, setMoveFailed] = useState(false);

  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await api.GET('/v1/me');
      return res.response.status === 401 ? null : unwrap(res);
    },
  });

  const staff = useQuery({
    queryKey: ['platform-me'],
    enabled: !!me.data && site.ready && site.kind === 'main',
    queryFn: async () => {
      const res = await api.GET('/v1/platform/me');
      return res.response.ok ? unwrap(res) : null;
    },
  });

  const owner = useQuery({
    queryKey: ['account'],
    enabled: !!me.data && site.ready && site.kind === 'main',
    queryFn: async () => unwrap(await api.GET('/v1/account')),
  });

  // Pendaftar yang menutup halaman bayar harus bisa melanjutkan, bukan buntu di "belum terdaftar".
  const latest = useQuery({
    queryKey: ['registration-latest'],
    enabled: !!me.data && site.ready && site.kind === 'main',
    queryFn: async () => {
      const res = await api.GET('/v1/registrations/latest');
      return res.response.ok ? unwrap(res) : null;
    },
  });

  useEffect(() => {
    if (site.ready && site.custom) return void router.replace('/site');
    if (!site.ready || me.isPending || me.isError) return;
    if (me.data === null) {
      // Alamat utama menampilkan profil perusahaan; alamat sekolah langsung ke login.
      if (site.kind === 'main') return;
      return void router.replace('/login');
    }
    if (site.kind === 'school') {
      // Wali/siswa mendarat di portal, staf di dasbor.
      const here = me.data.memberships.find((m) => m.schoolSlug === site.slug);
      return void router.replace(here ? homePathFor(here.permissions) : '/dashboard');
    }
    if (staff.isPending) return;
    if (staff.data) return void router.replace('/platform');
    if (owner.isPending) return;
    if (owner.data && owner.data.foundations.length > 0) return void router.replace('/account');
    const first = [...me.data.memberships].sort((a, b) => a.schoolName.localeCompare(b.schoolName))[0];
    if (!first || moving.current) return;
    moving.current = true;
    goToSchool(site, first.schoolSlug, homePathFor(first.permissions)).catch(() => {
      moving.current = false;
      setMoveFailed(true);
    });
  }, [
    site,
    me.isPending,
    me.isError,
    me.data,
    staff.isPending,
    staff.data,
    owner.isPending,
    owner.data,
    router,
  ]);

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    router.replace('/login');
  }

  const noSchool =
    site.ready &&
    site.kind === 'main' &&
    me.data &&
    !staff.isPending &&
    !staff.data &&
    !owner.isPending &&
    !latest.isPending &&
    !owner.data?.foundations.length &&
    me.data.memberships.length === 0;
  const reg = latest.data;
  const regExpired = !!reg && (reg.status === 'expired' || new Date(reg.expiresAt) < new Date());

  if (me.isError || moveFailed) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p>{t('loadError')}</p>
        <Button
          onClick={() => {
            setMoveFailed(false);
            moving.current = false;
            me.refetch();
          }}
        >
          {tc('retry')}
        </Button>
      </div>
    );
  }

  if (site.ready && !site.custom && site.kind === 'main' && me.data === null) return landing;

  if (noSchool && reg && reg.status !== 'paid') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-medium">
          {t(regExpired ? 'expiredTitle' : 'resumeTitle', { name: reg.foundationName })}
        </p>
        <p className="text-muted-foreground text-sm">{t(regExpired ? 'expiredBody' : 'resumeBody')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {regExpired ? (
            <Button nativeButton={false} render={<Link href="/register" />}>
              {t('registerAgain')}
            </Button>
          ) : (
            <>
              {reg.paymentUrl && (
                <Button nativeButton={false} render={<a href={reg.paymentUrl} />}>
                  {t('resumePay')}
                </Button>
              )}
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`/register/status/${reg.id}`} />}
              >
                {t('resumeStatus')}
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={signOut}>
            {tc('signOut')}
          </Button>
        </div>
      </div>
    );
  }

  if (noSchool) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-medium">{t('noSchoolTitle')}</p>
        <p className="text-muted-foreground text-sm">{t('noSchoolBody')}</p>
        <Button variant="outline" onClick={signOut}>
          {tc('signOut')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Skeleton className="h-8 w-48" />
    </div>
  );
}
