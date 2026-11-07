import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { buildLandingMetadata, getSiteConfig } from '@/lib/site-config';
import { requestOrigin } from '@/lib/site-origin';
import { GatewayView } from './gateway-view';
import { LandingPage } from './landing/landing-page';

export async function generateMetadata(): Promise<Metadata> {
  const [config, locale, origin] = await Promise.all([getSiteConfig(), getLocale(), requestOrigin()]);
  return buildLandingMetadata(config, locale, origin);
}

/**
 * Gerbang: menentukan ke mana pengguna harus pergi menurut alamat yang dibuka dan siapa dirinya.
 * Pengunjung yang belum masuk di alamat utama melihat profil perusahaan (dirender di server) yang isinya diatur
 * staf platform di menu Situs.
 */
export default function Home() {
  return <GatewayView landing={<LandingPage />} />;
}
