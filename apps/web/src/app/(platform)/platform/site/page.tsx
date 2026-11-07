import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SiteView } from './site-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platformSite');
  return { title: t('title') };
}

export default function SitePage() {
  return <SiteView />;
}
