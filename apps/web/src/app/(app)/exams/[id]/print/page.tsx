import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PrintView } from './print-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('examPaper');
  return { title: t('printTitle') };
}

export default async function Page({ params }: PageProps<'/exams/[id]/print'>) {
  const { id } = await params;
  return <PrintView id={id} />;
}
