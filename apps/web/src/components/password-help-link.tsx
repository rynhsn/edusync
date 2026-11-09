'use client';

import { LifeBuoy } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useSite } from '@/lib/site';

/**
 * Tautan ke halaman "Lapor ke admin sekolah" (/bantuan-sandi). Halaman itu hanya ada di alamat sekolah, jadi
 * tautan tidak ditampilkan di alamat utama. `inline` = kalimat kecil di bawah formulir; `prominent` = kotak
 * dengan penjelasan dan tombol (langkah pilih saluran dan keadaan kode tidak masuk).
 */
export function PasswordHelpLink({ variant = 'inline' }: { variant?: 'inline' | 'prominent' }) {
  const t = useTranslations('reportLink');
  const site = useSite();
  if (!site.ready || site.kind !== 'school') return null;

  if (variant === 'prominent') {
    return (
      <div className="bg-muted/50 grid gap-3 rounded-lg border p-3 text-sm">
        <p className="text-muted-foreground flex items-start gap-2">
          <LifeBuoy className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{t('body')}</span>
        </p>
        <Button variant="outline" nativeButton={false} render={<Link href="/bantuan-sandi" />}>
          {t('action')}
        </Button>
      </div>
    );
  }

  return (
    <p className="text-muted-foreground mt-3 text-center text-sm">
      {t('prompt')}{' '}
      <Link href="/bantuan-sandi" className="text-primary font-medium underline-offset-4 hover:underline">
        {t('action')}
      </Link>
    </p>
  );
}
