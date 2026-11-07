import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { StaffView } from './staff-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platformStaff');
  return { title: t('title') };
}

export default function StaffPage() {
  return <StaffView />;
}
