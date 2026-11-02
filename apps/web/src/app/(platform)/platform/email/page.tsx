import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmailView } from './email-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platformEmail');
  return { title: t('title') };
}

export default function EmailPage() {
  return <EmailView />;
}
