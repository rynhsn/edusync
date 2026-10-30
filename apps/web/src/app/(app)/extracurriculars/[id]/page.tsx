import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ExtracurricularDetailView } from './detail-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('extracurricular');
  return { title: t('title') };
}

export default async function Page({ params }: PageProps<'/extracurriculars/[id]'>) {
  const { id } = await params;
  return <ExtracurricularDetailView id={id} />;
}
