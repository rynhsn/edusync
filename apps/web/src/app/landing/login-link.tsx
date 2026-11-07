'use client';

import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

/**
 * Tombol masuk di profil perusahaan. Pengunjung yang sudah masuk tetap melihat halaman ini (tidak dialihkan
 * otomatis); tombolnya berubah menjadi jalan pintas ke aplikasi (`/enter`).
 */
export function LoginLink({
  label,
  signedInLabel,
  size,
  className,
}: {
  label: string;
  signedInLabel: string;
  size?: 'lg';
  className?: string;
}) {
  const session = authClient.useSession();
  const signedIn = !!session.data;
  return (
    <Link
      href={signedIn ? '/enter' : '/login'}
      className={cn(buttonVariants({ variant: 'outline', ...(size ? { size } : {}) }), className)}
    >
      {signedIn ? signedInLabel : label}
    </Link>
  );
}
