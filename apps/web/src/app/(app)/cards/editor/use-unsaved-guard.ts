'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Alamat tujuan bila klik tautan ini berpindah halaman di situs yang sama; null bila bukan perpindahan. */
export function internalDestination(
  anchor: Pick<HTMLAnchorElement, 'href' | 'target'> & { hasAttribute: (name: string) => boolean },
  here: Pick<Location, 'href' | 'origin' | 'pathname' | 'search'>,
): string | null {
  if (anchor.target === '_blank' || anchor.hasAttribute('download')) return null;
  const url = new URL(anchor.href, here.href);
  if (url.origin !== here.origin) return null;
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Penjaga perubahan belum tersimpan: peramban menanyakan saat tab ditutup/dimuat ulang, dan klik tautan ke halaman
 * lain ditahan sampai pengguna memilih tetap di sini atau keluar (`pending` berisi tujuan yang ditahan).
 */
export function useUnsavedGuard(dirty: boolean) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const dest = internalDestination(anchor, window.location);
      if (!dest) return;
      e.preventDefault();
      e.stopPropagation();
      setPending(dest);
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  return {
    pending,
    stay: () => setPending(null),
    leave: () => {
      const dest = pending;
      setPending(null);
      if (dest) router.push(dest);
    },
  };
}
