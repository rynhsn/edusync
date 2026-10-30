import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AnnouncementsView } from './announcements-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('announcements');
  return { title: t('title') };
}

export default function Page() {
  return <AnnouncementsView />;
}
