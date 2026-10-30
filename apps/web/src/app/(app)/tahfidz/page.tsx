import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HalaqahListView } from './halaqah-list-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('tahfidz');
  return { title: t('title') };
}

export default function Page() {
  return <HalaqahListView />;
}
