import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OnlineChargesView } from './online-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance');
  return { title: t('ocTitle') };
}

export default function Page() {
  return <OnlineChargesView />;
}
