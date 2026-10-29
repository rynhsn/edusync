import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CatalogView } from './catalog-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platformCatalog');
  return { title: t('title') };
}

export default function CatalogPage() {
  return <CatalogView />;
}
