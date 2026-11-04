import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ExamRoom } from './exam-room';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('examCbt');
  return { title: t('roomTitle') };
}

export default async function Page({ params }: PageProps<'/portal/exams/[id]'>) {
  const { id } = await params;
  return <ExamRoom id={id} />;
}
