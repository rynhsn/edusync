import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EventDetail } from './event-detail';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ukk');
  return { title: t('detailTitle') };
}

export default async function Page({ params }: PageProps<'/ukk/[id]'>) {
  const { id } = await params;
  return <EventDetail id={id} />;
}
