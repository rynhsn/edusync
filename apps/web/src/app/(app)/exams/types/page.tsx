import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TypesView } from './types-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('exams');
  return { title: t('typesTitle') };
}

export default function Page() {
  return <TypesView />;
}
