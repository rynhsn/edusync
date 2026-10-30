import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { InvoicesView } from './invoices-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance');
  return { title: t('invoicesTitle') };
}

export default function Page() {
  return <InvoicesView />;
}
