'use client';

import { SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useSchoolGate } from '@/lib/site';

/**
 * Penjaga semua halaman di subdomain sekolah: slug tanpa sekolah (tak pernah ada atau sudah dihapus, tidak
 * dibedakan) menampilkan "Sekolah tidak ditemukan"; sekolah yang ada dan alamat lain lewat seperti biasa.
 */
export function SchoolGate({ children }: { children: ReactNode }) {
  const t = useTranslations('schoolNotFound');
  const { state, mainUrl } = useSchoolGate();
  if (state === 'checking') return <div className="flex-1" aria-busy="true" />;
  if (state === 'ok') return children;
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-full">
        <SearchX className="size-7" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <p className="text-muted-foreground text-sm">{t('body')}</p>
      <Button nativeButton={false} render={<a href={mainUrl} />}>
        {t('action')}
      </Button>
    </main>
  );
}
