import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TeachersView } from './teachers-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('teachers');
  return { title: t('title') };
}

export default function TeachersPage() {
  return <TeachersView />;
}
