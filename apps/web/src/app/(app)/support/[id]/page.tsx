import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SchoolSupportThread } from '../support-views';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('support');
  return { title: t('title') };
}

export default async function SupportTicketPage({ params }: PageProps<'/support/[id]'>) {
  const { id } = await params;
  return <SchoolSupportThread id={id} />;
}
