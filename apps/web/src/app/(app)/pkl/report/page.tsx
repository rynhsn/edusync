import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ReportView } from './report-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pkl');
  return { title: t('reportTitle') };
}

export default async function Page({ searchParams }: PageProps<'/pkl/report'>) {
  const { periodId } = await searchParams;
  return <ReportView initialPeriodId={typeof periodId === 'string' ? periodId : ''} />;
}
