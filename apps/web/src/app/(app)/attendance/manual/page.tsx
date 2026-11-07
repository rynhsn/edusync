import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ManualView } from './manual-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('manualAttendance');
  return { title: t('title') };
}

export default function ManualAttendancePage() {
  return <ManualView />;
}
