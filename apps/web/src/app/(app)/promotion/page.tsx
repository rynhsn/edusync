import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PromotionView } from './promotion-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('promotion');
  return { title: t('title') };
}

export default function PromotionPage() {
  return <PromotionView />;
}
