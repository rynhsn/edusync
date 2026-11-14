import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EventsView } from './events-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ukk');
  return { title: t('title') };
}

export default function Page() {
  return <EventsView />;
}
