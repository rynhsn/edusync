import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PlatformSupportDetail } from '../support-detail';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platformSupport');
  return { title: t('title') };
}

export default async function PlatformSupportTicketPage({ params }: PageProps<'/platform/support/[id]'>) {
  const { id } = await params;
  return <PlatformSupportDetail id={id} />;
}
