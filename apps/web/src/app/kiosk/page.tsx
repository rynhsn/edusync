import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { KioskView } from './kiosk-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('gate');
  return { title: t('kiosk.title') };
}

export default function KioskPage() {
  return <KioskView />;
}
