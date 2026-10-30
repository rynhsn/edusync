import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ExtracurricularsView } from './extracurriculars-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('extracurricular');
  return { title: t('title') };
}

export default function Page() {
  return <ExtracurricularsView />;
}
