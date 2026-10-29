import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PaymentsView } from './payments-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platformPayments');
  return { title: t('title') };
}

export default function PaymentsPage() {
  return <PaymentsView />;
}
