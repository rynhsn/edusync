import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { StudentsView } from './students-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('students');
  return { title: t('title') };
}

export default function StudentsPage() {
  return <StudentsView />;
}
