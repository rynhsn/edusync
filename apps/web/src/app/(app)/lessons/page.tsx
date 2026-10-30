import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LessonsView } from './lessons-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('gate');
  return { title: t('lessonsTitle') };
}

export default function Page() {
  return <LessonsView />;
}
