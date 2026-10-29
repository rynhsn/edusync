import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AcademicYearsView } from './academic-years-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('academicYears');
  return { title: t('title') };
}

export default function AcademicYearsPage() {
  return <AcademicYearsView />;
}
