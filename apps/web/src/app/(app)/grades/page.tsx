import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { GradesView } from './grades-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('grades');
  return { title: t('title') };
}

export default function Page() {
  return <GradesView />;
}
