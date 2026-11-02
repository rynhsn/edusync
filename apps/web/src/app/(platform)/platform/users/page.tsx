import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { UsersView } from './users-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platform');
  return { title: t('users') };
}

export default function UsersPage() {
  return <UsersView />;
}
