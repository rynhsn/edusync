import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ScanView } from './scan-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('examScan');
  return { title: t('title') };
}

export default async function Page({ params }: PageProps<'/exams/[id]/scan'>) {
  const { id } = await params;
  return <ScanView id={id} />;
}
