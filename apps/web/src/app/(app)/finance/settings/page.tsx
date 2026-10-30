import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FinanceSettingsView } from './settings-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance');
  return { title: t('settingsTitle') };
}

export default function Page() {
  return <FinanceSettingsView />;
}
