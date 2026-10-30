import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LetterDetail } from './letter-detail';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('letters');
  return { title: t('detailTitle') };
}

export default async function Page({ params }: PageProps<'/letters/[id]'>) {
  const { id } = await params;
  return <LetterDetail id={id} />;
}
