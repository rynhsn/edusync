import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PaperView } from './paper-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('examPaper');
  return { title: t('title') };
}

export default function Page() {
  return <PaperView />;
}
