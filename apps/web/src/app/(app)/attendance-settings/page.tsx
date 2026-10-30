import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AttendanceSettingsView } from './attendance-settings-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('gate');
  return { title: t('settingsTitle') };
}

export default function AttendanceSettingsPage() {
  return <AttendanceSettingsView />;
}
