import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OwnerSupportThread } from '../support-views';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('support');
  return { title: t('title') };
}

export default async function OwnerSupportTicketPage({ params }: PageProps<'/account/support/[id]'>) {
  const { id } = await params;
  return <OwnerSupportThread id={id} />;
}
