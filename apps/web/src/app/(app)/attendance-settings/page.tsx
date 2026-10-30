import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AttendanceSettingsView } from './attendance-settings-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('gate');
  return { title: t('settingsTitle') };
}

export default async function AttendanceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = tab === 'devices' || tab === 'cards' || tab === 'roster' ? tab : 'policy';
  return <AttendanceSettingsView initialTab={initialTab} />;
}
