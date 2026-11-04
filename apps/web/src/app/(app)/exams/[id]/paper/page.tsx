import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ExamPaperView } from './exam-paper-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('examPaper');
  return { title: t('examTitle') };
}

export default async function Page({ params }: PageProps<'/exams/[id]/paper'>) {
  const { id } = await params;
  return <ExamPaperView id={id} />;
}
