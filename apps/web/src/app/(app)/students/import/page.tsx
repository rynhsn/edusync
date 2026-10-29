import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ImportView } from './import-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('studentImport');
  return { title: t('title') };
}

export default function StudentImportPage() {
  return <ImportView />;
}
