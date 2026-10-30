import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ReportCardsView } from './report-cards-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('reportCards');
  return { title: t('title') };
}

export default function Page() {
  return <ReportCardsView />;
}
