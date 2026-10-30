import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PartnersView } from './partners-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pkl');
  return { title: t('partnersTitle') };
}

export default function Page() {
  return <PartnersView />;
}
