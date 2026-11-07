import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { GatewayView } from './gateway-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance');
  return { title: t('gwTitle') };
}

export default function Page() {
  return <GatewayView />;
}
