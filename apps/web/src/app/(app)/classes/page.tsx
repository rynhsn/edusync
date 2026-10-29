import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ClassesView } from './classes-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('classes');
  return { title: t('title') };
}

export default function ClassesPage() {
  return <ClassesView />;
}
