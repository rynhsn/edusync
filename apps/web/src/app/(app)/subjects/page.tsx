import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SubjectsView } from './subjects-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('subjects');
  return { title: t('title') };
}

export default function SubjectsPage() {
  return <SubjectsView />;
}
