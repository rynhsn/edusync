import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
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
  // Tautan lama ke tab Kartu dialihkan ke halaman Kartu RFID.
  if (tab === 'cards') redirect('/attendance/cards');
  const initialTab = tab === 'devices' || tab === 'roster' ? tab : 'policy';
  return <AttendanceSettingsView initialTab={initialTab} />;
}
