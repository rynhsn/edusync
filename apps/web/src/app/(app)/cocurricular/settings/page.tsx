import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CocurricularSettingsView } from './settings-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('cocurricular');
  return { title: t('title') };
}

export default function CocurricularSettingsPage() {
  return <CocurricularSettingsView />;
}
