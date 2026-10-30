import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { GateView } from './gate-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('gate');
  return { title: t('gateTitle') };
}

export default function Page() {
  return <GateView />;
}
