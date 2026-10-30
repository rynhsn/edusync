import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HalaqahDetailView } from './detail-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('tahfidz');
  return { title: t('title') };
}

export default async function Page({ params }: PageProps<'/tahfidz/[id]'>) {
  const { id } = await params;
  return <HalaqahDetailView id={id} />;
}
