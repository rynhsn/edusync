import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PklPublicView } from './public-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pklPublic');
  // Halaman publik: jangan diindeks dan jangan membocorkan token lewat referrer.
  return { title: t('pageTitle'), robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

export default async function Page({ params }: PageProps<'/pkl/[token]'>) {
  const { token } = await params;
  return <PklPublicView token={token} />;
}
