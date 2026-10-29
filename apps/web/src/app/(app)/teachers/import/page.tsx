import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TeacherImportView } from './import-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('teacherImport');
  return { title: t('title') };
}

export default function TeacherImportPage() {
  return <TeacherImportView />;
}
