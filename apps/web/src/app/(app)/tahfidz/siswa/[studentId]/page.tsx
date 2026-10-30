import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { StudentProgressView } from './student-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('tahfidz');
  return { title: t('title') };
}

export default async function Page({ params }: PageProps<'/tahfidz/siswa/[studentId]'>) {
  const { studentId } = await params;
  return <StudentProgressView studentId={studentId} />;
}
