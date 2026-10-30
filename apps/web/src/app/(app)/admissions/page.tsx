import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdmissionsView } from './admissions-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admissions');
  return { title: t('title') };
}

export default function Page() {
  return <AdmissionsView />;
}
