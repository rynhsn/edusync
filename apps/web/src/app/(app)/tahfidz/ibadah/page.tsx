import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { IbadahView } from './ibadah-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('tahfidz');
  return { title: t('ibadahTitle') };
}

export default function Page() {
  return <IbadahView />;
}
