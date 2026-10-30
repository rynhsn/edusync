import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SettingsView } from './settings-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pkl');
  return { title: t('settingsTitle') };
}

export default function Page() {
  return <SettingsView />;
}
