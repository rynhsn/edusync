import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ExamDetailView } from './exam-detail-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('examList');
  return { title: t('detailTitle') };
}

export default async function Page({ params }: PageProps<'/exams/[id]'>) {
  const { id } = await params;
  return <ExamDetailView id={id} />;
}
