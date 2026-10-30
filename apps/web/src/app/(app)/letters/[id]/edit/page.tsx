import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EditLetterView } from './edit-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('letters');
  return { title: t('editTitle') };
}

export default async function Page({ params }: PageProps<'/letters/[id]/edit'>) {
  const { id } = await params;
  return <EditLetterView id={id} />;
}
