import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PayView } from './pay-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pay');
  return { title: t('title') };
}

export default async function PayPage({ params }: PageProps<'/pay/[orderId]'>) {
  const { orderId } = await params;
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <PayView orderId={orderId} />
    </main>
  );
}
