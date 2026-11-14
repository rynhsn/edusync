import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LedgerView } from './ledger-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ledger');
  return { title: t('title') };
}

export default function Page() {
  return <LedgerView />;
}
