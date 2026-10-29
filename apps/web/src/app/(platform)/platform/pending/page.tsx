import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PendingView } from './pending-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platform');
  return { title: t('pending') };
}

export default function PendingPage() {
  return <PendingView />;
}
