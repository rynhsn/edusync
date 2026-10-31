import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MainHostOnly } from '@/components/main-host-only';
import { AccountShell } from './account-shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('account');
  return { title: t('title') };
}

/** Portal akun yayasan hanya ada di alamat utama. */
export default function AccountLayout({ children }: LayoutProps<'/account'>) {
  return (
    <MainHostOnly>
      <AccountShell>{children}</AccountShell>
    </MainHostOnly>
  );
}
