import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SchoolSupportList } from './support-views';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('support');
  return { title: t('title') };
}

export default function SupportPage() {
  return <SchoolSupportList />;
}
