import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ReportCardSettingsView } from './settings-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('reportCards');
  return { title: t('settingsTitle') };
}

export default function Page() {
  return <ReportCardSettingsView />;
}
