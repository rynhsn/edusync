import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RolesView } from './roles-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('rolesPage');
  return { title: t('title') };
}

export default function RolesPage() {
  return <RolesView />;
}
