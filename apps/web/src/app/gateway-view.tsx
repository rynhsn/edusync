'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import {
  buildContexts,
  type ChoiceContext,
  decideEntry,
  readLastContext,
  writeLastContext,
} from '@/lib/context-choice';
import { homePathFor } from '@/lib/portal-access';
import { goToSchool, useSite } from '@/lib/site';
import { ContextChooser } from './context-chooser';

/**
 * - Belum masuk → halaman login.
 * - Alamat sekolah → dashboard sekolah itu.
 * - Alamat utama (/enter): satu tujuan (konsol platform, portal pemilik, atau satu sekolah) → langsung ke sana;
 *   lebih dari satu → layar "Pilih tujuan" dengan tujuan terakhir dibuka di urutan pertama.
 */
export function GatewayView({ landing, enter = false }: { landing: ReactNode; enter?: boolean }) {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const router = useRouter();
  const queryClient = useQueryClient();
  const site = useSite();
  const moving = useRef(false);
  const [moveFailed, setMoveFailed] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [pickFailed, setPickFailed] = useState(false);

  const me = useQuery({
    queryKey: ['me'],
    // Di alamat utama tanpa /enter yang tampil hanya profil perusahaan: tidak perlu tahu siapa yang masuk.
    enabled: site.ready && (enter || site.kind !== 'main'),
    queryFn: async () => {
      // Pengunjung yang belum masuk tidak perlu memanggil /v1/me (jawabannya 401 dan tercatat merah di konsol):
      // cek sesi dulu, yang menjawab 200 kosong bila belum masuk.
      const session = await authClient.getSession();
      if (!session.data) return null;
      const res = await api.GET('/v1/me');
      return res.response.status === 401 ? null : unwrap(res);
    },
  });

  const staff = useQuery({
    queryKey: ['platform-me'],
    enabled: enter && !!me.data && site.ready && site.kind === 'main',
    queryFn: async () => {
      const res = await api.GET('/v1/platform/me');
      return res.response.ok ? unwrap(res) : null;
    },
  });

  const owner = useQuery({
    queryKey: ['account'],
    enabled: enter && !!me.data && site.ready && site.kind === 'main',
    queryFn: async () => unwrap(await api.GET('/v1/account')),
  });

  // Pendaftar yang menutup halaman bayar harus bisa melanjutkan, bukan buntu di "belum terdaftar".
  const latest = useQuery({
    queryKey: ['registration-latest'],
    enabled: enter && !!me.data && site.ready && site.kind === 'main',
    queryFn: async () => {
      const res = await api.GET('/v1/registrations/latest');
      return res.response.ok ? unwrap(res) : null;
    },
  });

  // Hanya di alamat utama (/enter): gabungkan konsol platform, portal pemilik, dan sekolah menjadi daftar tujuan.
  const lastId = me.data ? readLastContext(me.data.user.id) : null;
  const decision = useMemo(() => {
    if (!enter || !site.ready || site.kind !== 'main' || !me.data) return null;
    if (staff.isPending || owner.isPending) return null;
    const contexts = buildContexts({
      isStaff: !!staff.data,
      isOwner: (owner.data?.foundations.length ?? 0) > 0,
      memberships: me.data.memberships,
    });
    return decideEntry(contexts, lastId);
  }, [enter, site, me.data, staff.isPending, staff.data, owner.isPending, owner.data, lastId]);

  useEffect(() => {
    if (site.ready && site.custom) return void router.replace('/site');
    if (!site.ready || me.isPending || me.isError) return;
    // Alamat utama menampilkan profil perusahaan, juga untuk yang sudah masuk (tanpa pengalihan otomatis);
    // pengalihan ke konsol, portal, atau sekolah hanya lewat /enter (tujuan setelah masuk dan tombol "Buka aplikasi").
    if (site.kind === 'main' && !enter) return;
    if (me.data === null) return void router.replace('/login');
    if (site.kind === 'school') {
      // Wali/siswa mendarat di portal, staf di dasbor.
      const here = me.data.memberships.find((m) => m.schoolSlug === site.slug);
      return void router.replace(here ? homePathFor(here.permissions) : '/dashboard');
    }
    // Satu konteks: langsung ke sana. Lebih dari satu: layar pilihan (dirender di bawah).
    if (decision?.action !== 'go' || moving.current) return;
    const only = decision.context;
    if (only.kind === 'platform') return void router.replace('/platform');
    if (only.kind === 'owner') return void router.replace('/account');
    moving.current = true;
    goToSchool(site, only.slug as string, homePathFor(only.permissions ?? [])).catch(() => {
      moving.current = false;
      setMoveFailed(true);
    });
  }, [site, me.isPending, me.isError, me.data, decision, router, enter]);

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    router.replace('/login');
  }

  function pick(context: ChoiceContext) {
    if (me.data) writeLastContext(me.data.user.id, context.id);
    if (context.kind === 'platform') return router.push('/platform');
    if (context.kind === 'owner') return router.push('/account');
    setOpeningId(context.id);
    setPickFailed(false);
    goToSchool(
      site as Extract<typeof site, { ready: true }>,
      context.slug as string,
      homePathFor(context.permissions ?? []),
    ).catch(() => {
      setOpeningId(null);
      setPickFailed(true);
    });
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

  if (site.ready && !site.custom && site.kind === 'main' && !enter) return landing;

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

  if (site.ready && !site.custom && site.kind === 'main' && me.data === null) return null;

  if (decision?.action === 'choose') {
    return (
      <ContextChooser
        contexts={decision.contexts}
        lastId={decision.contexts.some((c) => c.id === lastId) ? lastId : null}
        openingId={openingId}
        failed={pickFailed}
        onPick={pick}
        onSignOut={signOut}
      />
    );
  }

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
