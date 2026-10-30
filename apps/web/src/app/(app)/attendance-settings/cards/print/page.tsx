import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PrintCardsView } from './print-cards-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('gate');
  return { title: t('printQr.title') };
}

export default function Page() {
  return <PrintCardsView />;
}
