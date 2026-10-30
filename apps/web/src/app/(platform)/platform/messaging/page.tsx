import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PlatformMessagingView } from './messaging-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platformMessaging');
  return { title: t('title') };
}

export default function Page() {
  return <PlatformMessagingView />;
}
