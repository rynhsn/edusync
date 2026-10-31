import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CurriculumView } from './curriculum-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platformReference');
  return { title: t('title') };
}

export default function CurriculumPage() {
  return <CurriculumView />;
}
