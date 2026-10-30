import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { VerifyView } from './verify-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('verify');
  // Halaman publik: jangan diindeks dan jangan membocorkan token lewat referrer.
  return { title: t('pageTitle'), robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

export default async function Page({ params }: PageProps<'/verify/[token]'>) {
  const { token } = await params;
  return <VerifyView token={token} />;
}
