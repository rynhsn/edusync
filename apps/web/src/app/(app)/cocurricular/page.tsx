import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CocurricularProgramsView } from './programs-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('cocurricular');
  return { title: t('programsTitle') };
}

export default function CocurricularPage() {
  return <CocurricularProgramsView />;
}
