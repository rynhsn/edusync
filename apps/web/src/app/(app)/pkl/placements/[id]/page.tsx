import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PlacementDetail } from './placement-detail';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pkl');
  return { title: t('detailTitle') };
}

export default async function Page({ params }: PageProps<'/pkl/placements/[id]'>) {
  const { id } = await params;
  return <PlacementDetail id={id} />;
}
