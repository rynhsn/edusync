import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PlatformSupportList } from './support-list';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platformSupport');
  return { title: t('title') };
}

export default function PlatformSupportPage() {
  return <PlatformSupportList />;
}
