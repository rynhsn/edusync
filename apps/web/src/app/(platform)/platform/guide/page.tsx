import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { GuideView } from './guide-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platform');
  return { title: t('guide') };
}

export default function GuidePage() {
  return <GuideView />;
}
