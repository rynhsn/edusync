import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NewLetterView } from './new-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('letters');
  return { title: t('composeTitle') };
}

export default function Page() {
  return <NewLetterView />;
}
