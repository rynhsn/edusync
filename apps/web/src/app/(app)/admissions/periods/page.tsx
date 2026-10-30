import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PeriodsView } from './periods-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admissions');
  return { title: t('periodsTitle') };
}

export default function Page() {
  return <PeriodsView />;
}
