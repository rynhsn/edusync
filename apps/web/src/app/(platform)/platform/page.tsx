import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FoundationsView } from './foundations-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platform');
  return { title: t('title') };
}

export default function PlatformPage() {
  return <FoundationsView />;
}
