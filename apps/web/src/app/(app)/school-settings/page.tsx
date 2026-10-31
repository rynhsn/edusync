import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SchoolSettingsView } from './school-settings-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('schoolSettings');
  return { title: t('title') };
}

export default function SchoolSettingsPage() {
  return <SchoolSettingsView />;
}
