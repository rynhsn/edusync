import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SignersView } from './signers-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('letters');
  return { title: t('signersTitle') };
}

export default function Page() {
  return <SignersView />;
}
