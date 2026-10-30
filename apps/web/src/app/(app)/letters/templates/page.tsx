import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TemplatesView } from './templates-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('letters');
  return { title: t('templatesTitle') };
}

export default function Page() {
  return <TemplatesView />;
}
