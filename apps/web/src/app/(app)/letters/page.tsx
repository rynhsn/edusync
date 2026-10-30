import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LettersView } from './letters-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('letters');
  return { title: t('title') };
}

export default function Page() {
  return <LettersView />;
}
