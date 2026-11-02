import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DomainsView } from './domains-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('siteDomains');
  return { title: t('title') };
}

export default function Page() {
  return <DomainsView />;
}
