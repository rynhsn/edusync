import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CardsView } from './cards-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('cards');
  return { title: t('title') };
}

export default function Page() {
  return <CardsView />;
}
