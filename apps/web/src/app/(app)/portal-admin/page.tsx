import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PortalAdminView } from './portal-admin-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('portalAdmin');
  return { title: t('title') };
}

export default function Page() {
  return <PortalAdminView />;
}
