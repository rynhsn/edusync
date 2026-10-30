import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PortalHome } from './portal-home';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('portal');
  return { title: t('title') };
}

export default function PortalPage() {
  return <PortalHome />;
}
