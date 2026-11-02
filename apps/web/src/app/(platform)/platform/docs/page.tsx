import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PlatformDocsIndex } from './docs-views';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('docs');
  return { title: t('title') };
}

export default function PlatformDocsPage() {
  return <PlatformDocsIndex />;
}
