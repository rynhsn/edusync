import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BankView } from './bank-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('exams');
  return { title: t('bankTitle') };
}

export default function Page() {
  return <BankView />;
}
