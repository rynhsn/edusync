import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/** Tombol "Kembali" seragam untuk halaman rinci/sub; taruh di `actions` PageHeader (kanan atas). */
export function BackLink({ href, label }: { href: string; label?: string }) {
  const t = useTranslations('common');
  return (
    <Button variant="outline" nativeButton={false} render={<Link href={href} />}>
      <ArrowLeft className="size-4" aria-hidden />
      {label ?? t('back')}
    </Button>
  );
}
