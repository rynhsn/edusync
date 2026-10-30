import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CashierView } from './cashier-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance');
  return { title: t('cashierTitle') };
}

export default function Page() {
  return <CashierView />;
}
