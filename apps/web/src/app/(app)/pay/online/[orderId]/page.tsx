import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OnlineReturnView } from './online-return-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('payOnline');
  return { title: t('title') };
}

export default async function Page({ params }: PageProps<'/pay/online/[orderId]'>) {
  const { orderId } = await params;
  return <OnlineReturnView orderId={orderId} />;
}
