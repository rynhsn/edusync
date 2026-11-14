import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ExpertiseView } from './expertise-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vocational');
  return { title: t('title') };
}

export default function ExpertisePage() {
  return <ExpertiseView />;
}
