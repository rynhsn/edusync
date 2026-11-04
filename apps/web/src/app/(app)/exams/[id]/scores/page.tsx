import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ScoresView } from './scores-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('examScores');
  return { title: t('title') };
}

export default async function Page({ params }: PageProps<'/exams/[id]/scores'>) {
  const { id } = await params;
  return <ScoresView id={id} />;
}
