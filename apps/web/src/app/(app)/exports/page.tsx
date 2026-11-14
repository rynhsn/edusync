import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ExportsView } from './exports-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('exports');
  return { title: t('title') };
}

export default function ExportsPage() {
  return <ExportsView />;
}
