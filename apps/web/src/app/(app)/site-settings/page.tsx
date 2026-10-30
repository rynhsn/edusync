import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SiteSettingsView } from './site-settings-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('siteSettings');
  return { title: t('title') };
}

export default function Page() {
  return <SiteSettingsView />;
}
