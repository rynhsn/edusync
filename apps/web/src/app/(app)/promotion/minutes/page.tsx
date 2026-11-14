import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MinutesView } from './minutes-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('minutes');
  return { title: t('title') };
}

export default function Page() {
  return <MinutesView />;
}
