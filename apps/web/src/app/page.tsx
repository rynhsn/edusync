import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { GatewayView } from './gateway-view';
import { LandingPage } from './landing/landing-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('landing');
  return { title: { absolute: t('metaTitle') }, description: t('metaDescription') };
}

/**
 * Gerbang: menentukan ke mana pengguna harus pergi menurut alamat yang dibuka dan siapa dirinya.
 * Pengunjung yang belum masuk di alamat utama melihat profil perusahaan (dirender di server).
 */
export default function Home() {
  return <GatewayView landing={<LandingPage />} />;
}
