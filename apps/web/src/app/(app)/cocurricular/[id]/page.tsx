import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CocurricularProgramDetailView } from './detail-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('cocurricular');
  return { title: t('programsTitle') };
}

export default async function Page({ params }: PageProps<'/cocurricular/[id]'>) {
  const { id } = await params;
  return <CocurricularProgramDetailView id={id} />;
}
