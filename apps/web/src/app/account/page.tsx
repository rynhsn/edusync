import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AccountView } from './account-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('account');
  return { title: t('title') };
}

export default function AccountPage() {
  return <AccountView />;
}
