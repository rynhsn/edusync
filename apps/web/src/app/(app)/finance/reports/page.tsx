import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ReportsView } from './reports-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('financeReports');
  return { title: t('title') };
}

export default function Page() {
  return <ReportsView />;
}
