import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CardImportView } from './card-import-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('gate');
  return { title: t('cardImport.title') };
}

export default function CardImportPage() {
  return <CardImportView />;
}
