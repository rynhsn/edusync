'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useSite } from '@/lib/site';

/**
 * Halaman yang hanya hidup di alamat utama (daftar, bayar, konsol staf). Bila dibuka dari alamat sekolah,
 * pengguna dipindahkan ke alamat utama pada path yang sama.
 */
export function MainHostOnly({ children }: { children: React.ReactNode }) {
  const site = useSite();
  const path = usePathname();
  const wrongHost = site.ready && site.kind === 'school';

  useEffect(() => {
    if (site.ready && site.kind === 'school') window.location.replace(site.urlFor(null, path));
  }, [site, path]);

  if (!site.ready || wrongHost) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }
  return <>{children}</>;
}
