import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ExamsView } from './exams-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('examCbt');
  return { title: t('listTitle') };
}

export default function Page() {
  return <ExamsView />;
}
