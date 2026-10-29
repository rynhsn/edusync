'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { safeNextPath } from '@/lib/host';

/** Menukar token sekali pakai (dari alamat lain) menjadi sesi di alamat ini, lalu lanjut ke tujuan. */
export function HandoffView() {
  const t = useTranslations('handoff');
  const router = useRouter();
  const queryClient = useQueryClient();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Mode ketat React menjalankan efek dua kali; token hanya boleh ditukar sekali.
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const next = safeNextPath(params.get('next'));
    // Buang token dari alamat sebelum melakukan apa pun, supaya tidak tertinggal di riwayat browser.
    window.history.replaceState(null, '', window.location.pathname);

    if (!token) return void setFailed(true);
    fetch('/api/auth/one-time-token/verify', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('token ditolak');
        queryClient.clear();
        router.replace(next);
      })
      .catch(() => setFailed(true));
  }, [queryClient, router]);

  if (failed) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-medium">{t('failed')}</p>
        <Button nativeButton={false} render={<Link href="/login" />}>
          {t('signInAgain')}
        </Button>
      </main>
    );
  }

  return (
    <main
      className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
      aria-live="polite"
    >
      <Skeleton className="h-8 w-48" />
      <p className="text-muted-foreground text-sm">{t('working')}</p>
    </main>
  );
}
